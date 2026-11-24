"""Synthetic preflight coverage: this endpoint never changes V4 organizations."""
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Employee, OrganizationUnit


class V4SectorDirectUnitPreflightTests(TestCase):
    PATH = '/api/organization-units/sector-direct-unit-preflight/'

    def setUp(self):
        user = get_user_model()
        self.admin = user.objects.create_superuser(
            username='synthetic-sector-unit-admin', password='test-only-password')
        self.regular = user.objects.create_user(
            username='synthetic-sector-unit-user', password='test-only-password')
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def sector(self, name='القطاع الشرقي الاستشاري 1'):
        return OrganizationUnit.objects.create(
            name=name, code='CI-SECTOR-' + str(OrganizationUnit.objects.count()+1),
            kind=OrganizationUnit.Kind.SECTOR, is_active=True, is_approved=True)

    def unit(self, parent=None):
        return OrganizationUnit.objects.create(
            name='الوحدة الإدارية للفحص الشامل',
            code='CI-FULL-CHECKUP-' + str(OrganizationUnit.objects.count()+1),
            kind=OrganizationUnit.Kind.UNIT, parent=parent,
            is_active=True, is_approved=False)

    def get(self, scope='v4'):
        with patch('health.v4_sector_direct_unit_preflight.draft_import_scope',
                   return_value=scope):
            return self.client.get(self.PATH)

    def test_sector_missing_reports_no_writes(self):
        with self.assertNumQueries(1):
            result = self.get()
        self.assertEqual(result.status_code,200)
        self.assertEqual(result.data['status'],'sector_missing')
        self.assertFalse(result.data['linked'])
        self.assertEqual(result.data['source_record_count'],8)
        self.assertEqual(Employee.objects.count(),0)
        self.assertEqual(OrganizationUnit.objects.count(),0)

    def test_sector_without_unit_identifies_safe_preflight_only(self):
        self.sector()
        result=self.get()
        self.assertEqual(result.status_code,200)
        self.assertEqual(result.data['status'],'unit_missing')
        self.assertTrue(result.data['can_create_link'])
        self.assertEqual(OrganizationUnit.objects.count(),1)
        self.assertEqual(Employee.objects.count(),0)

    def test_existing_sector_direct_unit_detected_without_mutation(self):
        sector=self.sector()
        unit=self.unit(sector)
        result=self.get()
        self.assertEqual(result.data['status'],'already_linked')
        self.assertTrue(result.data['linked'])
        self.assertEqual(result.data['unit_id'],unit.id)
        unit.refresh_from_db()
        self.assertEqual(unit.parent_id,sector.id)
        self.assertFalse(unit.is_approved)
        self.assertEqual(Employee.objects.count(),0)

    def test_existing_unattached_unit_is_not_transferred(self):
        self.sector()
        unit=self.unit()
        result=self.get()
        self.assertEqual(result.data['status'],'unit_conflict')
        unit.refresh_from_db()
        self.assertIsNone(unit.parent_id)
        self.assertFalse(result.data['can_create_link'])

    def test_ambiguous_sector_requires_review(self):
        self.sector()
        self.sector()
        self.assertEqual(self.get().data['status'],'sector_ambiguous')

    def test_ambiguous_units_require_review(self):
        sector=self.sector()
        self.unit()
        self.unit()
        self.assertEqual(self.get().data['status'],'unit_ambiguous')
        self.assertEqual(OrganizationUnit.objects.filter(parent=sector).count(),0)

    def test_not_exposed_outside_isolated_v4_or_to_regular_users(self):
        self.sector()
        self.assertEqual(self.get(scope='staging').status_code,403)
        self.client.force_authenticate(self.regular)
        self.assertEqual(self.get().status_code,403)

    def test_writes_not_supported(self):
        self.assertEqual(self.client.post(self.PATH,{},format='json').status_code,405)
