"""V4 employee roster template: distinct organizational hierarchy columns.

The workbook contains no employee data. Org labels below describe the proposed
import contract, NOT an approved organization chart. Center choices come only
from the approved directory. Excel is never persisted on the server.
"""
from io import BytesIO

from django.http import HttpResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.workbook.defined_name import DefinedName
from rest_framework import permissions
from rest_framework.views import APIView

from .models import HealthCenter

VERSION = 'OHP-EMPLOYEE-ORGANIZATIONAL-V4'
SHEET = 'Employees'
ORGANIZATION_COLUMNS = (
    ('holding_company', 'الشركة القابضة'),
    ('health_cluster', 'التجمع الصحي'),
    ('health_network', 'الشبكة الصحية'),
    ('main_administration', 'الإدارة الرئيسية'),
    ('sub_administration', 'الإدارة الفرعية'),
    ('department', 'القسم'),
    ('sub_unit', 'الوحدة الفرعية'),
    ('consultative_sector', 'القطاع الاستشاري'),
    ('health_center', 'المركز الصحي'),
    ('service_program', 'الخدمة / البرنامج'),
    ('service_scope', 'نطاق تقديم الخدمة'),
    ('service_category', 'الفئة الخدمية'),
    ('specialization', 'التخصص داخل المسار'),
)
HEADERS = (
    'اسم الموظف', 'رقم الهوية / الإقامة', 'الرقم الوظيفي',
    'البريد الإلكتروني', 'رقم الجوال',
    *(label for _, label in ORGANIZATION_COLUMNS),
    'حالة المراجعة', 'ملاحظات المراجعة', 'الجنسية', 'تاريخ الميلاد',
    'مكان الميلاد', 'الجنس', 'الحالة الاجتماعية', 'عدد الأطفال',
    'العنوان الوطني', 'المسمى الوظيفي', 'المسمى الوظيفي بالإنجليزية',
    'الوظيفة الحالية', 'تاريخ التعيين',
)
TOP_LEVELS = {
    'holding_company': 'شركة الصحة القابضة',
    'health_cluster': 'تجمع الشرقية الصحي',
    'health_network': 'شبكة الدمام الصحية',
}
PLACEHOLDERS = frozenset({
    'لا ينطبق', 'غير محدد في المصدر', 'غير محدد', 'لا يوجد',
    'n/a', 'na', 'none', '-', '—',
})
REVIEW_COLUMNS = ('حالة المراجعة', 'ملاحظات المراجعة')


def is_placeholder(value):
    return str(value or '').strip().casefold() in PLACEHOLDERS


def clean_org_value(value):
    text = str(value or '').strip()
    return '' if is_placeholder(text) else text[:220]


def needs_source_org_review(value):
    """Only explicit clean/derived statuses are safe to treat as unflagged."""
    label = str(value or '').strip()
    return bool(label and label not in (
        'لا توجد ملاحظة تصنيفية سابقة',
        'مستكمل من المسار',
    ))


