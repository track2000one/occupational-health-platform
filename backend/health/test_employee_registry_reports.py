"""Privacy-preserving employee directory reporting with synthetic identities only."""
from datetime import date
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Employee, HealthCenter, AuditLog, UserProfile


class EmployeeRegistryReportTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_superuser(
            username='reports_ci_admin', password='fake-for-ci-only',
            email='reports-ci-admin@example.invalid',
        )
        self.viewer = User.objects.create_user(
            username='reports_ci_viewer', password='fake-for-ci-only',
        )
        self.center_a = HealthCenter.objects.create(
            name='QA East Center', name_ar='المركز الشرقي التجريبي', is_active=True,
        )
        self.center_b = HealthCenter.objects.create(
            name='QA West Center', is_active=True,
        )
        self.a = Employee.objects.create(
            name='أمل تجريبية', national_id='9998999001',
            employee_number='QA-AAA', health_center=self.center_a,
            job_title='Nurse', gender='female', mobile='0501234567',
        )
        self.b = Employee.objects.create(
            name='بدر تجريبي', national_id='9998999002',
            employee_number='QA-BBB', health_center=self.center_b,
            job_title='Doctor', gender='male',
            employment_status=Employee.EmploymentStatus.RETIRED,
        )
        self.c = Employee.objects.create(
            name='جاسم تجريبي', national_id='9998999003',
            employee_number='QA-CCC', health_center=self.center_a,
            job_title='Doctor', gender='male',
        )
        self.client = APIClient()
        self.url = '/api/employees/report/'

    def test_anonymous_and_ordinary_account_cannot_export(self):
        self.assertIn(self.client.get(self.url).status_code, (401, 403))
        self.client.force_authenticate(self.viewer)
        self.assertEqual(self.client.get(self.url).status_code, 403)

    def test_report_returns_all_filtered_records_not_25_page_list(self):
        self.client.force_authenticate(self.admin)
        result = self.client.get(self.url, {
            'health_center_id': self.center_a.pk, 'gender': 'male',
            'sort': 'employee_number',
        })
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['count'], 1)
        self.assertEqual(result.data['results'][0]['name'], 'جاسم تجريبي')
        self.assertEqual(result.data['results'][0]['health_center'], 'المركز الشرقي التجريبي')
        self.assertEqual(result.data['results'][0]['national_id_masked'], '99••••9003')
        self.assertNotIn('national_id', result.data['results'][0])
        self.assertNotIn('medical', str(result.data).lower())
        self.assertTrue(AuditLog.objects.filter(
            action='view_employee_registry_report',
        ).exists())

    def test_identity_hidden_is_default_and_never_sent_for_masked_request(self):
        self.client.force_authenticate(self.admin)
        for params in ({}, {'include_full_national_id': 'false'}):
            response = self.client.get(self.url, params)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data['identity_mode'], 'masked')
            self.assertIn('no-store', response['Cache-Control'])
            self.assertEqual(response.data['results'][0]['national_id_masked'], '99••••9001')
            self.assertTrue(all('national_id_full' not in row for row in response.data['results']))

    def test_explicit_full_identity_export_admin_is_audited(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(self.url, {'include_full_national_id': 'true'})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['identity_mode'], 'full')
        self.assertEqual(response.data['results'][0]['national_id_full'], '9998999001')
        self.assertIn('no-store', response['Cache-Control'])
        self.assertEqual(response['Pragma'], 'no-cache')
        self.assertTrue(AuditLog.objects.filter(
            action='view_employee_report_full_national_id',
            user=self.admin.username,
        ).exists())

    def test_reporting_role_cannot_request_full_identity(self):
        reports_user = get_user_model().objects.create_user(
            username='qa_reports_only', password='qa-only',
        )
        UserProfile.objects.create(user=reports_user, role='reportsOfficer')
        self.client.force_authenticate(reports_user)
        masked = self.client.get(self.url)
        self.assertEqual(masked.status_code, 200, masked.data)
        self.assertEqual(masked.data['identity_mode'], 'masked')
        denied = self.client.get(self.url, {'include_full_national_id': 'true'})
        self.assertEqual(denied.status_code, 403, denied.data)
        self.assertFalse(AuditLog.objects.filter(
            user=reports_user.username, action='view_employee_report_full_national_id',
        ).exists())
        self.assertEqual(self.client.get(
            self.url, {'include_full_national_id': 'maybe'},
        ).status_code, 400)

    def test_occupational_health_manager_can_request_full_identity(self):
        manager = get_user_model().objects.create_user(
            username='qa_manager_sensitive', password='qa-only',
        )
        UserProfile.objects.create(user=manager, role='ohManager')
        self.client.force_authenticate(manager)
        response = self.client.get(self.url, {'include_full_national_id': 'true'})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['identity_mode'], 'full')
        self.assertEqual(response.data['results'][0]['national_id_full'], self.a.national_id)

    def test_report_contains_more_than_the_twenty_five_displayed_employees(self):
        self.client.force_authenticate(self.admin)
        Employee.objects.bulk_create([
            Employee(
                name=f'Synthetic extra {i}',
                national_id=f'8888{i:06d}',
                employee_number=f'QA-EXTRA-{i:03d}',
                health_center=self.center_a,
                job_title='Doctor', gender='male',
            )
            for i in range(28)
        ])
        paged = self.client.get('/api/employees/?page=1')
        self.assertEqual(paged.status_code, 200)
        self.assertEqual(len(paged.data['results']), 25)
        full = self.client.get(self.url, {'sort': 'employee_number'})
        self.assertEqual(full.status_code, 200, full.data)
        self.assertEqual(full.data['count'], 31)
        self.assertEqual(len(full.data['results']), 31)
        self.assertEqual(len(set(row['employee_number'] for row in full.data['results'])), 31)

    def test_multiple_filters_and_sort_applied_server_side(self):
        self.client.force_authenticate(self.admin)
        result = self.client.get(self.url, {
            'job_title': 'doctor', 'sort': 'employee_number',
        })
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual([r['employee_number'] for r in result.data['results']],
                         ['QA-BBB', 'QA-CCC'])
        status = self.client.get(self.url, {'employment_status': 'retired'})
        self.assertEqual(status.data['count'], 1)
        self.assertEqual(status.data['results'][0]['name'], 'بدر تجريبي')
        text = self.client.get(self.url, {'search': 'أمل'})
        self.assertEqual(text.data['count'], 1)
        self.assertEqual(text.data['results'][0]['name'], 'أمل تجريبية')
        bad = self.client.get(self.url, {'gender': 'other'})
        self.assertEqual(bad.status_code, 400)
        bad_date = self.client.get(self.url, {'created_from': 'yesterday'})
        self.assertEqual(bad_date.status_code, 400)

    def test_archived_records_only_visible_to_admin_with_explicit_filter(self):
        self.client.force_authenticate(self.admin)
        self.a.is_archived = True
        self.a.archive_reason = 'Synthetic QA correction reason'
        self.a.save(update_fields=['is_archived', 'archive_reason'])
        normal = self.client.get(self.url)
        self.assertEqual(normal.data['count'], 2)
        archived = self.client.get(self.url, {'archived': 'true'})
        self.assertEqual(archived.status_code, 200)
        self.assertEqual(archived.data['count'], 1)
        self.assertTrue(archived.data['results'][0]['archived'])
        self.assertNotIn('archive_reason', archived.data['results'][0])
        self.client.force_authenticate(self.viewer)
        self.assertEqual(self.client.get(self.url, {'archived': 'true'}).status_code, 403)

    def test_big_report_is_rejected_instead_of_truncated(self):
        self.client.force_authenticate(self.admin)
        # Verify 5,000 cap without creating thousands of patient-like records.
        from unittest.mock import patch
        # Compare separate count cap with a mocked queryset chain via a
        # short-circuit to avoid invoking serialization.
        from health.views import EmployeeViewSet

        class CountOverride:
            def count(self):
                return 5001
            def __getattr__(self, key):
                raise AssertionError(f'Unexpected queryset access: {key}')

        with patch.object(EmployeeViewSet, 'get_queryset', return_value=CountOverride()):
            result = self.client.get(self.url)
        self.assertEqual(result.status_code, 400)
        self.assertEqual(result.data['count'], 5001)
