"""Superuser-only, two-phase reversible reset of the active employee directory.

This deliberately never deletes an Employee, associated clinical data,
employee import history, or identity keys. Unlike the isolated Staging QA
reset, Production resets are soft-archival batches with batch restoration.
"""
from hashlib import sha256
import json

from django.core import signing
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AuditLog, Employee, EmployeeArchiveEvent, EmployeeRegistryResetBatch

TOKEN_SALT = 'occupational-employee-registry-bulk-reset-2026-v1'
TOKEN_LIFETIME = 300
MAX_BATCH = 5000


def digest_of_records(rows, context):
    source = json.dumps(
        {'records': rows, 'context': context},
        ensure_ascii=False, separators=(',', ':'), sort_keys=True,
    )
    return sha256(source.encode('utf-8')).hexdigest()


def active_snapshot(lock=False):
    queryset = Employee.objects.filter(is_archived=False).order_by('pk')
    if lock:
        queryset = queryset.select_for_update()
    records = list(queryset.values_list('pk', 'updated_at'))
    return {
        'ids': [pk for pk, _ in records],
        'count': len(records),
        'hash': digest_of_records(
            [[pk, stamp.isoformat() if stamp else ''] for pk, stamp in records],
            'archive',
        ),
    }


def last_restorable_batch():
    # Most recent unfinished batch: only restore records archived by THIS
    # batch, not employees archived individually before or after it.
    return EmployeeRegistryResetBatch.objects.filter(
        restored_at__isnull=True,
    ).order_by('-created_at').first()


def restore_snapshot(batch, lock=False):
    if batch is None:
        return None
    queryset = Employee.objects.filter(
        pk__in=batch.employee_ids, is_archived=True,
        archived_at=batch.applied_at,
    ).order_by('pk')
    if lock:
        queryset = queryset.select_for_update()
    rows = list(queryset.values_list('pk', 'updated_at'))
    return {
        'batch_id': str(batch.pk),
        'ids': [pk for pk, _ in rows],
        'count': len(rows),
        'original_count': len(batch.employee_ids),
        'hash': digest_of_records(
            [[pk, stamp.isoformat() if stamp else ''] for pk, stamp in rows],
            'restore:' + str(batch.pk),
        ),
    }


