"""Synthetic-only tests for encrypted temporary staging roster, not real employee data."""
from io import BytesIO
from datetime import timedelta
from unittest.mock import patch

from cryptography.fernet import Fernet
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from openpyxl import Workbook
from rest_framework.test import APIClient

from health.models import Employee, TemporaryWorkforceSnapshot
from health.workforce_preview import EXPECTED_COLUMNS

URL = '/api/workforce-roster/temporary/'
FERNET_KEY = Fernet.generate_key().decode('ascii')
FAKE_STAGING_ENV = {
    'STAGING_MODE': 'true',
    'RAILWAY_PROJECT_ID': 'cf4b2162-5236-4f92-b010-165f505fe2c2',
    'TEMP_ROSTER_UPLOAD_ENABLED': 'true',
    'TEMP_ROSTER_ENCRYPTION_KEY': FERNET_KEY,
}


def fixture():
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(EXPECTED_COLUMNS)
    sheet.append([
        'المركز التجريبي', 'صحي', 'مدير اختباري',
        '9990000100', 'test-manager@example.invalid', '0000000000',
        'QATEST001', '9991000001', 'موظف اصطناعي 1', 'ذكر',
        'سعودي', '30', '0000000000', 'test-1@example.invalid',
        'تعيين نشط', '1447/01/01', 'عمل تجريبي', 'وظيفة اختبار', 'البرنامج',
    ])
    sheet.append([
        '', 'صحي', 'مديرة اختبارية', '9990000200',
        'test-manager-2@example.invalid', '0000000000',
        'QATEST002', '9991000002', 'موظفة اصطناعية 2', 'أنثى',
        'سعودي', '31', '0000000000', 'test-2@example.invalid',
        'إيفاد للدراسة بالداخل', '1447/02/01', 'عمل تجريبي', 'وظيفة اختبار', '',
    ])
    output = BytesIO()
    workbook.save(output)
    return SimpleUploadedFile(
        'original_roster.xlsx', output.getvalue(),
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )


class TemporaryRosterTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_superuser('temporary_admin', password='test-only-password')
        self.staff = User.objects.create_user('temporary_staff', password='test-only-password', is_staff=True)
        self.client = APIClient()

    @patch.dict('os.environ', FAKE_STAGING_ENV)
    def test_upload_preserves_all_19_fields_encrypted_and_deletes_without_core_writes(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(URL, {'file': fixture()}, format='multipart')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['summary']['rows'], 2)
        self.assertEqual(response.data['summary']['columns'], 19)
        self.assertEqual(response.data['summary']['missing_organization_rows'], [3])
        self.assertEqual(Employee.objects.count(), 0)
        snapshot = TemporaryWorkforceSnapshot.objects.get()
        self.assertNotIn(b'9991000001', bytes(snapshot.encrypted_rows))
        self.assertNotIn('موظف اصطناعي'.encode('utf-8'), bytes(snapshot.encrypted_rows))

        listed = self.client.get(URL + '?search=QATEST002')
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.data['count'], 1)
        self.assertEqual(listed.data['rows'][0]['values'][8], 'موظفة اصطناعية 2')
        self.assertEqual(len(listed.data['rows'][0]['values']), 19)
        self.assertEqual(listed['Cache-Control'], 'no-store, private, max-age=0')
        self.assertEqual(self.client.post(URL, {'file': fixture()}, format='multipart').status_code, 409)
        self.assertEqual(self.client.delete(URL, {'confirm': 'NO'}, format='json').status_code, 400)
        deleted = self.client.delete(URL, {'confirm': 'DELETE_TEMP_ROSTER'}, format='json')
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(deleted.data['temporary_snapshots_deleted'], 1)
        self.assertEqual(Employee.objects.count(), 0)
        self.assertFalse(TemporaryWorkforceSnapshot.objects.exists())

    @patch.dict('os.environ', FAKE_STAGING_ENV)
    def test_staff_and_anonymous_cannot_read_or_upload(self):
        self.assertIn(self.client.get(URL).status_code, (401, 403))
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get(URL).status_code, 403)
        self.assertEqual(self.client.post(URL, {'file': fixture()}, format='multipart').status_code, 403)
        self.assertFalse(TemporaryWorkforceSnapshot.objects.exists())

    @patch.dict('os.environ', FAKE_STAGING_ENV)
    def test_upload_locked_independently_from_view(self):
        self.client.force_authenticate(self.admin)
        with patch.dict('os.environ', {'TEMP_ROSTER_UPLOAD_ENABLED': 'false'}):
            self.assertEqual(self.client.post(URL, {'file': fixture()}, format='multipart').status_code, 423)
            self.assertFalse(self.client.get(URL).data['upload_enabled'])

    @patch.dict('os.environ', FAKE_STAGING_ENV)
    def test_wrong_railway_project_rejected_even_for_superuser(self):
        self.client.force_authenticate(self.admin)
        with patch.dict('os.environ', {'RAILWAY_PROJECT_ID': 'production-project'}):
            self.assertEqual(self.client.post(URL, {'file': fixture()}, format='multipart').status_code, 423)

    @patch.dict('os.environ', FAKE_STAGING_ENV)
    def test_expired_snapshot_not_released(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(URL, {'file': fixture()}, format='multipart').status_code, 201)
        TemporaryWorkforceSnapshot.objects.update(expires_at=timezone.now() - timedelta(minutes=1))
        self.assertEqual(self.client.get(URL).status_code, 410)
