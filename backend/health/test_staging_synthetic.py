"""Staging fixture safety tests use fake IDs and reserved example.invalid domains."""
from unittest.mock import patch
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from health.models import Employee, HealthCenter


class SyntheticStagingSeedTests(TestCase):
    def setUp(self):
        HealthCenter.objects.create(name='QA main health center')
        HealthCenter.objects.create(name='QA second center')

    def test_seed_requires_explicit_staging_markers(self):
        with patch.dict('os.environ', {'STAGING_MODE': 'false', 'SEED_STAGING_SYNTHETIC': 'true'}):
            with self.assertRaises(CommandError):
                call_command('seed_staging_synthetic')
        with patch.dict('os.environ', {'STAGING_MODE': 'true', 'SEED_STAGING_SYNTHETIC': 'false'}):
            with self.assertRaises(CommandError):
                call_command('seed_staging_synthetic')
        self.assertFalse(Employee.objects.exists())

    @patch.dict('os.environ', {'STAGING_MODE': 'true', 'SEED_STAGING_SYNTHETIC': 'true'})
    def test_idempotent_synthetic_records_only(self):
        call_command('seed_staging_synthetic')
        self.assertEqual(Employee.objects.count(), 6)
        call_command('seed_staging_synthetic')
        self.assertEqual(Employee.objects.count(), 6)
        self.assertEqual(Employee.objects.filter(employment_status='retired').count(), 1)
        for employee in Employee.objects.all():
            self.assertTrue(employee.national_id.startswith('99900000'))
            self.assertTrue(employee.email.endswith('@example.invalid'))
            self.assertEqual(employee.risk_level, 'unknown')
            self.assertEqual(employee.vaccination_status, 'unknown')

    @patch.dict('os.environ', {'STAGING_MODE': 'true', 'SEED_STAGING_SYNTHETIC': 'true'})
    def test_refuses_to_touch_database_with_real_employee(self):
        center = HealthCenter.objects.first()
        Employee.objects.create(
            name='Pre-existing non-QA employee', national_id='1000000011',
            employee_number='EMP11', health_center=center,
        )
        with self.assertRaises(CommandError):
            call_command('seed_staging_synthetic')
        self.assertEqual(Employee.objects.count(), 1)
