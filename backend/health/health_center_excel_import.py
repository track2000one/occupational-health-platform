"""Two-step health-center Excel import.

Accepts a dedicated center workbook or the distinct center names in an
employee worksheet. Never imports employee rows, edits existing centers,
assigns employees, or approves organizational hierarchy.
"""
from hashlib import sha256
from io import BytesIO
import json
import re
import unicodedata
import zipfile

from django.core import signing
from django.db import transaction
from django.utils import timezone
from openpyxl import load_workbook
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AuditLog, HealthCenter

MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_UNZIPPED_BYTES = 20 * 1024 * 1024
MAX_WORKSHEET_ROWS = 5000
MAX_DISTINCT_CENTERS = 500
TOKEN_SALT = 'ohp-health-centers-excel-preview-v1'
TOKEN_AGE_SECONDS = 600
CONFIRM = 'اعتماد المراكز الجديدة'

CENTER_ALIASES = {
    'المركز الصحي', 'اسم المركز الصحي', 'اسم المركز', 'المركز',
    'health center', 'health center name', 'healthcenter', 'center',
    'center name', 'health_center',
}
CODE_ALIASES = {'رمز المركز', 'كود المركز', 'الرمز', 'center code', 'center_code'}
EN_ALIASES = {'اسم المركز بالانجليزية', 'اسم المركز بالإنجليزية', 'الاسم الانجليزي', 'english center name'}
REGION_ALIASES = {'المنطقة', 'region'}
CITY_ALIASES = {'المدينة', 'city'}
DISTRICT_ALIASES = {'الحي', 'district'}
MANAGER_ALIASES = {'مدير المركز', 'اسم مدير المركز', 'center manager', 'manager name'}
TYPE_ALIASES = {'نوع المبنى', 'building type'}


def clean(value):
    if value is None:
        return ''
    text = unicodedata.normalize('NFKC', str(value)).replace('\u0640', '')
    return re.sub(r'\s+', ' ', text).strip()


def key(value):
    return clean(value).casefold()


def header(value):
    return key(value).replace('_', ' ')


def column_index(values, aliases):
    allowed = {header(item) for item in aliases}
    return next((i for i, cell in enumerate(values)
                 if header(cell) in allowed), None)


def read_workbook(upload, requested_sheet=''):
    if upload is None or not str(upload.name).lower().endswith('.xlsx'):
        raise ValueError('ارفع ملف Excel بصيغة .xlsx فقط.')
    if upload.size > MAX_FILE_BYTES:
        raise ValueError('حجم ملف Excel يزيد على 5 MB.')
    raw = upload.read(MAX_FILE_BYTES + 1)
    if len(raw) > MAX_FILE_BYTES:
        raise ValueError('حجم الملف غير مسموح.')
    try:
        with zipfile.ZipFile(BytesIO(raw)) as archive:
            if sum(entry.file_size for entry in archive.infolist()) > MAX_UNZIPPED_BYTES:
                raise ValueError('الملف المضغوط يحتوي على محتوى أكبر من الحد المسموح.')
        book = load_workbook(BytesIO(raw), read_only=True, data_only=True)
        if 'مرجع_المراكز' in book.sheetnames or 'مراجعة_المراكز' in book.sheetnames:
            book.close()
            raise ValueError('ملف المرجع والمراجعة يحتاج مسار «تأسيس مرجع المراكز»؛ لا يمكن اعتماد مسوداته كمراكز نشطة.')
    except (OSError, zipfile.BadZipFile, ValueError, KeyError) as exc:
        raise ValueError('ملف Excel غير صالح أو يتجاوز حدود الأمان.') from exc
    try:
        candidates = []
        for sheet_name in book.sheetnames:
            if requested_sheet and sheet_name != requested_sheet:
                continue
            sheet = book[sheet_name]
            for line_no, row in enumerate(sheet.iter_rows(min_row=1, max_row=5,
                                                          max_col=60, values_only=True), 1):
                idx = column_index(row, CENTER_ALIASES)
                if idx is not None:
                    candidates.append((sheet_name, line_no, idx, row))
                    break
        if not candidates:
            raise ValueError('لم يُعثر على عمود «المركز الصحي / Health center» في ورقة Excel المحددة.')
        # A dedicated center sheet takes precedence over an employee sheet,
        # otherwise take the explicitly selected sheet or first recognized.
        candidates.sort(key=lambda item: (
            0 if requested_sheet and item[0] == requested_sheet else 1,
            0 if 'مراكز' in item[0] or 'centers' in item[0].lower() else 1,
            0 if 'موحد' in item[0] else 1,
        ))
        sheet_name, heading_row, center_idx, headings = candidates[0]
        sheet = book[sheet_name]
        if sheet.max_row and sheet.max_row > MAX_WORKSHEET_ROWS:
            raise ValueError('عدد الصفوف يتجاوز 5000؛ يرجى تقسيم ملف المراكز.')
        mappings = {
            'name': center_idx,
            'code': column_index(headings, CODE_ALIASES),
            'name_en': column_index(headings, EN_ALIASES),
            'region': column_index(headings, REGION_ALIASES),
            'city': column_index(headings, CITY_ALIASES),
            'district': column_index(headings, DISTRICT_ALIASES),
            'manager_name': column_index(headings, MANAGER_ALIASES),
            'building_type': column_index(headings, TYPE_ALIASES),
        }
        distinct = {}
        row_count = 0
        for row_no, row in enumerate(
            sheet.iter_rows(min_row=heading_row + 1, max_col=60, values_only=True),
            heading_row + 1,
        ):
            if row_no > MAX_WORKSHEET_ROWS:
                raise ValueError('عدد الصفوف يتجاوز الحد المسموح.')
            name = clean(row[center_idx] if center_idx < len(row) else '')
            if not name:
                continue
            row_count += 1
            name_key = key(name)
            fields = {
                prop: clean(row[index]) if index is not None and index < len(row) else ''
                for prop, index in mappings.items()
            }
            fields['name'] = name
            if name_key in distinct:
                distinct[name_key]['source_count'] += 1
                # A single name with two official center codes is ambiguous.
                before = distinct[name_key]
                for attr in ('code', 'name_en', 'region', 'city', 'district', 'manager_name', 'building_type'):
                    if fields[attr] and before[attr] and key(fields[attr]) != key(before[attr]):
                        before['source_conflict'] = True
                    elif fields[attr] and not before[attr]:
                        before[attr] = fields[attr]
                continue
            fields.update({'source_count': 1, 'source_conflict': False, 'first_row': row_no})
            distinct[name_key] = fields
            if len(distinct) > MAX_DISTINCT_CENTERS:
                raise ValueError('يوجد أكثر من 500 اسم مركز مختلف. راجع عمود المركز الصحي.')
        if not distinct:
            raise ValueError('لم يتضمن الملف أي أسماء مراكز قابلة للقراءة.')
        return {
            'rows': list(distinct.values()), 'sheet': sheet_name,
            'source_rows': row_count, 'file_hash': sha256(raw).hexdigest(),
        }
    finally:
        book.close()