class EmployeeRegistryResetView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not request.user.is_superuser:
            return Response(
                {'detail': 'Only a system superuser may perform a bulk registry reset.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        action = str(request.data.get('action') or '').strip()
        if action not in {'preview', 'execute', 'restore_preview', 'restore'}:
            return Response({'detail': 'Invalid reset action.'},
                            status=status.HTTP_400_BAD_REQUEST)

        if action in {'preview', 'restore_preview'}:
            if action == 'preview':
                data = active_snapshot()
                if data['count'] > MAX_BATCH:
                    return Response(
                        {'detail': 'Too many employees for a safe reset. Contact an administrator.'},
                        status=status.HTTP_409_CONFLICT,
                    )
                payload = {
                    'kind': 'archive', 'count': data['count'], 'hash': data['hash'],
                }
                batch_restore = restore_snapshot(last_restorable_batch())
                return Response({
                    'mode': 'preview',
                    'total_active': data['count'],
                    'will_archive': data['count'],
                    'already_archived': Employee.objects.filter(is_archived=True).count(),
                    'restorable_from_last_batch': batch_restore['count'] if batch_restore else 0,
                    'confirm_phrase': f"تصفير {data['count']} موظفًا",
                    'preview_token': signing.dumps(payload, salt=TOKEN_SALT),
                    'notice': 'Reversible archival only: employee identities and clinical records remain stored.',
                }, headers={'Cache-Control': 'private, no-store'})
            batch = last_restorable_batch()
            data = restore_snapshot(batch)
            if not data or data['count'] == 0:
                return Response({'detail': 'No records remain eligible for bulk restoration.'},
                                status=status.HTTP_409_CONFLICT)
            return Response({
                'mode': 'restore_preview',
                'restorable': data['count'],
                'previous_batch_total': data['original_count'],
                'confirm_phrase': f"استعادة {data['count']} موظفًا",
                'preview_token': signing.dumps({
                    'kind': 'restore', 'batch_id': data['batch_id'],
                    'count': data['count'], 'hash': data['hash'],
                }, salt=TOKEN_SALT),
            }, headers={'Cache-Control': 'private, no-store'})

        # Both write actions require a fresh preview and two independent
        # factors of user intent: a phrase containing the actual row count,
        # plus a sufficiently explicit reason and checkbox.
        reason = str(request.data.get('reason') or '').strip()
        if not 20 <= len(reason) <= 500:
            return Response({'reason': 'A specific reason (20–500 characters) is required.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if request.data.get('confirmed') is not True:
            return Response({'confirmed': 'Explicit confirmation is required.'},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            token = signing.loads(
                request.data.get('preview_token'), salt=TOKEN_SALT,
                max_age=TOKEN_LIFETIME,
            )
        except (signing.BadSignature, signing.SignatureExpired, TypeError, ValueError):
            return Response({'detail': 'Preview expired or invalid. Preview again.'},
                            status=status.HTTP_409_CONFLICT)
        kind = 'archive' if action == 'execute' else 'restore'
        if not isinstance(token, dict) or token.get('kind') != kind:
            return Response({'detail': 'Preview action mismatch.'},
                            status=status.HTTP_409_CONFLICT)

        with transaction.atomic():
            # Lock all existing employee records to minimize races with edits,
            # individual archive or restore, and other bulk requests.
            list(Employee.objects.select_for_update().order_by('pk').values_list('pk', flat=True))
            if kind == 'archive':
                snapshot = active_snapshot(lock=True)
                if not snapshot['count'] or snapshot['count'] > MAX_BATCH:
                    return Response({'detail': 'No eligible records or maximum exceeded.'},
                                    status=status.HTTP_409_CONFLICT)
                if (token.get('count') != snapshot['count'] or
                        token.get('hash') != snapshot['hash']):
                    return Response({'detail': 'Employee list changed. Preview again.'},
                                    status=status.HTTP_409_CONFLICT)
                phrase = f"تصفير {snapshot['count']} موظفًا"
                if request.data.get('confirm_phrase') != phrase:
                    return Response({'confirm_phrase': 'Exact count confirmation is required.'},
                                    status=status.HTTP_400_BAD_REQUEST)
                instant = timezone.now()
                batch = EmployeeRegistryResetBatch.objects.create(
                    employee_ids=snapshot['ids'], reason=reason,
                    created_by=request.user, applied_at=instant,
                )
                changed = Employee.objects.filter(
                    pk__in=snapshot['ids'], is_archived=False,
                ).update(
                    is_archived=True, archive_reason=reason,
                    archived_at=instant, archived_by=request.user,
                    updated_at=instant,
                )
                if changed != snapshot['count']:
                    raise RuntimeError('Bulk archive count changed; transaction rolled back.')
                EmployeeArchiveEvent.objects.bulk_create([
                    EmployeeArchiveEvent(
                        employee_id=pk, action=EmployeeArchiveEvent.Action.ARCHIVE,
                        reason=reason, performed_by=request.user,
                    ) for pk in snapshot['ids']
                ], batch_size=250)
                AuditLog.objects.create(
                    user=str(request.user), action='bulk_reset_employee_registry',
                    model_name='EmployeeRegistryResetBatch', record_id=str(batch.pk),
                )
                if Employee.objects.filter(is_archived=False).exists():
                    raise RuntimeError('An employee record was not archived; transaction rolled back.')
                result = {
                    'mode': 'archived', 'archived_count': changed,
                    'active_count': 0, 'batch_id': str(batch.pk),
                    'notice': 'Only the active employee directory was reset. All employee and medical records remain stored.',
                }
            else:
                batch_id = token.get('batch_id')
                batch = EmployeeRegistryResetBatch.objects.select_for_update().filter(
                    pk=batch_id, restored_at__isnull=True,
                ).first()
                latest = last_restorable_batch()
                if batch is None or latest is None or batch.pk != latest.pk:
                    return Response({'detail': 'The restoration batch changed. Preview again.'},
                                    status=status.HTTP_409_CONFLICT)
                snapshot = restore_snapshot(batch, lock=True)
                if (not snapshot or snapshot['count'] <= 0 or
                        token.get('count') != snapshot['count'] or
                        token.get('hash') != snapshot['hash']):
                    return Response({'detail': 'Eligible records changed. Preview again.'},
                                    status=status.HTTP_409_CONFLICT)
                phrase = f"استعادة {snapshot['count']} موظفًا"
                if request.data.get('confirm_phrase') != phrase:
                    return Response({'confirm_phrase': 'Exact restoration confirmation is required.'},
                                    status=status.HTTP_400_BAD_REQUEST)
                instant = timezone.now()
                changed = Employee.objects.filter(
                    pk__in=snapshot['ids'], is_archived=True,
                    archived_at=batch.applied_at,
                ).update(
                    is_archived=False, archive_reason='',
                    archived_at=None, archived_by=None, updated_at=instant,
                )
                if changed != snapshot['count']:
                    raise RuntimeError('Bulk restore count mismatch; transaction rolled back.')
                EmployeeArchiveEvent.objects.bulk_create([
                    EmployeeArchiveEvent(
                        employee_id=pk, action=EmployeeArchiveEvent.Action.RESTORE,
                        reason=reason, performed_by=request.user,
                    ) for pk in snapshot['ids']
                ], batch_size=250)
                batch.restored_at = instant
                batch.restored_by = request.user
                batch.restoration_reason = reason
                batch.save(update_fields=['restored_at', 'restored_by', 'restoration_reason'])
                AuditLog.objects.create(
                    user=str(request.user), action='bulk_restore_employee_registry',
                    model_name='EmployeeRegistryResetBatch', record_id=str(batch.pk),
                )
                result = {
                    'mode': 'restored', 'restored_count': changed,
                    'batch_id': str(batch.pk),
                    'notice': 'Employees restored without modifying employment status or medical history.',
                }
        return Response(result, headers={'Cache-Control': 'private, no-store'})
