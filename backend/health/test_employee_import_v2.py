"""Synthetic-only tests for Employee Excel Import V2 Phase 1.

No employee, review card, import batch, archive or medical writes are allowed.
"""
from io import BytesIO

from django.contrib.auth import get_user_model
from django.test import TestCase
from openpyxl import Workbook
from rest_framework.test import APIClient

from .models import AuditLog, Employee, EmployeeImportReview, DataImportBatch


class EmployeeImportV2PreviewTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_superuser(
            username='qa_import_v2_admin',
            email='qa-v2-admin@example.invalid',
            password='synthetic-admin-password',
        )
        self.staff = User.objects.create_user(
            username='qa_import_v2_staff',
            is_staff=True, password='synthetic-staff-password',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.url = '/api/employee-import-v2/preview/'

    def workbook(self, rows, headers=None, sheet_name='Employees'):
        wb = Workbook()
        ws = wb.active
        ws.title = sheet_name
        ws.append(headers or ['اسم الموظف', 'رقم الهوية / الإقامة',
                              'الرقم الوظيفي', 'المركز الصحي', 'الجنسية'])
        for item in rows:
            ws.append(item)
        bio = BytesIO()
        wb.save(bio)
        bio.seek(0)
        bio.name = 'employee-v2-synthetic.xlsx'
        return bio

    def preview(self, rows, headers=None):
        return self.client.post(
            self.url,
            {'file': self.workbook(rows, headers=headers),
             'sheet_name': 'Employees'},
            format='multipart',
        )

    def test_structure_preview_and_masking_are_read_only(self):
        response = self.preview([
            ['QA One', '1000000001', 'E-1', 'Center X', 'Saudi'],
            ['QA Two', '1000000002', '', 'Center X', 'Saudi'],
            ['QA Repeat', '1000000001', 'E-3', 'Center X', 'Saudi'],
            ['QA Invalid', '777', 'E-4', 'Center Y', 'Saudi'],
        ])
        self.assertEqual(response.status_code, 200, response.data)
        result = response.data
        self.assertEqual(result['mode'], 'read_only_v2_structure_preflight')
        self.assertEqual(result['rows_total'], 4)
        self.assertEqual(result['counts']['structurally_valid'], 1)
        self.assertEqual(result['counts']['incomplete_source'], 1)
        self.assertEqual(result['counts']['duplicate_in_file'], 1)
        self.assertEqual(result['counts']['invalid_core'], 1)
        self.assertEqual(result['recognized_columns'][0], 'name')
        self.assertFalse(result['database_identity_checked'])
        self.assertFalse(result['import_enabled'])
        self.assertEqual(result['employee_count_created'], 0)
        self.assertEqual(result['employee_count_updated'], 0)
        self.assertNotIn('1000000001', str(result))
        self.assertNotIn('QA One', str(result))
        self.assertEqual(response['Cache-Control'], 'private, no-store')
        self.assertEqual(Employee.objects.count(), 0)
        self.assertEqual(EmployeeImportReview.objects.count(), 0)
        self.assertEqual(DataImportBatch.objects.count(), 0)
        self.assertEqual(AuditLog.objects.count(), 0)

    def test_arabic_indic_digits_and_minimal_template(self):
        response = self.preview(
            [['محمد اختبار', '١٠٠٠٠٠٠٠٠٢']],
            headers=['اسم الموظف', 'رقم الهوية الوطنية'],
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['rows_total'], 1)
        self.assertEqual(response.data['counts'], {'structurally_valid': 1})
        self.assertEqual(response.data['sample_masked'][0]['identity_masked'], '10••••0002')

    def test_missing_required_headers_rejected(self):
        response = self.preview([['QA', 'Center 1']],
                                headers=['اسم الموظف', 'المركز الصحي'])
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('national_id', response.data['missing_required'])
        self.assertFalse(EmployeeImportReview.objects.exists())

    def test_role_permissions_and_invalid_file(self):
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.preview([['QA', '1000000001']]).status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.preview([['QA', '1000000001']]).status_code, (401, 403))
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            self.url, {'file': BytesIO(b'not an xlsx file')}, format='multipart',
        )
        self.assertEqual(response.status_code, 400)
