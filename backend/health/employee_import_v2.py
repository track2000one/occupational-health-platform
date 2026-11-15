"""Independent v2 employee Excel preflight: read-only, no legacy import side effects.

Phase 2 adds READ-ONLY registry and approved health-center matching to the
structural checks. Neither preview creates review cards nor modifies staff,
archive state, organization links, clinical data or auditing.
"""
from collections import Counter
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
HEADERS = {
    'name': {'اسم الموظف', 'الاسم', 'اسم الموظفين', 'employee name', 'name', 'full name'},
    'national_id': {'رقم الهوية', 'رقم الهوية الاقامة', 'رقم الهوية الإقامة',
                    'رقم الهوية الوطنية', 'الهوية', 'السجل المدني',
                    'national id', 'national id iqama', 'national_id'},
    'employee_number': {'الرقم الوظيفي', 'رقم الموظف', 'employee number', 'employee id'},
    'email': {'البريد الالكتروني', 'البريد', 'email', 'email address'},
    'mobile': {'رقم الجوال', 'الجوال', 'mobile', 'mobile number'},
    'health_center': {'المركز الصحي', 'المركز الصحي مرجعي', 'health center', 'center'},
    'nationality': {'الجنسية', 'nationality'},
    'date_of_birth': {'تاريخ الميلاد', 'date of birth', 'dob'},
    'appointment_date': {'تاريخ التعيين', 'appointment date', 'date hired'},
    'job_title': {'المسمى الوظيفي', 'مسمى الوظيفي', 'job title'},
    'job_title_en': {'المسمى الوظيفي الانجليزي', 'job title english'},
    'current_job': {'الوظيفة الحالية', 'current job'},
    'gender': {'الجنس', 'gender'},
    'marital_status': {'الحالة الاجتماعية', 'marital status'},
    'national_address': {'العنوان الوطني', 'national address'},
    'birth_place': {'مكان الميلاد', 'place of birth'},
    'organization_unit': {'الجهة الوحدة التنظيمية المعتمدة', 'الوحدة التنظيمية',
                          'الجهة التنظيمية', 'organizational unit'},
    'sector': {'القطاع المقترح', 'القطاع', 'sector'},

}
REQUIRED = ('name', 'national_id')


def heading(value):
    text = unicodedata.normalize('NFKC', str(value or '')).strip().lower()
    text = re.sub(r'[\u064b-\u065f\u0670\u0640\u200b-\u200f\ufeff]', '', text)
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


def detect_header(sheet):
    best = None
    score = -1
    for number, cells in enumerate(
        sheet.iter_rows(min_row=1, max_row=min(sheet.max_row or 1, 15),
                        max_col=min(sheet.max_column or 1, MAX_COLUMNS),
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
            if (sheet.max_column or 0) > MAX_COLUMNS:
                return Response({'detail': 'الملف يتجاوز حد 120 عمودًا.'}, status=400)
            detected = detect_header(sheet)
            if not detected:
                return Response({'detail': 'تعذر اكتشاف أسماء الأعمدة.'}, status=400)
            header_row, headers, mapping = detected
            normalized_headers = [heading(value) for value in headers]
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
                return Response({
                    'detail': 'يلزم وجود اسم الموظف ورقم الهوية ضمن الأعمدة.',
                    'missing_required': missing,
                    'recognized_columns': list(mapping),
                }, status=400)

            counts = Counter()
            seen = set()
            mapped_rows = []
            samples = []
            total = 0
            for row_number, cells in enumerate(
                sheet.iter_rows(min_row=header_row + 1,
                                max_col=min(sheet.max_column or 1, MAX_COLUMNS),
                                values_only=True), start=header_row + 1
            ):
                if not any(text_cell(value) for value in cells):
                    continue
                total += 1
                if total > MAX_ROWS:
                    return Response({'detail': 'يتجاوز الملف حد 2500 سجل؛ قسّم الملف قبل الفحص.'},
                                    status=400)
                name = text_cell(cells[mapping['name']])
                nid = identity(cells[mapping['national_id']])
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
            from .employee_import_v2_matching import registry_match
            registry_report = registry_match(mapped_rows)
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
            }, headers={'Cache-Control': 'private, no-store'})
        except Exception:
            return Response({'detail': 'تعذرت قراءة ملف XLSX؛ تحقق من الملف وأسماء الأعمدة.'},
                            status=status.HTTP_400_BAD_REQUEST)
        finally:
            if workbook is not None:
                workbook.close()
