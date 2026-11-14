"""Safe employee Excel reconciliation: preview, then explicit verified restore/fill-only.

The existing Excel import is CREATE-only. This separate workflow NEVER creates a
duplicate employee and NEVER replaces a nonempty staff field or clinical record.
Archived employees must belong to the last unfinished bulk reset batch to qualify
for automatic restoration; individually archived records require manual review.

The Excel file is processed in memory, never stored. Commit requires the SAME
workbook, signed short-lived preview, unchanged registry snapshot, explicit
responsibility acknowledgement, and a specific administrative reason.
"""
from collections import Counter
from datetime import date
from hashlib import sha256
from io import BytesIO
import json
import unicodedata

from django.core import signing
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone
from openpyxl import load_workbook
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .employee_import_classification import normalize_person_name
from .employee_import_countries import resolve_import_nationality
from .importers import (
    clean_text, employee_choice, find_employee_header_row, iter_data_rows,
    mapped_employee_cell, parse_date, resolve_employee_field_mapping,
)
from .models import (
    AuditLog, Employee, EmployeeArchiveEvent, EmployeeProfileCompletionEvent,
    EmployeeRegistryResetBatch,
)


MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_ROWS = 2500
MAX_CHANGES = 500
TOKEN_SALT = 'employee-excel-verified-fill-restore-2026-v1'
TOKEN_TTL = 300

FIELD_MAX_LENGTH = {
    'employee_number': 40, 'email': 254, 'mobile': 30,
    'national_address': 255, 'birth_place': 120,
    'job_title': 150, 'job_title_en': 150, 'current_job': 200,
}
FILL_FIELDS = (
    'employee_number', 'email', 'mobile', 'national_address',
    'date_of_birth', 'birth_place', 'gender', 'marital_status',
    'job_title', 'job_title_en', 'current_job', 'nationality',
    'appointment_date',
)
CODED_FIELDS = ('gender', 'marital_status', 'nationality')
DATE_FIELDS = ('date_of_birth', 'appointment_date')


def digits_only(raw):
    return ''.join(str(unicodedata.digit(char)) for char in str(raw) if char.isdecimal())


def present(value):
    return value is not None and str(value).strip() != ''


def make_payload(row, mapping):
    raw = {field: clean_text(mapped_employee_cell(row, mapping, field))
           for field in ('name', 'national_id', *FILL_FIELDS, 'health_center')}
    raw['national_id'] = digits_only(raw['national_id'])
    raw['email'] = raw['email'].strip().lower()
    return raw


def normalize_incoming(raw):
    """Reject unsupported source values, NEVER guess a nationality or a date."""
    errors = []
    cleaned = {}
    for field in FILL_FIELDS:
        value = raw.get(field, '').strip()
        if not value:
            continue
        if field == 'nationality':
            value = resolve_import_nationality(value)
            if not value:
                errors.append('invalid_nationality')
                continue
        elif field in ('gender', 'marital_status'):
            value = employee_choice(field, value)
            if not value:
                errors.append('invalid_' + field)
                continue
        elif field in DATE_FIELDS:
            value = parse_date(value)
            if not value or not date(1900, 1, 1) <= value <= date.today():
                errors.append('invalid_' + field)
                continue
        elif field == 'email':
            try:
                validate_email(value)
            except ValidationError:
                errors.append('invalid_email')
                continue
        elif field == 'mobile':
            number = ''.join(c for c in value if c.isdigit())
            if not (9 <= len(number) <= 15):
                errors.append('invalid_mobile')
                continue
        if field in FIELD_MAX_LENGTH and len(str(value)) > FIELD_MAX_LENGTH[field]:
            errors.append('too_long_' + field)
            continue
        cleaned[field] = value
    return cleaned, errors


def employee_state(employee):
    """Hash only administrative fields used by this workflow, never health data."""
    return {
        'pk': employee.pk,
        'updated_at': employee.updated_at.isoformat() if employee.updated_at else '',
        'name': employee.name,
        'national_id': employee.national_id,
        'is_archived': employee.is_archived,
        'archived_at': employee.archived_at.isoformat() if employee.archived_at else '',
        'fields': {key: str(getattr(employee, key) or '') for key in FILL_FIELDS},
    }


