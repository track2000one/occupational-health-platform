"""Production-safe, reversible cleanup of Excel employee REVIEW cards only.

Never DELETE a row. Never modify an Employee, medical history or clinical record.
Only superusers can preview/confirm the status transition. A signed, short-lived
snapshot protects against removing a changed/new review unintentionally.
"""
from hashlib import sha256
import json

from django.core import signing
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AuditLog, EmployeeImportReview, EmployeeImportReviewCleanupBatch


PENDING = ('pending', 'conflict')
MAX_REVIEW_CLEANUP = 15000
TOKEN_SALT = 'employee-review-cleanup-production-safe-v1'
TOKEN_AGE_SECONDS = 300


def snapshot_digest(rows, context):
    raw = json.dumps({'context': context, 'rows': rows},
                     ensure_ascii=False, separators=(',', ':'), sort_keys=True)
    return sha256(raw.encode('utf-8')).hexdigest()


def pending_snapshot(lock=False):
    queryset = EmployeeImportReview.objects.filter(
        status__in=PENDING,
    ).order_by('pk')
    if lock:
        queryset = queryset.select_for_update()
    rows = list(queryset.values_list('pk', 'status', 'updated_at')[:MAX_REVIEW_CLEANUP + 1])
    if len(rows) > MAX_REVIEW_CLEANUP:
        return None
    data = [[pk, state, updated.isoformat()] for pk, state, updated in rows]
    return {
        'count': len(rows),
        'original_statuses': {str(pk): state for pk, state, _ in rows},
        'hash': snapshot_digest(data, 'discard-pending-conflict'),
    }


def latest_unrestored_batch():
    return EmployeeImportReviewCleanupBatch.objects.filter(
        restored_at__isnull=True,
    ).order_by('-created_at', '-pk').first()


def restorable_snapshot(batch, lock=False):
    if batch is None:
        return None
    ids = [int(pk) for pk in batch.original_statuses]
    query = EmployeeImportReview.objects.filter(
        pk__in=ids, status='discarded',
        resolved_at=batch.applied_at, resolved_by_id=batch.created_by_id,
    ).order_by('pk')
    if lock:
        query = query.select_for_update()
    rows = list(query.values_list('pk', 'updated_at'))
    data = [[pk, updated.isoformat()] for pk, updated in rows]
    return {
        'count': len(rows),
        'ids': [pk for pk, _ in rows],
        'hash': snapshot_digest(data, 'restore:' + str(batch.pk)),
        'batch_id': str(batch.pk),
        'original_count': len(ids),
    }


