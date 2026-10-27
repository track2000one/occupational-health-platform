"""Synthetic-only tests of the guarded employee import workflow."""
from io import BytesIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from openpyxl import Workbook
from rest_framework.test import APIClient

from health.models import (
    Employee, HealthCenter, WorkforceCenterMapping, WorkforceImportPlan,
    WorkforceImportCreatedEmployee
)
from health.workforce_preview import EXPECTED_COLUMNS, group_fingerprint


def workbook(ids):
    ws = Workbook()
    tab = ws.active
    tab.append(EXPECTED_COLUMNS)
    for count, identity in enumerate(ids):
        tab.append([
            'Demo unit', 'مركز صحي', 'Manager example', '2000000000',
            '', '', 'JOB' + str(count), identity, 'Synthetic employee ' + str(count),
            'ذكر', 'سعودي', '30', '0500000000', '', 'تعيين نشط',
            '1447/01/02', '', 'Health employee', ''
        ])
    buff = BytesIO()
    ws.save(buff)
    return buff.getvalue()


def excel_upload(payload):
    return SimpleUploadedFile('workforce.xlsx', payload,
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')


class SafeWorkforceImportTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.preparer = User.objects.create_user('preparer', password='test-pass', is_staff=True)
        self.approver = User.objects.create_user('approver', password='test-pass', is_staff=True)
        self.executor = User.objects.create_superuser('executor', password='test-pass')
        self.viewer = User.objects.create_user('viewer', password='test-pass')
        self.center = HealthCenter.objects.create(name='Approved test center')
        self.existing = Employee.objects.create(
            name='Existing record', national_id='1000000001', health_center=self.center,
            risk_level='high'
        )
        self.client = APIClient()
        self.payload = workbook(['1000000001', '1000000002'])

    def map_center(self):
        WorkforceCenterMapping.objects.create(
            fingerprint=group_fingerprint('Demo unit', 'مركز صحي'),
            organization='Demo unit', organization_type='مركز صحي',
            health_center=self.center, approval_reference='Verified organization ref',
            approved_by=self.preparer,
        )

    def prepare(self, payload=None):
        self.client.force_authenticate(self.preparer)
        return self.client.post(
            '/api/workforce-roster/import-plan/',
            {'file': excel_upload(payload or self.payload)}, format='multipart',
        )

    def approve(self, pk, as_user=None):
        self.client.force_authenticate(as_user or self.approver)
        return self.client.post(
            f'/api/workforce-roster/import-plan/{pk}/approve/',
            {
                'approval_reference': 'Second administrator decision ref',
                'backup_reference': 'Encrypted snapshot reference',
                'restore_verification_reference': 'Restoration drill reference',
            }, format='json',
        )

    def test_preflight_blocks_unapproved_center_without_writes(self):
        response = self.prepare()
        self.assertEqual(response.status_code, 201)
        self.assertFalse(response.data['summary']['ready'])
        self.assertEqual(response.data['summary']['unapproved_center_rows'], 2)
        self.assertEqual(Employee.objects.count(), 1)
        self.assertEqual(self.approve(response.data['plan_id']).status_code, 400)

    def test_approval_requires_different_administrator(self):
        self.map_center()
        plan = self.prepare()
        self.assertTrue(plan.data['summary']['ready'])
        self.assertEqual(plan.data['summary']['existing_unchanged'], 1)
        self.assertEqual(plan.data['summary']['new_candidates'], 1)
        self.assertEqual(self.approve(plan.data['plan_id'], self.preparer).status_code, 403)
        response = self.approve(plan.data['plan_id'])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Employee.objects.count(), 1)

    def test_commit_disabled_by_default_and_preserves_clinical_data(self):
        self.map_center()
        plan = self.prepare()
        self.assertEqual(self.approve(plan.data['plan_id']).status_code, 200)
        self.client.force_authenticate(self.executor)
        response = self.client.post(
            f"/api/workforce-roster/import-plan/{plan.data['plan_id']}/commit/",
            {
                'file': excel_upload(self.payload),
                'confirm': 'IMPORT_NEW_EMPLOYEES_ONLY',
            }, format='multipart')
        self.assertEqual(response.status_code, 423)
        self.existing.refresh_from_db()
        self.assertEqual(self.existing.risk_level, 'high')
        self.assertEqual(Employee.objects.count(), 1)

    @patch.dict('os.environ', {'WORKFORCE_IMPORT_ENABLED': 'true'})
    def test_commit_creates_only_new_employee_and_marks_medical_unknown(self):
        self.map_center()
        plan = self.prepare()
        self.assertEqual(self.approve(plan.data['plan_id']).status_code, 200)
        self.client.force_authenticate(self.executor)
        response = self.client.post(
            f"/api/workforce-roster/import-plan/{plan.data['plan_id']}/commit/",
            {
                'file': excel_upload(self.payload),
                'confirm': 'IMPORT_NEW_EMPLOYEES_ONLY',
            }, format='multipart')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['new_employees_created'], 1)
        self.existing.refresh_from_db()
        self.assertEqual(self.existing.name, 'Existing record')
        self.assertEqual(self.existing.risk_level, 'high')
        new_employee = Employee.objects.get(national_id='1000000002')
        self.assertEqual(new_employee.risk_level, 'unknown')
        self.assertEqual(new_employee.periodic_exam_status, 'unknown')
        self.assertEqual(new_employee.vaccination_status, 'unknown')
        self.assertEqual(WorkforceImportCreatedEmployee.objects.count(), 1)
        self.assertEqual(WorkforceImportPlan.objects.get(pk=plan.data['plan_id']).state, 'committed')

    @patch.dict('os.environ', {'WORKFORCE_IMPORT_ENABLED': 'true'})
    def test_repeated_commit_is_rejected(self):
        self.map_center()
        plan = self.prepare()
        self.approve(plan.data['plan_id'])
        self.client.force_authenticate(self.executor)
        url = f"/api/workforce-roster/import-plan/{plan.data['plan_id']}/commit/"
        data = {'file': excel_upload(self.payload), 'confirm': 'IMPORT_NEW_EMPLOYEES_ONLY'}
        self.assertEqual(self.client.post(url, data, format='multipart').status_code, 200)
        data['file'] = excel_upload(self.payload)
        self.assertEqual(self.client.post(url, data, format='multipart').status_code, 409)
        self.assertEqual(Employee.objects.count(), 2)

    @patch.dict('os.environ', {'WORKFORCE_IMPORT_ENABLED': 'true'})
    def test_file_change_aborts_before_writes(self):
        self.map_center()
        plan = self.prepare()
        self.approve(plan.data['plan_id'])
        self.client.force_authenticate(self.executor)
        response = self.client.post(
            f"/api/workforce-roster/import-plan/{plan.data['plan_id']}/commit/",
            {
                'file': excel_upload(workbook(['1000000001', '1000000003'])),
                'confirm': 'IMPORT_NEW_EMPLOYEES_ONLY',
            }, format='multipart')
        self.assertEqual(response.status_code, 409)
        self.assertEqual(Employee.objects.count(), 1)