def current_reset_batch():
    return EmployeeRegistryResetBatch.objects.filter(
        restored_at__isnull=True,
    ).order_by('-created_at').first()


def plan_reconciliation(sheet_rows, *, lock=False):
    national_ids = list({row['national_id'] for row in sheet_rows if row['national_id']})
    queryset = Employee.objects.filter(national_id__in=national_ids).order_by('pk')
    if lock:
        queryset = queryset.select_for_update()
    matching = {e.national_id: e for e in queryset}
    existing_email_owners = dict(
        Employee.objects.exclude(email__isnull=True).exclude(email='')
        .values_list('email', 'pk')
    )
    existing_number_owners = dict(
        Employee.objects.exclude(employee_number__isnull=True).exclude(employee_number='')
        .values_list('employee_number', 'pk')
    )
    reset = current_reset_batch()
    reset_ids = set(reset.employee_ids) if reset else set()
    duplicate_ids = Counter(row['national_id'] for row in sheet_rows if row['national_id'])
    email_counts = Counter(row['email'] for row in sheet_rows if row['email'])
    number_counts = Counter(row['employee_number'] for row in sheet_rows if row['employee_number'])

    results = []
    counts = Counter()
    fill_counts = Counter()
    states = []
    for raw in sheet_rows:
        identity = raw['national_id']
        employee = matching.get(identity)
        if not identity or len(identity) != 10 or not raw['name'].strip():
            kind = 'invalid_identity_or_name'
        elif duplicate_ids[identity] > 1:
            kind = 'duplicate_identity_in_file'
        elif raw['email'] and email_counts[raw['email']] > 1:
            kind = 'duplicate_email_in_file'
        elif raw['employee_number'] and number_counts[raw['employee_number']] > 1:
            kind = 'duplicate_employee_number_in_file'
        elif employee is None:
            kind = 'new_identity_requires_normal_import'
        elif normalize_person_name(employee.name) != normalize_person_name(raw['name']):
            kind = 'name_mismatch'
        else:
            normalized, issues = normalize_incoming(raw)
            if issues:
                kind = 'invalid_source_value'
            elif (raw['email'] and existing_email_owners.get(raw['email']) not in (None, employee.pk)) or (
                raw['employee_number'] and existing_number_owners.get(raw['employee_number']) not in (None, employee.pk)
            ):
                kind = 'unique_value_owned_by_other'
            elif any(
                present(getattr(employee, k)) and present(v) and
                (str(getattr(employee, k)).casefold() != str(v).casefold())
                for k, v in normalized.items() if k in ('employee_number', 'email')
            ):
                kind = 'unique_field_mismatch'
            elif employee.is_archived and (
                not reset or employee.pk not in reset_ids or
                employee.archived_at != reset.applied_at
            ):
                kind = 'individually_archived_requires_review'
            else:
                existing_dob = employee.date_of_birth
                dob = normalized.get('date_of_birth') or existing_dob
                join = normalized.get('appointment_date') or employee.appointment_date
                if dob and join and join <= dob:
                    kind = 'date_inconsistency'
                else:
                    additions = {
                        field: value for field, value in normalized.items()
                        if not present(getattr(employee, field))
                    }
                    # Do NOT fill or change the center or organization link
                    # from an unapproved reference spreadsheet.
                    if employee.is_archived:
                        kind = 'restore_and_fill' if additions else 'restore_only'
                    elif additions:
                        kind = 'fill_only'
                    else:
                        kind = 'no_change'
                    if additions:
                        fill_counts.update(additions.keys())
                    if kind in ('restore_and_fill', 'restore_only', 'fill_only'):
                        states.append({
                            'pk': employee.pk, 'identity': identity,
                            'kind': kind, 'additions': additions,
                        })
        counts[kind] += 1
        if employee is not None:
            states_for_signature = employee_state(employee)
        else:
            states_for_signature = None
        results.append({
            'status': kind,
            'row': raw['_row'],
            'national_id_masked': ((identity[:2] + '••••' + identity[-4:])
                                  if len(identity) == 10 else '—'),
        })
        states.append({'_snapshot': states_for_signature, '_row': raw['_row']})

    fingerprint_payload = {
        'rows': sheet_rows,
        'registry': [s['_snapshot'] for s in states if '_snapshot' in s],
        'reset_id': str(reset.pk) if reset else None,
        'reset_applied': reset.applied_at.isoformat() if reset else None,
    }
    digest = sha256(json.dumps(fingerprint_payload, sort_keys=True, default=str,
                               ensure_ascii=False).encode()).hexdigest()
    operations = [s for s in states if 'additions' in s]
    return {
        'counts': counts, 'fill_counts': fill_counts,
        'operations': operations, 'digest': digest,
        'examples': results[:30],
        'total': len(sheet_rows),
    }


