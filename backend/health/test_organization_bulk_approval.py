"""Bulk organizational approval uses fake entities only and never touches employee data."""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import (
    AuditLog, Employee, HealthCenter, OrganizationUnit,
    OrganizationUnitApprovalLog,
)

STAGING = {
    'STAGING_MODE': 'true',
    'RAILWAY_PROJECT_ID': 'cf4b2162-5236-4f92-b010-165f505fe2c2',
}
URL = '/api/organization-units/bulk-approval/'


class OrganizationBulkApprovalTests(TestCase):
    def setUp(self):
        user = get_user_model()
        self.owner = user.objects.create_superuser(
            username='bulk_org_admin', email='bulk@example.invalid', password='sample-qa-only',
        )
        self.staff = user.objects.create_user(
            username='bulk_org_staff', password='sample-qa-only', is_staff=True,
        )
        self.center = HealthCenter.objects.create(name='Synthetic health center')
        self.sector = OrganizationUnit.objects.create(
            code='TMP-S-AAAA00000001', name='Synthetic sector', kind='sector',
        )
        self.center_org = OrganizationUnit.objects.create(
            code='TMP-C101', name='Synthetic organizational center', kind='center',
            parent=self.sector,
        )
        self.unit = OrganizationUnit.objects.create(
            code='TMP-U101', name='Synthetic nursing unit', kind='unit',
            parent=self.center_org,
        )
        self.department = OrganizationUnit.objects.create(
            code='TMP-O101', name='Synthetic central administration', kind='department',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def preview(self, unit_ids):
        return self.client.post(URL, {
            'action': 'preview', 'unit_ids': unit_ids,
        }, format='json')

    def apply(self, unit_ids, preview, **override):
        data = {
            'action': 'approve', 'unit_ids': unit_ids,
            'preview_token': preview.data['preview_token'],
            'approval_reference': 'QA-OFFICIAL-001',
            'reference_covers_all': True,
        }
        data.update(override)
        return self.client.post(URL, data, format='json')

    @patch.dict('os.environ', STAGING)
    def test_preview_with_unmapped_center_only_approves_sector_and_department(self):
        all_ids = [self.sector.pk, self.center_org.pk, self.unit.pk, self.department.pk]
        preview = self.preview(all_ids)
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertEqual(preview.data['selected_count'], 4)
        self.assertEqual(preview.data['eligible_count'], 2)
        self.assertEqual(preview.data['blocked_count'], 2)
        self.assertEqual(
            {entry['reason'] for entry in preview.data['blocked']},
            {'center_mapping_required', 'parent_not_approved_or_selected'},
        )
        self.assertEqual(OrganizationUnit.objects.filter(is_approved=True).count(), 0)
        self.assertEqual(OrganizationUnitApprovalLog.objects.count(), 0)

    @patch.dict('os.environ', STAGING)
    def test_explicit_bulk_confirms_only_eligible_and_leaves_blocked_unmodified(self):
        all_ids = [self.sector.pk, self.center_org.pk, self.unit.pk, self.department.pk]
        initial_count = Employee.objects.count()
        preview = self.preview(all_ids)
        done = self.apply(all_ids, preview)
        self.assertEqual(done.status_code, 200, done.data)
        self.assertEqual(done.data['approved_count'], 2)
        self.assertEqual(done.data['blocked_count'], 2)
        self.sector.refresh_from_db()
        self.department.refresh_from_db()
        self.center_org.refresh_from_db()
        self.unit.refresh_from_db()
        self.assertTrue(self.sector.is_approved)
        self.assertTrue(self.department.is_approved)
        self.assertFalse(self.center_org.is_approved)
        self.assertFalse(self.unit.is_approved)
        self.assertEqual(OrganizationUnitApprovalLog.objects.filter(action='bulk-approve').count(), 2)
        self.assertEqual(AuditLog.objects.filter(action='organization_bulk_approve').count(), 1)
        self.assertEqual(Employee.objects.count(), initial_count)
        self.assertEqual(HealthCenter.objects.count(), 1)
        self.assertEqual(self.center_org.health_center_id, None)

    @patch.dict('os.environ', STAGING)
    def test_mapped_parent_sector_center_unit_can_all_be_approved_in_one_batch(self):
        self.center_org.health_center = self.center
        self.center_org.save(update_fields=['health_center'])
        all_ids = [self.unit.pk, self.center_org.pk, self.sector.pk]
        preview = self.preview(all_ids)
        self.assertEqual(preview.data['eligible_count'], 3, preview.data)
        done = self.apply(all_ids, preview)
        self.assertEqual(done.status_code, 200, done.data)
        self.assertEqual(done.data['approved_count'], 3)
        self.unit.refresh_from_db()
        self.assertTrue(self.unit.is_approved)
        self.assertEqual(self.unit.health_center_id, self.center.pk)
        self.assertEqual(OrganizationUnit.objects.filter(is_approved=True).count(), 3)

    @patch.dict('os.environ', STAGING)
    def test_stale_preview_and_missing_consent_rejected(self):
        selected = [self.sector.pk, self.department.pk]
        preview = self.preview(selected)
        no_consent = self.apply(selected, preview, reference_covers_all=False)
        self.assertEqual(no_consent.status_code, 400)
        self.sector.name = 'Another suggested name'
        self.sector.save()
        stale = self.apply(selected, preview)
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(OrganizationUnit.objects.filter(is_approved=True).count(), 0)

    @patch.dict('os.environ', STAGING)
    def test_invalid_duplicate_unknown_or_noninteger_selection_rejected(self):
        for ids in ([self.sector.pk, self.sector.pk], [999999], ['1'], [], [True]):
            result = self.preview(ids)
            self.assertIn(result.status_code, (400, 409), result.data)
        self.assertEqual(OrganizationUnitApprovalLog.objects.count(), 0)

    @patch.dict('os.environ', STAGING)
    def test_non_superuser_cannot_bulk_approve_or_preview(self):
        self.client.force_authenticate(self.staff)
        rejected = self.preview([self.sector.pk])
        self.assertEqual(rejected.status_code, 403)
        self.assertEqual(OrganizationUnit.objects.filter(is_approved=True).count(), 0)

    def test_production_environment_rejects_bulk_preview_and_confirm(self):
        with patch.dict('os.environ', {
            'STAGING_MODE': 'false', 'RAILWAY_PROJECT_ID': STAGING['RAILWAY_PROJECT_ID'],
        }):
            rejected = self.preview([self.sector.pk])
        self.assertEqual(rejected.status_code, 403)
        self.assertEqual(OrganizationUnit.objects.filter(is_approved=True).count(), 0)
