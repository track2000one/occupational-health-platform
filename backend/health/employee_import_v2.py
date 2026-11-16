"""Independent v2 employee Excel preflight: read-only, no legacy import side effects.

Phase 2 adds READ-ONLY registry and approved health-center matching to the
structural checks. Neither preview creates review cards nor modifies staff,
archive state, organization links, clinical data or auditing.
"""
from collections import Counter
from hashlib import sha256
from io import BytesIO
import re
import unicodedata

from openpyxl import load_workbook
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView


MAX_FILE_SIZE = 10 * 1024 * 1024
MAX_ROWS = 2500
MAX_COLUMNS = 120
# Allow a limited number of physically empty rows without permitting oversized sheets.
MAX_SCANNED_ROWS = MAX_ROWS + 250
HEADERS = {
    'name': {'اسم الموظف', 'اسم الموظف الكامل', 'الاسم', 'اسم الموظفين',
             'الاسم الكامل', 'اسم الموظف رباعي', 'employee name', 'name', 'full name'},
    'national_id': {'رقم الهوية', 'رقم الهوية الاقامة', 'رقم الهوية الإقامة',
                    'رقم الهوية / الإقامة', 'رقم الهوية/الإقامة',
                    'رقم الهوية او الاقامة', 'رقم الهوية أو الإقامة',
                    'رقم الهوية (مخفي)', 'رقم الهوية مخفي',
                    'رقم الهوية الوطنية', 'رقم الهوية الوطنية / الإقامة',
                    'الهوية', 'السجل المدني', 'national id',
                    'national id iqama', 'national id iqama number',
                    'national_id'},
    'employee_number': {'الرقم الوظيفي', 'رقم الموظف', 'employee number', 'employee id'},
    'email': {'البريد الالكتروني', 'البريد', 'email', 'email address'},
    'mobile': {'رقم الجوال', 'الجوال', 'mobile', 'mobile number'},
    'health_center': {'المركز الصحي', 'المركز الصحي مرجعي', 'health center', 'center'},
    'nationality': {'الجنسية', 'nationality'},
    'date_of_birth': {'تاريخ الميلاد', 'date of birth', 'dob'},
    'appointment_date': {'تاريخ التعيين', 'appointment date', 'date hired'},
    'job_title': {'المسمى الوظيفي', 'مسمى الوظيفي', 'job title'},
    'job_title_en': {'المسمى الوظيفي الانجليزي', 'المسمى الوظيفي بالإنجليزية',
                     'المسمى الوظيفي بالانجليزية', 'job title english'},
    'current_job': {'الوظيفة الحالية', 'current job'},
    'gender': {'الجنس', 'gender'},
    'marital_status': {'الحالة الاجتماعية', 'marital status'},
    'national_address': {'العنوان الوطني', 'national address'},
    'birth_place': {'مكان الميلاد', 'place of birth'},
    'organization_unit': {'الجهة الوحدة التنظيمية المعتمدة', 'الوحدة التنظيمية',
                          'الجهة التنظيمية', 'organizational unit',
                          'الجهة أو الوحدة المعتمدة في المنصة (بعد التحقق)'},
    'sector': {'القطاع المقترح', 'القطاع', 'sector'},

}
REQUIRED = ('name', 'national_id')


def heading(value):
    text = unicodedata.normalize('NFKC', str(value or '')).strip().lower()
    text = re.sub(r'[\u064b-\u065f\u0670\u0640\u200b-\u200f\u202a-\u202e\u2060\ufeff]', '', text)
    text = re.sub(r'[أإآٱ]', 'ا', text).replace('ى', 'ي')
    text = re.sub(r'[^\w\u0600-\u06ff]+', ' ', text.replace('_', ' '))
    return ' '.join(text.split())


NORMALIZED = {key: {heading(alias) for alias in values} for key, values in HEADERS.items()}


def text_cell(value):
    if value is None:
        return ''
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def identity(value):
    raw = text_cell(value)
    return ''.join(str(unicodedata.digit(c)) for c in raw if c.isdecimal())


