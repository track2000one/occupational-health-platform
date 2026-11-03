"""Staging-only multi-select review activation with explicit preview and consent.

No staff/medical data is generated or inferred. The master health-center match
must be exact and unambiguous; identity, center and uniqueness remain mandatory.
Batches are small (<= 100) and each review is handled transactionally.
"""
from collections import Counter
from datetime import date
from hashlib import sha256
import json
import os
import re
import unicodedata

from django.core import signing
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import permissions, serializers as drf_serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .employee_import_countries import resolve_import_nationality
from .models import AuditLog, Employee, EmployeeImportReview, HealthCenter
from .serializers import EmployeeSerializer

STAGING_PROJECT_ID = 'cf4b2162-5236-4f92-b010-165f505fe2c2'
TOKEN_SALT = 'staging-import-review-bulk-activate-v1'
MAX_TOKEN_AGE = 20 * 60
MAX_SELECTION = 5000
MAX_COMMIT_BATCH = 100
OPTIONAL_FIELDS = (
    'employee_number', 'email', 'mobile', 'national_address',
    'birth_place', 'gender', 'marital_status', 'job_title',
    'job_title_en', 'current_job', 'nationality', 'children_count',
    'date_of_birth', 'appointment_date',
)
REASON_LABELS = {
    'missing_name': 'اسم الموظف غير متوفر',
    'invalid_identity': 'رقم الهوية أو الإقامة ناقص أو غير صحيح',
    'missing_center': 'المركز الصحي غير مطابق أو غير نشط',
    'ambiguous_center': 'يوجد أكثر من مركز مطابق للاسم',
    'identity_exists': 'رقم الهوية موجود مسبقًا في سجلات الموظفين',
    'identity_repeated': 'رقم الهوية مكرر ضمن البطاقات المحددة',
    'review_processed': 'البطاقة عولجت مسبقًا',
    'record_changed': 'تغيرت بيانات البطاقة بعد المعاينة',
    'failed_validation': 'لم تجتز البيانات الأساسية التحقق النهائي',
    'unique_conflict': 'تعارض مع سجل موجود عند الحفظ',
}


def arabic_key(value):
    value = unicodedata.normalize('NFKC', str(value or '')).casefold().strip()
    value = re.sub(r'[\u064b-\u065f\u0670\u0640]', '', value)
    value = re.sub(r'[أإآٱ]', 'ا', value).replace('ى', 'ي').replace('ة', 'ه')
    return re.sub(r'\s+', ' ', value).strip()


def normalized_identity(value):
    return ''.join(str(unicodedata.digit(ch)) for ch in str(value or '') if ch.isdecimal())


def review_digest(review):
    raw = json.dumps({
        'id': review.pk, 'status': review.status,
        'updated_at': review.updated_at.isoformat(),
        'payload': review.employee_payload,
        'fingerprint': review.fingerprint,
    }, sort_keys=True, ensure_ascii=False, default=str, separators=(',', ':'))
    return sha256(raw.encode('utf-8')).hexdigest()


def center_index():
    centers = list(HealthCenter.objects.filter(is_active=True).only(
        'pk', 'name', 'name_ar', 'is_active',
    ))
    by_id = {center.pk: center for center in centers}
    by_name, ambiguous = {}, set()
    for center in centers:
        for name in [center.name, center.name_ar]:
            key = arabic_key(name)
            if not key:
                continue
            if key in by_name and by_name[key] != center.pk:
                ambiguous.add(key)
            else:
                by_name[key] = center.pk
    return by_id, by_name, ambiguous


def determine_center(payload, by_id, by_name, ambiguous):
    # A stored numeric key is preferable to a text alias. But no 0, inactive
    # center, or free-text organizational path is ever coerced into a match.
    possible = payload.get('health_center')
    if type(possible) is int or (isinstance(possible, str) and possible.isascii()
                                 and possible.isdecimal()):
        pk = int(possible)
        if pk in by_id:
            return pk, None
    for raw in [payload.get('health_center_name'), possible]:
        if not isinstance(raw, str) or not raw.strip():
            continue
        key = arabic_key(raw)
        if key in ambiguous:
            return None, 'ambiguous_center'
        if key in by_name:
            return by_name[key], None
    return None, 'missing_center'


