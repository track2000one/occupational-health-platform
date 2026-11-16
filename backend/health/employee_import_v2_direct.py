"""Single-step V2 approval: create eligible identities, fill blanks, restore verified originals.

The applicant's Excel file never becomes a second staff registry. Existing
national IDs are resolved to existing employee rows. Missing optional fields
are NOT blockers. Records with mismatching identities, names, or active-service
evidence are excluded from this path for individual investigation.

No write endpoint is available without both relevant independent settings gates.
"""
from django.conf import settings
from django.core import signing
from django.db import transaction
from django.utils import timezone
from rest_framework.response import Response

from .employee_import_v2_commit import (
    planned_action_counts, preview_commit_info, registry_fingerprint,
    commit_safe_plan,
)
from .employee_import_v2_matching import registry_match
from .employee_import_v2_restore import _current_snapshot
from .employee_import_v2 import identity
from .models import (
    AuditLog, DataImportBatch, Employee, EmployeeArchiveEvent,
    EmployeeRegistryResetBatch,
)

SALT = 'v2-single-button-employee-roster-approval-2026-v1'
TOKEN_AGE = 600
NO_CACHE = {'Cache-Control': 'private, no-store'}
MAX_RESTORE = 1500


def _restore_rows(plan):
    return sorted({
        item['row'] for item in (plan.get('_internal_review_queue') or [])
    })


def _prepare(sheet_rows, plan):
    selected = _restore_rows(plan)
    if len(selected) > MAX_RESTORE:
        raise ValueError('حجم دفعة الاستعادة يتجاوز الحد الآمن.')
    snapshot = _current_snapshot(sheet_rows, selected) if selected else None
    counts = planned_action_counts(plan)
    return selected, snapshot, counts


def approval_preview(plan, sheet_rows, file_sha, sheet, user_id):
    """Build a signed approval offer with explicit action counts and skips."""
    chosen, snapshot, counts = _prepare(sheet_rows, plan)
    new = counts['create']
    fill = counts['fill_only']
    restore = len(chosen)
    total = new + fill + restore
    can_create = bool(getattr(settings, 'EMPLOYEE_IMPORT_V2_COMMIT_ENABLED', False))
    can_restore = bool(getattr(settings, 'EMPLOYEE_V2_ARCHIVE_RESTORE_ENABLED', False))
    ready = bool(total and (not (new or fill) or can_create)
                 and (not restore or can_restore))
    approval = {
        'create': new, 'fill': fill,
        'restore_original': restore,
        'needs_manual_review': plan['rows_total'] - total,
        'missing_optional_count': plan['yellow_missing_information'],
        'available': ready,
        'requires_employment_and_backup_verification': bool(restore),
        'confirm_phrase': f'اعتماد إدراج {total} موظفًا',
        'notice': (
            'سيضاف الموظفون الجدد ويُستكمل الناقص دون استبدال بيانات صحيحة. '
            'تستعاد السجلات الأصلية التي تطابقت أسماءها ومعرّفاتها وتوثيق '
            'تصفيرها فقط، وتبقى الحالات المتعارضة للمراجعة. '
            'نقص البيانات الاختيارية لا يمنع الإدراج.'
        ),
    }
    token = signing.dumps({
        'kind': 'v2-single-button-approval',
        'user': user_id, 'file_sha': file_sha, 'sheet': sheet,
        'counts': {k: approval[k] for k in (
            'create', 'fill', 'restore_original', 'needs_manual_review')},
        'planned_fingerprint': registry_fingerprint(plan),
        'restore_fingerprint': snapshot['fingerprint'] if snapshot else None,
        'restore_rows': chosen,
    }, salt=SALT)
    approval['approval_token'] = token
    return approval


