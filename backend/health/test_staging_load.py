"""Production-volume staging fixtures MUST be synthetic and reversible by isolation."""
from unittest.mock import patch
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from health.models import Employee, HealthCenter, WorkforceCenterMapping
from health.management.commands.seed_staging_load import (
    EXPECTED_STAGING_PROJECT_ID, TOTAL_LOAD_EMPLOYEES,
    SOURCE_STATUS_FREQUENCIES
)

STAGING_ENV = {
    'STAGING_MODE': 'true',
    'SEED_STAGING_LOAD_DATA': 'true',
    'SEED_STAGING_SYNTHETIC': 'true',
    'RAILWAY_PROJECT_ID': EXPECTED_STAGING_PROJECT_ID,
}


class StagingFullLoadTests(TestCase):
    def setUp(self):
        self.c1 = HealthCenter.objects.create(name='QA fixture baseline center A')
        self.c2 = HealthCenter.objects.create(name='QA fixture baseline center B')

    def test_isolated_staging_gate_required(self):
        for key in ('STAGING_MODE', 'SEED_STAGING_LOAD_DATA', 'RAILWAY_PROJECT_ID'):
            env = {**STAGING_ENV, key: 'invalid'}
            with patch.dict('os.environ', env):
                with self.assertRaises(CommandError):
                    call_command('seed_staging_load')
        self.assertFalse(Employee.objects.exists())

    @patch.dict('os.environ', STAGING_ENV)
    def test_1423_synthetic_records_25_centers_131_groups_and_replay(self):
        call_command('seed_staging_synthetic')
        call_command('seed_staging_load')
        self.assertEqual(Employee.objects.count(), 1429)
        self.assertEqual(Employee.objects.filter(employee_number__startswith='OHP-QA-').count(), 6)
        self.assertEqual(Employee.objects.filter(employee_number__startswith='OHP-LOAD-').count(),
                         TOTAL_LOAD_EMPLOYEES)
        self.assertEqual(HealthCenter.objects.filter(code__startswith='QA-C').count(), 25)
        self.assertEqual(WorkforceCenterMapping.objects.filter(
            approval_reference='SYNTHETIC-TEST-NOT-OFFICIAL').count(), 131)
        for status, count in SOURCE_STATUS_FREQUENCIES:
            self.assertEqual(Employee.objects.filter(
                employee_number__startswith='OHP-LOAD-',
                roster_source_status=status).count(), count, status)
        self.assertFalse(Employee.objects.filter(
            employee_number__startswith='OHP-LOAD-'
        ).exclude(national_id__startswith='9991').exists())
        self.assertFalse(Employee.objects.filter(
            employee_number__startswith='OHP-LOAD-'
        ).exclude(email__endswith='@example.invalid').exists())
        self.assertEqual(Employee.objects.filter(
            employee_number__startswith='OHP-LOAD-', risk_level='unknown').count(), 1423)
        self.assertEqual(Employee.objects.filter(
            employee_number__startswith='OHP-LOAD-', employment_status='retired').count(), 0)

        # Container restart may call both seeders again without duplication.
        call_command('seed_staging_synthetic')
        call_command('seed_staging_load')
        self.assertEqual(Employee.objects.count(), 1429)

    @patch.dict('os.environ', STAGING_ENV)
    def test_refuses_non_synthetic_existing_employee_without_writes(self):
        Employee.objects.create(
            name='Existing non-test data', national_id='1000000091',
            employee_number='REAL-X91', health_center=self.c1,
        )
        with self.assertRaises(CommandError):
            call_command('seed_staging_load')
        self.assertEqual(Employee.objects.count(), 1)
        self.assertEqual(HealthCenter.objects.filter(code__startswith='QA-C').count(), 0)

    @patch.dict('os.environ', STAGING_ENV)
    def test_employee_api_paginates_full_staging_dataset(self):
        call_command('seed_staging_synthetic')
        call_command('seed_staging_load')
        client = APIClient()
        user = get_user_model().objects.create_user(
            'qa_list_reader', password='not-for-use', is_staff=True)
        client.force_authenticate(user)

        first = client.get('/api/employees/?page=1')
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data['count'], 1429)
        self.assertEqual(len(first.data['results']), 25)
        last = client.get('/api/employees/?page=58')
        self.assertEqual(last.status_code, 200)
        self.assertEqual(len(last.data['results']), 4)

        query = client.get('/api/employees/?search=OHP-LOAD-1423')
        self.assertEqual(query.status_code, 200)
        self.assertEqual(query.data['count'], 1)
        self.assertEqual(query.data['results'][0]['employee_number'], 'OHP-LOAD-1423')

        synthetic_center = HealthCenter.objects.get(code='QA-C01')
        filtered = client.get('/api/employees/?health_center_id=' + str(synthetic_center.id))
        self.assertEqual(filtered.status_code, 200)
        self.assertGreater(filtered.data['count'], 0)
        self.assertTrue(all(item['health_center'] == synthetic_center.id
                            for item in filtered.data['results']))
