"""Only synthetic employee and review data. Production-safe cleanup regressions."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import (
    AuditLog, Employee, EmployeeHealthCard, EmployeeImportReview,
    EmployeeImportReviewCleanupBatch, HealthCenter,
)


class EmployeeReviewCleanupTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.superuser = User.objects.create_superuser(
            username='qa_cleanup_admin', email='qa-cleanup@example.invalid',
            password='synthetic-only-password',
        )
        self.staff = User.objects.create_user(
            username='qa_cleanup_staff', password='synthetic-only-password',
            is_staff=True,
        )
        self.center = HealthCenter.objects.create(
            name='QA Cleanup Center', code='QA-CLEAN-001', is_active=True,
        )
        self.employee = Employee.objects.create(
            name='QA Original Worker', national_id='9998310001',
            employee_number='QA-0001', health_center=self.center,
            is_archived=True,
        )
        self.health_card = EmployeeHealthCard.objects.create(
            employee=self.employee, data={'conditions': {'qa': 'preserved'}},
        )
        self.client = APIClient()
        self.client.force_authenticate(self.superuser)
        self.path = '/api/employee-import-reviews/cleanup/'
        self.pending = self.review(1, 'pending')
        self.conflict = self.review(2, 'conflict')
        self.activated = self.review(3, 'activated')
        self.already_discarded = self.review(4, 'discarded')

    def review(self, n, status_value):
        return EmployeeImportReview.objects.create(
            source_file='qa-source.xlsx', source_sheet='Employees',
            source_row=n, fingerprint=f'{n:064x}',
            status=status_value, created_by=self.superuser,
            raw_payload={'name': 'QA Original Worker', 'national_id': '9998310001'},
            employee_payload={'name': 'QA Original Worker', 'national_id': '9998310001'},
            issues=['QA review check'],
        )

    def post(self, action, **kwargs):
        return self.client.post(self.path, {'action': action, **kwargs}, format='json')

    def preview(self):
        response = self.post('preview')
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def confirm(self, preview, **overrides):
        options = {
            'preview_token': preview['preview_token'],
            'confirm_phrase': preview['confirm_phrase'],
            'reason': 'QA cleanup of pending Excel review cards only',
            'confirmed': True,
        }
        options.update(overrides)
        return self.post('restore' if preview['mode'] == 'restore_preview' else 'commit',
                         **options)

    def test_only_superuser_can_preview_commit_or_restore(self):
        self.client.force_authenticate(self.staff)
        for action in ('preview', 'commit', 'restore_preview', 'restore'):
            self.assertEqual(self.post(action).status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.post('preview').status_code, (401, 403))
        self.assertEqual(EmployeeImportReview.objects.filter(
            status__in=('pending', 'conflict')).count(), 2)

    def test_preview_has_no_employee_or_review_mutation(self):
        preview = self.preview()
        self.assertEqual(preview['eligible_count'], 2)
        self.assertEqual(preview['pending_count'], 1)
        self.assertEqual(preview['conflict_count'], 1)
        self.assertEqual(preview['protected_statuses'], ['activated', 'discarded'])
        self.assertEqual(preview['confirm_phrase'], 'تنظيف 2 بطاقة مراجعة')
        self.assertNotIn('9998310001', str(preview))
        self.assertFalse(EmployeeImportReviewCleanupBatch.objects.exists())
        self.assertEqual(EmployeeImportReview.objects.filter(status='discarded').count(), 1)

    def test_cleanup_and_restore_preserve_original_employee_medical_and_source_data(self):
        preview = self.preview()
        result = self.confirm(preview)
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['discarded_count'], 2)
        self.pending.refresh_from_db()
        self.conflict.refresh_from_db()
        self.activated.refresh_from_db()
        self.already_discarded.refresh_from_db()
        self.employee.refresh_from_db()
        self.assertEqual(self.pending.status, 'discarded')
        self.assertEqual(self.conflict.status, 'discarded')
        self.assertEqual(self.activated.status, 'activated')
        self.assertEqual(self.already_discarded.status, 'discarded')
        self.assertEqual(self.pending.employee_payload['national_id'], '9998310001')
        self.assertEqual(self.conflict.raw_payload['national_id'], '9998310001')
        self.assertEqual(Employee.objects.count(), 1)
        self.assertTrue(self.employee.is_archived)
        self.assertTrue(EmployeeHealthCard.objects.filter(pk=self.health_card.pk).exists())
        self.assertEqual(AuditLog.objects.filter(
            action='bulk_discard_employee_import_reviews').count(), 1)

        self.assertEqual(self.confirm(preview).status_code, 409)
        restore_preview = self.post('restore_preview')
        self.assertEqual(restore_preview.status_code, 200, restore_preview.data)
        self.assertEqual(restore_preview.data['eligible_count'], 2)
        restored = self.confirm(restore_preview.data)
        self.assertEqual(restored.status_code, 200, restored.data)
        self.assertEqual(restored.data['restored_count'], 2)
        self.pending.refresh_from_db()
        self.conflict.refresh_from_db()
        self.assertEqual(self.pending.status, 'pending')
        self.assertEqual(self.conflict.status, 'conflict')
        self.assertIsNone(self.pending.resolved_at)
        self.assertIsNone(self.pending.resolved_by)
        self.employee.refresh_from_db()
        self.assertTrue(self.employee.is_archived)
        self.assertEqual(EmployeeHealthCard.objects.count(), 1)
        self.assertEqual(self.post('restore_preview').status_code, 409)
        self.assertEqual(AuditLog.objects.filter(
            action='restore_bulk_employee_import_reviews').count(), 1)

    def test_commit_requires_valid_token_reason_confirmation_and_exact_count(self):
        preview = self.preview()
        for override in (
            {'confirmed': False},
            {'reason': 'short'},
            {'confirm_phrase': 'تنظيف 999 بطاقة مراجعة'},
            {'preview_token': 'forged'},
        ):
            denied = self.confirm(preview, **override)
            self.assertIn(denied.status_code, (400, 409), denied.data)
        self.assertEqual(EmployeeImportReview.objects.filter(
            status__in=('pending', 'conflict')).count(), 2)
        self.assertFalse(EmployeeImportReviewCleanupBatch.objects.exists())

    def test_preview_cannot_commit_when_review_changes(self):
        preview = self.preview()
        self.pending.issues = ['QA corrected after preview']
        self.pending.save(update_fields=['issues', 'updated_at'])
        denied = self.confirm(preview)
        self.assertEqual(denied.status_code, 409, denied.data)
        self.assertFalse(EmployeeImportReviewCleanupBatch.objects.exists())
        self.assertEqual(Employee.objects.count(), 1)

    def test_restoration_excludes_cards_changed_after_cleanup(self):
        result = self.confirm(self.preview())
        self.assertEqual(result.status_code, 200, result.data)
        self.pending.refresh_from_db()
        self.pending.issues = ['another administrative review took place']
        self.pending.status = 'activated'
        self.pending.save(update_fields=['status', 'issues', 'updated_at'])
        restored_preview = self.post('restore_preview')
        self.assertEqual(restored_preview.status_code, 200, restored_preview.data)
        self.assertEqual(restored_preview.data['eligible_count'], 1)
        restored = self.confirm(restored_preview.data)
        self.assertEqual(restored.status_code, 200, restored.data)
        self.pending.refresh_from_db()
        self.conflict.refresh_from_db()
        self.assertEqual(self.pending.status, 'activated')
        self.assertEqual(self.conflict.status, 'conflict')
