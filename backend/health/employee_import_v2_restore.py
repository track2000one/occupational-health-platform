"""Guarded reactivation of EXISTING archived employee identities.

Nothing is created or filled. Missing optional fields remain missing and can
be completed after restoration. Never touch clinical records, national ID,
employee name, employee number, email, center or employment status.

Production write gate is OFF by default. Operator must verify a real backup,
current employment documentation and the case-by-case source comparison.
"""
import hashlib
import json

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.utils import timezone
from rest_framework.response import Response

from .employee_import_v2 import identity
from .employee_import_v2_matching import norm_text, registry_match
from .models import (
    AuditLog, Employee, EmployeeArchiveEvent, EmployeeRegistryResetBatch,
)

RESTORE_TOKEN_SALT = 'v2-guarded-existing-employee-restore-2026-v1'
RESTORE_TOKEN_MAX_AGE = 600
MAX_RESTORE_BATCH = 25
NO_CACHE = {'Cache-Control': 'private, no-store'}


def _selected_rows(raw):
    """Only explicit, unique Excel source row numbers, never identity strings."""
    if not isinstance(raw, str) or len(raw) > 250:
        raise ValueError('حدد صفوف الموظفين المراد مراجعة استعادتهم.')
    items = raw.split(',')
    if not 1 <= len(items) <= MAX_RESTORE_BATCH:
        raise ValueError('حد الاستعادة للمراجعة الواحدة هو 25 موظفًا.')
    if any(not item.isascii() or not item.isdecimal() for item in items):
        raise ValueError('تحديد الصفوف غير صالح.')
    numbers = [int(item) for item in items]
    if (len(numbers) != len(set(numbers)) or any(value < 2 for value in numbers)):
        raise ValueError('لا يمكن تكرار رقم صف أو تحديد صف عنوان.')
    return sorted(numbers)


def _current_snapshot(source_rows, chosen):
    """Fail closed if ANY row is not a uniquely matched, active, archived case."""
    report = registry_match(
        source_rows, review_category='candidate_for_administrative_review',
    )
    qualified = {
        item['row'] for item in report['_internal_review_queue']
    }
    if not set(chosen).issubset(qualified):
        raise ValueError(
            'توجد حالة غير مطابقة لشروط المراجعة الأولية أو تغير السجل. '
            'أعد الفحص وراجع المستندات الوظيفية.'
        )
    sources = {row['_row']: row for row in source_rows}
    selected_source = {number: sources[number] for number in chosen}
    ids = [identity(source['national_id']) for source in selected_source.values()]
    employees = {
        employee.national_id: employee
        for employee in Employee.objects.filter(national_id__in=ids)
    }
    batches = list(EmployeeRegistryResetBatch.objects.all())
    state = []
    selected_employees = []
    for rownum, source in selected_source.items():
        nid = identity(source['national_id'])
        employee = employees.get(nid)
        if not employee or not employee.is_archived or employee.employment_status != 'active':
            raise ValueError('تغيّرت حالة أحد الموظفين أو لا يملك سجلًا مؤرشفًا.')
        matches = [
            batch for batch in batches
            if batch.restored_at is None
            and str(employee.pk) in {str(pk) for pk in (batch.employee_ids or [])}
            and employee.archived_at is not None
            and batch.applied_at == employee.archived_at
        ]
        if (len(matches) != 1 or
                employee.archive_reason.strip() != (matches[0].reason or '').strip() or
                norm_text(source['name']) != norm_text(employee.name)):
            raise ValueError('لا يوجد دليل أرشفة فريد أو تطابق اسم معتمد لهذه الحالة.')
        batch = matches[0]
        state.append({
            'row': rownum, 'pk': employee.pk, 'id': employee.national_id,
            'name': employee.name, 'employee_number': employee.employee_number,
            'email': employee.email, 'is_archived': employee.is_archived,
            'employment_status': employee.employment_status,
            'archived_at': employee.archived_at.isoformat(),
            'archive_reason': employee.archive_reason,
            'updated_at': employee.updated_at.isoformat(),
            'reset_pk': str(batch.pk),
            'reset_applied_at': batch.applied_at.isoformat(),
            'reset_restored_at': None,
        })
        selected_employees.append(employee)
    digest = hashlib.sha256(json.dumps(
        state, sort_keys=True, ensure_ascii=False, default=str,
    ).encode('utf-8')).hexdigest()
    safe_rows = [
        {
            'row': item['row'],
            'identity_masked': item['id'][:2] + '••••' + item['id'][-4:],
        }
        for item in state
    ]
    return {'fingerprint': digest, 'employees': selected_employees,
            'masked_rows': safe_rows, 'count': len(state)}


