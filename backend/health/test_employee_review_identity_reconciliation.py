"""Only synthetic identifiers: read-only reconciliation inventory regression tests."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Employee, EmployeeImportReview

ROUTE = '/api/employee-import-reviews/reconciliation-preview/'


class EmployeeImportReconciliationPreviewTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_superuser(
            username='qa_reconcile_admin', email='reconcile-admin@example.invalid',
            password='qa-only-reconciliation-pass',
        )
        self.staff = User.objects.create_user(
            username='qa_reconcile_staff', email='reconcile-staff@example.invalid',
            password='qa-only-reconciliation-pass', is_staff=True,
        )
        self.client = APIClient()
        self.active = Employee.objects.create(
            name='موظف اختبار أ', national_id='9999991001',
            employee_number='QA1001', nationality='',
        )
        self.archived = Employee.objects.create(
            name='موظف اختبار ب', national_id='9999991002', is_archived=True,
        )
        self.other = Employee.objects.create(
            name='موظف اختبار ج', national_id='9999991003',
        )

    def review(self, seq, identity, name, **attrs):
        return EmployeeImportReview.objects.create(
            fingerprint=f'{seq:064x}',
            source_file='synthetic-employee-roster.xlsx',
            source_sheet='Employees',
            source_row=seq,
            employee_payload={
                'national_id': identity, 'name': name, **attrs,
            },
            status='pending',
        )

    def test_requires_superuser_and_does_not_expose_identity_to_staff(self):
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.post(ROUTE).status_code, 403)
        self.client.force_authenticate(user=None)
        self.assertIn(self.client.post(ROUTE).status_code, (401, 403))

    def test_aggregates_active_archived_differences_and_no_mutations(self):
        self.review(1, '9999991001', 'موظف اختبار أ', nationality='SA')
        self.review(2, '9999991002', 'موظف اختبار ب', nationality='SA')
        self.review(3, '9999991003', 'شخص آخر مختلف')
        self.review(4, '9999991004', 'مجهول في السجل')
        self.review(5, 'invalid-number', 'هوية غير صالحة')
        self.review(6, '9999991001', 'موظف اختبار أ', nationality='SA')

        self.client.force_authenticate(self.admin)
        response = self.client.post(ROUTE, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        data = response.data
        self.assertEqual(data['mode'], 'read_only')
        self.assertEqual(data['review_cards'], 6)
        self.assertEqual(data['unique_valid_identities'], 4)
        self.assertEqual(data['invalid_identity_cards'], 1)
        self.assertEqual(data['repeated_review_cards'], 1)
        self.assertEqual(data['multiple_reviews_for_identity'], 1)
        self.assertEqual(data['matched_active'], 2)
        self.assertEqual(data['matched_archived'], 1)
        self.assertEqual(data['archived_requires_verified_restore'], 1)
        self.assertEqual(data['different_or_missing_name'], 1)
        self.assertEqual(data['identity_not_in_registry'], 1)
        self.assertEqual(data['active_possible_fill_only'], 0)
        self.assertNotIn('9999991001', str(data))
        self.assertNotIn('موظف اختبار أ', str(data))
        self.assertNotIn('QA1001', str(data))
        self.assertEqual(Employee.objects.count(), 3)
        self.assertEqual(EmployeeImportReview.objects.count(), 6)
        self.active.refresh_from_db()
        self.archived.refresh_from_db()
        self.assertEqual(self.active.nationality, '')
        self.assertTrue(self.archived.is_archived)
        self.assertEqual(response['Cache-Control'], 'private, no-store')

    def test_active_single_record_with_empty_field_is_only_possible_candidate(self):
        self.review(7, '9999991001', 'موظف اختبار أ', nationality='SA')
        self.client.force_authenticate(self.admin)
        response = self.client.post(ROUTE)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['active_possible_fill_only'], 1)
        self.assertEqual(response.data['possible_fill_fields'], {'nationality': 1})
        self.active.refresh_from_db()
        self.assertEqual(self.active.nationality, '')

    def test_different_unique_employee_number_prevents_candidate_classification(self):
        self.review(8, '9999991001', 'موظف اختبار أ',
                    employee_number='DIFFERENT', nationality='SA')
        self.client.force_authenticate(self.admin)
        response = self.client.post(ROUTE)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['different_unique_fields'], 1)
        self.assertEqual(response.data['active_possible_fill_only'], 0)
