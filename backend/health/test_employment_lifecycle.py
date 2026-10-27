from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from health.models import Employee, EmployeeEmploymentChange, HealthCenter


class EmployeeEmploymentWorkflowTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='review_admin', password='local-only-test', is_staff=True,
        )
        self.regular = get_user_model().objects.create_user(
            username='review_viewer', password='local-only-test',
        )
        self.center = HealthCenter.objects.create(name='Test Center A')
        self.next_center = HealthCenter.objects.create(name='Test Center B')
        self.employee = Employee.objects.create(
            name='Sample Employee', national_id='1000000001', health_center=self.center,
        )
        self.client = APIClient()
        self.endpoint = f'/api/employees/{self.employee.pk}/employment-status/'

    def test_retirement_requires_document_reference_and_keeps_center(self):
        self.client.force_authenticate(self.user)
        data = {'status': 'retired', 'effective_date': date.today().isoformat()}
        missing = self.client.post(self.endpoint, data, format='json')
        self.assertEqual(missing.status_code, 400)
        self.assertEqual(EmployeeEmploymentChange.objects.count(), 0)
        data['evidence_reference'] = 'Decision 123/1448'
        response = self.client.post(self.endpoint, data, format='json')
        self.assertEqual(response.status_code, 200)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.employment_status, 'retired')
        self.assertEqual(self.employee.health_center_id, self.center.pk)
        record = EmployeeEmploymentChange.objects.get()
        self.assertEqual(record.previous_status, 'active')
        self.assertEqual(record.approved_by_id, self.user.pk)

    def test_absence_or_regular_user_cannot_mark_retired(self):
        self.client.force_authenticate(self.regular)
        response = self.client.post(self.endpoint, {
            'status': 'retired', 'effective_date': date.today().isoformat(),
            'evidence_reference': 'Decision 123/1448',
        }, format='json')
        self.assertEqual(response.status_code, 403)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.employment_status, 'active')

    def test_transfer_saves_old_center_in_history(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(self.endpoint, {
            'status': 'transferred',
            'effective_date': date.today().isoformat(),
            'evidence_reference': 'Transfer order 123',
            'new_health_center_id': self.next_center.pk,
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.health_center_id, self.next_center.pk)
        record = EmployeeEmploymentChange.objects.get()
        self.assertEqual(record.previous_health_center_id, self.center.pk)
        self.assertEqual(record.new_health_center_id, self.next_center.pk)

    def test_employee_serializer_cannot_change_status_directly(self):
        self.client.force_authenticate(self.user)
        response = self.client.patch(f'/api/employees/{self.employee.pk}/', {
            'employment_status': 'retired',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.employment_status, 'active')

    def test_retirement_cannot_be_reapplied_without_real_transition(self):
        self.client.force_authenticate(self.user)
        payload = {
            'status': 'retired', 'effective_date': date.today().isoformat(),
            'evidence_reference': 'Decision 123/1448',
        }
        self.assertEqual(self.client.post(self.endpoint, payload, format='json').status_code, 200)
        self.assertEqual(self.client.post(self.endpoint, payload, format='json').status_code, 400)
        self.assertEqual(EmployeeEmploymentChange.objects.count(), 1)