def approve_roster(request, sheet_rows, file_sha, sheet):
    if not request.user.is_superuser:
        return Response({'detail': 'هذه العملية للمسؤول الأعلى فقط.'},
                        status=403, headers=NO_CACHE)
    reason = str(request.data.get('reason') or '').strip()
    if (request.data.get('confirmed') != 'true'
            or request.data.get('identity_checked') != 'true'
            or not 20 <= len(reason) <= 500):
        return Response({'detail': 'يلزم مبرر واضح والتحقق من المصدر والموافقة الصريحة.'},
                        status=400, headers=NO_CACHE)
    try:
        signed = signing.loads(
            request.data.get('approval_token'), salt=SALT, max_age=TOKEN_AGE,
        )
    except (signing.BadSignature, signing.SignatureExpired, TypeError, ValueError):
        return Response({'detail': 'انتهت صلاحية الفحص؛ أعد فحص الملف.'},
                        status=409, headers=NO_CACHE)
    if (not isinstance(signed, dict)
            or signed.get('kind') != 'v2-single-button-approval'
            or signed.get('user') != request.user.pk
            or signed.get('file_sha') != file_sha
            or signed.get('sheet') != sheet):
        return Response({'detail': 'لا تتطابق الموافقة مع الملف أو المستخدم.'},
                        status=409, headers=NO_CACHE)

    summary = signed.get('counts') or {}
    create, fill, restore = (summary.get('create'), summary.get('fill'),
                             summary.get('restore_original'))
    if not all(type(v) is int and v >= 0 for v in (create, fill, restore)):
        return Response({'detail': 'بيانات الاعتماد غير صالحة.'},
                        status=409, headers=NO_CACHE)
    if (create or fill) and not getattr(
        settings, 'EMPLOYEE_IMPORT_V2_COMMIT_ENABLED', False
    ):
        return Response({'detail': 'إدراج الموظفين غير مفعل في بيئة التشغيل.'},
                        status=403, headers=NO_CACHE)
    if restore and not getattr(settings, 'EMPLOYEE_V2_ARCHIVE_RESTORE_ENABLED', False):
        return Response({'detail': 'استعادة المؤرشفين مغلقة حتى تحقق النسخ الاحتياطي.'},
                        status=403, headers=NO_CACHE)
    if not 0 < create + fill + restore <= MAX_RESTORE:
        return Response({'detail': 'لا توجد سجلات مؤهلة أو تجاوز العدد المسموح.'},
                        status=409, headers=NO_CACHE)
    hr_ref = str(request.data.get('hr_reference') or '').strip()
    backup_ref = str(request.data.get('backup_reference') or '').strip()
    if restore and (
        not 8 <= len(hr_ref) <= 255
        or not 8 <= len(backup_ref) <= 255
        or request.data.get('verified_current_employment') != 'true'
        or request.data.get('verified_backup_restore') != 'true'
    ):
        return Response({
            'detail': 'يلزم التحقق من إثبات خدمة الموظفين الحالي ونسخة PostgreSQL احتياطية مختبرة، وإدخال مرجعيهما.',
        }, status=400, headers=NO_CACHE)
    if request.data.get('confirm_phrase') != f'اعتماد إدراج {create + fill + restore} موظفًا':
        return Response({'detail': 'عبارة تأكيد الاعتماد لا تتطابق.'},
                        status=400, headers=NO_CACHE)

    try:
        with transaction.atomic():
            # Serialize all rows and reset metadata before recomputing the plan.
            ids = [
                identity(row['national_id']) for row in sheet_rows
            ]
            list(Employee.objects.select_for_update()
                 .filter(national_id__in=ids).order_by('pk')
                 .values_list('pk', flat=True))
            list(EmployeeRegistryResetBatch.objects.select_for_update()
                 .order_by('pk').values_list('pk', flat=True))
            fresh = registry_match(
                sheet_rows, review_category='candidate_for_administrative_review'
            )
            chosen, snapshot, counts = _prepare(sheet_rows, fresh)
            actual = {
                'create': counts['create'], 'fill': counts['fill_only'],
                'restore_original': len(chosen),
                'needs_manual_review': fresh['rows_total'] -
                    counts['create'] - counts['fill_only'] - len(chosen),
            }
            if (actual != summary or chosen != signed.get('restore_rows')
                    or registry_fingerprint(fresh) != signed.get('planned_fingerprint')
                    or (snapshot['fingerprint'] if snapshot else None)
                        != signed.get('restore_fingerprint')):
                return Response({
                    'detail': 'تغير السجل أو الملف منذ الفحص. أعد الفحص والاعتماد.',
                }, status=409, headers=NO_CACHE)

            created = filled = provisional = 0
            if create or fill:
                internal = preview_commit_info(
                    fresh, file_sha, sheet, request.user.pk,
                )
                # Reuse existing reviewed, non-destructive new/fill algorithm.
                # It has its own fingerprint/replay protection.
                proxy = type('ApprovalRequest', (), {
                    'user': request.user,
                    'data': {
                        'commit_token': internal['commit_token'],
                        'confirm_phrase': internal['confirm_phrase'],
                        'confirmed': 'true', 'identity_checked': 'true',
                        'reason': reason,
                    },
                })()
                result = commit_safe_plan(
                    proxy, fresh, file_sha, sheet, sheet_rows,
                )
                if result.status_code != 200:
                    # No preceding writes; nested safe-plan transaction rolls back.
                    return result
                created, filled, provisional = (
                    result.data['created'], result.data['filled'],
                    result.data['provisional'],
                )
            if chosen:
                employees = snapshot['employees']
                now = timezone.now()
                updated = Employee.objects.filter(
                    pk__in=[employee.pk for employee in employees], is_archived=True,
                ).update(
                    is_archived=False, archive_reason='', archived_at=None,
                    archived_by=None, updated_at=now,
                )
                if updated != len(chosen):
                    raise ValueError('تغير عدد السجلات أثناء الاستعادة؛ ألغيت المعاملة.')
                audit_reason = (
                    f'{reason} | HR: {hr_ref} | backup: {backup_ref} '
                    '| Approved Excel V2 roster'
                )
                EmployeeArchiveEvent.objects.bulk_create([
                    EmployeeArchiveEvent(
                        employee_id=employee.pk,
                        action=EmployeeArchiveEvent.Action.RESTORE,
                        reason=audit_reason, performed_by=request.user,
                    ) for employee in employees
                ], batch_size=250)
                AuditLog.objects.bulk_create([
                    AuditLog(
                        user=str(request.user),
                        action='v2_roster_direct_approved_restore',
                        model_name='Employee', record_id=str(employee.pk),
                    ) for employee in employees
                ], batch_size=250)
                if not (create or fill):
                    batch = DataImportBatch.objects.create(
                        file_name='employee-import-v2.xlsx', sheet_name=sheet,
                        mode='commit', status='committed',
                        total_rows=fresh['rows_total'],
                        valid_rows=len(chosen), imported_records=len(chosen),
                        skipped_rows=fresh['rows_total'] - len(chosen),
                        summary={
                            'v2_source_sha256': file_sha,
                            'restored_original': len(chosen),
                            'approved_by_user_id': request.user.pk,
                        },
                        created_by=request.user,
                    )
                    AuditLog.objects.create(
                        user=str(request.user),
                        action='v2_roster_direct_approval',
                        model_name='DataImportBatch', record_id=str(batch.pk),
                    )
            return Response({
                'mode': 'employee_v2_direct_approved',
                'created': created, 'filled': filled, 'provisional': provisional,
                'restored': len(chosen),
                'skipped': actual['needs_manual_review'],
                'missing_optional_count': fresh['yellow_missing_information'],
                'notice': (
                    'تمت معالجة المؤهلين مباشرة دون فقد البيانات الأصلية. '
                    'تظهر السجلات ذات النواقص كبطاقات صفراء، والحالات '
                    'المتعارضة باقية للمراجعة.'
                ),
            }, headers=NO_CACHE)
    except ValueError:
        return Response({
            'detail': 'حدث تعارض أثناء الاعتماد؛ أُلغيت الدفعة كاملة ولم تحفظ بيانات جزئية.',
        }, status=409, headers=NO_CACHE)