def center_state():
    return list(HealthCenter.objects.order_by('pk').values(
        'id', 'name', 'name_ar', 'name_en', 'code', 'updated_at',
    ))


def classify(workbook, existing):
    names = {}
    codes = {}
    for center in existing:
        for name in (center['name'], center['name_ar'], center['name_en']):
            if key(name):
                names.setdefault(key(name), set()).add(center['id'])
        if key(center['code']):
            codes.setdefault(key(center['code']), set()).add(center['id'])

    file_codes = {}
    for entry in workbook['rows']:
        if entry['code']:
            file_codes.setdefault(key(entry['code']), set()).add(key(entry['name']))

    result = []
    for entry in workbook['rows']:
        name = entry['name']
        code = entry['code']
        matches = set()
        for candidate in (name, entry['name_en']):
            if key(candidate):
                matches.update(names.get(key(candidate), set()))
        matching_code = codes.get(key(code), set()) if code else set()
        issue = ''
        if entry['source_conflict']:
            issue = 'تعارض بيانات المركز في صفوف ملف Excel'
        elif len(name) > 150 or len(entry['name_en']) > 150 or len(code) > 40:
            issue = 'اسم المركز أو رمزه أطول من الحد المسموح'
        elif any(len(entry[field]) > limit for field, limit in (
                ('region', 120), ('city', 120), ('district', 120),
                ('manager_name', 200))):
            issue = 'أحد الحقول أطول من الحد المسموح'
        elif entry['building_type'] and key(entry['building_type']) not in (
                'unknown', 'model', 'rented', 'owned', 'other',
                'غير محدد', 'نموذجي', 'مستأجر', 'مملوك', 'أخرى'):
            issue = 'نوع المبنى غير معروف؛ يُرجى تصحيح القيمة'
        elif code and len(file_codes[key(code)]) > 1:
            issue = 'رمز واحد مستخدم لأكثر من مركز في الملف'
        elif len(matches) > 1 or len(matching_code) > 1 or (matches and matching_code and matches != matching_code):
            issue = 'تعارض بين الاسم والرمز في قاعدة البيانات'
        elif matching_code and not matches:
            issue = 'رمز المركز مستخدم باسم مختلف'
        elif matches and matching_code and matches == matching_code:
            status_label = 'existing'
        elif matches:
            status_label = 'existing'
        else:
            status_label = 'new'
        if issue:
            status_label = 'conflict'
        result.append({
            **entry, 'status': status_label, 'reason': issue,
            'matched_center_id': next(iter(matches)) if len(matches) == 1 else None,
        })
    return result


