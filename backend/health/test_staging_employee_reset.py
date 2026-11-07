"""Only exact synthetic staging employee cards may be reset after signed preview."""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import AuditLog, Employee, EmployeeHealthProfile, HealthCenter
from .staging_employee_reset import CONFIRM_PHRASE, STAGING_PROJECT_ID

STAGING_ENV = {
    'STAGING_MODE': 'true',
    'RAILWAY_PROJECT_ID': STAGING_PROJECT_ID,
}
ENDPOINT = '/api/staging-employee-card-reset/'


class StagingEmployeeCardResetTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_superuser(
            username='reset_qa_admin', email='reset@example.invalid', password='not-a-real-password',
        )
        self.staff = User.objects.create_user(
            username='reset_qa_staff', password='not-a-real-password', is_staff=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.qa_center = HealthCenter.objects.create(
            name='QA Synthetic Health Center 01', code='QA-C01',
        )
        self.actual_center = HealthCenter.objects.create(name='Non-test center', code='REAL-C1')
        self.load = Employee.objects.create(
            name='موظف تجريبي رقم 0001', national_id='9991000001',
            employee_number='OHP-LOAD-0001',
            email='qa-load-0001@example.invalid', health_center=self.qa_center,
        )
        self.example = Employee.objects.create(
            name='تجريبي — موظف نشط ١', national_id='9990000001',
            employee_number='OHP-QA-01',
            email='ohp-qa-01@example.invalid', health_center=self.qa_center,
        )
        self.real = Employee.objects.create(
            name='Non-QA record must survive', national_id='3001234567',
            employee_number='ORG-0001', email='private-record@example.invalid',
            health_center=self.actual_center,
        )

    def preview(self, scope='all_synthetic'):
        return self.client.post(ENDPOINT, {
            'action': 'preview', 'scope': scope,
        }, format='json')

    def reset(self, preview, scope='all_synthetic', **override):
        data = {
            'action': 'reset', 'scope': scope,
            'preview_token': preview.data['preview_token'],
            'confirm_text': CONFIRM_PHRASE, 'acknowledge_irreversible': True,
        }
        data.update(override)
        return self.client.post(ENDPOINT, data, format='json')

    @patch.dict('os.environ', STAGING_ENV)
    def test_preview_never_deletes_any_record_and_hides_employee_identifiers(self):
        response = self.preview()
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['eligible_count'], 2, response.data)
        self.assertEqual(response.data['eligible_load_count'], 1)
        self.assertEqual(response.data['eligible_example_count'], 1)
        self.assertEqual(response.data['other_records_to_keep'], 1)
        self.assertNotIn('national_id', str(response.data))
        self.assertNotIn('3001234567', str(response.data))
        self.assertEqual(Employee.objects.count(), 3)

    @patch.dict('os.environ', STAGING_ENV)
    def test_reset_requires_typed_phrase_and_acknowledgement(self):
        preview = self.preview()
        no_phrase = self.reset(preview, confirm_text='')
        self.assertEqual(no_phrase.status_code, 400)
        no_consent = self.reset(preview, acknowledge_irreversible=False)
        self.assertEqual(no_consent.status_code, 400)
        self.assertEqual(Employee.objects.count(), 3)

    @patch.dict('os.environ', STAGING_ENV)
    def test_reset_removes_only_verified_test_cards_and_records_audit(self):
        preview = self.preview()
        response = self.reset(preview)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['deleted_test_cards'], 2)
        self.assertEqual(response.data['remaining_employee_cards'], 1)
        self.assertEqual(list(Employee.objects.values_list('id', flat=True)), [self.real.pk])
        self.assertEqual(AuditLog.objects.filter(action='staging_synthetic_employee_cards_reset').count(), 1)
        self.assertEqual(HealthCenter.objects.count(), 2)

    @patch.dict('os.environ', STAGING_ENV)
    def test_any_related_health_record_protects_employee_from_reset(self):
        EmployeeHealthProfile.objects.create(employee=self.load, children_count=1)
        preview = self.preview()
        self.assertEqual(preview.data['eligible_count'], 1, preview.data)
        self.assertEqual(preview.data['excluded_with_related_records'], 1)
        result = self.reset(preview)
        self.assertEqual(result.status_code, 200, result.data)
        self.assertTrue(Employee.objects.filter(pk=self.load.pk).exists())
        self.assertFalse(Employee.objects.filter(pk=self.example.pk).exists())
        self.assertTrue(EmployeeHealthProfile.objects.filter(employee=self.load).exists())

    @patch.dict('os.environ', STAGING_ENV)
    def test_stale_preview_is_rejected_and_no_partial_deletion(self):
        preview = self.preview()
        self.load.name = 'A changed test label'
        self.load.save()
        result = self.reset(preview)
        self.assertEqual(result.status_code, 409)
        self.assertEqual(Employee.objects.count(), 3)
        self.assertEqual(AuditLog.objects.count(), 0)

    @patch.dict('os.environ', STAGING_ENV)
    def test_a_test_looking_record_with_mismatched_data_is_never_removed(self):
        self.load.name = 'An actual person name'
        self.load.save()
        preview = self.preview()
        self.assertEqual(preview.data['eligible_count'], 1, preview.data)
        self.assertEqual(preview.data['excluded_unverified_markers'], 1)
        self.assertEqual(self.reset(preview).status_code, 200)
        self.assertTrue(Employee.objects.filter(pk=self.load.pk).exists())
        self.assertTrue(Employee.objects.filter(pk=self.real.pk).exists())

    @patch.dict('os.environ', STAGING_ENV)
    def test_scope_load_only_avoids_QA_examples(self):
        preview = self.preview('load_only')
        self.assertEqual(preview.data['eligible_count'], 1)
        result = self.reset(preview, 'load_only')
        self.assertEqual(result.status_code, 200)
        self.assertFalse(Employee.objects.filter(pk=self.load.pk).exists())
        self.assertTrue(Employee.objects.filter(pk=self.example.pk).exists())

    @patch.dict('os.environ', STAGING_ENV)
    def test_non_superuser_and_anonymous_are_denied(self):
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.preview().status_code, 403)
        self.client.force_authenticate(user=None)
        self.assertIn(self.preview().status_code, [401, 403])
        self.assertEqual(Employee.objects.count(), 3)

    def test_never_exposes_reset_in_production(self):
        with patch.dict('os.environ', {
            'STAGING_MODE': 'false', 'RAILWAY_PROJECT_ID': STAGING_PROJECT_ID,
        }):
            result = self.preview()
        self.assertEqual(result.status_code, 403)
        self.assertEqual(Employee.objects.count(), 3)