def template_bytes():
    book = Workbook()
    sheet = book.active
    sheet.title = SHEET
    sheet.sheet_view.rightToLeft = True
    sheet.freeze_panes = 'F2'
    sheet.append(list(HEADERS))
    primary = PatternFill('solid', fgColor='104E71')
    org_fill = PatternFill('solid', fgColor='145F8F')
    warn = PatternFill('solid', fgColor='B67A23')
    white_font = Font(name='Arial', size=11, bold=True, color='FFFFFF')
    sheet.row_dimensions[1].height = 40
    for index, _ in enumerate(HEADERS, 1):
        cell = sheet.cell(1, index)
        cell.fill = (org_fill if 6 <= index <= 18
                     else warn if index in (19, 20) else primary)
        cell.font = white_font
        cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        sheet.column_dimensions[cell.column_letter].width = 30 if 6 <= index <= 20 else 23
    # Styling blank rows never creates fake employee rows.
    for letter in ('B', 'C', 'E'):
        for row in range(2, 502):
            sheet[f'{letter}{row}'].number_format = '@'
    sheet.auto_filter.ref = 'A1:AE1'

    reference = book.create_sheet('مرجع_الهيكلة')
    reference.sheet_view.rightToLeft = True
    reference.append(['المستوى', 'مسمى العمود', 'القيمة المرجعية/التوجيه'])
    for key, label in ORGANIZATION_COLUMNS:
        reference.append([key, label, TOP_LEVELS.get(key, 'من مصدر الموظف أو دليل الجهة المعتمد')])
    reference.column_dimensions['A'].width = 28
    reference.column_dimensions['B'].width = 36
    reference.column_dimensions['C'].width = 60

    centers = book.create_sheet('المراكز_المعتمدة')
    centers.sheet_view.rightToLeft = True
    centers.append(['اسم المركز الصحي', 'رمز المركز', 'حالة المرجع'])
    approved = HealthCenter.objects.filter(
        is_active=True, is_archived=False,
        approval_status=HealthCenter.ApprovalStatus.APPROVED,
    ).order_by('name').only('name', 'name_ar', 'code')
    for center in approved.iterator():
        if center.name or center.name_ar:
            centers.append([center.name or center.name_ar, center.code or '', 'معتمد'])
    centers.column_dimensions['A'].width = 48
    centers.column_dimensions['B'].width = 25
    centers.column_dimensions['C'].width = 20

    instructions = book.create_sheet('تعليمات الاستخدام')
    instructions.sheet_view.rightToLeft = True
    rows = [
        ['القالب التنظيمي لاستيراد الموظفين', VERSION],
        ['مصدر الهيكلة', 'هيكلة تشغيلية مقترحة؛ لا تعني اعتماد تبعية أي موظف تلقائيًا'],
        ['طريقة الإدخال', 'أدخل الموظفين في Employees فقط، كل مستوى في عمود مستقل'],
        ['أرقام الهوية', 'رقم الهوية كاملًا من عشر خانات وبصيغة نص دون إخفاء'],
        ['قيم المستويات', 'لا ينطبق للمستوى غير المنطبق، وغير محدد في المصدر للمعلومة غير المتوفرة'],
        ['سلامة التبعية', 'لا تنشئ مراكز أو وحدات غير معتمدة؛ تبقى القيم المقترحة مصدرًا للمراجعة'],
        ['تاريخ التعيين', 'احتفظ بالتاريخ الهجري كما هو ولا تحوله إلى ميلادي تخمينًا'],
        ['المعاينة والاعتماد', 'معاينة إلزامية قبل إنشاء أي بطاقة؛ تُمنع التعارضات والنقل التلقائي'],
        ['خصوصية الموظفين', 'لا ترفع الملفات المعبأة إلى GitHub أو إلى بيئة الاختبار العامة'],
    ]
    for row in rows:
        instructions.append(row)
    instructions.column_dimensions['A'].width = 26
    instructions.column_dimensions['B'].width = 100
    for row in range(1, instructions.max_row + 1):
        instructions.row_dimensions[row].height = 30
        instructions.cell(row, 2).alignment = Alignment(wrap_text=True, vertical='center')
    for ws in (reference, centers, instructions):
        ws.row_dimensions[1].height = 34
        for cell in ws[1]:
            cell.fill = primary
            cell.font = white_font
            cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
    # A soft list only for known validated centers; free text remains available
    # so mismatched centers can be submitted for explicit review, not auto-created.
    if centers.max_row > 1:
        book.defined_names.add(DefinedName(
            'V4_ApprovedCenters',
            attr_text="'المراكز_المعتمدة'!$A$2:$A$%s" % centers.max_row,
        ))
        dv = DataValidation(type='list', formula1='V4_ApprovedCenters',
                            allow_blank=True)
        dv.showErrorMessage = False
        sheet.add_data_validation(dv)
        dv.add('N2:N501')
    out = BytesIO()
    book.save(out)
    return out.getvalue()


class EmployeeOrgRosterTemplateV4View(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        response = HttpResponse(
            template_bytes(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = 'attachment; filename=OHP_Employee_Organizational_Template_V4.xlsx'
        response['Cache-Control'] = 'private, no-store'
        return response
