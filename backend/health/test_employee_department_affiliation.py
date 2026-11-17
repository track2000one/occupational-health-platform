"""Synthetic safety checks for center-versus-department employee affiliation.

No production employee records or external Excel files are used.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import (
    AuditLog, Employee, EmployeeProfileCompletionEvent, HealthCenter, OrganizationUnit,
)


class EmployeeDepartmentAffiliationTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser(
            username='test_department_affiliation_admin',
            password='test-only-password',
            email='department-test@example.invalid',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.center = HealthCenter.objects.create(name='Synthetic Primary Center', is_active=True)
        self.department = OrganizationUnit.objects.create(
            code='QA-CENTRAL-DEPT-01', name='القسم الإداري التجريبي',
            kind=OrganizationUnit.Kind.DEPARTMENT,
            is_active=True, is_approved=True, health_center=None,
            approval_reference='QA-DEPARTMENT-APPROVAL',
        )
        self.draft = OrganizationUnit.objects.create(
            code='QA-DRAFT-DEPT-02', name='قسم غير معتمد تجريبي',
            kind=OrganizationUnit.Kind.DEPARTMENT,
            is_active=True, is_approved=False,
        )

    def test_new_employee_accepts_approved_central_department_without_health_center(self):
        result = self.client.post('/api/employees/', {
            'name': 'موظف قسم تجريبي', 'national_id': '9998888001',
            'health_center': None, 'organization_unit': self.department.pk,
        }, format='json')
        self.assertEqual(result.status_code, 201, result.data)
        employee = Employee.objects.get(national_id='9998888001')
        self.assertIsNone(employee.health_center_id)
        self.assertEqual(employee.organization_unit_id, self.department.pk)
        self.assertEqual(result.data['organization_unit_name'], self.department.name)
        self.assertEqual(result.data['organization_unit_kind'], 'department')

    def test_center_only_legacy_path_still_works(self):
        result = self.client.post('/api/employees/', {
            'name': 'موظف مركز تجريبي', 'national_id': '9998888002',
            'health_center': self.center.pk,
        }, format='json')
        self.assertEqual(result.status_code, 201, result.data)
        self.assertIsNone(result.data['organization_unit'])

    def test_rejects_missing_multiple_and_unapproved_placements(self):
        cases = (
            ({}, 'missing'),
            ({'health_center': self.center.pk, 'organization_unit': self.department.pk}, 'both'),
            ({'organization_unit': self.draft.pk}, 'unapproved'),
        )
        for i, (fields, scenario) in enumerate(cases):
            with self.subTest(scenario=scenario):
                payload = {'name': 'QA ' + scenario, 'national_id': f'999888801{i}', **fields}
                result = self.client.post('/api/employees/', payload, format='json')
                self.assertEqual(result.status_code, 400, result.data)
        self.assertEqual(Employee.objects.count(), 0)

    def test_department_cannot_be_reassigned_by_generic_patch(self):
        employee = Employee.objects.create(
            name='Synthetic Verified Department',
            national_id='9998888014', organization_unit=self.department,
        )
        blocked = self.client.patch('/api/employees/%d/' % employee.pk, {
            'organization_unit': None, 'health_center': self.center.pk,
        }, format='json')
        self.assertEqual(blocked.status_code, 400, blocked.data)
        employee.refresh_from_db()
        self.assertIsNone(employee.health_center_id)
        self.assertEqual(employee.organization_unit_id, self.department.pk)

    def test_identity_checked_provisional_completion_can_assign_department(self):
        employee = Employee.objects.create(
            name='Synthetic Provisional Worker', national_id='9998888015',
            registration_status='provisional', health_center=None,
        )
        result = self.client.post('/api/employees/%d/complete-profile/' % employee.pk, {
            'identity_checked': True,
            'reason': 'Identity checked and official department verified',
            'fields': {'organization_unit': self.department.pk},
        }, format='json')
        self.assertEqual(result.status_code, 200, result.data)
        employee.refresh_from_db()
        self.assertEqual(employee.organization_unit_id, self.department.pk)
        self.assertIsNone(employee.health_center_id)
        self.assertEqual(employee.registration_status, 'verified')
        event = EmployeeProfileCompletionEvent.objects.get(employee=employee)
        self.assertEqual(event.changed_fields, ['organization_unit'])
        self.assertTrue(AuditLog.objects.filter(
            model_name='Employee', record_id=str(employee.pk),
            action='employee_profile_completed_at_visit',
        ).exists())
        second = self.client.post('/api/employees/%d/complete-profile/' % employee.pk, {
            'identity_checked': True,
            'reason': 'Repeat assignment is forbidden without review',
            'fields': {'organization_unit': self.department.pk},
        }, format='json')
        self.assertEqual(second.status_code, 409)

    def test_report_and_list_can_filter_departments_without_exposing_full_identity(self):
        Employee.objects.create(name='QA Department', national_id='9998888016',
                                organization_unit=self.department)
        Employee.objects.create(name='QA Center', national_id='9998888017',
                                health_center=self.center)
        listing = self.client.get('/api/employees/', {'affiliation_type': 'department'})
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.data['count'], 1)
        report = self.client.get('/api/employees/report/', {
            'affiliation_type': 'department', 'department_id': self.department.pk,
        })
        self.assertEqual(report.status_code, 200, report.data)
        self.assertEqual(report.data['count'], 1)
        row = report.data['results'][0]
        self.assertEqual(row['department'], self.department.name)
        self.assertEqual(row['affiliation'], self.department.name)
        self.assertEqual(row['affiliation_type'], 'department')
        self.assertEqual(row['health_center'], '')
        self.assertNotIn('national_id_full', row)
        self.assertNotIn('national_id', row)

    def test_directory_exposes_only_approved_department_to_non_admin(self):
        reader = get_user_model().objects.create_user(
            username='test_department_reader', password='test-only',
        )
        self.client.force_authenticate(reader)
        directory = self.client.get('/api/organization-units/?approved=1')
        self.assertEqual(directory.status_code, 200)
        matching = {row['name'] for row in directory.data['results'] if row['kind'] == 'department'}
        self.assertIn(self.department.name, matching)
        self.assertNotIn(self.draft.name, matching)
