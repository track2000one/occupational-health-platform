"""HealthData V1 contract. Read-only preview; never writes identity or clinical records."""
from collections import Counter
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from io import BytesIO
import os
import re
import zipfile

from django.http import HttpResponse
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from rest_framework import permissions
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .employee_import_classification import normalize_person_name
from .employee_import_v2_matching import norm_text
from .models import Employee, EmployeeHealthCard
from .organization_structure import STAGING_PROJECT

SHEET = 'HealthData'
LINK_FIELDS = ('source_row', 'national_id', 'employee_name', 'source_health_center')
# Ordered exactly as the reviewed workbook. Ambiguous fields deliberately have
# no automatic target until their clinical meaning is explicitly reviewed.
GROUPS = (
    ('physical', ('weight_kg', 'height_cm', 'bmi', 'obesity_status', 'physical_activity')),
    ('conditions', ('diabetes', 'hypertension', 'thyroid_disease', 'asthma',
        'ms_disorder_source', 'chronic_disease', 'blood_disease', 'smoking_status',
        'surgical_history', 'surgical_details', 'other_family_history_source',
        'colon_cancer_history', 'breast_cancer_history', 'other_cancer_history_source',
        'medical_restrictions')),
    ('mental', ('phq_result', 'gad_result', 'mbi_result', 'other_psychological',
        'depression', 'anxiety', 'burnout')),
    ('follow_up', ('latest_virtual_visit', 'joined_program', 'latest_field_visit_source',
        'lab_request', 'lab_request_date', 'lab_result', 'result_checked_date', 'follow_up_source')),
    ('immunity', ('anti_hbs', 'measles_igg', 'varicella_igg', 'ppd_test', 'ppd_date',
        'hcv', 'hbsag', 'hiv', 'rubella_igg')),
    ('vaccinations', ('flu_vaccine', 'mcv4_vaccine', 'covid_19', 'other_vaccine',
        'hbv_vaccine', 'hbv_dose_1', 'hbv_dose_2', 'hbv_dose_3', 'post_vaccine_anti_hbs',
        'post_vaccine_anti_hbs_date', 'mmr_vaccine', 'mmr_dose_1', 'mmr_dose_2')),
    ('exposure', ('nsi_source', 'needle_stick_history')),
    ('screening', ('breast_cancer_screening', 'colon_cancer_screening')),
)
HEADERS = LINK_FIELDS + tuple(key for _, keys in GROUPS for key in keys)
HEALTH_FIELDS = HEADERS[len(LINK_FIELDS):]
AMBIGUOUS = frozenset(('ms_disorder_source', 'other_family_history_source',
    'other_cancer_history_source', 'latest_field_visit_source', 'follow_up_source', 'nsi_source'))
BOOLEAN_FIELDS = frozenset(('diabetes', 'hypertension', 'thyroid_disease', 'asthma',
    'blood_disease', 'surgical_history', 'colon_cancer_history', 'breast_cancer_history',
    'depression', 'anxiety', 'burnout', 'joined_program', 'needle_stick_history'))
NUMERIC_FIELDS = frozenset(('weight_kg', 'height_cm', 'bmi', 'phq_result', 'gad_result', 'mbi_result'))
DATE_FIELDS = frozenset(('latest_virtual_visit', 'lab_request_date', 'result_checked_date',
    'ppd_date', 'hbv_dose_1', 'hbv_dose_2', 'hbv_dose_3', 'post_vaccine_anti_hbs_date',
    'mmr_dose_1', 'mmr_dose_2'))
TARGETS = {}
for group, keys in GROUPS:
    for key in keys:
        if key in AMBIGUOUS:
            continue
        section = group
        if group == 'immunity':
            section = 'follow_up' if key in ('ppd_test', 'ppd_date') else 'vaccinations'
        elif group == 'vaccinations' and key in ('flu_vaccine', 'mcv4_vaccine', 'covid_19', 'other_vaccine'):
            section = 'follow_up'
        elif group == 'exposure':
            section = 'conditions'
        elif group == 'screening':
            section = 'follow_up'
        TARGETS[key] = (section, 'joined' if key == 'joined_program' else key)

