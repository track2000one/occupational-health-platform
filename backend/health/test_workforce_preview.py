"""Tests for the read-only roster preview. All data below are synthetic."""
from io import BytesIO
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from openpyxl import Workbook
from rest_framework.test import APIClient
from health.models import Employee, HealthCenter, WorkforceCenterMapping, WorkforceCenterMappingRevision
from health.workforce_preview import EXPECTED_COLUMNS, group_fingerprint

def fixture(identity):
    row = ['Demo organization', 'مركز صحي', 'Demo manager', '0' * 10,
           '', '', 'EMP1', identity, 'Demo Employee', 'ذكر', '', 30,
           '', '', 'تعيين نشط', '1447/07/12', '', 'Demo role', '']
    book = Workbook()
    sheet = book.active
    sheet.append(EXPECTED_COLUMNS)
    sheet.append(row)
    buffer = BytesIO()
    book.save(buffer)
    return SimpleUploadedFile('source.xlsx', buffer.getvalue())

class PreviewTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_user('roster_admin', password='test-secret', is_staff=True)
        self.center = HealthCenter.objects.create(name='Test center')
        self.employee = Employee.objects.create(name='Existing employee',
                                                national_id='0' * 10,
                                                health_center=self.center)
        self.client = APIClient()

    def test_no_mutation_and_column_h_only(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post('/api/workforce-roster/preview/', {'file': fixture('1' * 10)}, format='multipart')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['summary']['already_on_platform'], 0)
        self.assertEqual(response.data['summary']['not_on_platform'], 1)
        self.assertEqual(response.data['summary']['automatic_imported'], 0)
        self.assertEqual(Employee.objects.count(), 1)

    def test_non_admin_cannot_preview(self):
        user = get_user_model().objects.create_user('roster_viewer', password='test-secret')
        self.client.force_authenticate(user)
        response = self.client.post('/api/workforce-roster/preview/', {'file': fixture('1' * 10)}, format='multipart')
        self.assertEqual(response.status_code, 403)

    def test_approve_center_mapping_does_not_create_employee(self):
        self.client.force_authenticate(self.admin)
        org = 'Demo organization'
        org_type = 'مركز صحي'
        response = self.client.post(
            '/api/workforce-roster/mapping/',
            {
                'organization': org,
                'organization_type': org_type,
                'fingerprint': group_fingerprint(org, org_type),
                'center_id': self.center.pk,
                'approval_reference': 'Approved letter ref 10',
            }, format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(WorkforceCenterMapping.objects.filter(
            fingerprint=group_fingerprint(org, org_type),
            health_center=self.center,
        ).exists())
        self.assertEqual(WorkforceCenterMappingRevision.objects.count(), 1)
        self.assertEqual(Employee.objects.count(), 1)
        output = self.client.post(
            '/api/workforce-roster/preview/', {'file': fixture('1' * 10)},
            format='multipart',
        )
        self.assertEqual(output.status_code, 200)
        self.assertEqual(output.data['summary']['approved_organization_groups'], 1)
        self.assertEqual(output.data['summary']['unapproved_center_employees'], 0)
        self.assertEqual(Employee.objects.count(), 1)

    def test_no_unapproved_mapping_without_official_reference(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post('/api/workforce-roster/mapping/', {
            'organization': 'Demo organization',
            'organization_type': 'مركز صحي',
            'fingerprint': group_fingerprint('Demo organization', 'مركز صحي'),
            'center_id': self.center.pk,
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(WorkforceCenterMapping.objects.count(), 0)

    def test_mapping_admin_only(self):
        user = get_user_model().objects.create_user('ordinary', password='test-secret')
        self.client.force_authenticate(user)
        response = self.client.post('/api/workforce-roster/mapping/', {
            'organization': 'Demo organization',
            'organization_type': 'مركز صحي',
            'fingerprint': group_fingerprint('Demo organization', 'مركز صحي'),
            'center_id': self.center.pk,
            'approval_reference': 'Authorization test',
        }, format='json')
        self.assertEqual(response.status_code, 403)
