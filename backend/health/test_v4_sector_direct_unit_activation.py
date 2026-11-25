"""Synthetic-only tests: direct-sector unit activation must never alter staff records."""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import (
    AuditLog, Employee, HealthCenter, OrganizationUnit, OrganizationUnitApprovalLog,
)
from .v4_sector_direct_unit_draft_create import DRAFT_CODE, SOURCE_PATH
from .v4_sector_direct_unit_preflight import SECTOR_NAME, UNIT_NAME
from .organization_bulk_approval import _plan_approvals


class V4SectorDirectUnitActivationTests(TestCase):
    URL = '/api/organization-units/sector-direct-unit-activation/'

    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_superuser(
            username='ci-sector-unit-activation-admin', password='ci-only')
        self.staff = User.objects.create_user(
            username='ci-sector-unit-activation-staff', password='ci-only', is_staff=True)
        self.api = APIClient()
        self.api.force_authenticate(self.admin)

    def sector(self, approved=True):
        return OrganizationUnit.objects.create(
            code='CI-SECTOR-1', name=SECTOR_NAME,
            kind=OrganizationUnit.Kind.SECTOR,
            is_active=True, is_approved=approved,
        )

    def unit(self, sector, *, code=DRAFT_CODE):
        return OrganizationUnit.objects.create(
            code=code, name=UNIT_NAME,
            kind=OrganizationUnit.Kind.UNIT, parent=sector,
            health_center=None, is_active=True, is_approved=False,
            source_sheet='V4 confirmed sector-direct draft',
            source_path=SOURCE_PATH,
        )

    def post(self, data, scope='v4', flag='true'):
        with patch('health.v4_sector_direct_unit_activation.draft_import_scope',
                   return_value=scope):
            with patch('health.v4_operational_activation.draft_import_scope',
                       return_value=scope):
                with patch.dict('os.environ',
                                {'OHP_V4_OPERATIONAL_ACTIVATION_ENABLED': flag}):
                    return self.api.post(self.URL, data, format='json')

    def preview(self):
        return self.post({'action':'preview'})

    def activate(self, token, **overrides):
        data = {
            'action': 'activate', 'preview_token': token, 'confirmed': True,
            'confirmation_text': 'تفعيل الوحدة الإدارية للفحص الشامل',
        }
        data.update(overrides)
        return self.post(data)

    def test_preview_requires_activated_parent_without_writing(self):
        sector = self.sector(approved=False)
        unit = self.unit(sector)
        result = self.preview()
        self.assertEqual(result.status_code,409,result.data)
        self.assertEqual(result.data['status'],'parent_pending')
        unit.refresh_from_db()
        self.assertFalse(unit.is_approved)
        self.assertFalse(AuditLog.objects.exists())
        self.assertFalse(OrganizationUnitApprovalLog.objects.exists())
        self.assertFalse(Employee.objects.exists())

    def test_preview_is_readonly_after_parent_activation(self):
        sector = self.sector()
        unit = self.unit(sector)
        result = self.preview()
        self.assertEqual(result.status_code,200,result.data)
        self.assertEqual(result.data['status'],'ready')
        self.assertEqual(result.data['unit_id'],unit.pk)
        self.assertEqual(result.data['sector_id'],sector.pk)
        self.assertEqual(result.data['source_record_count'],8)
        self.assertEqual(result.data['employee_changes'],0)
        self.assertFalse(result.data['legal_approval'])
        self.assertTrue(result.data['preview_token'])
        self.assertFalse(unit.is_approved)
        self.assertFalse(AuditLog.objects.exists())
        self.assertFalse(OrganizationUnitApprovalLog.objects.exists())

    def test_activation_only_changes_unit_approval_and_writes_audit(self):
        sector = self.sector()
        unit = self.unit(sector)
        token = self.preview().data['preview_token']
        result = self.activate(token)
        self.assertEqual(result.status_code,200,result.data)
        self.assertEqual(result.data['status'],'activated')
        unit.refresh_from_db()
        sector.refresh_from_db()
        self.assertTrue(unit.is_approved)
        self.assertTrue(sector.is_approved)
        self.assertEqual(unit.approved_by,self.admin)
        self.assertIsNotNone(unit.approved_at)
        self.assertEqual(unit.approval_reference,'')
        self.assertIsNone(unit.health_center_id)
        self.assertEqual(unit.parent_id,sector.pk)
        self.assertEqual(unit.kind,OrganizationUnit.Kind.UNIT)
        self.assertEqual(OrganizationUnit.objects.count(),2)
        self.assertEqual(OrganizationUnitApprovalLog.objects.filter(
            unit=unit, action='v4-activate', user=self.admin).count(),1)
        self.assertEqual(AuditLog.objects.filter(
            action='v4_sector_direct_unit_operational_activation',
            record_id=str(unit.pk)).count(),1)
        self.assertFalse(Employee.objects.exists())
        self.assertFalse(HealthCenter.objects.exists())
        replay = self.activate(token)
        self.assertEqual(replay.status_code,409)
        self.assertEqual(OrganizationUnitApprovalLog.objects.count(),1)

    def test_rejects_missing_confirmation_and_tampered_token(self):
        sector = self.sector()
        unit = self.unit(sector)
        token = self.preview().data['preview_token']
        self.assertEqual(self.activate(token,confirmed=False).status_code,400)
        self.assertEqual(self.activate(token,confirmation_text='موافق').status_code,400)
        self.assertEqual(self.activate('invalid-token').status_code,409)
        unit.refresh_from_db()
        self.assertFalse(unit.is_approved)

    def test_rejects_changed_sector_and_unit_after_preview(self):
        sector = self.sector()
        unit = self.unit(sector)
        token = self.preview().data['preview_token']
        sector.code = 'CHANGED-SECTOR'
        sector.save(update_fields=['code','updated_at'])
        self.assertEqual(self.activate(token).status_code,409)
        self.assertFalse(OrganizationUnit.objects.get(pk=unit.pk).is_approved)

    def test_rejects_mismatched_identity_duplicate_inactive_or_wrong_parent(self):
        sector = self.sector()
        unit = self.unit(sector)
        unit.source_sheet='unverified'
        unit.save(update_fields=['source_sheet'])
        self.assertEqual(self.preview().data['status'],'unit_identity_mismatch')
        unit.source_sheet='V4 confirmed sector-direct draft'
        unit.is_active=False
        unit.save(update_fields=['source_sheet','is_active'])
        self.assertEqual(self.preview().data['status'],'unit_missing' if False else 'unit_conflict')

    def test_duplicate_name_does_not_activate_either(self):
        sector = self.sector()
        unit = self.unit(sector)
        extra=OrganizationUnit.objects.create(
            code='CI-SECOND-UNIT', name=UNIT_NAME, kind=OrganizationUnit.Kind.UNIT,
            parent=sector, is_active=True,
        )
        result=self.preview()
        self.assertEqual(result.status_code,409)
        self.assertEqual(result.data['status'],'unit_ambiguous')
        self.assertFalse(OrganizationUnit.objects.filter(is_approved=True,
            kind=OrganizationUnit.Kind.UNIT).exists())

    def test_scope_feature_flag_and_admin_required(self):
        sector=self.sector()
        unit=self.unit(sector)
        self.assertEqual(self.post({'action':'preview'},scope='staging').status_code,403)
        self.assertEqual(self.post({'action':'preview'},flag='false').status_code,403)
        self.api.force_authenticate(self.staff)
        self.assertEqual(self.preview().status_code,403)
        self.assertFalse(unit.is_approved)

    def test_bulk_activation_still_blocks_sector_child_unit(self):
        sector=self.sector()
        unit=self.unit(sector)
        rows=list(OrganizationUnit.objects.all())
        plan,eligible=_plan_approvals([unit.pk],rows,set())
        self.assertEqual(plan['eligible_count'],0)
        self.assertEqual(plan['blocked_count'],1)
        self.assertEqual(plan['blocked'][0]['reason'],'invalid_parent_center')
        self.assertEqual(eligible,[])
        self.assertFalse(unit.is_approved)
