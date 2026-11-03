"""Generate the CURRENT employee Excel template from Staging database references.

No employee or other private person records are read. Center options come only
from linked organizational centers, not QA/load-test centers.
"""
from io import BytesIO

from django.http import HttpResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation
from rest_framework import permissions
from rest_framework.views import APIView

from .employee_import_countries import COUNTRY_LABEL_TO_CODE
from .employee_import_job_titles import JOB_TITLES
from .models import OrganizationUnit

COLUMNS = (
    'المركز الصحي',
    'اسم الموظف',
    'رقم الهوية / الإقامة',
    'الرقم الوظيفي',
    'البريد الإلكتروني',
    'رقم الجوال',
    'تاريخ الميلاد',
    'مكان الميلاد',
    'الجنس',
    'الحالة الاجتماعية',
    'العنوان الوطني',
    'المسمى الوظيفي',
    'تاريخ التعيين',
    'الجنسية',
    'الوظيفة الحالية',
    'المسمى الوظيفي بالإنجليزية',
    'عدد الأطفال',
    'رمز الوحدة التنظيمية',
)
REQUIRED_COLUMNS = (1, 2, 3)
ARAB_COUNTRY_ORDER = (
    'السعودية', 'البحرين', 'الكويت', 'مصر', 'الإمارات', 'قطر', 'عُمان',
    'اليمن', 'الأردن', 'لبنان', 'سوريا', 'العراق', 'فلسطين',
    'السودان', 'ليبيا', 'تونس', 'الجزائر', 'المغرب', 'موريتانيا',
    'الصومال', 'جيبوتي', 'جزر القمر',
)


