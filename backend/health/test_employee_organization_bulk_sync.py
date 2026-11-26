from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from .models import Employee, EmployeeOrganizationalHierarchyEvent, HealthCenter, OrganizationUnit
from .organization_structure import STAGING_PROJECT

URL = '/api/employees/organization-bulk-sync/'
ENV = {'STAGING_MODE': 'true', 'RAILWAY_PROJECT_ID': STAGING_PROJECT}


class EmployeeOrganizationBulkSyncTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser(username='sync_admin', password='test-only')
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        root = OrganizationUnit.objects.create(code='SYNC-ROOT', name='تجمع الشرقية الصحي', kind='department', is_approved=True)
        network = OrganizationUnit.objects.create(code='SYNC-NET', name='شبكة الدمام الصحية', kind='department', parent=root, is_approved=True)
        sector = OrganizationUnit.objects.create(code='SYNC-SEC', name='القطاع الشرقي الاستشاري 2', kind='sector', parent=network, is_approved=True)
        self.center = HealthCenter.objects.create(name='الجلوية', name_ar='الجلوية')
        OrganizationUnit.objects.create(code='SYNC-C', name='الجلوية', kind='center', parent=sector, health_center=self.center, is_approved=True)
        self.ready = Employee.objects.create(name='Synthetic A', national_id='1000000001', health_center=self.center,
            source_organizational_hierarchy={'service_program': 'preserve'})
        self.conflict = Employee.objects.create(name='Synthetic B', national_id='1000000002', health_center=self.center,
            source_organizational_hierarchy={'consultative_sector': 'قطاع آخر'})
        self.review = Employee.objects.create(name='Synthetic C', national_id='1000000003')
        self.retired = Employee.objects.create(name='Synthetic D', national_id='1000000004', health_center=self.center, employment_status='retired')
        self.archived = Employee.objects.create(name='Synthetic E', national_id='1000000005', health_center=self.center, is_archived=True)

    def preview(self):
        response = self.client.post(URL, {'action': 'preview'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def apply(self, preview, ids, **kw):
        payload = {'action': 'apply', 'preview_token': preview['preview_token'], 'employee_ids': ids,
                   'confirmed': True, 'reason': 'استكمال المسميات من الهيكلة المعتمدة'}
        return self.client.post(URL, {**payload, **kw}, format='json')

    @patch.dict('os.environ', ENV)
    def test_preview_then_selective_completion_preserves_links_and_conflicts(self):
        plan = self.preview()
        self.assertEqual(plan['counts'], {'ready': 1, 'matched': 0, 'conflict': 1, 'review': 2})
        self.assertEqual(plan['total'], 4)
        self.assertNotIn('national_id', str(plan))
        self.assertEqual(self.apply(plan, [self.conflict.pk]).status_code, 400)
        self.assertEqual(self.apply(plan, [self.ready.pk], confirmed=False).status_code, 400)
        self.assertEqual(self.apply(plan, [self.ready.pk]).status_code, 200)
        self.ready.refresh_from_db()
        self.conflict.refresh_from_db()
        self.assertEqual(self.ready.source_organizational_hierarchy['consultative_sector'], 'القطاع الشرقي الاستشاري 2')
        self.assertEqual(self.ready.source_organizational_hierarchy['service_program'], 'preserve')
        self.assertEqual(self.ready.health_center_id, self.center.pk)
        self.assertEqual(self.conflict.source_organizational_hierarchy['consultative_sector'], 'قطاع آخر')
        self.assertEqual(Employee.objects.count(), 5)
        self.assertEqual(EmployeeOrganizationalHierarchyEvent.objects.filter(employee=self.ready).count(), 1)
        self.assertEqual(self.apply(plan, [self.ready.pk]).status_code, 409)
        self.assertEqual(self.preview()['counts']['matched'], 1)

    @patch.dict('os.environ', ENV)
    def test_reject_non_superuser_and_stale_preview(self):
        plan = self.preview()
        self.ready.source_organizational_hierarchy = {'service_program': 'changed'}
        self.ready.save()
        self.assertEqual(self.apply(plan, [self.ready.pk]).status_code, 409)
        staff = get_user_model().objects.create_user(username='sync_staff', password='test-only', is_staff=True)
        self.client.force_authenticate(staff)
        self.assertEqual(self.client.post(URL, {'action': 'preview'}, format='json').status_code, 403)

    @patch.dict('os.environ', {'STAGING_MODE': 'false'})
    def test_production_blocked(self):
        self.assertEqual(self.client.post(URL, {'action': 'preview'}, format='json').status_code, 403)
