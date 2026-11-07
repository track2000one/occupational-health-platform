"""Synthetic tests for bulk IGNORE with no employee writes or deletions."""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import AuditLog, Employee, EmployeeImportReview, HealthCenter
from .employee_review_bulk_activation import STAGING_PROJECT_ID

URL = '/api/employee-import-reviews/bulk-discard/'
ISOLATED_STAGING = {'STAGING_MODE': 'true', 'RAILWAY_PROJECT_ID': STAGING_PROJECT_ID}


class StagingReviewBulkDiscardTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_superuser(
            username='discard_test_admin', email='discard-admin@example.invalid',
            password='test-not-real',
        )
        self.staff = User.objects.create_user(
            username='discard_test_staff', email='discard-staff@example.invalid',
            password='test-not-real', is_staff=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.center = HealthCenter.objects.create(
            name='Test center', code='TEST-DISCARD', is_active=True,
        )
        self.employee = Employee.objects.create(
            name='Never touch this employee', national_id='9999222222',
            health_center=self.center,
        )

    def review(self, idx, status='pending'):
        return EmployeeImportReview.objects.create(
            fingerprint=f'{idx:064x}', source_file='qa-synthetic.xlsx',
            source_row=idx, status=status,
            employee_payload={'name': f'Synthetic employee {idx}',
                              'national_id': f'9998{idx:06d}',
                              'health_center': None},
            raw_payload={'important_source_value': f'original {idx}'},
            issues=['center not matched'], warnings=['keep original import'],
        )

    def preview(self, ids=None, selection='selected'):
        data = {'action': 'preview', 'selection': selection}
        if ids is not None:
            data['review_ids'] = ids
        return self.client.post(URL, data, format='json')

    def commit(self, preview, ids, **kwargs):
        return self.client.post(URL, {
            'action': 'commit', 'preview_token': preview.data['preview_token'],
            'review_ids': ids, 'confirmed': True, **kwargs,
        }, format='json')

    @patch.dict('os.environ', ISOLATED_STAGING)
    def test_preview_does_not_write_selected_commit_preserves_source_and_employee(self):
        row1 = self.review(1)
        row2 = self.review(2, status='conflict')
        review = self.preview([row1.pk, row2.pk])
        self.assertEqual(review.status_code, 200, review.data)
        self.assertEqual(review.data['discardable_count'], 2)
        row1.refresh_from_db()
        self.assertEqual(row1.status, 'pending')
        self.assertEqual(AuditLog.objects.count(), 0)
        reply = self.commit(review, [row1.pk])
        self.assertEqual(reply.status_code, 200, reply.data)
        self.assertEqual(reply.data['discarded_count'], 1)
        row1.refresh_from_db()
        self.assertEqual(row1.status, 'discarded')
        self.assertEqual(row1.raw_payload, {'important_source_value': 'original 1'})
        self.assertEqual(row1.issues, ['center not matched'])
        self.assertEqual(row1.warnings, ['keep original import'])
        self.assertEqual(row1.employee_payload['name'], 'Synthetic employee 1')
        self.assertEqual(row1.resolved_by, self.admin)
        self.assertIsNotNone(row1.resolved_at)
        row2.refresh_from_db()
        self.assertEqual(row2.status, 'conflict')
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.name, 'Never touch this employee')
        self.assertEqual(Employee.objects.count(), 1)
        self.assertEqual(EmployeeImportReview.objects.count(), 2)
        self.assertTrue(AuditLog.objects.filter(
            action='bulk_discard_employee_import_review', record_id=str(row1.pk),
        ).exists())

    @patch.dict('os.environ', ISOLATED_STAGING)
    def test_all_scope_includes_database_pending_not_only_selected_or_visible(self):
        rows = [self.review(i) for i in (3, 4, 5)]
        self.review(6, status='discarded')
        self.review(7, status='activated')
        result = self.preview(selection='all')
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['discardable_count'], 3)
        self.assertEqual(result.data['blocked_count'], 0)
        self.assertEqual(len(result.data['discardable_ids']), 3)
        result2 = self.commit(result, [row.pk for row in rows])
        self.assertEqual(result2.status_code, 200, result2.data)
        self.assertEqual(result2.data['discarded_count'], 3)
        self.assertEqual(EmployeeImportReview.objects.filter(status='discarded').count(), 4)
        self.assertEqual(EmployeeImportReview.objects.filter(status='activated').count(), 1)
        self.assertEqual(Employee.objects.count(), 1)

    @patch.dict('os.environ', ISOLATED_STAGING)
    def test_confirmation_double_submit_stale_source_are_guarded(self):
        row1 = self.review(8)
        row2 = self.review(9)
        result = self.preview([row1.pk, row2.pk])
        self.assertEqual(self.commit(result, [row1.pk], confirmed=False).status_code, 400)
        row2.employee_payload = {**row2.employee_payload, 'name': 'Changed name'}
        row2.save()
        commit = self.commit(result, [row1.pk, row2.pk])
        self.assertEqual(commit.status_code, 200, commit.data)
        self.assertEqual(commit.data['discarded_count'], 1)
        self.assertEqual(commit.data['skipped_count'], 1)
        again = self.commit(result, [row1.pk])
        self.assertEqual(again.status_code, 200, again.data)
        self.assertEqual(again.data['discarded_count'], 0)
        self.assertEqual(EmployeeImportReview.objects.filter(status='discarded').count(), 1)
        self.assertEqual(AuditLog.objects.filter(
            action='bulk_discard_employee_import_review',
        ).count(), 1)

    @patch.dict('os.environ', ISOLATED_STAGING)
    def test_only_admin_unique_numeric_selections_and_signed_memberships(self):
        row = self.review(10)
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.preview([row.pk]).status_code, 403)
        self.client.force_authenticate(self.admin)
        for invalid in [[], ['10'], [True], [row.pk, row.pk], [0]]:
            self.assertEqual(self.preview(invalid).status_code, 400)
        result = self.preview([row.pk])
        self.assertEqual(self.commit(result, [row.pk, row.pk]).status_code, 400)
        self.assertEqual(self.commit(result, [999999]).status_code, 400)
        self.assertEqual(self.commit(result, [row.pk], preview_token='tampered').status_code, 409)
        self.assertEqual(EmployeeImportReview.objects.filter(status='discarded').count(), 0)

    @patch.dict('os.environ', ISOLATED_STAGING)
    def test_other_superuser_cannot_replay_preview(self):
        row = self.review(11)
        result = self.preview([row.pk])
        User = get_user_model()
        second = User.objects.create_superuser(
            username='another_bulk_admin', email='another-admin@example.invalid',
            password='test-not-real',
        )
        self.client.force_authenticate(second)
        self.assertEqual(self.commit(result, [row.pk]).status_code, 409)
        row.refresh_from_db()
        self.assertEqual(row.status, 'pending')

    def test_production_cannot_preview_or_commit_discard(self):
        row = self.review(12)
        with patch.dict('os.environ', {'STAGING_MODE': 'false', 'RAILWAY_PROJECT_ID': STAGING_PROJECT_ID}):
            self.assertEqual(self.preview([row.pk]).status_code, 403)
        with patch.dict('os.environ', {'STAGING_MODE': 'true', 'RAILWAY_PROJECT_ID': 'other-production-project'}):
            self.assertEqual(self.preview([row.pk]).status_code, 403)
        row.refresh_from_db()
        self.assertEqual(row.status, 'pending')
        self.assertEqual(Employee.objects.count(), 1)
