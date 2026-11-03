"""Legacy review activation regression: synthetic IDs and centers only."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Employee, EmployeeImportReview, HealthCenter, OrganizationUnit


class EmployeeReviewActivationValidationTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_superuser(
            username='review_validation_admin', password='qa-example-only',
            email='review-admin@example.invalid',
        )
        self.center = HealthCenter.objects.create(
            code='QA-REVIEW-001', name='مركز وهمي للاختبار',
            name_ar='مركز وهمي للاختبار', is_active=True,
        )
        self.inactive = HealthCenter.objects.create(
            code='QA-REVIEW-002', name='مركز تجريبي غير نشط', is_active=False,
        )
        self.sector = OrganizationUnit.objects.create(
            code='TMP-S-REVIEW-QA', name='قطاع وهمي', kind='sector', is_approved=False,
        )
        self.unit = OrganizationUnit.objects.create(
            code='TMP-C-REVIEW-QA', name='مركز تنظيمي غير معتمد',
            kind='center', parent=self.sector, health_center=self.center, is_approved=False,
        )
        self.review = EmployeeImportReview.objects.create(
            source_file='qa-fake-roster.xlsx', source_sheet='Employees',
            source_row=1398, fingerprint='a' * 64, status='pending',
            employee_payload={
                'name': 'موظف وهمي للاختبار',
                'national_id': '9995771398',
                'health_center_name': self.center.name,
                'health_center': None,
                'nationality': 'السعودية',
                'organization_unit': self.unit.pk,
            },
            issues=['Invalid nationality', 'Organization unit reference is not approved or does not exist'],
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.url = f'/api/employee-import-reviews/{self.review.pk}/activate/'

    def payload(self, center):
        return {
            'name': 'موظف وهمي للاختبار',
            'national_id': '9995771398',
            'health_center': center,
            'date_of_birth': None,
            'appointment_date': None,
            'nationality': 'SA',
            'email': '',
            'employee_number': '',
            'gender': 'female',
        }

    def test_missing_or_zero_center_returns_explanatory_error_without_creation(self):
        for value in (0, '', None, 'not-a-center', -1):
            result = self.client.post(self.url, self.payload(value), format='json')
            self.assertEqual(result.status_code, 400, result.data)
            self.assertIn('health_center', result.data)
            self.assertEqual(Employee.objects.count(), 0)
            self.review.refresh_from_db()
            self.assertEqual(self.review.status, 'pending')

    def test_inactive_center_cannot_be_used_during_activation(self):
        result = self.client.post(self.url, self.payload(self.inactive.pk), format='json')
        self.assertEqual(result.status_code, 400)
        self.assertEqual(Employee.objects.count(), 0)

    def test_valid_center_and_optional_blank_dates_activate_and_drop_unapproved_unit(self):
        result = self.client.post(self.url, self.payload(self.center.pk), format='json')
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(Employee.objects.count(), 1)
        employee = Employee.objects.get(national_id='9995771398')
        self.assertEqual(employee.health_center_id, self.center.pk)
        self.assertEqual(employee.nationality, 'SA')
        self.assertIsNone(employee.organization_unit)
        self.assertIsNone(employee.date_of_birth)
        self.assertIsNone(employee.appointment_date)
        self.review.refresh_from_db()
        self.assertEqual(self.review.status, 'activated')
        self.assertEqual(self.review.issues, [])
