"""Synthetic regression tests for reversible deletion with mandatory reasons.

No employee or clinical data from Production is used.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import AuditLog, Employee, EmployeeArchiveEvent, EmployeeHealthCard, EmployeeHealthProfile, HealthCenter


class EmployeeSafeArchiveTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser(
            username='safe_archive_admin', email='qa-archive-admin@example.invalid',
            password='synthetic-qa-password',
        )
        self.staff = get_user_model().objects.create_user(
            username='safe_archive_staff', is_staff=True, password='synthetic-qa-password',
        )
        self.viewer = get_user_model().objects.create_user(
            username='safe_archive_viewer', password='synthetic-qa-password',
        )
        self.center = HealthCenter.objects.create(name='Safe Archive QA Center', is_active=True)
        self.employee = Employee.objects.create(
            name='QA archive record', national_id='9998111122',
            health_center=self.center, employee_number='QA-ARCH-0001',
            employment_status=Employee.EmploymentStatus.ACTIVE,
        )
        self.profile = EmployeeHealthProfile.objects.create(
            employee=self.employee, notes='Synthetic history must survive archival',
        )
        self.card = EmployeeHealthCard.objects.create(
            employee=self.employee, data={'synthetic': 'preserved'},
        )
        self.client = APIClient()
        self.archive_url = f'/api/employees/{self.employee.pk}/archive/'
        self.restore_url = f'/api/employees/{self.employee.pk}/restore/'

    def archive(self, reason='Duplicate record created accidentally', confirmed=True):
        return self.client.post(
            self.archive_url, {'reason': reason, 'confirmed': confirmed}, format='json',
        )

    def test_archive_requires_admin_reason_and_explicit_confirmation(self):
        self.client.force_authenticate(self.admin)
        for reason in ['', 'short', 'x' * 501]:
            answer = self.archive(reason)
            self.assertEqual(answer.status_code, 400, answer.data)
        answer = self.archive(confirmed=False)
        self.assertEqual(answer.status_code, 400, answer.data)
        self.employee.refresh_from_db()
        self.assertFalse(self.employee.is_archived)
        self.assertFalse(EmployeeArchiveEvent.objects.exists())

    def test_staff_and_viewer_cannot_archive_or_restore(self):
        for user in (self.staff, self.viewer):
            self.client.force_authenticate(user)
            self.assertEqual(self.archive().status_code, 403)
            self.assertEqual(self.client.post(self.restore_url, {
                'reason': 'Synthetic restore request', 'confirmed': True,
            }, format='json').status_code, 403)
        self.employee.refresh_from_db()
        self.assertFalse(self.employee.is_archived)
        self.assertFalse(EmployeeArchiveEvent.objects.exists())

    def test_archival_hides_from_list_but_keeps_all_medical_data_and_history(self):
        self.client.force_authenticate(self.admin)
        reason = 'Duplicate entry entered by mistake — retain history'
        self.assertEqual(self.archive(reason).status_code, 200)
        self.employee.refresh_from_db()
        self.assertTrue(self.employee.is_archived)
        self.assertEqual(self.employee.archive_reason, reason)
        self.assertEqual(self.employee.archived_by_id, self.admin.pk)
        self.assertIsNotNone(self.employee.archived_at)
        self.assertEqual(Employee.objects.count(), 1)
        self.assertEqual(EmployeeHealthProfile.objects.count(), 1)
        self.assertEqual(EmployeeHealthCard.objects.count(), 1)
        self.assertEqual(EmployeeHealthCard.objects.get(pk=self.card.pk).data,
                         {'synthetic': 'preserved'})
        active = self.client.get('/api/employees/')
        self.assertEqual(active.status_code, 200)
        self.assertEqual(active.data['count'], 0)
        self.assertEqual(self.client.get('/api/employees/?archived=true').data['count'], 1)
        archived = self.client.get('/api/employees/?archived=true').data['results'][0]
        self.assertEqual(archived['archive_reason'], reason)
        self.assertTrue(archived['is_archived'])
        self.assertEqual(self.employee.employment_status, Employee.EmploymentStatus.ACTIVE)
        self.assertTrue(EmployeeArchiveEvent.objects.filter(
            employee=self.employee, action='archive', reason=reason, performed_by=self.admin,
        ).exists())
        self.assertTrue(AuditLog.objects.filter(
            record_id=str(self.employee.pk), action='archive_employee',
        ).exists())
        # Hard deletion must remain forbidden even after soft archival.
        self.assertEqual(self.client.delete(f'/api/employees/{self.employee.pk}/').status_code, 405)

    def test_archive_is_idempotent_and_restore_requires_reason(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.archive().status_code, 200)
        self.assertEqual(self.archive().status_code, 404)  # hidden from active actions
        self.assertEqual(self.client.post(self.restore_url, {
            'reason': '', 'confirmed': True,
        }, format='json').status_code, 400)
        self.assertEqual(self.client.post(self.restore_url, {
            'reason': 'Verify source correction', 'confirmed': False,
        }, format='json').status_code, 400)
        result = self.client.post(self.restore_url, {
            'reason': 'Mistaken archive, corrected by QA admin', 'confirmed': True,
        }, format='json')
        self.assertEqual(result.status_code, 200, result.data)
        self.employee.refresh_from_db()
        self.assertFalse(self.employee.is_archived)
        self.assertIsNone(self.employee.archived_at)
        self.assertEqual(self.employee.archive_reason, '')
        self.assertEqual(self.client.get('/api/employees/').data['count'], 1)
        self.assertEqual(self.client.get('/api/employees/?archived=true').data['count'], 0)
        self.assertEqual(EmployeeArchiveEvent.objects.filter(employee=self.employee).count(), 2)
        self.assertTrue(EmployeeArchiveEvent.objects.filter(
            action='archive', employee=self.employee,
        ).exists())
        self.assertTrue(EmployeeArchiveEvent.objects.filter(
            action='restore', employee=self.employee,
            reason='Mistaken archive, corrected by QA admin',
        ).exists())
        self.assertEqual(EmployeeHealthCard.objects.count(), 1)
        self.assertEqual(EmployeeHealthProfile.objects.count(), 1)

    def test_archival_columns_are_read_only_in_normal_employee_patch(self):
        self.client.force_authenticate(self.admin)
        answer = self.client.patch(f'/api/employees/{self.employee.pk}/', {
            'is_archived': True, 'archive_reason': 'Forbidden bypass',
            'archived_at': '2026-01-01T00:00:00Z',
        }, format='json')
        self.assertEqual(answer.status_code, 200, answer.data)
        self.employee.refresh_from_db()
        self.assertFalse(self.employee.is_archived)
        self.assertEqual(self.employee.archive_reason, '')

    def test_archived_records_not_accessible_in_normal_list_for_other_roles(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.archive().status_code, 200)
        for user in (self.staff, self.viewer):
            self.client.force_authenticate(user)
            response = self.client.get('/api/employees/?archived=true')
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data['count'], 0)
            self.assertEqual(self.client.get(
                f'/api/employees/{self.employee.pk}/',
            ).status_code, 404)
