"""Synthetic-only department foundation, official approval and employee safety checks."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import (
    AuditLog, Employee, HealthCenter, OrganizationUnit,
    OrganizationUnitApprovalLog,
)


class DepartmentFoundationTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_superuser(
            username='qa_department_founder', password='only-test',
            email='qa-dept-founder@example.invalid',
        )
        self.staff = User.objects.create_user(
            username='qa_department_staff', password='only-test', is_staff=True,
        )
        self.viewer = User.objects.create_user(
            username='qa_department_viewer', password='only-test',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def create_draft(self, name='قسم الصحة الإدارية التجريبي', code='DEP-QA001'):
        response = self.client.post('/api/departments/', {
            'name': name, 'code': code,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data['department']['id']

    def test_draft_creation_without_health_center_or_employee_side_effects(self):
        pk = self.create_draft()
        department = OrganizationUnit.objects.get(pk=pk)
        self.assertEqual(department.kind, OrganizationUnit.Kind.DEPARTMENT)
        self.assertFalse(department.is_approved)
        self.assertTrue(department.is_active)
        self.assertIsNone(department.parent_id)
        self.assertIsNone(department.health_center_id)
        self.assertEqual(HealthCenter.objects.count(), 0)
        self.assertEqual(Employee.objects.count(), 0)
        directory = self.client.get('/api/departments/')
        self.assertEqual(directory.status_code, 200, directory.data)
        self.assertEqual(directory.data['summary']['pending'], 1)
        self.assertEqual(directory.data['results'][0]['employee_count'], 0)
        approved_directory = self.client.get('/api/organization-units/?approved=1')
        self.assertEqual(approved_directory.data['summary']['total'], 0)
        self.assertTrue(AuditLog.objects.filter(
            action='department_draft_created', record_id=str(pk),
        ).exists())

    def test_duplicate_name_and_code_rejected_and_generates_stable_unique_code(self):
        pk = self.create_draft()
        repeated = self.client.post('/api/departments/', {
            'name': '  قسم الصحة الإدارية التجريبي  ',
        }, format='json')
        self.assertEqual(repeated.status_code, 409)
        clash = self.client.post('/api/departments/', {
            'name': 'قسم مختلف', 'code': 'dep-qa001',
        }, format='json')
        self.assertEqual(clash.status_code, 409)
        invalid = self.client.post('/api/departments/', {
            'name': 'قسم آخر', 'code': 'TMP-123',
        }, format='json')
        self.assertEqual(invalid.status_code, 400)
        auto = self.client.post('/api/departments/', {
            'name': 'قسم بدون رمز رسمي',
        }, format='json')
        self.assertEqual(auto.status_code, 201, auto.data)
        self.assertTrue(auto.data['department']['code'].startswith('DEP-'))
        self.assertEqual(OrganizationUnit.objects.count(), 2)
        self.assertTrue(OrganizationUnit.objects.filter(pk=pk).exists())

    def test_only_superuser_can_create_approve_and_manage_status(self):
        pk = self.create_draft()
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get('/api/departments/').status_code, 200)
        self.assertEqual(self.client.post('/api/departments/', {
            'name': 'قسم غير مصرح به',
        }, format='json').status_code, 403)
        self.assertEqual(self.client.post('/api/departments/%d/status/' % pk, {
            'is_active': False, 'reason': 'محاولة غير مصرح بها للقسم',
        }, format='json').status_code, 403)
        self.client.force_authenticate(self.viewer)
        self.assertEqual(self.client.get('/api/departments/').status_code, 403)
        self.assertEqual(self.client.post('/api/departments/', {
            'name': 'قسم جديد',
        }, format='json').status_code, 403)
        self.client.force_authenticate(self.admin)
        self.assertFalse(OrganizationUnit.objects.get(pk=pk).is_approved)

    def test_official_approval_makes_department_selectable_without_any_fake_center(self):
        pk = self.create_draft()
        blocked_employee = self.client.post('/api/employees/', {
            'name': 'مستخدم في قسم غير معتمد',
            'national_id': '9998222001', 'organization_unit': pk,
            'health_center': None,
        }, format='json')
        self.assertEqual(blocked_employee.status_code, 400)
        approved = self.client.post('/api/organization-units/%d/review/' % pk, {
            'action': 'approve', 'approval_reference': 'TEST-APPROVAL-DEPT-001',
        }, format='json')
        self.assertEqual(approved.status_code, 200, approved.data)
        employee = self.client.post('/api/employees/', {
            'name': 'موظف تابع لقسم تجريبي',
            'national_id': '9998222002', 'organization_unit': pk,
            'health_center': None,
        }, format='json')
        self.assertEqual(employee.status_code, 201, employee.data)
        self.assertEqual(employee.data['organization_unit'], pk)
        self.assertIsNone(employee.data['health_center'])
        self.assertEqual(HealthCenter.objects.count(), 0)
        report = self.client.get('/api/employees/report/', {
            'affiliation_type': 'department', 'department_id': pk,
        })
        self.assertEqual(report.status_code, 200, report.data)
        self.assertEqual(report.data['count'], 1)
        self.assertEqual(report.data['results'][0]['affiliation'], OrganizationUnit.objects.get(pk=pk).name)
        self.assertNotIn('national_id_full', report.data['results'][0])
        self.assertEqual(self.client.get('/api/departments/').data['summary']['employees'], 1)
        denied_deactivation = self.client.post('/api/departments/%d/status/' % pk, {
            'is_active': False, 'reason': 'طلب إيقاف قسم يرتبط بموظف',
        }, format='json')
        self.assertEqual(denied_deactivation.status_code, 409, denied_deactivation.data)
        self.assertTrue(OrganizationUnit.objects.get(pk=pk).is_active)

    def test_draft_status_change_requires_reason_and_is_audited(self):
        pk = self.create_draft()
        bad = self.client.post('/api/departments/%d/status/' % pk, {
            'is_active': False, 'reason': 'قصير',
        }, format='json')
        self.assertEqual(bad.status_code, 400)
        off = self.client.post('/api/departments/%d/status/' % pk, {
            'is_active': False, 'reason': 'إيقاف القسم مؤقتًا لحين مراجعة المستندات',
        }, format='json')
        self.assertEqual(off.status_code, 200, off.data)
        blocked_approval = self.client.post('/api/organization-units/%d/review/' % pk, {
            'action': 'approve', 'approval_reference': 'OFFLINE-APPROVAL-01',
        }, format='json')
        self.assertEqual(blocked_approval.status_code, 409)
        on = self.client.post('/api/departments/%d/status/' % pk, {
            'is_active': True, 'reason': 'تمت مراجعة القسم واعتماد إعادة تفعيله',
        }, format='json')
        self.assertEqual(on.status_code, 200, on.data)
        self.assertTrue(OrganizationUnit.objects.get(pk=pk).is_active)
        self.assertTrue(OrganizationUnitApprovalLog.objects.filter(
            unit_id=pk, action='deactivate',
        ).exists())
        self.assertTrue(AuditLog.objects.filter(
            model_name='OrganizationUnit', record_id=str(pk),
            action='department_reactivate',
        ).exists())

    def test_draft_name_edit_allowed_but_approved_name_immutable(self):
        pk = self.create_draft()
        edited = self.client.post('/api/organization-units/%d/review/' % pk, {
            'action': 'edit-draft', 'name': 'القسم بعد التصحيح',
        }, format='json')
        self.assertEqual(edited.status_code, 200, edited.data)
        approved = self.client.post('/api/organization-units/%d/review/' % pk, {
            'action': 'approve', 'approval_reference': 'APPROVED-ADMIN-DEPT',
        }, format='json')
        self.assertEqual(approved.status_code, 200, approved.data)
        blocked = self.client.post('/api/organization-units/%d/review/' % pk, {
            'action': 'edit-draft', 'name': 'تغيير غير مسموح',
        }, format='json')
        self.assertEqual(blocked.status_code, 409)
        self.assertEqual(OrganizationUnit.objects.get(pk=pk).name, 'القسم بعد التصحيح')