MAX_FILE = 5 * 1024 * 1024
MAX_EXPANDED = 40 * 1024 * 1024
MAX_ROWS = 2500
NO_CACHE = {'Cache-Control': 'private, no-store'}
STATUS_KEYS = ('matched', 'identity_review', 'unmatched', 'inactive', 'duplicate')
FIELD_STATES = ('empty', 'proposed', 'same_card_value', 'card_conflict', 'review', 'identity_blocked')


def authorized(request):
    return (request.user.is_authenticated and request.user.is_superuser
            and os.getenv('STAGING_MODE', '').lower() == 'true'
            and os.getenv('RAILWAY_PROJECT_ID') == STAGING_PROJECT)


def template_bytes():
    book = Workbook()
    sheet = book.active
    sheet.title = SHEET
    sheet.sheet_view.rightToLeft = True
    sheet.freeze_panes = 'E2'
    sheet.append(HEADERS)
    sheet.auto_filter.ref = f'A1:{get_column_letter(len(HEADERS))}1'
    colors = ('184B65', '497A49', 'A46021', '78518B', '216989', '167D86', '17766D', '995546', '426C85')
    for index, keys in enumerate((LINK_FIELDS, *(keys for _, keys in GROUPS))):
        for key in keys:
            col = HEADERS.index(key) + 1
            cell = sheet.cell(1, col)
            cell.fill = PatternFill('solid', fgColor=colors[index])
            cell.font = Font(color='FFFFFF', bold=True)
            cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
            sheet.column_dimensions[get_column_letter(col)].width = 25 if key != 'employee_name' else 34
    sheet.row_dimensions[1].height = 36
    sheet.column_dimensions['B'].number_format = '@'
    guide = book.create_sheet('دليل الحقول')
    guide.sheet_view.rightToLeft = True
    guide.append(('المفتاح البرمجي', 'المجموعة', 'الربط المستهدف', 'ضابط المعاينة'))
    for key in LINK_FIELDS:
        guide.append((key, 'الربط', '', 'للمطابقة فقط، لا تعديل للموظف'))
    for group, keys in GROUPS:
        for key in keys:
            guide.append((key, group, '.'.join(TARGETS.get(key, ())),
                'مراجعة دلالة المصدر' if key in AMBIGUOUS else 'قيمة غير فارغة؛ المعاينة لا تحفظ'))
    for col, width in zip('ABCD', (32, 25, 43, 48)):
        guide.column_dimensions[col].width = width
    info = book.create_sheet('تعليمات')
    info.sheet_view.rightToLeft = True
    info.append(('HealthData V1 — معاينة فقط',))
    for line in ('استخدم بيانات اصطناعية فقط في Staging.', 'لا تغير أسماء الأعمدة أو ترتيبها.',
                 'رقم الهوية نص من 10 أرقام والاسم للتحقق، ولا يُنشأ موظف جديد.',
                 'التواريخ ميلادية YYYY-MM-DD أو خلية تاريخ Excel؛ الفراغ لا يعني لا.',
                 'لا تعتبر حالة التحصين أو المناعة إثبات جرعة أو نتيجة تشخيص.',
                 'الفحص لا يحفظ بيانات ولا يعتمد بطاقة صحية.'):
        info.append((line,))
    info.column_dimensions['A'].width = 110
    out = BytesIO()
    book.save(out)
    book.close()
    return out.getvalue()


