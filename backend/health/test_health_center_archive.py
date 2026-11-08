"""Non-destructive health center archive/reset checks using synthetic records only."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import (
    AuditLog, Employee, HealthCenter, HealthCenterLifecycleEvent,
    HealthCenterResetBatch, UserProfile,
)


class HealthCenterArchiveTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_superuser(
            username='center_archive_admin', email='archive@example.invalid',
            password='synthetic-only',
        )
        self.viewer = User.objects.create_user(
            username='center_archive_viewer', password='synthetic-only',
        )
        self.manager = User.objects.create_user(
            username='center_archive_manager', password='synthetic-only', is_staff=True,
        )
        UserProfile.objects.create(user=self.manager, role='ohManager')
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.url = '/api/health-centers/archive/'
        self.one = HealthCenter.objects.create(name='Synthetic center alpha', code='QA-HCA-01')
        self.two = HealthCenter.objects.create(name='Synthetic center beta', code='QA-HCA-02')
        self.three = HealthCenter.objects.create(name='Synthetic center gamma', code='QA-HCA-03')
        self.employee = Employee.objects.create(
            name='Synthetic linked employee', national_id='9998155501',
            employee_number='QA-ARCHIVE-EMP-1', health_center=self.three,
        )
        self.reason = 'Administrative test reason for archiving a synthetic center'

    def call(self, action, **args):
        return self.client.post(self.url, {'action': action, **args}, format='json')

    def confirm(self, action, preview, **kwargs):
        params = {
            'preview_token': preview['preview_token'],
            'confirm_phrase': preview['confirm_phrase'],
            'reason': self.reason, 'confirmed': True,
        }
        if action in ('delete', 'restore'):
            params['center_id'] = preview['center_id']
        params.update(kwargs)
        return self.call(action, **params)

    def test_delete_preview_and_reason_confirmed_restore_leave_history_intact(self):
        preview = self.call('preview_delete', center_id=self.one.pk)
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertEqual(preview.data['eligible_count'], 1)
        self.assertEqual(preview.data['blocked_count'], 0)
        self.assertEqual(HealthCenter.objects.filter(is_archived=True).count(), 0)
        missing_reason = self.confirm('delete', preview.data, reason='tiny')
        self.assertEqual(missing_reason.status_code, 400)
        wrong_phrase = self.confirm('delete', preview.data, confirm_phrase='حذف آخر')
        self.assertEqual(wrong_phrase.status_code, 400)
        no_checkbox = self.confirm('delete', preview.data, confirmed=False)
        self.assertEqual(no_checkbox.status_code, 400)
        saved = self.confirm('delete', preview.data)
        self.assertEqual(saved.status_code, 200, saved.data)
        self.one.refresh_from_db()
        self.assertTrue(self.one.is_archived)
        self.assertEqual(self.one.archive_reason, self.reason)
        self.assertEqual(HealthCenter.objects.count(), 3)
        self.assertEqual(self.client.get('/api/health-centers/').data['count'], 2)
        self.assertEqual(self.client.get('/api/health-centers/?archived=true').data['count'], 1)
        self.assertTrue(HealthCenterLifecycleEvent.objects.filter(
            center=self.one, action='archive', performed_by=self.admin,
        ).exists())
        self.assertTrue(AuditLog.objects.filter(action='health_center_delete').exists())
        restore = self.call('preview_restore', center_id=self.one.pk)
        self.assertEqual(restore.status_code, 200, restore.data)
        result = self.confirm('restore', restore.data)
        self.assertEqual(result.status_code, 200, result.data)
        self.one.refresh_from_db()
        self.assertFalse(self.one.is_archived)
        self.assertEqual(self.one.archive_reason, '')
        self.assertEqual(HealthCenterLifecycleEvent.objects.filter(
            center=self.one,
        ).count(), 2)
        self.assertEqual(HealthCenter.objects.count(), 3)

    def test_linked_center_delete_blocked_even_when_unlinked_centers_exist(self):
        preview = self.call('preview_delete', center_id=self.three.pk)
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertEqual(preview.data['blocked_count'], 1)
        self.assertGreater(preview.data['blocked'][0]['references']['health.Employee'], 0)
        refused = self.confirm('delete', preview.data)
        self.assertEqual(refused.status_code, 409)
        self.three.refresh_from_db()
        self.assertFalse(self.three.is_archived)
        self.assertEqual(Employee.objects.get(pk=self.employee.pk).health_center_id, self.three.pk)
        self.assertFalse(HealthCenterLifecycleEvent.objects.exists())

    def test_bulk_reset_all_or_nothing_when_any_center_has_links(self):
        preview = self.call('preview_reset')
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertEqual(preview.data['count'], 3)
        self.assertEqual(preview.data['eligible_count'], 2)
        self.assertEqual(preview.data['blocked_count'], 1)
        result = self.confirm('reset', preview.data)
        self.assertEqual(result.status_code, 409, result.data)
        self.assertEqual(HealthCenter.objects.filter(is_archived=False).count(), 3)
        self.assertFalse(HealthCenterResetBatch.objects.exists())

    def test_bulk_reset_preview_confirm_and_recover_exact_batch(self):
        self.employee.delete()  # Synthetic dependency only, not real data.
        before = self.call('preview_reset')
        self.assertEqual(before.status_code, 200)
        self.assertEqual(before.data['count'], 3)
        self.assertEqual(before.data['blocked_count'], 0)
        result = self.confirm('reset', before.data)
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['affected'], 3)
        self.assertEqual(self.client.get('/api/health-centers/').data['count'], 0)
        self.assertEqual(self.client.get('/api/health-centers/?archived=true').data['count'], 3)
        self.assertEqual(HealthCenter.objects.count(), 3)
        batch = HealthCenterResetBatch.objects.get()
        self.assertEqual(len(batch.center_ids), 3)
        self.assertEqual(HealthCenterLifecycleEvent.objects.filter(action='reset_archive').count(), 3)
        self.assertEqual(self.confirm('reset', before.data).status_code, 409)
        recovery = self.call('preview_restore_batch')
        self.assertEqual(recovery.status_code, 200, recovery.data)
        restored = self.confirm('restore_batch', recovery.data)
        self.assertEqual(restored.status_code, 200, restored.data)
        self.assertEqual(restored.data['affected'], 3)
        self.assertEqual(self.client.get('/api/health-centers/').data['count'], 3)
        self.assertEqual(HealthCenter.objects.filter(is_archived=True).count(), 0)
        batch.refresh_from_db()
        self.assertIsNotNone(batch.restored_at)
        self.assertEqual(HealthCenterLifecycleEvent.objects.filter(action='batch_restore').count(), 3)

    def test_concurrent_change_invalidates_signed_preview(self):
        prev = self.call('preview_delete', center_id=self.one.pk).data
        HealthCenter.objects.filter(pk=self.one.pk).update(name='Changed after preview')
        result = self.confirm('delete', prev)
        # The name and phrase can change as well as the fingerprint.
        self.assertEqual(result.status_code, 409, result.data)
        self.one.refresh_from_db()
        self.assertFalse(self.one.is_archived)

    def test_preview_cannot_be_reused_by_other_account(self):
        preview = self.call('preview_delete', center_id=self.one.pk).data
        self.client.force_authenticate(self.viewer)
        self.assertEqual(self.call('preview_delete', center_id=self.one.pk).status_code, 403)
        self.assertEqual(self.confirm('delete', preview).status_code, 403)
        self.assertEqual(self.client.get('/api/health-centers/?archived=true').data['count'], 3)
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.call('preview_reset').status_code, 403)
        self.client.force_authenticate(self.admin)
        self.assertFalse(HealthCenterResetBatch.objects.exists())

    def test_legacy_delete_cannot_bypass_signed_workflow(self):
        self.assertEqual(self.client.delete(f'/api/health-centers/{self.one.pk}/').status_code, 405)
        self.one.refresh_from_db()
        self.assertFalse(self.one.is_archived)
        # An API caller cannot set archive flags using ordinary PATCH.
        patch = self.client.patch(
            f'/api/health-centers/{self.one.pk}/',
            {'is_archived': True, 'archive_reason': 'fake'},
            format='json',
        )
        self.assertEqual(patch.status_code, 200)
        self.one.refresh_from_db()
        self.assertFalse(self.one.is_archived)
        self.assertEqual(self.one.archive_reason, '')