def decide_preview(reviews, centers):
    by_id, by_name, ambiguous = centers
    ids = [review.pk for review in reviews]
    employee_ids = {
        value for value in Employee.objects.values_list('national_id', flat=True)
        if value
    }
    reasons, viable = {}, []
    repeat_counts = Counter()
    for review in reviews:
        if review.status not in ('pending', 'conflict'):
            reasons[review.pk] = 'review_processed'
            continue
        payload = review.employee_payload or {}
        name = str(payload.get('name') or '').strip()
        identity = normalized_identity(payload.get('national_id'))
        if not name:
            reasons[review.pk] = 'missing_name'
        elif len(identity) != 10:
            reasons[review.pk] = 'invalid_identity'
        elif identity in employee_ids:
            reasons[review.pk] = 'identity_exists'
        else:
            center_id, problem = determine_center(payload, by_id, by_name, ambiguous)
            if problem:
                reasons[review.pk] = problem
            else:
                viable.append((review, identity, center_id))
                repeat_counts[identity] += 1
    eligible = {}
    for review, identity, center_id in viable:
        if repeat_counts[identity] > 1:
            reasons[review.pk] = 'identity_repeated'
        else:
            eligible[review.pk] = {
                'center_id': center_id,
                'identity': identity,
                'fingerprint': review_digest(review),
            }
    return eligible, reasons


def optional_employee_data(review, center_id):
    payload = review.employee_payload or {}
    submitted = {
        'name': str(payload.get('name') or '').strip(),
        'national_id': normalized_identity(payload.get('national_id')),
        'health_center': center_id,
    }
    omitted = []
    for field in OPTIONAL_FIELDS:
        value = payload.get(field)
        if value in (None, ''):
            continue
        if field == 'nationality':
            value = resolve_import_nationality(value)
            if not value:
                omitted.append(field)
                continue
        elif field in ('date_of_birth', 'appointment_date'):
            # Legacy date strings may be Hijri or invalid; never guess or
            # translate a date on employee activation.
            if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
                omitted.append(field)
                continue
        candidate = dict(submitted)
        candidate[field] = value
        serializer = EmployeeSerializer(data=candidate)
        if serializer.is_valid():
            submitted = candidate
        else:
            omitted.append(field)
    return submitted, omitted


