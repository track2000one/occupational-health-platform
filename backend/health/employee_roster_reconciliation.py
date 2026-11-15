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
import re
import unicodedata

from django.core import signing
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
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
    AuditLog, Employee, EmployeeArchiveEvent, EmployeeExcelMatchReview,
    EmployeeProfileCompletionEvent, EmployeeRegistryResetBatch,
)


MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_ROWS = 2500
MAX_CHANGES = 500
TOKEN_SALT = 'employee-excel-verified-fill-restore-2026-v1'
TOKEN_TTL = 300
REVIEW_TOKEN_TTL = 600
REVIEW_PAGE_SIZE = 25
NAME_DIAGNOSTICS = (
    'orthographic', 'reordered', 'missing_or_extra_parts',
    'same_first_and_last', 'same_first_only', 'same_last_only',
    'different_or_complex',
)
REVIEW_CATEGORIES = frozenset((
    'name_mismatch', 'name_different_scripts', 'individually_archived_requires_review',
    'unique_field_mismatch', 'unique_value_owned_by_other',
))

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


def digest_value(value):
    return sha256(json.dumps(value, sort_keys=True, default=str,
                             ensure_ascii=False).encode('utf-8')).hexdigest()


_ARABIC_NAME = re.compile(r'[\u0600-\u06ff]')
_LATIN_NAME = re.compile(r'[A-Za-z]')


def primary_name_script(value):
    """Only identify unambiguous Arabic-only versus Latin-only written names.

    This is a *diagnostic classification*, NEVER evidence of identity.
    """
    text = str(value or '')
    arabic = bool(_ARABIC_NAME.search(text))
    latin = bool(_LATIN_NAME.search(text))
    if arabic and not latin:
        return 'arabic'
    if latin and not arabic:
        return 'latin'
    return 'mixed_or_unknown'


def name_scripts_differ(registry_name, source_name):
    return {primary_name_script(registry_name), primary_name_script(source_name)} == {
        'arabic', 'latin',
    }


_ARABIC_DIACRITICS = re.compile(r'[\u064b-\u065f\u0670\u06d6-\u06ed]')
_NAME_SEPARATOR = re.compile(r'[^\u0621-\u064aA-Za-z0-9]+')


def name_parts_for_diagnostics(value):
    """Create non-authoritative comparison tokens without editing source text."""
    value = unicodedata.normalize('NFKC', str(value or '')).strip().lower()
    value = _ARABIC_DIACRITICS.sub('', value).replace('ـ', '')
    for source, replacement in (('أ', 'ا'), ('إ', 'ا'), ('آ', 'ا'),
                                ('ٱ', 'ا'), ('ى', 'ي'), ('ة', 'ه')):
        value = value.replace(source, replacement)
    return tuple(token for token in _NAME_SEPARATOR.sub(' ', value).split() if token)


