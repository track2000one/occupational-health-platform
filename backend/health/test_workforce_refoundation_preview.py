from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from .models import (
    Employee, EmployeeOrganizationalHierarchyEvent,
    HealthCenter, OrganizationUnit,
)
from .workforce_refoundation_preview import (
    SCOPES, RELATED_EXTERNAL_SCOPES, WorkforceRefoundationImpactPreviewView,
    read_only_inventory,
)


class WorkforceRefoundationPreviewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_superuser(
            username='reset-preview-admin', email='reset-preview@example.invalid',
            password='test-only-credentials',
        )
        cls.staff = get_user_model().objects.create_user(
            username='reset-preview-staff', email='staff-preview@example.invalid',
            password='test-only-credentials', is_staff=True,
        )
        cls.center = HealthCenter.objects.create(name='مركز تجربة التصفير')
        cls.department = OrganizationUnit.objects.create(
            code='PREVIEW-D1', name='قسم تجربة الهيكلة',
            kind=OrganizationUnit.Kind.DEPARTMENT,
        )
        cls.employee = Employee.objects.create(
            name='موظف اختباري', national_id='9997771234',
            health_center=cls.center,
            organization_unit=cls.department,
        )
        EmployeeOrganizationalHierarchyEvent.objects.create(
            employee=cls.employee, action='created',
            changed_levels=['department'], reason='Synthetic test only',
            performed_by=cls.admin,
        )

    def preview(self, user=None, method='get'):
        request = getattr(APIRequestFactory(), method)(
            '/api/workforce-refoundation/preview/',
        )
        if user is not None:
            force_authenticate(request, user=user)
        return WorkforceRefoundationImpactPreviewView.as_view()(request)

    def test_superuser_inventory_covers_all_scope_categories_without_writes(self):
        initial = {
            'employee': Employee.objects.count(),
            'center': HealthCenter.objects.count(),
            'org': OrganizationUnit.objects.count(),
        }
        response = self.preview(self.admin)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['mode'], 'read_only_full_refoundation_impact_preview')
        self.assertEqual(response.data['employees']['total'], 1)
        self.assertEqual(response.data['health_centers']['total'], 1)
        self.assertEqual(response.data['organization_units']['total'], 1)
        self.assertEqual(len(response.data['sections']), len(SCOPES) + len(RELATED_EXTERNAL_SCOPES))
        self.assertFalse(response.data['execution_available'])
        self.assertFalse(response.data['archive_frees_unique_employee_identity'])
        self.assertFalse(response.data['production_backup_restored_and_verified'])
        self.assertEqual(response['Cache-Control'], 'private, no-store')
        self.assertNotIn('9997771234', repr(response.data))
        self.assertEqual(initial, {
            'employee': Employee.objects.count(),
            'center': HealthCenter.objects.count(),
            'org': OrganizationUnit.objects.count(),
        })

    def test_preview_reports_protected_employee_audit_dependency(self):
        report = read_only_inventory()
        self.assertTrue(any(
            item['target'] == 'Employee'
            and item['dependent_model'] == 'EmployeeOrganizationalHierarchyEvent'
            and item['linked_count'] == 1
            for item in report['protected_relations']
        ))

    def test_staff_cannot_view_global_employee_or_clinical_counts(self):
        response = self.preview(self.staff)
        self.assertEqual(response.status_code, 403)

    def test_anonymous_cannot_view_inventory(self):
        response = self.preview()
        self.assertIn(response.status_code, (401, 403))

    def test_no_execution_or_mutation_endpoint_exists(self):
        before = Employee.objects.count()
        response = self.preview(self.admin, method='post')
        self.assertEqual(response.status_code, 405)
        self.assertEqual(Employee.objects.count(), before)