def handle_restore(request, source_rows, file_sha, sheet, action):
    """Signed preview plus separate, never-by-default batch restoration."""
    try:
        chosen = _selected_rows(str(request.data.get('selected_rows') or ''))
    except ValueError as exc:
        return Response({'detail': str(exc)}, status=400, headers=NO_CACHE)

    if action == 'restore_preview':
        try:
            snapshot = _current_snapshot(source_rows, chosen)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=409, headers=NO_CACHE)
        token = signing.dumps({
            'kind': 'v2-archive-restore',
            'user': request.user.pk,
            'file_sha256': file_sha,
            'sheet': sheet,
            'rows': chosen,
            'count': snapshot['count'],
            'fingerprint': snapshot['fingerprint'],
        }, salt=RESTORE_TOKEN_SALT)
        return Response({
            'mode': 'employee_v2_restore_preview',
            'count': snapshot['count'],
            'selected_rows_masked': snapshot['masked_rows'],
            'confirm_phrase': f"استعادة {snapshot['count']} موظفًا",
            'preview_token': token,
            'restore_available': bool(getattr(
                settings, 'EMPLOYEE_V2_ARCHIVE_RESTORE_ENABLED', False,
            )),
            'notice': (
                'الاستعادة المقترحة تستخدم السجلات الأصلية الموجودة، '
                'ولا تنشئ هويات ولا تعبئ بيانات ناقصة. يلزم الرجوع '
                'إلى مصدر وظيفي معتمد ونسخة PostgreSQL قابلة للاسترجاع.'
            ),
        }, headers=NO_CACHE)

    if not getattr(settings, 'EMPLOYEE_V2_ARCHIVE_RESTORE_ENABLED', False):
        return Response({
            'detail': (
                'استعادة الموظفين على دفعات غير مفعّلة. '
                'يلزم التحقق من نسخة احتياطية حقيقية قابلة للاسترجاع '
                'واعتماد الصلاحية قبل التشغيل.'
            ),
        }, status=403, headers=NO_CACHE)
    reason = str(request.data.get('reason') or '').strip()
    hr_reference = str(request.data.get('hr_reference') or '').strip()
    backup_reference = str(request.data.get('backup_reference') or '').strip()
    if (not 20 <= len(reason) <= 500 or
            not 8 <= len(hr_reference) <= 255 or
            not 8 <= len(backup_reference) <= 255 or
            any(request.data.get(key) != 'true' for key in (
                'verified_current_employment', 'verified_backup_restore',
                'reviewed_original_identity', 'confirmed',
            ))):
        return Response({
            'detail': 'يلزم مبرر إداري واضح، مرجع الموارد البشرية، مرجع النسخة الاحتياطية المختبرة، وأربع موافقات صريحة.',
        }, status=400, headers=NO_CACHE)
    try:
        token = signing.loads(
            request.data.get('preview_token'),
            salt=RESTORE_TOKEN_SALT, max_age=RESTORE_TOKEN_MAX_AGE,
        )
    except (signing.BadSignature, signing.SignatureExpired, ValueError, TypeError):
        return Response({'detail': 'انتهت صلاحية المعاينة. أعد فحص الدفعة.'},
                        status=409, headers=NO_CACHE)
    if (not isinstance(token, dict)
            or token.get('kind') != 'v2-archive-restore'
            or token.get('user') != request.user.pk
            or token.get('file_sha256') != file_sha
            or token.get('sheet') != sheet
            or token.get('rows') != chosen
            or token.get('count') != len(chosen)
            or request.data.get('confirm_phrase') != f"استعادة {len(chosen)} موظفًا"):
        return Response({
            'detail': 'الملف أو المسؤول أو نطاق الدفعة أو عبارة التأكيد لا تطابق المعاينة.',
        }, status=409, headers=NO_CACHE)

    with transaction.atomic():
        # Lock the selected employee records AND the historical reset batches
        # before reconstructing all safety checks and comparing the signed hash.
        nids = [
            identity(row['national_id']) for row in source_rows
            if row['_row'] in chosen
        ]
        list(Employee.objects.filter(national_id__in=nids)
             .select_for_update().order_by('pk').values_list('pk', flat=True))
        list(EmployeeRegistryResetBatch.objects.select_for_update()
             .order_by('pk').values_list('pk', flat=True))
        try:
            snapshot = _current_snapshot(source_rows, chosen)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=409, headers=NO_CACHE)
        if snapshot['fingerprint'] != token.get('fingerprint'):
            return Response({'detail': 'تغيرت حالة الموظفين منذ المعاينة؛ أعد فحص الدفعة.'},
                            status=409, headers=NO_CACHE)
        now = timezone.now()
        employees = snapshot['employees']
        count = Employee.objects.filter(
            pk__in=[employee.pk for employee in employees],
            is_archived=True,
        ).update(
            is_archived=False, archived_at=None,
            archived_by=None, archive_reason='', updated_at=now,
        )
        if count != len(chosen):
            raise RuntimeError('Employee restoration count changed; rollback required.')
        audit_reason = (
            f'{reason} | HR evidence: {hr_reference} | '
            f'Backup restore evidence: {backup_reference}'
        )
        EmployeeArchiveEvent.objects.bulk_create([
            EmployeeArchiveEvent(
                employee_id=employee.pk,
                action=EmployeeArchiveEvent.Action.RESTORE,
                reason=audit_reason, performed_by=request.user,
            )
            for employee in employees
        ], batch_size=25)
        AuditLog.objects.bulk_create([
            AuditLog(
                user=str(request.user),
                action='employee_v2_evidenced_batch_restore',
                model_name='Employee', record_id=str(employee.pk),
            )
            for employee in employees
        ], batch_size=25)
    return Response({
        'mode': 'employee_v2_restored',
        'restored': len(chosen),
        'new_employees': 0,
        'overwritten_employee_fields': 0,
        'notice': (
            'عادت السجلات الأصلية إلى القائمة النشطة، مع بقاء البيانات '
            'الناقصة كما هي لاستكمالها لاحقًا. لم تتغير الملفات الطبية.'
        ),
    }, headers=NO_CACHE)