def is_masked_identity(value):
    """Reject a masked Excel value; no import may reconstruct its missing digits.

    Excel number formatting that visually masks a *full underlying value*
    remains valid, because openpyxl reads the real stored cell value.
    """
    raw = text_cell(value)
    if not raw:
        return False
    has_digits = any(char.isdecimal() for char in raw)
    mask_symbols = ('•', '●', '▪', '*', '×', '✱', '✳', '…')
    return has_digits and (
        any(marker in raw for marker in mask_symbols)
        or bool(re.search(r'\d[xX]{2,}\d', raw))
    )


def detect_header(sheet):
    best = None
    score = -1
    # XLSX files produced by some generators omit <dimension ref="..." />.
    # ReadOnlyWorksheet.max_row/max_column are then None. Never interpret
    # missing dimension metadata as "only row/column 1".
    for number, cells in enumerate(
        sheet.iter_rows(min_row=1, max_row=30,
                        max_col=MAX_COLUMNS + 1,
                        values_only=True), start=1
    ):
        normalized = [heading(c) for c in cells]
        matches = {}
        for field, aliases in NORMALIZED.items():
            for idx, label in enumerate(normalized):
                if label in aliases:
                    matches[field] = idx
                    break
        this_score = len(matches) + (4 if all(k in matches for k in REQUIRED) else 0)
        if this_score > score:
            best = (number, cells, matches)
            score = this_score
    return best


