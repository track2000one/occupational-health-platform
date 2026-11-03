"""Ensure a previously existing Arabic Excel roster reads actual employee columns.

Tests contain only synthetic, non-personal data; no real employee workbook.
"""
from datetime import date
from io import BytesIO

from django.contrib.auth import get_user_model
from django.test import TestCase
from openpyxl import Workbook

from .importers import process_excel_import
from .models import Employee, EmployeeImportReview, HealthCenter


def synthetic_workbook(headers, row, row_number=2):
    book = Workbook()
    ws = book.active
    ws.title = 'قاعدة بيانات'
    ws.append(headers)
    if row_number > 2:
        # Empty formatted rows are common in real-world legacy workbooks.
        for _ in range(2, row_number):
            ws.append([None] * len(headers))
    ws.append(row)
    output = BytesIO()
    book.save(output)
    output.seek(0)
    output.name = 'synthetic-original-roster.xlsx'
    return output


class ExistingEmployeeExcelMappingTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser(
            username='synthetic_roster_qa', password='qa-example-only',
            email='qa-admin@example.invalid',
        )
        self.center = HealthCenter.objects.create(
            name='مركز اختباري محلي', name_ar='مركز اختباري محلي',
            code='OHP-REF-C998',
        )

    def test_actual_columns_A_to_G_with_row_1398_are_mapped_correctly(self):
        book = synthetic_workbook([
            'المركز الصحي', 'اسم الموظف', 'رقم الهوية / الإقامة',
            'الرقم الوظيفي', 'البريد الإلكتروني', 'رقم الجوال',
            'تاريخ الميلاد', 'المسمى الوظيفي',
        ], [
            self.center.name, 'موظف وهمي للاختبار', '٩٩٩٥٠٠١٣٩٨',
            'QA-1398', 'synthetic.employee@example.invalid', '966500000000',
            date(1988, 4, 20), 'مسمى وظيفي تجريبي',
        ], row_number=1398)
        result = process_excel_import(
            book, employee_import_mode='flexible',
            user=self.admin, commit=False,
        )
        self.assertEqual(result['header_row'], 1, result)
        self.assertEqual(result['sheet_name'], 'قاعدة بيانات')
        self.assertEqual(result['summary']['valid_rows'], 1, result)
        self.assertEqual(result['summary']['errors_count'], 0, result)
        self.assertEqual(result['summary']['total_rows'], 1, result)
        mapping = result['mapped_fields']
        for field, col in [('health_center',0),('name',1),('national_id',2),
                           ('employee_number',3),('email',4),('mobile',5),
                           ('date_of_birth',6),('job_title',7)]:
            self.assertEqual(mapping[field], col, field)
        self.assertEqual(Employee.objects.count(), 0)

    def test_formatted_arabic_header_is_matched_and_populated(self):
        result = process_excel_import(
            synthetic_workbook(
                ['المركز الصحي', 'اِسم الموظف', 'رقم الهوية / الاقامة',
                 'الرقم الوظيفي', 'البريد الالكتروني'],
                [self.center.name, 'موظف اختبار', '9995000002',
                 'QA-JOB-2', 'fake2@example.invalid']),
            user=self.admin, commit=True, employee_import_mode='flexible',
        )
        self.assertEqual(result['summary']['imported_employees'], 1, result)
        saved = Employee.objects.get(national_id='9995000002')
        self.assertEqual(saved.name, 'موظف اختبار')
        self.assertEqual(saved.employee_number, 'QA-JOB-2')
        self.assertEqual(saved.email, 'fake2@example.invalid')

    def test_incorrect_automatic_mapping_cannot_create_mass_pending_reviews(self):
        workbook = synthetic_workbook(
            ['اسم الموظف', 'رقم الهوية / الإقامة', 'البريد الإلكتروني'],
            ['موظف وهمي', '9995000003', 'fake3@example.invalid'],
        )
        preview = process_excel_import(
            workbook, user=self.admin, commit=False,
            employee_import_mode='flexible',
        )
        self.assertIn('health_center', preview['missing_required_fields'])
        workbook.seek(0)
        with self.assertRaisesRegex(ValueError, 'column mapping'):
            process_excel_import(workbook, user=self.admin, commit=True,
                                 employee_import_mode='flexible')
        self.assertEqual(Employee.objects.count(), 0)
        self.assertEqual(EmployeeImportReview.objects.count(), 0)

    def test_manual_mapping_recovers_legacy_headings_without_rewriting_data(self):
        columns = ['A-قطاع', 'B-الاسم', 'C-هوية', 'D-رقم وظيفي', 'E-بريد']
        workbook = synthetic_workbook(
            columns, [self.center.name, 'موظف اختبار 4',
                      '9995000004', 'QA-JOB-4', 'fake4@example.invalid'],
        )
        preview = process_excel_import(
            workbook, user=self.admin, commit=False,
            employee_import_mode='flexible',
        )
        self.assertTrue(preview['mapping_options'])
        workbook.seek(0)
        remap = {'health_center':0,'name':1,'national_id':2,
                 'employee_number':3,'email':4}
        result = process_excel_import(
            workbook, user=self.admin, commit=False,
            employee_import_mode='flexible', field_mapping=remap,
        )
        self.assertEqual(result['summary']['valid_rows'], 1, result)
        self.assertEqual(result['summary']['errors_count'], 0, result)