class EmployeeRosterReconciliationView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        if not request.user.is_superuser:
            return Response({'detail': 'هذه العملية متاحة للمسؤول الأعلى فقط.'},
                            status=status.HTTP_403_FORBIDDEN)
        action = request.data.get('action', 'preview')
        if action not in ('preview', 'commit'):
            return Response({'detail': 'إجراء غير معروف.'}, status=400)
        file = request.FILES.get('file')
        if not file or not file.name.lower().endswith('.xlsx') or file.size > MAX_FILE_BYTES:
            return Response({'detail': 'ارفع ملف Excel بصيغة XLSX لا يتجاوز 10MB.'}, status=400)
        content = file.read()
        if len(content) > MAX_FILE_BYTES:
            return Response({'detail': 'حجم ملف Excel أكبر من الحد المسموح.'}, status=400)
        file_hash = sha256(content).hexdigest()
        try:
            workbook = load_workbook(BytesIO(content), read_only=True, data_only=True)
            sheet_name = str(request.data.get('sheet_name') or 'Employees')
            if sheet_name not in workbook.sheetnames:
                return Response({'detail': 'ورقة Employees غير موجودة في الملف.'}, status=400)
            ws = workbook[sheet_name]
            header_row, headers = find_employee_header_row(ws)
            mapping, _ = resolve_employee_field_mapping(headers)
            if mapping.get('name') is None or mapping.get('national_id') is None:
                return Response({'detail': 'عمودا اسم الموظف ورقم الهوية مطلوبان.'}, status=400)
            rows = []
            for num, row in iter_data_rows(ws, header_row):
                if len(rows) >= MAX_ROWS:
                    return Response({'detail': 'يجب ألا تتجاوز الدفعة 2500 موظف.'}, status=400)
                data = make_payload(row, mapping)
                data['_row'] = num
                rows.append(data)
            workbook.close()
        except Exception:
            return Response({'detail': 'تعذرت قراءة أعمدة ملف Excel؛ تحقق من صيغة الملف.'}, status=400)
        if not rows:
            return Response({'detail': 'ورقة Employees خالية من الموظفين.'}, status=400)

        if action == 'preview':
            plan = plan_reconciliation(rows)
            eligible = sum(plan['counts'][k] for k in (
                'restore_and_fill', 'restore_only', 'fill_only',
            ))
            if eligible > MAX_CHANGES:
                warning = 'يتجاوز العدد 500 موظف؛ قسّم الملف إلى دفعات معتمدة قبل التنفيذ.'
            else:
                warning = ''
            token = signing.dumps({
                'file_sha': file_hash, 'sheet': sheet_name,
                'digest': plan['digest'], 'count': eligible,
                'admin_id': request.user.pk,
            }, salt=TOKEN_SALT)
            return Response({
                'mode': 'preview', 'total_rows': plan['total'],
                'eligible_count': eligible, 'breakdown': dict(plan['counts']),
                'fill_field_counts': dict(plan['fill_counts']),
                'examples_masked': plan['examples'],
                'preview_token': token,
                'confirm_phrase': f"مطابقة {eligible} موظفًا",
                'warning': warning,
                'notice': ('لم تُعدل أي بيانات. السجلات ذات الاسم أو الرقم المختلف '
                           'تحتاج مراجعة. المراكز والجهات التنظيمية لا تُعتمد من Excel آليًا.'),
            }, headers={'Cache-Control': 'private, no-store'})

        reason = str(request.data.get('reason') or '').strip()
        if not 20 <= len(reason) <= 500 or request.data.get('confirmed') != 'true' or (
            request.data.get('identity_checked') != 'true'
        ):
            return Response({'detail': 'يلزم مبرر واضح، وتأكيد الهوية ونطاق الاستكمال.'},
                            status=400)
        try:
            token = signing.loads(request.data.get('preview_token'),
                                  salt=TOKEN_SALT, max_age=TOKEN_TTL)
        except (signing.BadSignature, signing.SignatureExpired, ValueError, TypeError):
            return Response({'detail': 'انتهت المعاينة؛ يجب إجراؤها مجددًا.'}, status=409)
        if (not isinstance(token, dict) or token.get('file_sha') != file_hash or
                token.get('sheet') != sheet_name or token.get('admin_id') != request.user.pk):
            return Response({'detail': 'الملف أو جلسة الاعتماد لا تطابق المعاينة.'}, status=409)
        if request.data.get('confirm_phrase') != f"مطابقة {token.get('count')} موظفًا":
            return Response({'detail': 'عبارة التأكيد غير مطابقة للعدد.'}, status=400)
        if not (0 < token.get('count', 0) <= MAX_CHANGES):
            return Response({'detail': 'لا توجد سجلات مؤهلة أو تجاوز العدد حد الدفعة.'}, status=409)

        with transaction.atomic():
            plan = plan_reconciliation(rows, lock=True)
            eligible = sum(plan['counts'][k] for k in (
                'restore_and_fill', 'restore_only', 'fill_only',
            ))
            if plan['digest'] != token.get('digest') or eligible != token['count']:
                return Response({'detail': 'تغيّرت بيانات السجل بعد المعاينة؛ أعد الفحص.'},
                                status=status.HTTP_409_CONFLICT)
            updated = 0
            restored = 0
            for operation in plan['operations']:
                if '_snapshot' in operation:
                    continue
                employee = Employee.objects.get(pk=operation['pk'])
                changed = list(operation['additions'])
                for field, value in operation['additions'].items():
                    setattr(employee, field, value)
                if operation['kind'].startswith('restore'):
                    employee.is_archived = False
                    employee.archive_reason = ''
                    employee.archived_at = None
                    employee.archived_by = None
                    changed.extend(['is_archived', 'archive_reason', 'archived_at', 'archived_by'])
                    restored += 1
                if 'date_of_birth' in changed:
                    changed.append('age')
                if 'appointment_date' in changed:
                    changed.append('years_of_experience')
                changed.append('updated_at')
                employee.save(update_fields=changed)
                if operation['kind'].startswith('restore'):
                    EmployeeArchiveEvent.objects.create(
                        employee=employee, action=EmployeeArchiveEvent.Action.RESTORE,
                        reason=reason, performed_by=request.user,
                    )
                EmployeeProfileCompletionEvent.objects.create(
                    employee=employee, changed_fields=list(operation['additions']),
                    reason=reason, identity_checked=True, performed_by=request.user,
                    previous_center=employee.health_center,
                    resulting_center=employee.health_center,
                )
                updated += 1
            AuditLog.objects.create(
                user=str(request.user), action='employee_excel_restore_and_fill_only',
                model_name='Employee', record_id=str(updated),
            )
            return Response({
                'mode': 'committed', 'processed': plan['total'],
                'matched_and_updated': updated, 'restored': restored,
                'changed_fields_total': sum(len(o['additions']) for o in plan['operations']),
                'not_modified': plan['total'] - updated,
                'notice': 'استُعيدت أو استُكملت السجلات المطابقة فقط، دون إنشاء موظف مكرر أو تعديل ملف صحي.',
            }, headers={'Cache-Control': 'private, no-store'})