class StagingEmployeeReviewBulkActivationView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request):
        if not request.user.is_superuser:
            return Response({'detail': 'Bulk activation requires a superuser.'}, status=403)
        if (os.getenv('STAGING_MODE', '').lower() != 'true'
                or os.getenv('RAILWAY_PROJECT_ID') != STAGING_PROJECT_ID):
            return Response({'detail': 'This feature is restricted to isolated Staging.'},
                            status=403)

        action = request.data.get('action')
        if action not in ('preview', 'commit'):
            return Response({'detail': 'Invalid action.'}, status=400)

        if action == 'preview':
            selection = request.data.get('selection')
            if selection == 'all':
                ids = list(EmployeeImportReview.objects.filter(
                    status__in=['pending', 'conflict']
                ).order_by('pk').values_list('pk', flat=True)[:MAX_SELECTION + 1])
                if len(ids) > MAX_SELECTION:
                    return Response({'detail': 'Too many pending cards. Use a smaller selection.'}, status=400)
            elif selection == 'selected':
                ids = request.data.get('review_ids')
                if (not isinstance(ids, list) or not ids or len(ids) > MAX_SELECTION
                        or len(ids) != len(set(ids))
                        or any(type(pk) is not int or pk <= 0 for pk in ids)):
                    return Response({'detail': 'Select 1–5000 unique review IDs.'}, status=400)
            else:
                return Response({'detail': 'Selection must be all or selected.'}, status=400)
            if not ids:
                return Response({'detail': 'No pending reviews to activate.'}, status=400)
            reviews = list(EmployeeImportReview.objects.filter(
                pk__in=ids,
            ).order_by('pk'))
            if len(reviews) != len(ids):
                return Response({'detail': 'One or more selected cards no longer exist.'}, status=409)
            centers = center_index()
            eligible, blocked = decide_preview(reviews, centers)
            token = signing.dumps({
                'ids': {str(pk): record for pk, record in eligible.items()},
                'selection': selection,
            }, salt=TOKEN_SALT, compress=True)
            return Response({
                'mode': 'preview', 'selection': selection,
                'selected_count': len(ids),
                'eligible_count': len(eligible),
                'blocked_count': len(blocked),
                'eligible_ids': list(eligible.keys()),
                'blocked_reasons': [
                    {'reason': reason, 'label': REASON_LABELS[reason], 'count': count}
                    for reason, count in Counter(blocked.values()).most_common()
                ],
                'preview_token': token,
                'batch_size': MAX_COMMIT_BATCH,
            }, headers={'Cache-Control': 'no-store'})

        if request.data.get('confirmed') is not True:
            return Response({'detail': 'Explicit final confirmation is required.'}, status=400)
        token = request.data.get('preview_token')
        try:
            signed = signing.loads(token, salt=TOKEN_SALT, max_age=MAX_TOKEN_AGE)
        except (signing.BadSignature, signing.SignatureExpired, TypeError, ValueError):
            return Response({'detail': 'The preview token is invalid or expired. Preview again.'},
                            status=409)
        if not isinstance(signed, dict) or not isinstance(signed.get('ids'), dict):
            return Response({'detail': 'Invalid preview data.'}, status=409)
        all_eligible = signed['ids']
        batch_ids = request.data.get('review_ids')
        if (not isinstance(batch_ids, list) or not batch_ids
                or len(batch_ids) > MAX_COMMIT_BATCH
                or len(batch_ids) != len(set(batch_ids))
                or any(type(pk) is not int or str(pk) not in all_eligible for pk in batch_ids)):
            return Response({'detail': 'Select up to 100 cards from the confirmed preview.'},
                            status=400)

        created, skipped, reasons = 0, 0, Counter()
        for pk in batch_ids:
            try:
                with transaction.atomic():
                    review = EmployeeImportReview.objects.select_for_update().get(pk=pk)
                    approved = all_eligible[str(pk)]
                    if review_digest(review) != approved['fingerprint']:
                        reasons['record_changed'] += 1
                        skipped += 1
                        continue
                    if review.status not in ('pending', 'conflict'):
                        reasons['review_processed'] += 1
                        skipped += 1
                        continue
                    center_id = approved['center_id']
                    if not HealthCenter.objects.filter(pk=center_id, is_active=True).exists():
                        reasons['missing_center'] += 1
                        skipped += 1
                        continue
                    # Health-center names and aliases might change between
                    # preview and commit. Re-evaluate to avoid misassignment.
                    live_center_id, live_reason = determine_center(
                        review.employee_payload or {}, *center_index(),
                    )
                    if live_reason or live_center_id != center_id:
                        reasons['record_changed'] += 1
                        skipped += 1
                        continue
                    submitted, omitted = optional_employee_data(review, center_id)
                    serializer = EmployeeSerializer(data=submitted, context={'request': request})
                    if not serializer.is_valid():
                        reasons['failed_validation'] += 1
                        skipped += 1
                        continue
                    employee = serializer.save()
                    source_payload = review.employee_payload
                    review.employee_payload = dict(serializer.data)
                    review.employee_payload['_original_import_payload'] = source_payload
                    review.warnings = list(review.warnings or []) + [
                        'تفعيل جماعي بالبيانات المتاحة؛ راجع الحقول التي لم تُنقل لاحقًا.'
                    ]
                    if omitted:
                        review.warnings.append(
                            'حقول اختيارية استبعدت: ' + ', '.join(omitted)
                        )
                    review.status = 'activated'
                    review.activated_employee = employee
                    review.resolved_by = request.user
                    review.resolved_at = timezone.now()
                    review.issues = []
                    review.save(update_fields=[
                        'employee_payload', 'warnings', 'status', 'activated_employee',
                        'resolved_by', 'resolved_at', 'issues', 'updated_at',
                    ])
                    AuditLog.objects.create(
                        user=str(request.user), action='bulk_activate_employee_review',
                        model_name='EmployeeImportReview', record_id=str(review.pk),
                    )
                    created += 1
            except (IntegrityError, drf_serializers.ValidationError):
                reasons['unique_conflict'] += 1
                skipped += 1
            except EmployeeImportReview.DoesNotExist:
                reasons['record_changed'] += 1
                skipped += 1

        return Response({
            'mode': 'committed', 'processed_count': len(batch_ids),
            'created_count': created, 'skipped_count': skipped,
            'skipped_reasons': [
                {'reason': reason, 'label': REASON_LABELS[reason], 'count': count}
                for reason, count in reasons.items()
            ],
        }, headers={'Cache-Control': 'no-store'})
