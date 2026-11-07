"""Synthetic-only staff import classification tests: no real identities or Excel data."""
from io import BytesIO
from datetime import date

from django.test import TestCase
from django.contrib.auth import get_user_model
from openpyxl import Workbook
from rest_framework.test import APIClient

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
            date_of_birth=date(1980, 1, 1), health_center=self.center,
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
        self.assertEqual(summary['duplicate_rows'], 0, result)
        self.assertEqual(summary['staged_for_review'], 1, result)
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
        self.assertEqual(result['summary']['new_complete'], 0)
        self.assertEqual(result['summary']['new_optional_incomplete'], 1)
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
        self.assertEqual(review.status, 'pending')
        self.assertEqual(review.conflict_employee_id, self.existing.pk)

    def test_existing_employee_review_is_idempotent_across_reimports(self):
        first = self.classify(self.row(), commit=True)
        second = self.classify(self.row(), commit=True)
        self.assertEqual(first['summary']['imported_employees'], 0)
        self.assertEqual(second['summary']['imported_employees'], 0)
        self.assertEqual(first['summary']['duplicate_rows'], 0)
        self.assertEqual(Employee.objects.count(), 1)
        self.assertEqual(EmployeeImportReview.objects.count(), 1)
        self.assertEqual(EmployeeImportReview.objects.get().status, 'pending')

    def test_existing_employee_activation_cannot_be_bypassed_by_changing_identity(self):
        self.classify(self.row(), commit=True)
        review = EmployeeImportReview.objects.get()
        admin = get_user_model().objects.create_superuser(
            username='classification_qa_admin',
            email='classification-admin@example.invalid',
            password='synthetic-only-password',
        )
        client = APIClient()
        client.force_authenticate(admin)
        response = client.post(
            f'/api/employee-import-reviews/{review.pk}/activate/',
            {
                'name': 'مختلف بالهوية',
                'national_id': '9998000099',
                'health_center': self.center.pk,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(Employee.objects.count(), 1)
        self.existing.refresh_from_db()
        self.assertEqual(self.existing.national_id, '9998000001')
        review.refresh_from_db()
        self.assertEqual(review.status, 'pending')

    def test_true_conflict_and_invalid_center_are_not_recorded_as_safe_existing(self):
        result = self.classify(self.row(name='اسم شخص آخر', center='مركز غير معروف'), commit=True)
        self.assertEqual(result['summary']['true_conflicts'], 1)
        self.assertEqual(result['summary']['needs_correction'], 0)
        self.assertEqual(result['summary']['errors_count'], 1)
        self.assertEqual(result['preview_rows'][0]['status'], 'conflict')
        self.assertEqual(Employee.objects.count(), 1)
        review = EmployeeImportReview.objects.get()
        self.assertEqual(review.status, 'conflict')
        self.assertEqual(review.conflict_employee_id, self.existing.pk)


    def test_blocker_summary_counts_every_row_with_only_static_reasons(self):
        result = self.classify(
            self.row(identity='9998000002', name='QA New A', center='Unknown Center'),
            self.row(identity='9998000003', name='QA New B', center='Unknown Center'),
            self.row(identity='9998000004', name='QA New C', center='QA Example Center', birth='not-a-date'),
        )
        counts = {item['reason']: item['count']
                  for item in result['blocking_reasons']}
        self.assertEqual(result['summary']['total_rows'], 3)
        self.assertEqual(result['summary']['errors_count'], 3)
        self.assertEqual(counts['Health center does not match an active center in the platform.'], 2)
        self.assertEqual(counts['Invalid date of birth. Use a real Excel date or YYYY-MM-DD.'], 1)
        self.assertNotIn('QA New A', str(result['blocking_reasons']))
        self.assertNotIn('9998000002', str(result['blocking_reasons']))
        self.assertEqual(Employee.objects.count(), 1)
        self.assertEqual(EmployeeImportReview.objects.count(), 0)

    def test_centers_match_exact_english_title_without_fuzzy_guessing(self):
        english = HealthCenter.objects.create(
            name='Official Arabic/Master Name', name_ar='مركز اختباري معتمد',
            name_en='QA Bilingual Center', code='QA-BILINGUAL', is_active=True,
        )
        valid = self.classify(self.row(
            identity='9998000005', name='QA New Valid', center='QA Bilingual Center',
            number='QA-5555', email='new-valid@example.invalid',
        ))
        self.assertEqual(valid['summary']['new_ready'], 1)
        self.assertEqual(valid['summary']['errors_count'], 0)
        self.assertEqual(valid['preview_rows'][0]['status'], 'valid')
        self.assertTrue(valid['preview_rows'][0]['health_center_matched'])
        unknown = self.classify(self.row(
            identity='9998000006', name='QA Unknown Center',
            center='QA Bilingual Center North', number='QA-6666',
        ))
        self.assertEqual(unknown['summary']['new_ready'], 0)
        self.assertEqual(unknown['summary']['errors_count'], 1)
        self.assertFalse(unknown['preview_rows'][0]['health_center_matched'])
        self.assertIsNotNone(english.pk)
