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


class V4BulkPreviewSafetyTests(TestCase):
    """Synthetic V4 hierarchy: preview works; bulk writes fail closed."""
    def setUp(self):
        self.user = get_user_model().objects.create_superuser(
            username='v4-bulk-reviewer', password='synthetic-test-secret')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.root = OrganizationUnit.objects.create(
            code='V4-D-ROOT', name='Z Root', kind='department')
        self.child = OrganizationUnit.objects.create(
            code='V4-D-CHILD', name='A Child', kind='department', parent=self.root)
        self.leaf = OrganizationUnit.objects.create(
            code='V4-D-LEAF', name='B Leaf', kind='department', parent=self.child)

    def v4_preview(self, ids):
        with patch('health.organization_bulk_approval.draft_import_scope', return_value='v4'):
            with patch.dict('os.environ', {
                'STAGING_MODE': 'false', 'OHP_V4_BULK_PREVIEW_ENABLED': 'true',
                'OHP_V4_BULK_APPROVAL_COMMIT_ENABLED': 'false',
            }):
                return self.client.post(URL, {'action': 'preview', 'unit_ids': ids}, format='json')

    def test_v4_preview_is_parent_first_and_read_only(self):
        selected = [self.leaf.pk, self.child.pk, self.root.pk]
        preview = self.v4_preview(selected)
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertEqual(preview.data['eligible_count'], 3, preview.data)
        self.assertEqual(preview.data['blocked_count'], 0)
        self.assertIs(preview.data['commit_enabled'], False)
        self.assertFalse(OrganizationUnit.objects.filter(is_approved=True).exists())
        self.assertFalse(OrganizationUnitApprovalLog.objects.exists())
        self.assertFalse(AuditLog.objects.exists())
        self.assertFalse(Employee.objects.exists())

    def test_v4_commit_stays_denied_even_with_valid_preview_and_reference(self):
        ids = [self.root.pk, self.child.pk, self.leaf.pk]
        preview = self.v4_preview(ids)
        with patch('health.organization_bulk_approval.draft_import_scope', return_value='v4'):
            with patch.dict('os.environ', {
                'STAGING_MODE': 'false', 'OHP_V4_BULK_PREVIEW_ENABLED': 'true',
                'OHP_V4_BULK_APPROVAL_COMMIT_ENABLED': 'false',
            }):
                commit = self.client.post(URL, {
                    'action': 'approve', 'unit_ids': ids,
                    'preview_token': preview.data['preview_token'],
                    'approval_reference': 'QA-V4-ONLY-001', 'reference_covers_all': True,
                }, format='json')
        self.assertEqual(commit.status_code, 403)
        self.assertFalse(OrganizationUnit.objects.filter(is_approved=True).exists())

    def test_preview_denied_without_v4_flag_and_in_wrong_scope(self):
        with patch('health.organization_bulk_approval.draft_import_scope', return_value='v4'):
            with patch.dict('os.environ', {
                'STAGING_MODE': 'false', 'OHP_V4_BULK_PREVIEW_ENABLED': 'false',
            }):
                self.assertEqual(self.client.post(
                    URL, {'action': 'preview', 'unit_ids': [self.root.pk]}, format='json').status_code, 403)
        with patch('health.organization_bulk_approval.draft_import_scope', return_value=''):
            with patch.dict('os.environ', {
                'STAGING_MODE': 'false', 'OHP_V4_BULK_PREVIEW_ENABLED': 'true',
            }):
                self.assertEqual(self.client.post(
                    URL, {'action': 'preview', 'unit_ids': [self.root.pk]}, format='json').status_code, 403)

    def test_v4_invalid_hierarchy_is_blocked_even_when_parent_selected(self):
        self.child.code = 'LEGACY-CHILD'
        self.child.save(update_fields=['code'])
        preview = self.v4_preview([self.root.pk, self.child.pk, self.leaf.pk])
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.data['eligible_count'], 1, preview.data)
        self.assertEqual(preview.data['blocked_count'], 2, preview.data)
        self.assertFalse(OrganizationUnit.objects.filter(is_approved=True).exists())


