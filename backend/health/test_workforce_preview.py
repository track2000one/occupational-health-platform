"""Tests for the read-only roster preview. All data below are synthetic."""
from io import BytesIO
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from openpyxl import Workbook
from rest_framework.test import APIClient
from health.models import Employee, HealthCenter
from health.workforce_preview import EXPECTED_COLUMNS

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
