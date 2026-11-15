"""Synthetic-only tests for Employee Excel Import V2 Phase 1.

No employee, review card, import batch, archive or medical writes are allowed.
"""
from io import BytesIO

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from openpyxl import Workbook
from rest_framework.test import APIClient

from .models import AuditLog, Employee, EmployeeImportReview, DataImportBatch, HealthCenter


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
        self.assertEqual(result['mode'], 'read_only_registry_match_v2')
        self.assertEqual(result['rows_total'], 4)
        self.assertEqual(result['counts']['structurally_valid'], 1)
        self.assertEqual(result['counts']['incomplete_source'], 1)
        self.assertEqual(result['counts']['duplicate_in_file'], 1)
        self.assertEqual(result['counts']['invalid_core'], 1)
        self.assertEqual(result['recognized_columns'][0], 'name')
        self.assertTrue(result['database_identity_checked'])
        self.assertEqual(result['registry_counts']['center_review'], 2)
        self.assertEqual(result['registry_counts']['duplicate_file_identity'], 1)
        self.assertEqual(result['registry_counts']['invalid_identity'], 1)
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
        self.assertEqual(response.data['registry_counts']['new_incomplete'], 1)
        self.assertEqual(response.data['yellow_missing_information'], 1)

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

    @override_settings(LEGACY_EMPLOYEE_EXCEL_IMPORTS_ENABLED=False)
    def test_old_employee_import_endpoints_are_retired_but_v2_works(self):
        legacy = (
            '/api/employee-roster/reconcile/',
            '/api/employee-import-reviews/cleanup/',
            '/api/employee-roster-template/',
            '/api/workforce-roster/preview/',
            '/api/workforce-roster/import-plan/',
            '/api/excel-import/upload/',
        )
        for endpoint in legacy:
            with self.subTest(endpoint=endpoint):
                response = self.client.post(endpoint, {}, format='multipart')
                self.assertEqual(response.status_code, 403, response.content[:250])
                self.assertTrue(response.json()['legacy_import_disabled'])
                self.assertEqual(response['Cache-Control'], 'private, no-store')
        current = self.preview([['QA Authorized', '1000000001']],
                               headers=['اسم الموظف', 'رقم الهوية الوطنية'])
        self.assertEqual(current.status_code, 200, current.data)
        self.assertEqual(Employee.objects.count(), 0)
        self.assertEqual(EmployeeImportReview.objects.count(), 0)
        self.assertEqual(DataImportBatch.objects.count(), 0)

    def test_approved_center_and_new_identity_are_candidates_only(self):
        center = HealthCenter.objects.create(
            name='QA Official Center', name_ar='المركز الاختباري',
            code='QA-HC-100', approval_status='approved', is_active=True,
        )
        response = self.preview([
            ['موظف اختباري جديد', '1000001011', 'QA-NEW-11',
             'المركز الاختباري', 'السعودية'],
        ])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['registry_counts']['new_candidate'], 1)
        self.assertEqual(response.data['employee_count_created'], 0)
        self.assertEqual(response.data['employee_count_updated'], 0)
        self.assertFalse(response.data['import_enabled'])
        self.assertEqual(Employee.objects.count(), 0)
        center.refresh_from_db()
        self.assertEqual(center.approval_status, 'approved')

    def test_unapproved_center_is_reviewed_without_placeholder_assignment(self):
        HealthCenter.objects.create(
            name='QA Draft Center', name_ar='المركز غير المعتمد',
            code='QA-HC-101', approval_status='pending',
        )
        preview = self.preview([
            ['موظف اختبار', '1000001012', 'QA-NEW-12',
             'المركز غير المعتمد', 'السعودية'],
        ])
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertEqual(preview.data['registry_counts']['center_review'], 1)
        self.assertEqual(Employee.objects.count(), 0)
        self.assertFalse(EmployeeImportReview.objects.exists())

    def test_archived_employee_is_never_reactivated_on_preview(self):
        archived = Employee.objects.create(
            name='موظف اختبار مؤرشف', national_id='1000001013',
            is_archived=True, employee_number='QA-A13',
        )
        response = self.preview([
            ['موظف اختبار مؤرشف', '1000001013', 'QA-A13', '', ''],
        ])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['registry_counts']['archived_review'], 1)
        self.assertEqual(response.data['identity_found'], 1)
        self.assertTrue(response.data['review_examples_masked'][0]['archived_record'])
        archived.refresh_from_db()
        self.assertTrue(archived.is_archived)
        self.assertIsNone(archived.health_center_id)
        self.assertFalse(EmployeeImportReview.objects.exists())

    def test_identity_is_unique_even_when_name_has_same_language_variation(self):
        Employee.objects.create(
            name='محمد عبدالله القحطاني',
            national_id='1000001014', employee_number='QA-A14',
        )
        response = self.preview([
            ['محمد سالم القحطاني', '1000001014', 'QA-A14', '', ''],
        ])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['registry_counts']['name_review'], 1)
        self.assertEqual(response.data['identity_found'], 1)
        self.assertFalse(response.data['import_enabled'])
        self.assertEqual(Employee.objects.count(), 1)

    def test_existing_empty_fields_only_reported_for_later_fill(self):
        center = HealthCenter.objects.create(
            name='QA Active Center', name_ar='المركز الفعال',
            code='QA-HC-102', approval_status='approved',
        )
        employee = Employee.objects.create(
            name='موظف فعال', national_id='1000001015',
            health_center=center, nationality='',
        )
        response = self.preview([
            ['موظف فعال', '1000001015', 'QA-EN15',
             'المركز الفعال', 'السعودية'],
        ])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['registry_counts']['existing_fill_only'], 1)
        employee.refresh_from_db()
        self.assertEqual(employee.nationality, '')
        self.assertEqual(employee.employee_number, None)
        self.assertEqual(employee.health_center_id, center.pk)
        self.assertEqual(EmployeeImportReview.objects.count(), 0)

    def test_other_employee_email_or_job_number_cannot_be_claimed(self):
        Employee.objects.create(
            name='صاحب الرقم', national_id='1000001016',
            employee_number='QA-DUP-16', email='qa-owner@example.invalid',
        )
        response = self.preview([
            ['موظف جديد', '1000001017', 'QA-DUP-16', '', ''],
        ])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['registry_counts']['identifier_owned_by_other'], 1)
        self.assertEqual(Employee.objects.count(), 1)

    def test_existing_employee_job_number_mismatch_requires_review(self):
        Employee.objects.create(
            name='موظف رقم', national_id='1000001018', employee_number='QA-OLD-18',
        )
        response = self.preview([
            ['موظف رقم', '1000001018', 'QA-NEW-18', '', ''],
        ])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['registry_counts']['identifier_disagreement'], 1)
        self.assertEqual(Employee.objects.get(national_id='1000001018').employee_number, 'QA-OLD-18')
