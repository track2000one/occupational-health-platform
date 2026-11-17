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
from .employee_template_contract import (
    CANONICAL_HEADERS, TEMPLATE_VERSION, NATIONALITY_PRIORITY,
    GENDER_CHOICES, MARITAL_CHOICES,
)
from .models import OrganizationUnit, HealthCenter

# The source headings come from the same contract used by import tests.
COLUMNS = CANONICAL_HEADERS
REQUIRED_COLUMNS = (1, 2)
ARAB_COUNTRY_ORDER = NATIONALITY_PRIORITY


def make_template():
    book = Workbook()
    sheet = book.active
    sheet.title = 'Employees'
    sheet.sheet_view.rightToLeft = True
    sheet.freeze_panes = 'C2'
    sheet.append(list(COLUMNS))
    # Only APPROVED active master records are offered as validated centers.
    # Draft centers must not appear as approved options in the template.
    centers = [
        (center.name or center.name_ar or '', '', center.code or '')
        for center in HealthCenter.objects.filter(
            is_active=True, is_archived=False,
            approval_status=HealthCenter.ApprovalStatus.APPROVED,
        ).order_by('name').only('name', 'name_ar', 'code')
        if center.name or center.name_ar
    ]
    approved_orgs = list(OrganizationUnit.objects.select_related('health_center').filter(
        is_approved=True, is_active=True, health_center__is_active=True,
        kind__in=['center', 'unit'],
    ).order_by('name'))
    nationalities = [name for name in ARAB_COUNTRY_ORDER if name in COUNTRY_LABEL_TO_CODE]
    nationalities += sorted((name for name in COUNTRY_LABEL_TO_CODE if name not in nationalities),
                            key=lambda name: name.casefold())

    master = book.create_sheet('المراكز والقطاعات')
    master.sheet_view.rightToLeft = True
    master.append(['المركز الصحي المعتمد حاليًا', 'قطاع/مجموعة (إن وجدت)', 'رمز المركز'])
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
            GENDER_CHOICES[idx] if idx < len(GENDER_CHOICES) else None,
            MARITAL_CHOICES[idx] if idx < len(MARITAL_CHOICES) else None,
            approved_orgs[idx].code if idx < len(approved_orgs) else None,
        ])
    info = book.create_sheet('تعليمات الاستخدام')
    info.sheet_view.rightToLeft = True
    guide = [
        [f'القالب المعتمد لاستيراد الموظفين — {TEMPLATE_VERSION}'],
        ['1', 'ورقة Employees فقط مخصصة لإدخال الموظفين. تبدأ البيانات من الصف 2. لا تغيّر اسمها أو رؤوس أعمدتها.'],
        ['2', 'الحقول الإلزامية: اسم الموظف، ورقم الهوية/الإقامة الكامل المكون من 10 أرقام. المركز والرقم الوظيفي والحقول الأخرى اختيارية.'],
        ['3', 'أدخل الهوية والرقم الوظيفي والجوال كنص للحفاظ على الأصفار. لا تضع هويات مخفية أو أرقامًا ناقصة.'],
        ['4', 'لا تكرر الهوية الوطنية أو الإقامة في أكثر من صف. الرقم الوظيفي والبريد لا يجوز ربطهما بهوية مختلفة.'],
        ['5', 'اختر اسم المركز والوحدة التنظيمية من الخيارات المعتمدة عند توفرها فقط؛ إذا لم تجدها اترك الحقل فارغًا للمراجعة.'],
        ['6', 'تواريخ الميلاد والتعيين بالتقويم الميلادي وبصيغة YYYY-MM-DD. لا تحول التاريخ الهجري إلى ميلادي دون تحقق.'],
        ['7', 'اختر المسمى الوظيفي من القائمة المرجعية إن أمكن؛ الوظيفة الحالية حقل إدخال منفصل.'],
        ['8', 'يجب أن تكون الجنسية والجنس والحالة الاجتماعية من القوائم. عدد الأطفال رقم صحيح غير سالب.'],
        ['9', 'حقول المعلومات غير المتوفرة تُترك فارغة، ولا تُدخل قيمًا افتراضية أو غير مؤكدة. ستظهر البطاقة بلون تنبيهي عند النقص.'],
        ['10', 'ورقتا «قوائم الاختيار» و«تعليمات الاستخدام» ليستا للاستيراد؛ لا تضف بيانات أشخاص إليهما.'],
        ['11', 'استخدم فحص الملف في المنصة قبل الاستيراد، وراجع عدد السجلات والأعمدة والتعارضات.'],
        ['12', 'الاستيراد ينشئ بطاقات إدارية مؤقتة فقط ولا يفك أرشفة ملفات صحية أو يعتمد الموظفين تلقائيًا.'],
        ['13', 'إذا كانت دفعة موظفين مستوردة سابقًا، راجع تقرير التداخل قبل رفع دفعة جديدة؛ الاستيراد ليس تحديثًا جماعيًا للسجلات القديمة.'],
        ['14', 'لا ترفع ملف الموظفين الحقيقي إلى GitHub أو Staging أو خدمات مشاركة عامة.'],
        ['تنبيه', 'تعكس قوائم المراكز المعتمدة الحالة الحالية فقط، وقد تكون فارغة لحين اعتماد دليل المراكز.'],
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
        sheet.column_dimensions[letter].width = (34 if col in (1, 6, 7, 8, 15, 16, 17, 18) else 24)
        for row in range(2, 502):
            cell = sheet.cell(row, col)
            cell.alignment = Alignment(horizontal='right', vertical='center')
            if row % 2 == 0:
                cell.fill = pale
    # Numeric identifiers must be treated as text by Excel to preserve their digits.
    for col in ('B', 'C', 'E'):
        for row in range(2, 502):
            sheet[f'{col}{row}'].number_format = '@'
    for col in ('J', 'S'):
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
        formula = f'INDIRECT("{safe_sheet}!${source_col}$2:${source_col}${count+1}")'
        validation = DataValidation(type='list', formula1=formula, allow_blank=True)
        validation.errorTitle = 'قيمة غير موجودة في القائمة'
        validation.error = 'اختر قيمة من قائمة الاختيار المعتمدة.'
        validation.showErrorMessage = True
        sheet.add_data_validation(validation)
        validation.add(f'{target_col}2:{target_col}501')

    for col, source_col, length in [
        ('F', 'A', len(centers)), ('P', 'B', len(JOB_TITLES)),
        ('I', 'C', len(nationalities)), ('L', 'E', 2),
        ('M', 'F', 4), ('G', 'G', len(approved_orgs)),
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
        response['Content-Disposition'] = "attachment; filename=OHP_Employee_Approved_Template_V3.xlsx"
        response['Cache-Control'] = 'no-store'
        return response