def make_template():
    book = Workbook()
    sheet = book.active
    sheet.title = 'Employees'
    sheet.sheet_view.rightToLeft = True
    sheet.freeze_panes = 'D2'
    sheet.append(list(COLUMNS))
    # Center names are drawn from the current active master, but no approval
    # is granted. An optional org code is exposed only when already approved.
    organizations = list(OrganizationUnit.objects.select_related(
        'health_center', 'parent',
    ).filter(kind='center', is_active=True, health_center__is_active=True)
        .order_by('parent__name', 'health_center__name'))
    seen = set()
    centers = []
    for unit in organizations:
        center = unit.health_center
        if center and center.pk not in seen:
            centers.append((center.name, unit.parent.name if unit.parent_id else '', unit.code))
            seen.add(center.pk)
    approved_orgs = list(OrganizationUnit.objects.select_related('health_center').filter(
        is_approved=True, is_active=True, health_center__is_active=True,
        kind__in=['center', 'unit'],
    ).order_by('name'))
    nationalities = [name for name in ARAB_COUNTRY_ORDER if name in COUNTRY_LABEL_TO_CODE]
    nationalities += sorted((name for name in COUNTRY_LABEL_TO_CODE if name not in nationalities),
                            key=lambda name: name.casefold())

    master = book.create_sheet('المراكز والقطاعات')
    master.sheet_view.rightToLeft = True
    master.append(['المركز الصحي', 'القطاع الاستشاري المقترح', 'رمز المركز في الهيكل'])
    for row in centers:
        master.append(list(row))

    choices = book.create_sheet('قوائم الاختيار')
    choices.sheet_view.rightToLeft = True
    choices.append(['المراكز الصحية', 'المسميات الوظيفية', 'الجنسية', 'رمز الدولة', 'الجنس',
                    'الحالة الاجتماعية', 'رموز الوحدات المعتمدة'])
    rows = max(len(centers), len(JOB_TITLES), len(nationalities), len(approved_orgs))
    for idx in range(rows):
        choices.append([
            centers[idx][0] if idx < len(centers) else None,
            JOB_TITLES[idx] if idx < len(JOB_TITLES) else None,
            nationalities[idx] if idx < len(nationalities) else None,
            COUNTRY_LABEL_TO_CODE[nationalities[idx]] if idx < len(nationalities) else None,
            ('ذكر', 'أنثى')[idx] if idx < 2 else None,
            ('أعزب', 'متزوج', 'مطلق', 'أرمل')[idx] if idx < 4 else None,
            approved_orgs[idx].code if idx < len(approved_orgs) else None,
        ])
    info = book.create_sheet('تعليمات الاستخدام')
    info.sheet_view.rightToLeft = True
    guide = [
        ['قالب استيراد الموظفين – منصة الصحة المهنية (محدث تلقائيًا)'],
        ['1', 'يبدأ إدخال الموظفين من الصف 2 في ورقة Employees. لا تغيّر اسم الورقة أو رؤوس الأعمدة.'],
        ['2', 'الحقول الإلزامية فقط: اسم المركز الصحي، اسم الموظف، رقم الهوية / الإقامة (10 أرقام).'],
        ['3', 'الرقم الوظيفي والبريد الإلكتروني اختياريان، لكن يجب عدم تكرارهما إن أُدخلا.'],
        ['4', 'اختر المركز من القائمة؛ أسماء المراكز الحالية في ورقة المراكز والقطاعات.'],
        ['5', 'الجنسية اسم بلد مثل «السعودية» أو رمز ISO مثل SA؛ السعودية والدول العربية أولًا.'],
        ['6', 'تاريخا الميلاد والتعيين اختياريان، بصيغة YYYY-MM-DD أو خلية تاريخ Excel صحيحة.'],
        ['7', 'المسمى الوظيفي من القائمة المرجعية، والوظيفة الحالية حقل يدوي مستقل.'],
        ['8', 'رمز الوحدة التنظيمية اختياري، ولا يقبل إلا الرمز المعتمد في المنصة.'],
        ['9', 'لا تُدرج بيانات طبية أو نتائج فحص أو تطعيم أو تشخيص في ملف تأسيس الموظفين.'],
        ['10', 'ارفع الملف بحساب مسؤول، ثم معاينة وتدقيق، ثم اعتماد الموظفين السليمين.'],
        ['11', 'التعارضات مثل وجود الهوية مسبقًا تُعلق للمراجعة ولا تنشئ موظفًا مكررًا.'],
        ['12', 'لا ترفع الملف المعبأ إلى GitHub أو إلى Staging إذا كان يحوي بيانات موظفين فعلية.'],
        ['تنبيه', 'أسماء القطاعات والمسارات التنظيمية مرجعية حتى اعتمادها رسميًا.'],
    ]
    for row in guide:
        info.append(row)
    info.merge_cells('A1:B1')

    blue = PatternFill('solid', fgColor='153F64')
    green = PatternFill('solid', fgColor='246B66')
    white = Font(name='Arial', size=11, color='FFFFFF', bold=True)
    pale = PatternFill('solid', fgColor='F1F6FA')
    for ws in [sheet, master, choices]:
        ws.row_dimensions[1].height = 35
        for cell in ws[1]:
            cell.fill = blue
            cell.font = white
            cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        ws.freeze_panes = ws.freeze_panes or 'A2'
        ws.auto_filter.ref = f'A1:{ws.cell(row=1, column=ws.max_column).column_letter}{max(ws.max_row,2)}'
    for col in REQUIRED_COLUMNS:
        sheet.cell(1, col).fill = green
    for col in range(1, len(COLUMNS)+1):
        letter = sheet.cell(1, col).column_letter
        sheet.column_dimensions[letter].width = (32 if col in (1, 2, 12, 15, 16) else 24)
        for row in range(2, 502):
            cell = sheet.cell(row, col)
            cell.alignment = Alignment(horizontal='right', vertical='center')
            if row % 2 == 0:
                cell.fill = pale
    # Numeric identifiers must be treated as text by Excel to preserve their digits.
    for col in ('C', 'D', 'F'):
        for row in range(2, 502):
            sheet[f'{col}{row}'].number_format = '@'
    for col in ('G', 'M'):
        for row in range(2, 502):
            sheet[f'{col}{row}'].number_format = 'yyyy-mm-dd'
    info.column_dimensions['A'].width = 17
    info.column_dimensions['B'].width = 106
    info.row_dimensions[1].height = 32
    info['A1'].font = Font(name='Arial', size=14, color='FFFFFF', bold=True)
    info['A1'].fill = blue
    for row in range(2, info.max_row+1):
        info.cell(row,1).font = Font(name='Arial', size=11, bold=True, color='153F64')
        info.cell(row,2).alignment = Alignment(wrap_text=True, vertical='center')
        info.row_dimensions[row].height = 38
    master.column_dimensions['A'].width = 31
    master.column_dimensions['B'].width = 36
    master.column_dimensions['C'].width = 23
    for letter, width in [('A', 34), ('B', 45), ('C', 32), ('D', 18), ('E', 21), ('F', 26), ('G', 29)]:
        choices.column_dimensions[letter].width = width

    def add_dropdown(target_col, source_col, count):
        if count <= 0:
            return
        safe_sheet = "'قوائم الاختيار'"
        formula = f'{safe_sheet}!${source_col}$2:${source_col}${count+1}'
        validation = DataValidation(type='list', formula1=formula, allow_blank=True)
        validation.errorTitle = 'قيمة غير موجودة في القائمة'
        validation.error = 'اختر قيمة من قائمة الاختيار المعتمدة.'
        validation.showErrorMessage = True
        sheet.add_data_validation(validation)
        validation.add(f'{target_col}2:{target_col}501')

    for col, source_col, length in [
        ('A', 'A', len(centers)), ('L', 'B', len(JOB_TITLES)),
        ('N', 'C', len(nationalities)), ('I', 'E', 2),
        ('J', 'F', 4), ('R', 'G', len(approved_orgs)),
    ]:
        add_dropdown(col, source_col, length)

    out = BytesIO()
    book.save(out)
    return out.getvalue()


class EmployeeRosterTemplateView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        content = make_template()
        response = HttpResponse(
            content,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = "attachment; filename=employee-roster-current.xlsx"
        response['Cache-Control'] = 'no-store'
        return response