def read_rows(upload):
    if not upload or not str(upload.name).lower().endswith('.xlsx') or upload.size > MAX_FILE:
        raise ValueError('اختر ملف XLSX لا يتجاوز 5 ميغابايت.')
    raw = upload.read(MAX_FILE + 1)
    if not raw or len(raw) > MAX_FILE:
        raise ValueError('الملف فارغ أو تجاوز الحجم المسموح.')
    try:
        with zipfile.ZipFile(BytesIO(raw)) as archive:
            if len(archive.infolist()) > 250 or sum(i.file_size for i in archive.infolist()) > MAX_EXPANDED:
                raise ValueError('حجم الملف بعد فك الضغط يتجاوز الحد الآمن.')
        book = load_workbook(BytesIO(raw), read_only=True, data_only=False, keep_links=False)
    except (ValueError, zipfile.BadZipFile):
        raise ValueError('ملف XLSX غير صالح أو تجاوز الحد الآمن.')
    except Exception:
        raise ValueError('تعذرت قراءة ملف XLSX.')
    try:
        if SHEET not in book.sheetnames:
            raise ValueError('ورقة HealthData مطلوبة.')
        sheet = book[SHEET]
        if sheet.max_row in (None, 1) or sheet.max_column in (None, 1):
            sheet.reset_dimensions()
        if (sheet.max_column or 0) > len(HEADERS) or (sheet.max_row or 0) > MAX_ROWS + 1:
            raise ValueError('عدد الصفوف أو الأعمدة خارج حدود قالب V1.')
        iterator = sheet.iter_rows(max_col=len(HEADERS) + 1)
        first = next(iterator, ())
        headers = tuple(c.value for c in first[:len(HEADERS)])
        if headers != HEADERS or any(c.value is not None for c in first[len(HEADERS):]):
            raise ValueError('رؤوس الأعمدة لا تطابق قالب HealthData V1.')
        rows = []
        for index, cells in enumerate(iterator, start=2):
            if index > MAX_ROWS + 1:
                raise ValueError('الملف يتجاوز 2500 صف.')
            if any(c.data_type == 'f' for c in cells):
                raise ValueError(f'الصف {index}: الصيغ غير مسموحة؛ استخدم القيم فقط.')
            values = [c.value for c in cells]
            if any(v is not None for v in values[len(HEADERS):]):
                raise ValueError('يوجد عمود زائد عن القالب.')
            if not any(v is not None and v != '' for v in values):
                continue
            if any(len(str(v)) > 2000 for v in values if v is not None):
                raise ValueError(f'الصف {index}: إحدى القيم أطول من الحد.')
            rows.append((index, dict(zip(HEADERS, values))))
        if not rows:
            raise ValueError('لا توجد بيانات للفحص.')
        return rows
    finally:
        book.close()


def text(value):
    return '' if value is None else str(value).strip()


def normalized_value(key, value):
    if value is None or text(value) == '':
        return None
    if key in AMBIGUOUS:
        raise ValueError('ambiguous_source')
    if key in BOOLEAN_FIELDS:
        if isinstance(value, bool):
            return 'Yes' if value else 'No'
        label = text(value).casefold()
        if label in ('yes', 'نعم'):
            return 'Yes'
        if label in ('no', 'لا'):
            return 'No'
        if label in ('n/a', 'لا ينطبق'):
            return 'N/A'
        raise ValueError('non_boolean_source')
    if key in DATE_FIELDS:
        try:
            parsed = value.date() if isinstance(value, datetime) else value if isinstance(value, date) else date.fromisoformat(text(value))
        except (TypeError, ValueError):
            raise ValueError('invalid_date')
        if not 1900 <= parsed.year <= date.today().year or parsed > date.today():
            raise ValueError('invalid_date')
        return parsed.isoformat()
    if key in NUMERIC_FIELDS:
        try:
            number = Decimal(text(value))
            if not number.is_finite() or number < 0 or number > 10000:
                raise ValueError('invalid_number')
            if key in ('weight_kg', 'height_cm', 'bmi') and number == 0:
                raise ValueError('invalid_number')
            return format(number.normalize(), 'f')
        except (InvalidOperation, ValueError):
            raise ValueError('invalid_number')
    return text(value)


def identity_status(source, employee, duplicate):
    nid = text(source.get('national_id'))
    if duplicate:
        return 'duplicate'
    if not re.fullmatch(r'[0-9]{10}', nid) or not text(source.get('employee_name')):
        return 'identity_review'
    if not employee:
        return 'unmatched'
    if employee.is_archived or employee.employment_status != Employee.EmploymentStatus.ACTIVE or employee.registration_status != 'verified':
        return 'inactive'
    if normalize_person_name(employee.name) != normalize_person_name(source['employee_name']):
        return 'identity_review'
    source_center = text(source.get('source_health_center'))
    if source_center:
        center = employee.health_center
        if not center or norm_text(source_center) not in {
            norm_text(v) for v in (center.name, center.name_ar, center.name_en, center.code) if v
        }:
            return 'identity_review'
    return 'matched'