def fingerprint(workbook, existing, classified):
    existing_rows = [
        [c['id'], c['name'], c['name_ar'], c['name_en'], c['code'],
         c['updated_at'].isoformat() if c['updated_at'] else '']
        for c in existing
    ]
    payload = {
        'file': workbook['file_hash'], 'sheet': workbook['sheet'],
        'centers': existing_rows,
        'decisions': [[row['name'], row['status'], row['reason']] for row in classified],
    }
    return sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


class HealthCenterExcelImportView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [FormParser, MultiPartParser]

    def post(self, request):
        try:
            role = request.user.health_profile.role
        except Exception:
            role = ''
        if not (request.user.is_superuser or role in ('systemAdmin', 'ohManager')):
            return Response({'detail': 'Only approved center administrators may import centers.'},
                            status=status.HTTP_403_FORBIDDEN)
        mode = str(request.data.get('action') or 'preview').strip()
        if mode not in ('preview', 'commit'):
            return Response({'detail': 'Invalid import action.'}, status=400)
        try:
            book = read_workbook(request.FILES.get('file'),
                                 str(request.data.get('sheet_name') or '').strip())
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        def response_payload(existing, classified):
            counts = {
                state: sum(item['status'] == state for item in classified)
                for state in ('new', 'existing', 'conflict')
            }
            return {
                'mode': 'preview',
                'worksheet': book['sheet'],
                'source_rows': book['source_rows'],
                'distinct_centers': len(classified),
                'counts': counts,
                'preview': [{
                    'name': item['name'], 'code': item['code'],
                    'name_en': item['name_en'], 'source_count': item['source_count'],
                    'status': item['status'], 'reason': item['reason'],
                    'matched_center_id': item['matched_center_id'],
                } for item in classified],
                'preview_token': signing.dumps({
                    'hash': fingerprint(book, existing, classified),
                    'sheet': book['sheet'],
                    'count': counts['new'],
                }, salt=TOKEN_SALT),
                'notice': 'Preview only: no centers, employee assignments or organizational approvals have changed.',
            }

        if mode == 'preview':
            existing = center_state()
            classified = classify(book, existing)
            return Response(response_payload(existing, classified),
                            headers={'Cache-Control': 'private, no-store'})

        if request.data.get('confirm_text') != CONFIRM or str(
                request.data.get('confirmed') or '').lower() != 'true':
            return Response({'detail': 'Explicit confirmation is required.'}, status=400)
        try:
            previous = signing.loads(
                request.data.get('preview_token'),
                salt=TOKEN_SALT, max_age=TOKEN_AGE_SECONDS,
            )
        except (signing.BadSignature, signing.SignatureExpired, TypeError, ValueError):
            return Response({'detail': 'Expired or invalid preview. Preview again.'}, status=409)
        with transaction.atomic():
            list(HealthCenter.objects.select_for_update().values_list('pk', flat=True))
            existing = center_state()
            classified = classify(book, existing)
            expected = fingerprint(book, existing, classified)
            if (not isinstance(previous, dict) or previous.get('hash') != expected
                    or previous.get('sheet') != book['sheet']
                    or previous.get('count') != sum(x['status'] == 'new' for x in classified)):
                return Response({'detail': 'Centers or Excel data changed since preview. Preview again.'},
                                status=status.HTTP_409_CONFLICT)
            new_rows = [row for row in classified if row['status'] == 'new']
            if not new_rows:
                return Response({'detail': 'There are no new centers to import.'},
                                status=status.HTTP_409_CONFLICT)
            created = []
            types = {
                'غير محدد': 'unknown', 'نموذجي': 'model', 'مستأجر': 'rented',
                'مملوك': 'owned', 'أخرى': 'other',
            }
            for item in new_rows:
                building_type = types.get(item['building_type'], item['building_type'] or 'unknown')
                obj = HealthCenter.objects.create(
                    name=item['name'], name_ar=item['name'],
                    name_en=item['name_en'], code=item['code'].upper() or None,
                    region=item['region'], city=item['city'],
                    district=item['district'], manager_name=item['manager_name'],
                    building_type=building_type,
                    is_active=True,
                    notes='أُدرج من ملف Excel للمراكز الصحية بعد المعاينة والاعتماد.',
                )
                created.append(obj.pk)
            AuditLog.objects.create(
                user=str(request.user), action='import_health_centers_from_excel',
                model_name='HealthCenter', record_id=f'created:{len(created)}',
            )
            return Response({
                'mode': 'committed', 'created_count': len(created),
                'existing_count': sum(r['status'] == 'existing' for r in classified),
                'conflict_count': sum(r['status'] == 'conflict' for r in classified),
                'notice': 'New health centers created; existing centers and all employee assignments unchanged.',
            }, headers={'Cache-Control': 'private, no-store'})