class V4InternalOperationalActivationTests(TestCase):
    """All data and users are synthetic. No actual employee or medical writes."""

    def setUp(self):
        users = get_user_model()
        self.admin = users.objects.create_superuser(
            username='v4-operational-admin', password='test-only-secret')
        self.staff = users.objects.create_user(
            username='v4-operational-staff', password='test-only-secret', is_staff=True)
        self.api = APIClient()
        self.api.force_authenticate(self.admin)
        self.center = HealthCenter.objects.create(
            name='Synthetic Unique Center', name_ar='مركز اختبار فريد')
        self.duplicate_a = HealthCenter.objects.create(
            name='Synthetic Duplicate A', name_ar='مركز مكرر')
        self.duplicate_b = HealthCenter.objects.create(
            name='Synthetic Duplicate B', name_ar='مركز مكرر')
        self.root = OrganizationUnit.objects.create(
            code='V4-D-OP-ROOT', name='Operational Root', kind='department')
        self.child = OrganizationUnit.objects.create(
            code='V4-D-OP-CHILD', name='Operational Child', kind='department',
            parent=self.root)

    def test_defaults_deny_all_activation_with_no_writes(self):
        with patch('health.v4_operational_activation.draft_import_scope', return_value='v4'):
            with patch.dict('os.environ', {
                'OHP_V4_OPERATIONAL_ACTIVATION_ENABLED': 'false',
                'OHP_V4_BULK_PREVIEW_ENABLED': 'true',
            }):
                result = self.api.post(
                    '/api/health-centers/operational-activation/',
                    {'action': 'preview', 'center_ids': [self.center.pk]}, format='json')
                org = self.api.post(URL, {
                    'action': 'activate', 'unit_ids': [self.root.pk],
                }, format='json')
        self.assertEqual(result.status_code, 403)
        self.assertEqual(org.status_code, 403)
        self.assertEqual(self.center.approval_status, 'pending')
        self.assertFalse(self.root.is_approved)

    def test_center_activation_rejects_duplicate_names_and_preserves_records(self):
        from .models import HealthCenterProfileAuditEvent
        ids = [self.center.pk, self.duplicate_a.pk, self.duplicate_b.pk]
        with patch('health.v4_operational_activation.draft_import_scope', return_value='v4'):
            with patch.dict('os.environ', {'OHP_V4_OPERATIONAL_ACTIVATION_ENABLED': 'true'}):
                url = '/api/health-centers/operational-activation/'
                pre = self.api.post(url, {'action': 'preview', 'center_ids': ids}, format='json')
                self.assertEqual(pre.status_code, 200, pre.data)
                self.assertEqual(pre.data['eligible_count'], 1)
                self.assertEqual(pre.data['blocked_count'], 2)
                self.assertEqual(pre.data['mode'], 'preview')
                self.assertEqual(HealthCenterProfileAuditEvent.objects.count(), 0)
                invalid = self.api.post(url, {
                    'action': 'activate', 'center_ids': ids,
                    'preview_token': pre.data['preview_token'], 'confirmed': False,
                }, format='json')
                self.assertEqual(invalid.status_code, 400, invalid.data)
                applied = self.api.post(url, {
                    'action': 'activate', 'center_ids': ids,
                    'preview_token': pre.data['preview_token'],
                    'confirmed': True, 'confirm_text': 'تفعيل تشغيلي',
                }, format='json')
                self.assertEqual(applied.status_code, 200, applied.data)
                self.assertEqual(applied.data['activated_count'], 1)
                stale = self.api.post(url, {
                    'action': 'activate', 'center_ids': ids,
                    'preview_token': pre.data['preview_token'],
                    'confirmed': True, 'confirm_text': 'تفعيل تشغيلي',
                }, format='json')
                self.assertEqual(stale.status_code, 409)
        self.center.refresh_from_db()
        self.duplicate_a.refresh_from_db()
        self.assertEqual(self.center.approval_status, 'approved')
        self.assertEqual(self.center.approval_reference, '')
        self.assertEqual(self.center.approved_by, self.admin)
        self.assertEqual(self.duplicate_a.approval_status, 'pending')
        self.assertEqual(HealthCenterProfileAuditEvent.objects.filter(
            action='v4_operational_activate').count(), 1)
        self.assertEqual(Employee.objects.count(), 0)
        self.assertEqual(OrganizationUnit.objects.filter(is_approved=True).count(), 0)

    def test_org_bulk_v4_operational_activation_uses_parent_first_without_reference(self):
        ids = [self.child.pk, self.root.pk]
        with patch('health.v4_operational_activation.draft_import_scope', return_value='v4'):
            with patch('health.organization_bulk_approval.draft_import_scope', return_value='v4'):
                with patch.dict('os.environ', {
                    'STAGING_MODE': 'false',
                    'OHP_V4_OPERATIONAL_ACTIVATION_ENABLED': 'true',
                    'OHP_V4_BULK_PREVIEW_ENABLED': 'true',
                    'OHP_V4_BULK_APPROVAL_COMMIT_ENABLED': 'false',
                }):
                    pre = self.api.post(URL, {'action': 'preview', 'unit_ids': ids}, format='json')
                    self.assertEqual(pre.status_code, 200, pre.data)
                    self.assertEqual(pre.data['eligible_count'], 2, pre.data)
                    self.assertTrue(pre.data['commit_enabled'])
                    bad = self.api.post(URL, {
                        'action': 'activate', 'unit_ids': ids,
                        'preview_token': pre.data['preview_token'], 'confirmed': False,
                    }, format='json')
                    self.assertEqual(bad.status_code, 400)
                    result = self.api.post(URL, {
                        'action': 'activate', 'unit_ids': ids,
                        'preview_token': pre.data['preview_token'],
                        'confirmed': True, 'confirm_text': 'تفعيل تشغيلي',
                    }, format='json')
                    self.assertEqual(result.status_code, 200, result.data)
                    self.assertEqual(result.data['mode'], 'activated')
                    self.assertEqual(result.data['approved_count'], 2)
        self.root.refresh_from_db()
        self.child.refresh_from_db()
        self.assertTrue(self.root.is_approved and self.child.is_approved)
        self.assertEqual(self.root.approval_reference, '')
        self.assertEqual(self.child.approval_reference, '')
        self.assertEqual(OrganizationUnitApprovalLog.objects.filter(
            action='v4-activate').count(), 2)
        self.assertEqual(Employee.objects.count(), 0)
        self.assertFalse(HealthCenter.objects.filter(approved_at__isnull=False).exists())

    def test_non_admin_cannot_operationally_activate(self):
        self.api.force_authenticate(self.staff)
        with patch('health.v4_operational_activation.draft_import_scope', return_value='v4'):
            with patch('health.organization_bulk_approval.draft_import_scope', return_value='v4'):
                with patch.dict('os.environ', {
                    'OHP_V4_OPERATIONAL_ACTIVATION_ENABLED': 'true',
                    'OHP_V4_BULK_PREVIEW_ENABLED': 'true',
                }):
                    centers = self.api.post(
                        '/api/health-centers/operational-activation/',
                        {'action': 'preview', 'center_ids': [self.center.pk]}, format='json')
                    orgs = self.api.post(
                        URL, {'action': 'preview', 'unit_ids': [self.root.pk]}, format='json')
        self.assertEqual(centers.status_code, 403)
        self.assertEqual(orgs.status_code, 403)

    def test_single_department_operational_activation_without_official_reference(self):
        url = f'/api/organization-units/{self.root.pk}/review/'
        with patch('health.v4_operational_activation.draft_import_scope', return_value='v4'):
            with patch('health.organization_structure.draft_import_scope', return_value='v4'):
                with patch.dict('os.environ', {
                    'OHP_V4_OPERATIONAL_ACTIVATION_ENABLED': 'true',
                    'OHP_V4_DEPARTMENT_DRAFT_IMPORT_ENABLED': 'true',
                }):
                    not_confirmed = self.api.post(
                        url, {'action': 'activate'}, format='json')
                    self.assertEqual(not_confirmed.status_code, 400)
                    activated = self.api.post(
                        url, {'action': 'activate', 'confirmed': True}, format='json')
                    self.assertEqual(activated.status_code, 200, activated.data)
        self.root.refresh_from_db()
        self.assertTrue(self.root.is_approved)
        self.assertEqual(self.root.approval_reference, '')
        self.assertTrue(OrganizationUnitApprovalLog.objects.filter(
            action='v4-activate', unit=self.root).exists())
        self.assertEqual(Employee.objects.count(), 0)