class EmployeeImportV2PreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        if not request.user.is_superuser:
            return Response({'detail': 'هذه المهمة متاحة للمسؤول الأعلى فقط.'}, status=403)
        action = str(request.data.get('action') or 'preview')
        if action not in ('preview', 'commit', 'review_page', 'restore_preview', 'restore_commit', 'approve_roster'):
            return Response({'detail': 'إجراء غير معروف.'}, status=400)
        category = None
        review_page = 1
        if action == 'review_page':
            from .employee_import_v2_matching import RESTORATION_REVIEW_CATEGORIES
            category = str(request.data.get('review_category') or '').strip()
            if category not in (*RESTORATION_REVIEW_CATEGORIES, 'all'):
                return Response({'detail': 'تصنيف المراجعة غير معروف.'}, status=400)
            try:
                review_page = int(request.data.get('review_page') or 1)
            except (TypeError, ValueError):
                return Response({'detail': 'رقم الصفحة غير صالح.'}, status=400)
            if not 1 <= review_page <= 100:
                return Response({'detail': 'رقم الصفحة خارج النطاق.'}, status=400)
        file = request.FILES.get('file')
        if not file or not str(file.name).lower().endswith('.xlsx'):
            return Response({'detail': 'اختر ملف Excel بصيغة XLSX.'}, status=400)
        if file.size > MAX_FILE_SIZE:
            return Response({'detail': 'حجم الملف يجب ألا يتجاوز 10 ميغابايت.'}, status=400)
        raw = file.read(MAX_FILE_SIZE + 1)
        if len(raw) > MAX_FILE_SIZE:
            return Response({'detail': 'حجم الملف تجاوز الحد المسموح.'}, status=400)
        workbook = None
        try:
            workbook = load_workbook(BytesIO(raw), read_only=True, data_only=True)
            sheet_name = str(request.data.get('sheet_name') or 'Employees').strip()
            if sheet_name not in workbook.sheetnames:
                return Response({
                    'detail': 'لم يُعثر على ورقة الموظفين المحددة.',
                    'available_sheets': workbook.sheetnames[:15],
                }, status=400)
            sheet = workbook[sheet_name]
            # Incorrect A1-only dimension metadata can also occur in generated
            # workbooks. Neither header detection nor data import may trust it.
            if sheet.max_column in (None, 1) or sheet.max_row in (None, 1):
                sheet.reset_dimensions()
            if (sheet.max_column or 0) > MAX_COLUMNS:
                return Response({'detail': 'الملف يتجاوز حد 120 عمودًا.'}, status=400)
            detected = detect_header(sheet)
            if not detected:
                return Response({'detail': 'تعذر اكتشاف أسماء الأعمدة.'}, status=400)
            header_row, headers, mapping = detected
            if any(text_cell(value) for value in headers[MAX_COLUMNS:]):
                return Response({'detail': 'الملف يتجاوز حد 120 عمودًا.'}, status=400)
            headers = headers[:MAX_COLUMNS]
            normalized_headers = [heading(value) for value in headers]
            # Explicit column selection is a fallback for unusual Excel exports.
            # It never bypasses ID validation, conflict checks, or masked-ID rejection.
            manual_requested = any(request.data.get(
                'map_' + field + '_column'
            ) not in (None, '') for field in REQUIRED)
            if manual_requested:
                indices = {}
                for field in REQUIRED:
                    raw_index = request.data.get('map_' + field + '_column')
                    try:
                        value = int(raw_index)
                    except (ValueError, TypeError):
                        return Response({'detail': 'حدد عمودي الاسم والهوية بصورة صحيحة.'},
                                        status=400)
                    if not 1 <= value <= min(len(headers), MAX_COLUMNS) or not heading(headers[value - 1]):
                        return Response({'detail': 'رقم العمود المختار خارج نطاق صف العناوين.'},
                                        status=400)
                    indices[field] = value - 1
                if indices['name'] == indices['national_id']:
                    return Response({'detail': 'لا يمكن استخدام العمود نفسه للاسم والهوية.'},
                                    status=400)
                mapping.update(indices)
            ambiguous_fields = [
                field for field, aliases in NORMALIZED.items()
                if sum(1 for value in normalized_headers if value in aliases) > 1
            ]
            if ambiguous_fields:
                return Response({
                    'detail': 'يوجد أكثر من عمود للبيان نفسه. راجع الأعمدة المكررة قبل الفحص.',
                    'ambiguous_columns': ambiguous_fields,
                }, status=400)
            missing = [field for field in REQUIRED if field not in mapping]
            if missing:
                # Never expose source row values if a real header is not identified.
                # Header text is returned only when other known headers prove this is
                # an actual header row; otherwise the UI receives column numbers.
                safe_header = len(mapping) >= 2
                columns = [{
                    'index': index + 1,
                    'label': (
                        str(value).strip()[:80] if (
                            safe_header and isinstance(value, str)
                            and not any(ch.isdecimal() for ch in value)
                            and 0 < len(value.strip()) <= 80
                        ) else f'العمود {index + 1}'
                    ),
                } for index, value in enumerate(headers) if text_cell(value)]
                return Response({
                    'detail': 'لم يتعرف النظام على جميع الأعمدة المطلوبة. حدد عمودي الاسم والهوية من القائمة دون تعديل ملف Excel.',
                    'missing_required': missing,
                    'recognized_columns': list(mapping),
                    'header_row': header_row,
                    'available_columns': columns,
                }, status=400, headers={'Cache-Control': 'private, no-store'})

            counts = Counter()
            seen = set()
            mapped_rows = []
            samples = []
            total = 0
            masked_identity_rows = []
            for row_number, cells in enumerate(
                sheet.iter_rows(min_row=header_row + 1,
                                max_col=MAX_COLUMNS + 1,
                                values_only=True), start=header_row + 1
            ):
                if row_number - header_row > MAX_SCANNED_ROWS:
                    return Response({'detail': 'عدد صفوف الورقة كبير جدًا؛ قسّم الملف قبل الفحص.'}, status=400)
                if any(text_cell(value) for value in cells[MAX_COLUMNS:]):
                    return Response({'detail': 'الملف يتجاوز حد 120 عمودًا.'}, status=400)
                cells = cells[:MAX_COLUMNS]
                if not any(text_cell(value) for value in cells):
                    continue
                total += 1
                if total > MAX_ROWS:
                    return Response({'detail': 'يتجاوز الملف حد 2500 سجل؛ قسّم الملف قبل الفحص.'},
                                    status=400)
                name = text_cell(cells[mapping['name']])
                source_identity = cells[mapping['national_id']]
                if is_masked_identity(source_identity):
                    masked_identity_rows.append(row_number)
                nid = identity(source_identity)
                optional_missing = [
                    key for key in ('health_center', 'employee_number', 'nationality')
                    if key in mapping and not text_cell(cells[mapping[key]])
                ]
                if not name or len(nid) != 10:
                    classification = 'invalid_core'
                elif nid in seen:
                    classification = 'duplicate_in_file'
                elif optional_missing:
                    classification = 'incomplete_source'
                else:
                    classification = 'structurally_valid'
                if len(nid) == 10:
                    seen.add(nid)
                counts[classification] += 1
                from .employee_import_v2_matching import source_profile
                mapped_rows.append({
                    **source_profile(cells, mapping),
                    '_row': row_number,
                })
                if len(samples) < 8:
                    samples.append({
                        'row': row_number, 'classification': classification,
                        'identity_masked': (nid[:2] + '••••' + nid[-4:])
                        if len(nid) == 10 else '—',
                        'missing_optional': optional_missing,
                    })
            if masked_identity_rows:
                return Response({
                    'detail': (
                        'ملف Excel يحتوي على أرقام هوية مخفية بالفعل. '
                        'لا يمكن استعادة الأرقام الناقصة من رموز الإخفاء، '
                        'ولا يجوز استيراد هذا الملف. استخدم المصدر الأصلي '
                        'الذي يحفظ رقم الهوية كاملًا؛ وستُخفى الهوية في '
                        'شاشة الاستيراد والتقارير افتراضيًا.'
                    ),
                    'masked_identity_count': len(masked_identity_rows),
                    'masked_identity_source_rows': masked_identity_rows[:20],
                }, status=400, headers={'Cache-Control': 'private, no-store'})
            file_hash = sha256(raw).hexdigest()
            if action == 'approve_roster':
                from .employee_import_v2_direct import approve_roster
                return approve_roster(request, mapped_rows, file_hash, sheet_name)
            if action in ('restore_preview', 'restore_commit'):
                from .employee_import_v2_restore import handle_restore
                return handle_restore(
                    request, mapped_rows, file_hash, sheet_name, action,
                )
            from .employee_import_v2_matching import registry_match
            from .employee_import_v2_commit import (
                preview_commit_info, commit_safe_plan,
            )
            registry_report = registry_match(
                mapped_rows,
                review_category=(
                    'candidate_for_administrative_review'
                    if action == 'preview' else category
                ),
            )
            if action == 'review_page':
                from .employee_import_v2_matching import RESTORATION_REVIEW_PAGE_SIZE
                review_queue = registry_report.pop('_internal_review_queue', [])
                total_results = len(review_queue)
                total_pages = max(
                    1, (total_results + RESTORATION_REVIEW_PAGE_SIZE - 1)
                    // RESTORATION_REVIEW_PAGE_SIZE,
                )
                if review_page > total_pages:
                    return Response({'detail': 'رقم الصفحة خارج النطاق.'},
                                    status=400, headers={'Cache-Control': 'private, no-store'})
                start = (review_page - 1) * RESTORATION_REVIEW_PAGE_SIZE
                return Response({
                    'mode': 'archived_employee_review_page_read_only',
                    'category': category,
                    'page': review_page,
                    'page_size': RESTORATION_REVIEW_PAGE_SIZE,
                    'total': total_results,
                    'total_pages': total_pages,
                    'items': review_queue[start:start + RESTORATION_REVIEW_PAGE_SIZE],
                    'restore_enabled': False,
                    'notice': (
                        'هذه قائمة مطابقة للمسؤول الأعلى فقط. لا تمثل اعتمادًا '
                        'للاستعادة ولا تغير أي حالة موظف أو ملف صحي.'
                    ),
                }, headers={'Cache-Control': 'private, no-store'})
            if action == 'commit':
                return commit_safe_plan(
                    request, registry_report, file_hash, sheet_name, mapped_rows,
                )
            preview_details = preview_commit_info(
                registry_report, file_hash, sheet_name, request.user.pk,
            )
            from .employee_import_v2_direct import approval_preview
            direct_approval = approval_preview(
                registry_report, mapped_rows, file_hash,
                sheet_name, request.user.pk,
            )
            # Never return raw employee records or internal operation plans.
            registry_report.pop('_internal_planned_rows', None)
            registry_report.pop('_internal_review_queue', None)
            return Response({
                'mode': 'read_only_registry_match_v2',
                'sheet_name': sheet_name, 'rows_total': total,
                'header_row': header_row,
                'recognized_columns': list(mapping),
                'missing_optional_columns': [
                    field for field in HEADERS if field not in REQUIRED and field not in mapping
                ],
                'counts': dict(counts),
                'sample_masked': samples,
                **registry_report,
                **preview_details,
                'direct_approval': direct_approval,
            }, headers={'Cache-Control': 'private, no-store'})
        except Exception:
            return Response({'detail': 'تعذرت قراءة ملف XLSX؛ تحقق من الملف وأسماء الأعمدة.'},
                            status=status.HTTP_400_BAD_REQUEST)
        finally:
            if workbook is not None:
                workbook.close()
