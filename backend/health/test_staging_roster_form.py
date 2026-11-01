from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from .models import Employee, HealthCenter, EmployeeHealthProfile


class StagingRosterFormCompatibilityTests(TestCase):
    def setUp(self):
        self.center = HealthCenter.objects.create(name='Synthetic Test Center')
        self.user = get_user_model().objects.create_user(
            username='qa_form_admin', password='synthetic-only-password', is_staff=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.url = reverse('employee-list')

    def test_minimum_fields_are_center_name_and_unique_national_id(self):
        response = self.client.post(self.url, {
            'name': 'موظف تجريبي أول',
            'national_id': '1000000001',
            'health_center': self.center.pk,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        employee = Employee.objects.get(national_id='1000000001')
        self.assertEqual(employee.gender, '')
        self.assertIsNone(employee.email)
        self.assertIsNone(employee.employee_number)
        self.assertEqual(employee.periodic_exam_status, 'unknown')
        self.assertEqual(employee.vaccination_status, 'unknown')
        self.assertEqual(employee.risk_level, 'unknown')
        self.assertEqual(employee.employment_status, Employee.EmploymentStatus.ACTIVE)
        self.assertEqual(employee.age, 0)

    def test_all_new_fields_write_and_read_through_existing_health_profile(self):
        payload = {
            'name': 'موظف تجريبي ثان',
            'national_id': '1000000002',
            'health_center': self.center.pk,
            'moh_id': 'FAKE-MOH-002',
            'children_count': 2,
            'employment_start_date': '2012-01-01',
            'job_title': 'تمريض',
            'job_title_en': 'Nursing',
            'latest_virtual_visit': '2025-02-01',
            'latest_field_visit': '2025-05-01',
            'lab_request': 'Requested',
            'lab_request_date': '2025-05-10',
        }
        response = self.client.post(self.url, payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        employee = Employee.objects.get(national_id='1000000002')
        profile = EmployeeHealthProfile.objects.get(employee=employee)
        self.assertEqual(profile.moh_id, 'FAKE-MOH-002')
        self.assertEqual(profile.children_count, 2)
        self.assertEqual(employee.job_title_en, 'Nursing')
        self.assertEqual(employee.latest_field_visit.isoformat(), '2025-05-01')

        fetched = self.client.get(reverse('employee-detail', kwargs={'pk': employee.pk}))
        self.assertEqual(fetched.status_code, 200)
        self.assertEqual(fetched.data.get('moh_id'), 'FAKE-MOH-002')
        self.assertEqual(fetched.data.get('children_count'), 2)
        self.assertEqual(fetched.data.get('employment_start_date'), '2012-01-01')
        self.assertEqual(fetched.data.get('lab_request'), 'Requested')

    def test_update_does_not_wipe_other_health_profile_information(self):
        employee = Employee.objects.create(
            name='Synthetic Existing', national_id='1000000003', health_center=self.center,
        )
        profile = EmployeeHealthProfile.objects.create(
            employee=employee, moh_id='FAKE-MOH-003',
            children_count=1, weight_kg=65,
        )
        response = self.client.patch(
            reverse('employee-detail', kwargs={'pk': employee.pk}),
            {'children_count': 3}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        profile.refresh_from_db()
        self.assertEqual(profile.children_count, 3)
        self.assertEqual(profile.moh_id, 'FAKE-MOH-003')
        self.assertEqual(str(profile.weight_kg), '65.00')

    def test_duplicate_identity_rejected(self):
        payload = {'name': 'فرد تجريبي', 'national_id': '1000000004', 'health_center': self.center.pk}
        self.assertEqual(self.client.post(self.url, payload, format='json').status_code, 201)
        self.assertEqual(self.client.post(self.url, payload, format='json').status_code, 400)
        self.assertEqual(Employee.objects.count(), 1)