class EmployeeImportReviewCleanupView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not request.user.is_superuser:
            return Response({'detail': 'تنظيف بطاقات المراجعة متاح للمسؤول الأعلى فقط.'},
                            status=status.HTTP_403_FORBIDDEN)
        action = request.data.get('action')
        if action not in ('preview', 'commit', 'restore_preview', 'restore'):
            return Response({'detail': 'إجراء غير معروف.'},
                            status=status.HTTP_400_BAD_REQUEST)

        if action == 'preview':
            snap = pending_snapshot()
            if snap is None:
                return Response({'detail': 'عدد البطاقات تجاوز حد 15000؛ يلزم معالجة محددة.'},
                                status=status.HTTP_409_CONFLICT)
            if not snap['count']:
                return Response({'detail': 'لا توجد بطاقات مراجعة معلقة أو متعارضة لتنظيفها.'},
                                status=status.HTTP_409_CONFLICT)
            return Response({
                'mode': 'preview', 'eligible_count': snap['count'],
                'pending_count': sum(v == 'pending' for v in snap['original_statuses'].values()),
                'conflict_count': sum(v == 'conflict' for v in snap['original_statuses'].values()),
                'protected_statuses': ['activated', 'discarded'],
                'confirm_phrase': f"تنظيف {snap['count']} بطاقة مراجعة",
                'preview_token': signing.dumps({
                    'action': 'discard', 'count': snap['count'],
                    'hash': snap['hash'], 'admin_id': request.user.pk,
                }, salt=TOKEN_SALT),
                'notice': ('المعاينة لا تُغيّر أي بيانات. لن تُمس سجلات الموظفين '
                           'أو سجلاتهم الطبية؛ ستُستبعد بطاقات المراجعة فقط.'),
            }, headers={'Cache-Control': 'private, no-store'})

        if action == 'restore_preview':
            batch = latest_unrestored_batch()
            snap = restorable_snapshot(batch)
            if not snap or not snap['count']:
                return Response({'detail': 'لا توجد دفعة تنظيف قابلة للاستعادة.'},
                                status=status.HTTP_409_CONFLICT)
            return Response({
                'mode': 'restore_preview',
                'eligible_count': snap['count'],
                'original_count': snap['original_count'],
                'confirm_phrase': f"استعادة {snap['count']} بطاقة مراجعة",
                'preview_token': signing.dumps({
                    'action': 'restore', 'count': snap['count'],
                    'hash': snap['hash'], 'batch_id': snap['batch_id'],
                    'admin_id': request.user.pk,
                }, salt=TOKEN_SALT),
            }, headers={'Cache-Control': 'private, no-store'})

        reason = str(request.data.get('reason') or '').strip()
        if len(reason) < 20 or len(reason) > 500:
            return Response({'reason': 'يلزم مبرر إداري من 20 إلى 500 حرف.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if request.data.get('confirmed') is not True:
            return Response({'confirmed': 'يلزم تأكيد العملية صراحة.'},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            token = signing.loads(
                request.data.get('preview_token'), salt=TOKEN_SALT,
                max_age=TOKEN_AGE_SECONDS,
            )
        except (signing.BadSignature, signing.SignatureExpired, TypeError, ValueError):
            return Response({'detail': 'انتهت المعاينة أو لم تعد صالحة. أعد الفحص.'},
                            status=status.HTTP_409_CONFLICT)
        expected = 'discard' if action == 'commit' else 'restore'
        if (not isinstance(token, dict) or token.get('action') != expected or
                token.get('admin_id') != request.user.pk):
            return Response({'detail': 'المعاينة لا تخص هذه العملية أو المستخدم.'},
                            status=status.HTTP_409_CONFLICT)

        with transaction.atomic():
            if action == 'commit':
                snap = pending_snapshot(lock=True)
                if (snap is None or not snap['count'] or snap['count'] != token.get('count')
                        or snap['hash'] != token.get('hash')):
                    return Response({'detail': 'تغيّر عدد أو محتوى بطاقات المراجعة؛ أعد المعاينة.'},
                                    status=status.HTTP_409_CONFLICT)
                if request.data.get('confirm_phrase') != f"تنظيف {snap['count']} بطاقة مراجعة":
                    return Response({'confirm_phrase': 'أدخل عبارة التأكيد مع العدد المطابق.'},
                                    status=status.HTTP_400_BAD_REQUEST)
                stamp = timezone.now()
                batch = EmployeeImportReviewCleanupBatch.objects.create(
                    original_statuses=snap['original_statuses'],
                    reason=reason, created_by=request.user, applied_at=stamp,
                )
                ids = [int(pk) for pk in snap['original_statuses']]
                changed = EmployeeImportReview.objects.filter(
                    pk__in=ids, status__in=PENDING,
                ).update(
                    status='discarded', resolved_by=request.user,
                    resolved_at=stamp, updated_at=stamp,
                )
                if changed != snap['count']:
                    raise RuntimeError('Cleanup count changed; transaction rolled back.')
                AuditLog.objects.create(
                    user=str(request.user), action='bulk_discard_employee_import_reviews',
                    model_name='EmployeeImportReviewCleanupBatch', record_id=str(batch.pk),
                )
                return Response({
                    'mode': 'committed', 'discarded_count': changed,
                    'batch_id': str(batch.pk),
                    'notice': 'أُخفيت بطاقات المراجعة القديمة دون حذف موظف أو ملف صحي واحد.',
                }, headers={'Cache-Control': 'private, no-store'})

            batch = EmployeeImportReviewCleanupBatch.objects.select_for_update().filter(
                pk=token.get('batch_id'), restored_at__isnull=True,
            ).first()
            if batch is None or latest_unrestored_batch().pk != batch.pk:
                return Response({'detail': 'دفعة الاستعادة تغيّرت؛ أعد المعاينة.'},
                                status=status.HTTP_409_CONFLICT)
            snap = restorable_snapshot(batch, lock=True)
            if (snap is None or not snap['count'] or snap['count'] != token.get('count')
                    or snap['hash'] != token.get('hash')):
                return Response({'detail': 'تغيّرت بطاقات الدفعة؛ أعد معاينة الاستعادة.'},
                                status=status.HTTP_409_CONFLICT)
            if request.data.get('confirm_phrase') != f"استعادة {snap['count']} بطاقة مراجعة":
                return Response({'confirm_phrase': 'أدخل عبارة تأكيد الاستعادة مع العدد.'},
                                status=status.HTTP_400_BAD_REQUEST)
            total_restored = 0
            for initial_status in PENDING:
                ids = [
                    pk for pk in snap['ids']
                    if batch.original_statuses[str(pk)] == initial_status
                ]
                if ids:
                    total_restored += EmployeeImportReview.objects.filter(
                        pk__in=ids, status='discarded',
                        resolved_at=batch.applied_at,
                        resolved_by_id=batch.created_by_id,
                    ).update(
                        status=initial_status, resolved_at=None,
                        resolved_by=None, updated_at=timezone.now(),
                    )
            if total_restored != snap['count']:
                raise RuntimeError('Restore count changed; transaction rolled back.')
            batch.restored_at = timezone.now()
            batch.restored_by = request.user
            batch.restoration_reason = reason
            batch.save(update_fields=['restored_at', 'restored_by', 'restoration_reason'])
            AuditLog.objects.create(
                user=str(request.user), action='restore_bulk_employee_import_reviews',
                model_name='EmployeeImportReviewCleanupBatch', record_id=str(batch.pk),
            )
            return Response({
                'mode': 'restored', 'restored_count': total_restored,
                'batch_id': str(batch.pk),
            }, headers={'Cache-Control': 'private, no-store'})
