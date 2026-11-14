"""Synthetic-only tests for the aligned employee master template and importer."""
from io import BytesIO

from django.contrib.auth import get_user_model
from django.test import TestCase
from openpyxl import Workbook, load_workbook
from rest_framework.test import APIClient

from .employee_roster_template import COLUMNS
from .importers import process_excel_import
from .models import Employee, EmployeeHealthProfile, HealthCenter, OrganizationUnit


def make_file(columns, entries):
    book = Workbook()
    sheet = book.active
    sheet.title = 'Employees'
    sheet.append(columns)
    for row in entries:
        sheet.append(row)
    stream = BytesIO()
    book.save(stream)
    stream.seek(0)
    stream.name = 'synthetic-employees.xlsx'
    return stream


class EmployeeMasterImportAlignmentTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_user(
            username='template_qa_staff', password='fake-qa-only', is_staff=True,
        )
        self.reader = get_user_model().objects.create_user(
            username='template_qa_reader', password='fake-qa-only',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.real = HealthCenter.objects.create(name='المركز الصحي التجريبي', name_ar='التجريبي', code='OHP-REF-C001')
        self.qa = HealthCenter.objects.create(name='QA Synthetic Health Center 001', code='QA-C001')
        self.sector = OrganizationUnit.objects.create(
            code='TMP-S-0123456789AB', name='قطاع اختبار', kind='sector', is_approved=False,
        )
        OrganizationUnit.objects.create(
            code='TMP-C001', name='التجريبي', kind='center', parent=self.sector,
            health_center=self.real, is_approved=False,
        )

    def run_import(self, columns, rows, commit=False):
        source = make_file(columns, rows)
        return process_excel_import(
            source, sheet_name='Employees', commit=commit,
            employee_import_mode='template', user=self.admin,
        )

    def test_template_download_is_protected_and_uses_organization_centers(self):
        response = self.client.get('/api/employee-roster-template/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('spreadsheetml', response['Content-Type'])
        book = load_workbook(BytesIO(response.content), read_only=False)
        self.assertEqual([cell.value for cell in book['Employees'][1]], list(COLUMNS))
        self.assertIn(self.real.name, [x[0] for x in book['المراكز والقطاعات'].values])
        self.assertNotIn(self.qa.name, [x[0] for x in book['المراكز والقطاعات'].values])
        self.assertEqual(book['Employees']['C2'].number_format, '@')
        self.assertGreaterEqual(len(book['Employees'].data_validations.dataValidation), 5)
        self.client.force_authenticate(self.reader)
        self.assertEqual(self.client.get('/api/employee-roster-template/').status_code, 403)

    def test_only_center_name_identity_required_two_blank_optional_emails_not_duplicates(self):
        columns = ('المركز الصحي', 'اسم الموظف', 'رقم الهوية / الإقامة')
        rows = [
            (self.real.name, 'موظف تجريبي أ', '٩٨٧٦٥٤٣٢١٠'),
            ('التجريبي', 'موظف تجريبي ب', '9876543211'),
        ]
        preview = self.run_import(columns, rows, commit=False)
        self.assertEqual(preview['summary']['valid_rows'], 2, preview)
        self.assertEqual(preview['summary']['duplicate_rows'], 0, preview)
        self.assertEqual(Employee.objects.count(), 0)
        actual = self.run_import(columns, rows, commit=True)
        self.assertEqual(actual['summary']['imported_employees'], 2, actual)
        self.assertEqual(Employee.objects.count(), 2)
        a = Employee.objects.get(national_id='9876543210')
        self.assertIsNone(a.email)
        self.assertIsNone(a.employee_number)
        self.assertEqual(a.periodic_exam_status, 'unknown')
        self.assertEqual(a.vaccination_status, 'unknown')
        self.assertEqual(a.risk_level, 'unknown')
        self.assertIsNone(a.organization_unit)

    def test_optional_country_job_fields_and_child_count_zero_persist(self):
        columns = ('المركز الصحي','اسم الموظف','رقم الهوية / الإقامة',
                   'الجنسية','المسمى الوظيفي بالإنجليزية','الوظيفة الحالية','عدد الأطفال',
                   'الرقم الوظيفي','البريد الإلكتروني','المسمى الوظيفي')
        rows = [
            (self.real.name,'موظف تجريبي','9876543212',
             'السعودية','Nurse','مشرف مناوبة',0,'QA-JOB-001','qa.employee@example.invalid','فني تمريض رجال'),
        ]
        preview = self.run_import(columns, rows)
        self.assertEqual(preview['summary']['valid_rows'], 1, preview)
        result = self.run_import(columns, rows, commit=True)
        self.assertEqual(result['summary']['imported_employees'], 1, result)
        employee = Employee.objects.get(national_id='9876543212')
        self.assertEqual(employee.nationality, 'SA')
        self.assertEqual(employee.job_title_en, 'Nurse')
        self.assertEqual(employee.current_job, 'مشرف مناوبة')
        self.assertEqual(employee.employee_number, 'QA-JOB-001')
        self.assertEqual(EmployeeHealthProfile.objects.get(employee=employee).children_count, 0)

    def test_source_nationality_spellings_are_normalized_to_iso_without_data_loss(self):
        # Synthetic data matching common source labels, never live employee IDs.
        columns = ('المركز الصحي', 'اسم الموظف', 'رقم الهوية / الإقامة', 'الجنسية')
        cases = [
            ('سعودي', 'SA'), ('سعودية', 'SA'), ('مصر', 'EG'),
            ('كوبي', 'CU'), ('الباكستان', 'PK'),
            ('البحرين', 'BH'), ('السودان', 'SD'), ('سوريا', 'SY'),
        ]
        rows = [
            (self.real.name, f'Synthetic Employee {index}', f'9876543{index:03d}', label)
            for index, (label, _) in enumerate(cases, start=1)
        ]
        preview = self.run_import(columns, rows, commit=False)
        self.assertEqual(preview['summary']['valid_rows'], len(cases), preview)
        result = self.run_import(columns, rows, commit=True)
        self.assertEqual(result['summary']['imported_employees'], len(cases), result)
        for index, (label, expected) in enumerate(cases, start=1):
            employee = Employee.objects.get(national_id=f'9876543{index:03d}')
            self.assertEqual(employee.nationality, expected, label)

    def test_unknown_country_becomes_review_not_fake_country(self):
        result = self.run_import(
            ('المركز الصحي','اسم الموظف','رقم الهوية / الإقامة','الجنسية'),
            [(self.real.name,'Person example','9876543213','بلد غير موجود')],
        )
        self.assertEqual(result['summary']['valid_rows'], 0, result)
        self.assertEqual(result['summary']['errors_count'], 1)
        self.assertEqual(Employee.objects.count(), 0)

    def test_existing_identity_is_not_duplicated(self):
        Employee.objects.create(name='Old fake', national_id='9876543214', health_center=self.real)
        result = self.run_import(
            ('المركز الصحي','اسم الموظف','رقم الهوية / الإقامة'),
            [(self.real.name,'New fake','9876543214')],
            commit=True,
        )
        self.assertEqual(result['summary']['duplicate_rows'], 1, result)
        self.assertEqual(Employee.objects.count(), 1)

    def test_org_code_waits_until_approved_but_base_record_can_be_imported(self):
        result = self.run_import(
            ('المركز الصحي','اسم الموظف','رقم الهوية / الإقامة','رمز الوحدة التنظيمية'),
            [(self.real.name,'Fake draft org','9876543215','TMP-C001')],
        )
        self.assertEqual(result['summary']['valid_rows'], 0, result)
        without_code = self.run_import(
            ('المركز الصحي','اسم الموظف','رقم الهوية / الإقامة'),
            [(self.real.name,'Fake no org','9876543216')],
        )
        self.assertEqual(without_code['summary']['valid_rows'], 1, without_code)
