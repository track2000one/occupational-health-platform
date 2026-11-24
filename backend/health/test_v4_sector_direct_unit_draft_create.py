"""Synthetic-only, database-backed tests of explicit V4 sector-unit draft creation."""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import (
    AuditLog, Employee, HealthCenter, OrganizationUnit, OrganizationUnitApprovalLog,
)
from .v4_sector_direct_unit_draft_create import DRAFT_CODE, CONFIRM_TEXT


class V4SectorDirectUnitDraftCreateTests(TestCase):
    PATH = '/api/organization-units/sector-direct-unit-create-draft/'

    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_superuser(
            username='ci-sector-draft-admin', password='ci-not-used')
        self.regular = User.objects.create_user(
            username='ci-sector-draft-regular', password='ci-not-used')
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def sector(self, *, approved=True, name='القطاع الشرقي الاستشاري 1'):
        return OrganizationUnit.objects.create(
            code='CI-SECTOR-' + str(OrganizationUnit.objects.count() + 1),
            name=name, kind=OrganizationUnit.Kind.SECTOR,
            is_active=True, is_approved=approved,
        )

    def unit(self, parent=None):
        return OrganizationUnit.objects.create(
            code='CI-EXISTING-U-' + str(OrganizationUnit.objects.count() + 1),
            name='الوحدة الإدارية للفحص الشامل', kind=OrganizationUnit.Kind.UNIT,
            parent=parent, is_active=True, is_approved=False,
        )

    def post(self, data, scope='v4'):
        with patch('health.v4_sector_direct_unit_draft_create.draft_import_scope',
                   return_value=scope):
            return self.client.post(self.PATH, data, format='json')

    def preview(self):
        return self.post({'action': 'preview'})

    def confirm(self, token, **overrides):
        data = {
            'action': 'create', 'preview_token': token,
            'confirmed': True, 'confirmation_text': CONFIRM_TEXT,
        }
        data.update(overrides)
        return self.post(data)

    def test_preview_creates_no_records_and_returns_expiring_token(self):
        self.sector()
        before = list(OrganizationUnit.objects.values_list('id', flat=True))
        response = self.preview()
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['mode'], 'preview')
        self.assertEqual(response.data['source_record_count'], 8)
        self.assertEqual(response.data['target_status'], 'مسودة غير مفعّلة')
        self.assertTrue(response.data['preview_token'])
        self.assertEqual(response.data['unit_code'], DRAFT_CODE)
        self.assertEqual(before,list(OrganizationUnit.objects.values_list('id',flat=True)))
        self.assertFalse(OrganizationUnitApprovalLog.objects.exists())
        self.assertFalse(AuditLog.objects.exists())
        self.assertFalse(Employee.objects.exists())

    def test_confirm_once_creates_audited_unapproved_sector_child(self):
        sector = self.sector()
        token = self.preview().data['preview_token']
        result = self.confirm(token)
        self.assertEqual(result.status_code, 201, result.data)
        unit = OrganizationUnit.objects.get(code=DRAFT_CODE)
        self.assertEqual(unit.parent_id, sector.id)
        self.assertEqual(unit.kind, OrganizationUnit.Kind.UNIT)
        self.assertIsNone(unit.health_center_id)
        self.assertTrue(unit.is_active)
        self.assertFalse(unit.is_approved)
        self.assertEqual(unit.source_sheet,'V4 confirmed sector-direct draft')
        self.assertIn('القطاع الشرقي الاستشاري 1',unit.source_path)
        self.assertEqual(OrganizationUnitApprovalLog.objects.filter(
            unit=unit, action='create-draft', user=self.admin).count(),1)
        self.assertEqual(AuditLog.objects.filter(
            action='v4_direct_sector_unit_draft_created',
            record_id=str(unit.pk)).count(),1)
        self.assertFalse(Employee.objects.exists())
        self.assertFalse(HealthCenter.objects.exists())
        self.assertEqual(self.confirm(token).status_code,409)
        self.assertEqual(OrganizationUnit.objects.count(),2)

    def test_confirmation_required_and_rejects_forged_token(self):
        self.sector()
        token = self.preview().data['preview_token']
        self.assertEqual(self.confirm(token,confirmed=False).status_code,400)
        self.assertEqual(self.confirm(token,confirmation_text='أوافق').status_code,400)
        self.assertEqual(self.confirm('not-valid').status_code,409)
        self.assertFalse(OrganizationUnit.objects.filter(kind='unit').exists())

    def test_stale_preview_rejected_when_sector_changes(self):
        sector = self.sector()
        token = self.preview().data['preview_token']
        sector.code = 'CHANGED-SECTOR'
        sector.save(update_fields=['code','updated_at'])
        self.assertEqual(self.confirm(token).status_code,409)
        self.assertFalse(OrganizationUnit.objects.filter(kind='unit').exists())

    def test_no_creation_if_unit_already_exists_under_another_parent(self):
        self.sector()
        token = self.preview().data['preview_token']
        self.unit()
        self.assertEqual(self.confirm(token).status_code,409)
        self.assertEqual(OrganizationUnit.objects.filter(kind='unit').count(),1)

    def test_preexisting_unit_blocks_new_preview(self):
        sector = self.sector()
        self.unit(sector)
        self.assertEqual(self.preview().status_code,409)
        self.assertEqual(OrganizationUnit.objects.filter(kind='unit').count(),1)

    def test_ambiguous_or_inactive_sector_rejected(self):
        self.sector()
        self.sector()
        self.assertEqual(self.preview().status_code,409)

    def test_pending_sector_allows_draft_only_without_approving_either_node(self):
        sector = self.sector(approved=False)
        preview = self.preview()
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertFalse(preview.data['sector_activated'])
        self.assertEqual(preview.data['target_status'], 'مسودة غير مفعّلة')
        self.assertFalse(OrganizationUnit.objects.filter(kind='unit').exists())
        created = self.confirm(preview.data['preview_token'])
        self.assertEqual(created.status_code, 201, created.data)
        sector.refresh_from_db()
        unit = OrganizationUnit.objects.get(code=DRAFT_CODE)
        self.assertFalse(sector.is_approved)
        self.assertFalse(unit.is_approved)
        self.assertEqual(unit.parent_id, sector.pk)
        self.assertEqual(unit.kind, OrganizationUnit.Kind.UNIT)
        self.assertIsNone(unit.health_center_id)
        self.assertFalse(Employee.objects.exists())
        self.assertFalse(HealthCenter.objects.exists())
        self.assertEqual(OrganizationUnit.objects.count(),2)

    def test_inactive_sector_does_not_allow_draft_creation(self):
        sector = self.sector(approved=False)
        sector.is_active = False
        sector.save(update_fields=['is_active'])
        preview = self.preview()
        self.assertEqual(preview.status_code,409)
        self.assertEqual(preview.data['status'],'sector_invalid')
        self.assertFalse(OrganizationUnit.objects.filter(kind='unit').exists())

    def test_scope_and_role_required_for_both_phases(self):
        self.sector()
        self.assertEqual(self.post({'action':'preview'},scope='staging').status_code,403)
        self.client.force_authenticate(self.regular)
        self.assertEqual(self.preview().status_code,403)
        self.assertEqual(self.confirm('forged').status_code,403)
        self.assertFalse(OrganizationUnit.objects.filter(kind='unit').exists())

    def test_get_not_supported(self):
        self.assertEqual(self.client.get(self.PATH).status_code,405)
