"""Review and explicitly reconcile unmatched legacy Excel center labels on Staging.

Never assign a health center based on a partial match or a generic sector. Admin
chooses one exact SOURCE label and one active MASTER center, previews, confirms;
all raw import data is preserved. This endpoint makes NO employees.
"""
from collections import defaultdict
from hashlib import sha256
import json
import os

from django.core import signing
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .employee_review_bulk_activation import (
    STAGING_PROJECT_ID, center_index, determine_center, normalized_identity,
    review_digest,
)
from .models import AuditLog, EmployeeImportReview, HealthCenter

TOKEN_SALT = 'staging-review-center-reconciliation-v1'
TOKEN_TTL = 20 * 60
MAX_GROUPS = 500
MAX_ROWS = 5000
SOURCE_KEYS = (
    'health_center_name', 'health_center', 'المركز الصحي', 'المركز',
    'جهة العمل', 'health center', 'facility',
)


def center_source(review):
    payload = review.employee_payload or {}
    raw = review.raw_payload or {}
    for data in (payload, raw):
        for key in SOURCE_KEYS:
            value = data.get(key)
            if type(value) is str and value.strip() and len(value.strip()) <= 500:
                return value.strip()
    return ''


def unmatched_reviews():
    index = center_index()
    rows = EmployeeImportReview.objects.filter(
        status__in=['pending', 'conflict'],
    ).order_by('pk').only('id', 'status', 'updated_at', 'employee_payload',
                          'raw_payload', 'fingerprint')
    for review in rows.iterator(chunk_size=400):
        # Do not remap a review with an already valid center.
        if determine_center(review.employee_payload or {}, *index)[1]:
            yield review


def group_snapshot(source):
    items = [review for review in unmatched_reviews()
             if center_source(review) == source]
    if len(items) > MAX_ROWS:
        raise ValueError('Large center groups must be subdivided before reconciliation.')
    fingerprint_input = [
        [review.pk, review_digest(review)] for review in items
    ]
    digest = sha256(json.dumps(fingerprint_input, separators=(',', ':')).encode()).hexdigest()
    return items, digest


