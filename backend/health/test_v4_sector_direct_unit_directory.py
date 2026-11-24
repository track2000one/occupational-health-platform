"""Synthetic V4 regression: direct sector units must display separately from departments."""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Employee, HealthCenter, OrganizationUnit


class V4SectorDirectUnitDirectoryTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser(
            username='ci-v4-direct-sector-directory', password='test-only')
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def listing(self, scope='v4'):
        with patch('health.department_directory.draft_import_scope',
                   return_value=scope):
            return self.client.get('/api/departments/')

    def test_direct_sector_unit_is_visible_separately_and_not_counted_as_department(self):
        for i in range(38):
            OrganizationUnit.objects.create(
                name=f'CI Department {i:02d}', code=f'CI-D-{i:02d}',
                kind=OrganizationUnit.Kind.DEPARTMENT,
                is_active=True, is_approved=True)
        sector = OrganizationUnit.objects.create(
            name='القطاع الشرقي الاستشاري 1', code='CI-EAST-1',
            kind=OrganizationUnit.Kind.SECTOR,
            is_active=True, is_approved=False)
        unit = OrganizationUnit.objects.create(
            name='الوحدة الإدارية للفحص الشامل', code='CI-V4-SECTOR-UNIT',
            kind=OrganizationUnit.Kind.UNIT, parent=sector,
            health_center=None, is_active=True, is_approved=False)
        before = OrganizationUnit.objects.count()
        response = self.listing()
        self.assertEqual(response.status_code,200,response.data)
        data=response.data
        self.assertEqual(data['summary']['total'],38)
        self.assertEqual(len(data['results']),38)
        self.assertEqual(data['summary']['approved'],38)
        self.assertEqual(data['summary']['pending'],0)
        self.assertEqual(data['sector_direct_summary']['total'],1)
        self.assertEqual(data['sector_direct_summary']['pending'],1)
        self.assertEqual(data['sector_direct_summary']['approved'],0)
        self.assertEqual(data['sector_direct_summary']['employees'],0)
        self.assertEqual(len(data['sector_direct_units']),1)
        shown=data['sector_direct_units'][0]
        self.assertEqual(shown['id'],unit.pk)
        self.assertEqual(shown['kind'],OrganizationUnit.Kind.UNIT)
        self.assertEqual(shown['name'],unit.name)
        self.assertEqual(shown['parent_name'],sector.name)
        self.assertEqual(shown['parent_kind'],OrganizationUnit.Kind.SECTOR)
        self.assertFalse(shown['parent_is_approved'])
        self.assertFalse(shown['is_approved'])
        self.assertEqual(data['summary']['total']+
                         data['sector_direct_summary']['total'],39)
        self.assertEqual(before,OrganizationUnit.objects.count())
        self.assertFalse(Employee.objects.exists())

    def test_center_child_units_are_not_misreported_as_direct_sector_units(self):
        sector=OrganizationUnit.objects.create(
            name='القطاع الشرقي الاستشاري 1',code='CI-SECTOR',
            kind=OrganizationUnit.Kind.SECTOR)
        center=OrganizationUnit.objects.create(
            name='مركز تجريبي',code='CI-CENTER',
            kind=OrganizationUnit.Kind.CENTER,parent=sector)
        OrganizationUnit.objects.create(
            name='وحدة تتبع مركز',code='CI-CENTER-UNIT',
            kind=OrganizationUnit.Kind.UNIT,parent=center)
        data=self.listing().data
        self.assertEqual(data['sector_direct_summary']['total'],0)
        self.assertEqual(data['sector_direct_units'],[])

    def test_existing_non_v4_api_remains_unchanged(self):
        sector=OrganizationUnit.objects.create(
            name='القطاع الشرقي الاستشاري 1',code='CI-SECTOR',
            kind=OrganizationUnit.Kind.SECTOR)
        OrganizationUnit.objects.create(
            name='الوحدة الإدارية للفحص الشامل',code='CI-FULLCHECKUP',
            kind=OrganizationUnit.Kind.UNIT,parent=sector)
        data=self.listing(scope='staging').data
        self.assertNotIn('sector_direct_units',data)
        self.assertNotIn('sector_direct_summary',data)
        self.assertEqual(data['summary']['total'],0)