def preview_rows(rows):
    nids = Counter(text(src.get('national_id')) for _, src in rows)
    staff = {e.national_id: e for e in Employee.objects.filter(national_id__in=list(nids)).select_related('health_center')}
    cards = {c.employee_id: c for c in EmployeeHealthCard.objects.filter(employee_id__in=[e.pk for e in staff.values()]).only('employee', 'data', 'is_approved')}
    counts = Counter()
    totals = Counter()
    field_counts = {key: Counter() for key in HEALTH_FIELDS}
    items = []
    for row_index, source in rows:
        nid = text(source.get('national_id'))
        employee = staff.get(nid)
        identity = identity_status(source, employee, nids[nid] > 1)
        counts[identity] += 1
        card = cards.get(employee.pk) if employee and identity == 'matched' else None
        item_counts = Counter()
        issues = []
        for key in HEALTH_FIELDS:
            value = source.get(key)
            if value is None or text(value) == '':
                state = 'empty'
            elif identity != 'matched':
                state = 'identity_blocked'
            else:
                try:
                    proposed = normalized_value(key, value)
                except ValueError as exc:
                    state = 'review'
                    issues.append({'field': key, 'reason': str(exc)})
                else:
                    section, target = TARGETS[key]
                    saved_section = card.data.get(section, {}) if card and isinstance(card.data, dict) else {}
                    existing = saved_section.get(target) if isinstance(saved_section, dict) else None
                    if existing is not None and text(existing) != '':
                        try:
                            same = normalized_value(key, existing) == proposed
                        except ValueError:
                            same = False
                        state = 'same_card_value' if same else 'card_conflict'
                    else:
                        state = 'proposed'
            item_counts[state] += 1
            field_counts[key][state] += 1
            totals[state] += 1
        items.append({'row': row_index, 'identity_status': identity,
                      'existing_card': bool(card), 'approved_card': bool(card and card.is_approved),
                      'counts': {s: item_counts[s] for s in FIELD_STATES}, 'issues': issues})
    return {'version': 'HealthData V1', 'total_rows': len(rows),
            'health_fields': len(HEALTH_FIELDS), 'identity_counts': {s: counts[s] for s in STATUS_KEYS},
            'field_totals': {s: totals[s] for s in FIELD_STATES},
            'fields': [{'field': key, 'target': '.'.join(TARGETS.get(key, ())),
                        'counts': {s: field_counts[key][s] for s in FIELD_STATES}} for key in HEALTH_FIELDS],
            'rows': items, 'read_only': True, 'commit_available': False,
            'notice': 'المعاينة تقارن القيم المحفوظة في البطاقة فقط، ولا تعتمد المطابقة السريرية مع السجلات المتخصصة.'}


class HealthDataTemplateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not authorized(request):
            return Response({'detail': 'متاح للمسؤول الأعلى في Staging فقط.'}, status=403, headers=NO_CACHE)
        response = HttpResponse(template_bytes(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        response['Content-Disposition'] = 'attachment; filename="OHP_HealthData_V1.xlsx"'
        response['Cache-Control'] = NO_CACHE['Cache-Control']
        return response


class HealthDataPreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        if not authorized(request):
            return Response({'detail': 'متاح للمسؤول الأعلى في Staging فقط.'}, status=403, headers=NO_CACHE)
        if request.data.get('synthetic_confirmed') != 'true':
            return Response({'detail': 'أقر باستخدام بيانات اصطناعية فقط.'}, status=400, headers=NO_CACHE)
        try:
            rows = read_rows(request.FILES.get('file'))
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400, headers=NO_CACHE)
        return Response(preview_rows(rows), headers=NO_CACHE)
