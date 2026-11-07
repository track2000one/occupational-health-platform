"""Synthetic-only staff import classification tests: no real identities or Excel data."""
from io import BytesIO

from django.test import TestCase
from openpyxl import Workbook

from .importers import process_excel_import
from .models import Employee, EmployeeImportReview, HealthCenter


def preview_file(rows):
    book = Workbook()
    sheet = book.active
    sheet.title = 'Employees'
    sheet.append([
        'اسم الموظف', 'رقم الهوية / الإقامة', 'المركز الصحي',
        'الرقم الوظيفي', 'البريد الإلكتروني', 'تاريخ الميلاد',
        'الجنسية', 'مكان الميلاد', 'تاريخ التعيين',
    ])
    for row in rows:
        sheet.append(row)
    stream = BytesIO()
    book.save(stream)
    stream.seek(0)
    stream.name = 'qa-staff-classification.xlsx'
    return stream


class EmployeeImportClassificationTests(TestCase):
    def setUp(self):
        self.center = HealthCenter.objects.create(
            name='QA Example Center', code='QA-CLAS-01', is_active=True,
        )
        self.second = HealthCenter.objects.create(
            name='QA Other Center', code='QA-CLAS-02', is_active=True,
        )
        self.existing = Employee.objects.create(
            name='موظف تجريبي', national_id='9998000001',
            employee_number='QA-1234', email='qa-original@example.invalid',
            date_of_birth='1980-01-01', health_center=self.center,
            job_title='فني',
        )

    def row(self, identity='9998000001', name='موظف تجريبي',
            center='QA Example Center', number='QA-1234',
            email='qa-original@example.invalid', birth='1980-01-01',
            nationality='', place='', joined=''):
        return (name, identity, center, number, email, birth,
                nationality, place, joined)

    def classify(self, *rows, commit=False):
        return process_excel_import(
            preview_file(rows), sheet_name='Employees',
            employee_import_mode='flexible', commit=commit,
        )

    def test_known_employee_same_identity_same_details_is_blue_not_red(self):
        result = self.classify(self.row())
        summary = result['summary']
        self.assertEqual(summary['already_existing'], 1, result)
        self.assertEqual(summary['true_conflicts'], 0, result)
        self.assertEqual(summary['valid_rows'], 0, result)
        self.assertEqual(summary['duplicate_rows'], 1, result)
        preview = result['preview_rows'][0]
        self.assertEqual(preview['status'], 'existing')
        self.assertEqual(preview['existing_employee']['id'], self.existing.pk)
        self.assertEqual(preview['existing_employee']['name'], 'موظف تجريبي')
        self.assertIn('nationality', preview['missing_optional_fields'])
        self.assertNotIn('employee_number', preview['missing_optional_fields'])
        self.assertEqual(Employee.objects.count(), 1)
        self.assertEqual(EmployeeImportReview.objects.count(), 0)

    def test_same_identity_changed_center_stays_existing_but_requires_comparison(self):
        result = self.classify(self.row(center='QA Other Center'))
        row = result['preview_rows'][0]
        self.assertEqual(row['status'], 'existing')
        self.assertIn('health_center', [
            item['field'] for item in row['field_differences']
        ])
        self.existing.refresh_from_db()
        self.assertEqual(self.existing.health_center_id, self.center.pk)
        self.assertEqual(result['summary']['true_conflicts'], 0)

    def test_same_identity_different_name_is_real_conflict(self):
        result = self.classify(self.row(name='موظف آخر مختلف'))
        row = result['preview_rows'][0]
        self.assertEqual(row['status'], 'conflict')
        self.assertEqual(result['summary']['true_conflicts'], 1)
        self.assertEqual(result['summary']['already_existing'], 0)
        self.assertTrue(any('different employee name' in issue for issue in row['issues']))
        self.assertEqual(Employee.objects.count(), 1)

    def test_same_identity_different_job_number_is_true_conflict(self):
        result = self.classify(self.row(number='QA-9999'))
        self.assertEqual(result['preview_rows'][0]['status'], 'conflict')
        self.assertTrue(any(
            'different employee number' in issue
            for issue in result['preview_rows'][0]['issues']
        ))

    def test_email_owned_by_different_identity_is_true_conflict(self):
        result = self.classify(self.row(
            identity='9998000002', name='موظف جديد',
            number='QA-5555', email='qa-original@example.invalid',
        ))
        self.assertEqual(result['preview_rows'][0]['status'], 'conflict')
        self.assertEqual(result['summary']['true_conflicts'], 1)
        self.assertTrue(any(
            'belongs to a different employee' in issue
            for issue in result['preview_rows'][0]['issues']
        ))

    def test_valid_new_employee_with_missing_optional_fields_is_yellow_hint_not_error(self):
        result = self.classify(self.row(
            identity='9998000003', name='موظف تجريبي آخر',
            number='', email='', birth='',
        ))
        self.assertEqual(result['summary']['new_ready'], 1)
        self.assertEqual(result['summary']['valid_rows'], 1)
        self.assertEqual(result['summary']['optional_incomplete'], 1)
        self.assertEqual(result['summary']['errors_count'], 0)
        row = result['preview_rows'][0]
        self.assertEqual(row['status'], 'valid')
        self.assertIn('date_of_birth', row['missing_optional_fields'])
        self.assertIn('email', row['missing_optional_fields'])
        self.assertEqual(Employee.objects.count(), 1)

    def test_name_normalization_with_arabic_diacritics_does_not_false_flag(self):
        result = self.classify(self.row(name='مُوظَّف تجريبي'))
        self.assertEqual(result['preview_rows'][0]['status'], 'existing')
        self.assertEqual(result['summary']['true_conflicts'], 0)

    def test_missing_required_center_blocks_import_even_for_existing_identity(self):
        result = self.classify(self.row(center='غير موجود في سجل المراكز'))
        row = result['preview_rows'][0]
        self.assertEqual(row['status'], 'error')
        self.assertEqual(result['summary']['needs_correction'], 1)
        self.assertIsNotNone(row['existing_employee'])
        self.assertFalse(row['health_center_matched'])

    def test_preview_never_updates_existing_and_commit_does_not_replace_it(self):
        result = self.classify(self.row(
            center='QA Other Center', nationality='السعودية',
        ), commit=True)
        self.assertEqual(result['summary']['imported_employees'], 0)
        self.assertEqual(Employee.objects.count(), 1)
        self.existing.refresh_from_db()
        self.assertEqual(self.existing.health_center_id, self.center.pk)
        self.assertEqual(self.existing.nationality, '')
        reviews = EmployeeImportReview.objects.all()
        self.assertEqual(reviews.count(), 1)
        review = reviews.first()
        self.assertEqual(review.employee_payload['_import_classification'], 'existing')
        self.assertEqual(review.status, 'conflict')
        self.assertEqual(review.conflict_employee_id, self.existing.pk)