class StagingReviewCenterReconciliationView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def _guard(self, request):
        return (request.user.is_superuser
                and os.environ.get('STAGING_MODE', '').lower() == 'true'
                and os.environ.get('RAILWAY_PROJECT_ID') == STAGING_PROJECT_ID)

    def get(self, request):
        if not self._guard(request):
            return Response({'detail': 'Available only for Staging superusers.'}, status=403)
        groups = defaultdict(lambda: {
            'count': 0, 'with_name_and_identity': 0,
        })
        missing_source = 0
        missing_name = 0
        total = 0
        for review in unmatched_reviews():
            total += 1
            payload = review.employee_payload or {}
            name = str(payload.get('name') or '').strip()
            identity = normalized_identity(payload.get('national_id'))
            if not name:
                missing_name += 1
            source = center_source(review)
            if not source:
                missing_source += 1
                continue
            item = groups[source]
            item['count'] += 1
            if name and len(identity) == 10:
                item['with_name_and_identity'] += 1
        grouped = [
            {'source_name': name, **item} for name, item in groups.items()
        ]
        grouped.sort(key=lambda item: (-item['count'], item['source_name']))
        active = list(HealthCenter.objects.filter(is_active=True).order_by(
            'name'
        ).values('id', 'name', 'name_ar', 'code'))
        return Response({
            'unmatched_count': total,
            'missing_source_count': missing_source,
            'missing_name_count': missing_name,
            'group_count': len(grouped),
            'groups': grouped[:MAX_GROUPS],
            'truncated': len(grouped) > MAX_GROUPS,
            'centers': active,
        }, headers={'Cache-Control': 'no-store'})

    def post(self, request):
        if not self._guard(request):
            return Response({'detail': 'Available only for Staging superusers.'}, status=403)
        action = request.data.get('action')
        if action not in ('preview', 'commit'):
            return Response({'detail': 'Invalid action.'}, status=400)

        if action == 'preview':
            source = request.data.get('source_name')
            target_id = request.data.get('target_center_id')
            if (type(source) is not str or not source.strip() or len(source) > 500
                    or type(target_id) is not int or target_id <= 0):
                return Response({'detail': 'Select the exact source label and a real active center.'}, status=400)
            center = HealthCenter.objects.filter(pk=target_id, is_active=True).first()
            if not center:
                return Response({'detail': 'The chosen master center is inactive or missing.'}, status=400)
            try:
                reviews, digest = group_snapshot(source)
            except ValueError as exc:
                return Response({'detail': str(exc)}, status=400)
            if not reviews:
                return Response({'detail': 'This source group has no unmatched pending records.'}, status=409)
            valid_identity = sum(
                bool(str((row.employee_payload or {}).get('name') or '').strip())
                and len(normalized_identity((row.employee_payload or {}).get('national_id'))) == 10
                for row in reviews
            )
            token = signing.dumps({
                'source': source, 'center_id': center.pk, 'digest': digest,
                'user_id': request.user.pk, 'count': len(reviews),
            }, salt=TOKEN_SALT, compress=True)
            return Response({
                'mode': 'preview', 'source_name': source,
                'target_center_id': center.pk,
                'target_center_name': center.name_ar or center.name,
                'affected_count': len(reviews),
                'with_name_and_identity': valid_identity,
                'still_missing_basic_info': len(reviews) - valid_identity,
                'preview_token': token,
            }, headers={'Cache-Control': 'no-store'})

        if request.data.get('confirmed') is not True:
            return Response({'detail': 'Explicit confirmation is required.'}, status=400)
        try:
            token = signing.loads(
                request.data.get('preview_token'), salt=TOKEN_SALT,
                max_age=TOKEN_TTL,
            )
        except (signing.BadSignature, signing.SignatureExpired, ValueError, TypeError):
            return Response({'detail': 'Preview expired or invalid; refresh and review.'}, status=409)
        if (not isinstance(token, dict) or token.get('user_id') != request.user.pk
                or type(token.get('source')) is not str
                or type(token.get('center_id')) is not int
                or type(token.get('digest')) is not str):
            return Response({'detail': 'Invalid mapping preview.'}, status=409)
        source, center_id = token['source'], token['center_id']
        with transaction.atomic():
            target = HealthCenter.objects.filter(pk=center_id, is_active=True).first()
            if not target:
                return Response({'detail': 'Target center is no longer active.'}, status=409)
            try:
                previous, digest = group_snapshot(source)
            except ValueError as exc:
                return Response({'detail': str(exc)}, status=409)
            if not previous or digest != token['digest'] or len(previous) != token.get('count'):
                return Response({'detail': 'The source group changed. Preview again.'}, status=409)

            locked = list(EmployeeImportReview.objects.select_for_update().filter(
                pk__in=[row.pk for row in previous],
                status__in=['pending', 'conflict'],
            ).order_by('pk'))
            if (len(locked) != len(previous)
                    or [review.pk for review in locked] != [review.pk for review in previous]
                    or any(review_digest(review) != review_digest(original)
                           for review, original in zip(locked, previous))):
                return Response({'detail': 'Reviews changed during confirmation. Preview again.'},
                                status=409)
            now = timezone.now()
            for review in locked:
                payload = dict(review.employee_payload or {})
                original_label = center_source(review)
                payload['_source_center_before_mapping'] = original_label
                payload['health_center'] = target.pk
                payload['health_center_name'] = target.name
                review.employee_payload = payload
                review.warnings = list(review.warnings or []) + [
                    'تعيين المركز الصحي بموافقة مسؤول النظام بعد مطابقة اسم المركز الأصلي: '
                    + source
                ]
                review.updated_at = now
            EmployeeImportReview.objects.bulk_update(
                locked, ['employee_payload', 'warnings', 'updated_at'], batch_size=100,
            )
            AuditLog.objects.create(
                user=str(request.user), action='staging_review_center_bulk_mapping',
                model_name='EmployeeImportReview', record_id=f'count:{len(locked)}:center:{target.pk}',
            )
            return Response({
                'mode': 'committed', 'mapped_count': len(locked),
                'center_id': target.pk, 'center_name': target.name_ar or target.name,
                'remaining_without_name_or_identity': sum(
                    not str((r.employee_payload or {}).get('name') or '').strip()
                    or len(normalized_identity((r.employee_payload or {}).get('national_id'))) != 10
                    for r in locked
                ),
            }, headers={'Cache-Control': 'no-store'})