def name_difference_diagnostic(registry_name, source_name):
    """Describe ONLY the text discrepancy, not who owns a national ID.

    Even the highest similarity stays manually blocked as name_mismatch.
    """
    registry = name_parts_for_diagnostics(registry_name)
    incoming = name_parts_for_diagnostics(source_name)
    if not registry or not incoming:
        return 'different_or_complex'
    if registry == incoming:
        return 'orthographic'
    if len(registry) == len(incoming) and sorted(registry) == sorted(incoming):
        return 'reordered'
    # The shorter name can omit patronymics, with original word order kept.
    short, long_ = ((registry, incoming) if len(registry) < len(incoming)
                    else (incoming, registry))
    matched = iter(long_)
    if len(short) >= 2 and len(short) != len(long_) and all(
        any(word == candidate for candidate in matched) for word in short
    ):
        return 'missing_or_extra_parts'
    if len(registry) >= 3 and len(incoming) >= 3 and (
        registry[0] == incoming[0] and registry[-1] == incoming[-1]
    ):
        return 'same_first_and_last'
    if registry[0] == incoming[0]:
        return 'same_first_only'
    if registry[-1] == incoming[-1]:
        return 'same_last_only'
    return 'different_or_complex'


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
    comparison_rows = []
    counts = Counter()
    fill_counts = Counter()
    diagnostic_counts = Counter()
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
            # Arabic/Latin differences are not proof of different people, but
            # must remain blocked until an authoritative bilingual roster is verified.
            kind = ('name_different_scripts'
                    if name_scripts_differ(employee.name, raw['name'])
                    else 'name_mismatch')
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
        name_diagnostic = (
            name_difference_diagnostic(employee.name, raw['name'])
            if kind == 'name_mismatch' and employee is not None else None
        )
        if name_diagnostic:
            diagnostic_counts[name_diagnostic] += 1
        if employee is not None:
            states_for_signature = employee_state(employee)
        else:
            states_for_signature = None
        masked_id = ((identity[:2] + '••••' + identity[-4:])
                     if len(identity) == 10 else '—')
        results.append({
            'status': kind, 'row': raw['_row'],
            'national_id_masked': masked_id,
        })
        if kind in REVIEW_CATEGORIES and employee is not None:
            comparison_rows.append({
                'row': raw['_row'], 'status': kind,
                'employee_pk': employee.pk,
                'national_id_masked': masked_id,
                'source_name': raw['name'],
                'registry_name': employee.name,
                'name_diagnostic': name_diagnostic,
                'source_employee_number': raw['employee_number'],
                'registry_employee_number': employee.employee_number or '',
                'source_email_present': bool(raw['email']),
                'registry_email_present': bool(employee.email),
                'email_mismatch': bool(raw['email'] and employee.email
                                       and raw['email'] != employee.email),
                'source_center': raw['health_center'],
                'registry_center': (employee.health_center.name
                                    if employee.health_center else ''),
                'archived': employee.is_archived,
                'employment_status': employee.employment_status,
                'source_row_hash': digest_value(raw),
                'registry_snapshot_hash': digest_value(states_for_signature),
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
        'name_diagnostic_counts': diagnostic_counts,
        'operations': operations, 'digest': digest,
        'examples': results[:30], 'comparison_rows': comparison_rows,
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
        if action not in (
            'preview', 'commit', 'review', 'review_decision',
            'export_review', 'bulk_review_decision',
        ):
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
                'name_diagnostic_counts': dict(plan['name_diagnostic_counts']),
                'examples_masked': plan['examples'],
                'preview_token': token,
                'confirm_phrase': f"مطابقة {eligible} موظفًا",
                'warning': warning,
                'notice': ('لم تُعدل أي بيانات. اختلاف الاسم العربي والإنجليزي صُنّف '
                           'منفصلًا ولا يُعامل كتطابق تلقائي دون مصدر رسمي معتمد. '
                           'المراكز والجهات التنظيمية لا تُعتمد من Excel آليًا.'),
            }, headers={'Cache-Control': 'private, no-store'})

        if action in ('export_review', 'bulk_review_decision'):
            plan = plan_reconciliation(rows)
            from .employee_name_bulk_review import (
                export_reconciled_review, commit_evidenced_bulk_review,
            )
            if action == 'export_review':
                return export_reconciled_review(request, plan, file_hash, sheet_name)
            return commit_evidenced_bulk_review(
                request, plan, file_hash, sheet_name,
                token_salt=TOKEN_SALT,
                token_ttl=REVIEW_TOKEN_TTL,
                employee_state=employee_state,
                digest_value=digest_value,
            )

        if action in ('review', 'review_decision'):
            plan = plan_reconciliation(rows)
            if action == 'review':
                category = str(request.data.get('review_filter') or 'all')
                if category != 'all' and category not in REVIEW_CATEGORIES:
                    return Response({'detail': 'تصنيف مراجعة غير معروف.'}, status=400)
                try:
                    offset = int(request.data.get('review_offset', '0'))
                except (TypeError, ValueError):
                    return Response({'detail': 'رقم الصفحة غير صحيح.'}, status=400)
                if offset < 0 or offset > MAX_ROWS:
                    return Response({'detail': 'رقم الصفحة خارج النطاق.'}, status=400)
                name_filter = str(request.data.get('review_name_diagnostic') or 'all')
                if name_filter != 'all' and name_filter not in NAME_DIAGNOSTICS:
                    return Response({'detail': 'نوع اختلاف الاسم غير معروف.'}, status=400)
                matches = [
                    row for row in plan['comparison_rows']
                    if (category == 'all' or row['status'] == category) and
                    (name_filter == 'all' or (
                        row['status'] == 'name_mismatch' and
                        row['name_diagnostic'] == name_filter
                    ))
                ]
                page = matches[offset:offset + REVIEW_PAGE_SIZE]
                review_records = {
                    review.source_row: review
                    for review in EmployeeExcelMatchReview.objects.filter(
                        workbook_sha256=file_hash, sheet_name=sheet_name,
                        source_row__in=[r['row'] for r in page],
                    )
                }
                displayed = []
                for row in page:
                    saved = review_records.get(row['row'])
                    item = {key: value for key, value in row.items()
                            if key not in ('source_row_hash', 'registry_snapshot_hash')}
                    item['decision_status'] = (
                        saved.decision if saved and
                        saved.source_row_sha256 == row['source_row_hash'] and
                        saved.registry_snapshot_sha256 == row['registry_snapshot_hash']
                        else 'stale' if saved else 'pending'
                    )
                    item['decision_token'] = signing.dumps({
                        'file_sha': file_hash, 'sheet': sheet_name,
                        'row': row['row'], 'pk': row['employee_pk'],
                        'kind': row['status'], 'source_hash': row['source_row_hash'],
                        'registry_hash': row['registry_snapshot_hash'],
                        'admin_id': request.user.pk,
                    }, salt=TOKEN_SALT + '-review')
                    displayed.append(item)
                return Response({
                    'mode': 'review', 'total': len(matches),
                    'offset': offset, 'page_size': REVIEW_PAGE_SIZE,
                    'review_filter': category,
                    'review_name_diagnostic': name_filter,
                    'name_diagnostic_counts': dict(plan['name_diagnostic_counts']),
                    'rows': displayed,
                    'notice': ('مقارنة إدارية للقراءة فقط. يعتمد التحقق على مستند رسمي '
                               'مستقل؛ تسجيل قرار المراجعة لا يستعيد أو يعدّل أي موظف.'),
                }, headers={'Cache-Control': 'private, no-store'})

            try:
                review_token = signing.loads(
                    request.data.get('decision_token'),
                    salt=TOKEN_SALT + '-review', max_age=REVIEW_TOKEN_TTL,
                )
            except (signing.BadSignature, signing.SignatureExpired, ValueError, TypeError):
                return Response({'detail': 'انتهت صلاحية مقارنة السجل. أعد عرض المراجعة.'},
                                status=409)
            decision = str(request.data.get('decision') or '')
            evidence = str(request.data.get('evidence_reference') or '').strip()
            reason_text = str(request.data.get('reason') or '').strip()
            if (decision not in ('verified', 'not_verified') or
                    len(evidence) < 6 or len(evidence) > 255 or
                    len(reason_text) < 20 or len(reason_text) > 500 or
                    request.data.get('confirmed') != 'true'):
                return Response({'detail': 'يلزم قرار وتوثيق مرجعه ومبرر لا يقل عن 20 حرفًا مع التأكيد.'},
                                status=400)
            if (not isinstance(review_token, dict) or
                    review_token.get('file_sha') != file_hash or
                    review_token.get('sheet') != sheet_name or
                    review_token.get('admin_id') != request.user.pk):
                return Response({'detail': 'مصدر الملف أو المسؤول لا يطابق المعاينة.'}, status=409)
            matched = next((
                entry for entry in plan['comparison_rows']
                if entry['row'] == review_token.get('row') and
                entry['employee_pk'] == review_token.get('pk') and
                entry['status'] == review_token.get('kind') and
                entry['source_row_hash'] == review_token.get('source_hash') and
                entry['registry_snapshot_hash'] == review_token.get('registry_hash')
            ), None)
            if matched is None:
                return Response({'detail': 'تغيرت بيانات المطابقة؛ أعد الفحص قبل توثيق القرار.'},
                                status=409)
            with transaction.atomic():
                employee = Employee.objects.select_for_update().get(pk=matched['employee_pk'])
                if digest_value(employee_state(employee)) != matched['registry_snapshot_hash']:
                    return Response({'detail': 'تغيّر سجل الموظف بعد المقارنة؛ أعد الفحص.'},
                                    status=409)
                if EmployeeExcelMatchReview.objects.filter(
                    workbook_sha256=file_hash, sheet_name=sheet_name,
                    source_row=matched['row'],
                ).exists():
                    return Response({'detail': 'سُجّل قرار لهذه الحالة سابقًا؛ يمنع اعتماده ثانية دون مراجعة مستقلة.'},
                                    status=409)
                try:
                    record = EmployeeExcelMatchReview.objects.create(
                        employee=employee, workbook_sha256=file_hash,
                        sheet_name=sheet_name, source_row=matched['row'],
                        source_row_sha256=matched['source_row_hash'],
                        registry_snapshot_sha256=matched['registry_snapshot_hash'],
                        discrepancy_type=matched['status'], decision=decision,
                        evidence_reference=evidence, reason=reason_text,
                        reviewed_by=request.user,
                    )
                except IntegrityError:
                    return Response({'detail': 'تم توثيق قرار متزامن لهذه الحالة؛ حدّث الشاشة.'},
                                    status=409)
                AuditLog.objects.create(
                    user=str(request.user), action='employee_excel_match_review_decision',
                    model_name='EmployeeExcelMatchReview', record_id=str(record.pk),
                )
                return Response({
                    'mode': 'review_decision', 'decision': record.decision,
                    'review_id': record.pk, 'employee_modified': False,
                    'notice': 'تم توثيق المراجعة دون استعادة أو تعديل أو إنشاء أي موظف.',
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
