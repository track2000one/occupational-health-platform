"""Full employee roster preview: all row statuses, masked PII, preview-only writes.

Only synthetic records are used. Preview must not create Employee or
EmployeeImportReview records, nor store the detailed roster in DataImportBatch.
"""
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from openpyxl import Workbook
from rest_framework.test import APIClient

from .models import DataImportBatch, Employee, EmployeeImportReview, HealthCenter


def synthetic_staff_file():
    book = Workbook()
    ws = book.active
    ws.title = 'Employees'
    ws.append([
        'اسم الموظف', 'رقم الهوية / الإقامة', 'المركز الصحي', 'تاريخ الميلاد',
        'الرقم الوظيفي', 'الوظيفة الحالية', 'رقم الجوال', 'البريد الإلكتروني',
    ])
    for i in range(1, 38):
        # 34 regular, 1 provisional (unknown center), 1 invalid (missing name),
        # 1 duplicate of the 1st identity
        name = f'Synthetic Staff {i}' if i != 35 else ''
        center = 'Synthetic Clinic One' if i != 36 else 'No such health center'
        identity = f'9996{i:06d}' if i != 37 else '9996000001'
        ws.append([
            name, identity, center, '1988-04-20', f'QA-JOB-{i:04d}',
            'QA test job only', '0500000000', f'preview{i}@example.invalid',
        ])
    data = BytesIO()
    book.save(data)
    data.seek(0)
    return SimpleUploadedFile(
        'synthetic-preview-only.xlsx', data.getvalue(),
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )


class FullEmployeeRosterPreviewTests(TestCase):
    def setUp(self):
        user_class = get_user_model()
        self.staff = user_class.objects.create_user(
            username='preview_roster_supervisor', password='QA-fake-password',
            is_staff=True,
        )
        self.reader = user_class.objects.create_user(
            username='preview_roster_reader', password='QA-fake-password',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.staff)
        self.center = HealthCenter.objects.create(
            name='Synthetic Clinic One', code='QA-PREV-001', is_active=True,
        )

    def preview(self):
        return self.client.post('/api/excel-import/upload/', {
            'file': synthetic_staff_file(),
            'commit': 'false',
            'employeeImportMode': 'flexible',
            'sheetName': 'Employees',
        }, format='multipart')

    def test_preview_returns_all_rows_with_status_and_masked_contact_fields(self):
        response = self.preview()
        self.assertEqual(response.status_code, 200, response.data)
        data = response.data
        self.assertEqual(data['mode'], 'preview')
        self.assertEqual(data['summary']['total_rows'], 37)
        self.assertEqual(data['summary']['valid_rows'], 35)
        self.assertEqual(data['summary']['provisional_ready'], 1)
        self.assertEqual(data['summary']['errors_count'], 1)
        self.assertEqual(data['summary']['duplicate_rows'], 1)
        self.assertEqual(len(data['preview_rows']), 37)
        self.assertEqual(data['preview_rows_total'], 37)
        self.assertFalse(data['preview_rows_truncated'])
        self.assertEqual([row['row'] for row in data['preview_rows']], list(range(2, 39)))
        first = data['preview_rows'][0]
        self.assertEqual(first['status'], 'valid')
        self.assertEqual(first['name'], 'Synthetic Staff 1')
        self.assertEqual(first['date_of_birth'], '1988-04-20')
        self.assertEqual(first['health_center'], 'Synthetic Clinic One')
        self.assertTrue(first['health_center_matched'])
        self.assertEqual(first['employee_number'], 'QA-JOB-0001')
        self.assertEqual(first['current_job'], 'QA test job only')
        self.assertNotEqual(first['national_id'], '9996000001')
        self.assertTrue(first['national_id'].endswith('0001'))
        self.assertNotEqual(first['mobile'], '0500000000')
        self.assertNotEqual(first['email'], 'preview1@example.invalid')
        self.assertEqual(data['preview_rows'][34]['status'], 'error')
        self.assertEqual(data['preview_rows'][35]['status'], 'provisional')
        self.assertFalse(data['preview_rows'][35]['health_center_matched'])
        self.assertEqual(data['preview_rows'][36]['status'], 'conflict')
        self.assertTrue(data['preview_rows'][36]['issues'])
        self.assertEqual(Employee.objects.count(), 0)
        self.assertEqual(EmployeeImportReview.objects.count(), 0)

    def test_batch_audit_keeps_only_counts_and_mapping_no_raw_employee_data(self):
        response = self.preview()
        self.assertEqual(response.status_code, 200, response.data)
        batch = DataImportBatch.objects.get(pk=response.data['batch_id'])
        self.assertEqual(batch.status, 'validated')
        self.assertNotIn('preview_rows', batch.summary)
        self.assertNotIn('errors', batch.summary)
        self.assertNotIn('duplicates', batch.summary)
        self.assertEqual(batch.summary['summary']['total_rows'], 37)
        self.assertNotIn('Synthetic Staff 1', str(batch.summary))
        self.assertNotIn('9996000001', str(batch.summary))
        self.assertEqual(Employee.objects.count(), 0)

    def test_non_admin_cannot_preview_personal_employee_data(self):
        self.client.force_authenticate(self.reader)
        response = self.preview()
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Employee.objects.count(), 0)
        self.assertEqual(DataImportBatch.objects.count(), 0)
