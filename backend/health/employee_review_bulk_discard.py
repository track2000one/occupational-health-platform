"""Staging-only bulk discard of pending employee Excel review cards.

Discard is a soft status change on EmployeeImportReview. It never deletes
source data and never creates, edits, or deletes Employee records. Preview and
confirmation are separate, auditable operations with an expiring snapshot.
"""
import os

from django.core import signing
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .employee_review_bulk_activation import (
    MAX_SELECTION, MAX_COMMIT_BATCH, STAGING_PROJECT_ID, review_digest,
)
from .models import AuditLog, EmployeeImportReview

TOKEN_SALT = 'staging-employee-review-bulk-discard-v1'
TOKEN_AGE = 20 * 60
PENDING_STATUSES = ('pending', 'conflict')


class StagingEmployeeReviewBulkDiscardView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request):
        if (not request.user.is_superuser
                or os.getenv('STAGING_MODE', '').lower() != 'true'
                or os.getenv('RAILWAY_PROJECT_ID') != STAGING_PROJECT_ID):
            return Response(
                {'detail': 'Bulk discard is restricted to superusers on isolated Staging.'},
                status=403,
            )

        action = request.data.get('action')
        if action not in ('preview', 'commit'):
            return Response({'detail': 'Invalid action.'}, status=400)

        if action == 'preview':
            scope = request.data.get('selection')
            if scope == 'all':
                requested_ids = list(EmployeeImportReview.objects.filter(
                    status__in=PENDING_STATUSES,
                ).order_by('pk').values_list('pk', flat=True)[:MAX_SELECTION + 1])
                if len(requested_ids) > MAX_SELECTION:
                    return Response({
                        'detail': 'More than 5000 pending cards. Select a smaller group.',
                    }, status=400)
            elif scope == 'selected':
                requested_ids = request.data.get('review_ids')
                if (not isinstance(requested_ids, list) or not requested_ids
                        or len(requested_ids) > MAX_SELECTION
                        or any(type(pk) is not int or pk <= 0 for pk in requested_ids)
                        or len(requested_ids) != len(set(requested_ids))):
                    return Response({'detail': 'Select unique valid card IDs (1 to 5000).'},
                                    status=400)
            else:
                return Response({'detail': 'Selection must be all or selected.'}, status=400)

            if not requested_ids:
                return Response({'detail': 'No pending employee review cards.'}, status=400)

            reviews = list(EmployeeImportReview.objects.filter(
                pk__in=requested_ids,
            ).order_by('pk').only(
                'pk', 'fingerprint', 'employee_payload', 'status', 'updated_at',
            ))
            if len(reviews) != len(requested_ids):
                return Response({'detail': 'Some selected cards no longer exist.'}, status=409)
            eligible = {
                str(review.pk): review_digest(review) for review in reviews
                if review.status in PENDING_STATUSES
            }
            blocked = len(requested_ids) - len(eligible)
            if not eligible:
                return Response({
                    'detail': 'No selected pending cards can be discarded.',
                }, status=409)
            preview_token = signing.dumps({
                'review_hashes': eligible,
                'owner_user_id': request.user.pk,
                'selection': scope,
            }, salt=TOKEN_SALT, compress=True)
            return Response({
                'mode': 'preview',
                'selection': scope,
                'selected_count': len(requested_ids),
                'discardable_count': len(eligible),
                'blocked_count': blocked,
                'discardable_ids': [int(pk) for pk in eligible],
                'preview_token': preview_token,
                'batch_size': MAX_COMMIT_BATCH,
                'warning': ('Cards will be archived as discarded and hidden from the '
                            'pending queue; original Excel review data is retained. '
                            'This does not alter any employee records.'),
            }, headers={'Cache-Control': 'no-store'})

        if request.data.get('confirmed') is not True:
            return Response({'detail': 'Explicit confirmation is required.'}, status=400)

        try:
            signed = signing.loads(
                request.data.get('preview_token'), salt=TOKEN_SALT, max_age=TOKEN_AGE,
            )
        except (signing.BadSignature, signing.SignatureExpired, TypeError, ValueError):
            return Response({'detail': 'Preview expired or invalid. Refresh preview.'}, status=409)

        if (not isinstance(signed, dict)
                or signed.get('owner_user_id') != request.user.pk
                or not isinstance(signed.get('review_hashes'), dict)):
            return Response({'detail': 'Invalid preview or wrong administrator.'}, status=409)
        hashes = signed['review_hashes']
        ids = request.data.get('review_ids')
        if (not isinstance(ids, list) or not ids
                or len(ids) > MAX_COMMIT_BATCH
                or len(ids) != len(set(ids))
                or any(type(pk) is not int or str(pk) not in hashes for pk in ids)):
            return Response({'detail': 'Choose up to 100 IDs from the confirmed preview.'},
                            status=400)

        ignored = 0
        skipped = 0
        reasons = {'changed': 0, 'already_processed': 0}
        for pk in ids:
            with transaction.atomic():
                review = EmployeeImportReview.objects.select_for_update().filter(pk=pk).first()
                if not review or review_digest(review) != hashes[str(pk)]:
                    skipped += 1
                    reasons['changed'] += 1
                    continue
                if review.status not in PENDING_STATUSES:
                    skipped += 1
                    reasons['already_processed'] += 1
                    continue

                # Preserve raw_payload, employee_payload, issues and warnings.
                review.status = 'discarded'
                review.resolved_by = request.user
                review.resolved_at = timezone.now()
                review.save(update_fields=[
                    'status', 'resolved_by', 'resolved_at', 'updated_at',
                ])
                AuditLog.objects.create(
                    user=str(request.user),
                    action='bulk_discard_employee_import_review',
                    model_name='EmployeeImportReview',
                    record_id=str(review.pk),
                )
                ignored += 1
        return Response({
            'mode': 'committed',
            'processed_count': len(ids),
            'discarded_count': ignored,
            'skipped_count': skipped,
            'skipped_reasons': [
                {'reason': key, 'count': count} for key, count in reasons.items() if count
            ],
        }, headers={'Cache-Control': 'no-store'})
