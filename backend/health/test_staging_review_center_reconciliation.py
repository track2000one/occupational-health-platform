"""Isolated reference-label reconciliation; no real employee data."""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import AuditLog, Employee, EmployeeImportReview, HealthCenter
from .staging_review_center_reconciliation import STAGING_PROJECT_ID

URL = '/api/employee-import-reviews/center-reconciliation/'
BULK_URL = '/api/employee-import-reviews/bulk-activate/'
ISOLATED_STAGING = {'STAGING_MODE': 'true', 'RAILWAY_PROJECT_ID': STAGING_PROJECT_ID}


class StagingCenterReconciliationTests(TestCase):
    def setUp(self):
        user_cls = get_user_model()
        self.admin = user_cls.objects.create_superuser(
            username='center_match_qa', email='center-admin@example.invalid',
            password='unused-qa-password',
        )
        self.staff = user_cls.objects.create_user(
            username='center_match_other', email='staff@example.invalid',
            password='unused-qa-password', is_staff=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.good_center = HealthCenter.objects.create(
            name='مركز افتراضي معتمد', name_ar='افتراضي', code='QA-CENTER-01',
            is_active=True,
        )
        self.inactive = HealthCenter.objects.create(
            name='مركز افتراضي غير نشط', code='QA-CENTER-02',
            is_active=False,
        )
        self.other_center = HealthCenter.objects.create(
            name='مركز افتراضي آخر', code='QA-CENTER-03', is_active=True,
        )

    def make_review(self, index, center_text='المركز من ملف قديم', name='موظف وهمي'):
        return EmployeeImportReview.objects.create(
            fingerprint=f'{index:064x}', source_file='qa-old.xlsx', source_row=index,
            status='pending', issues=['Health center does not match an active center'],
            employee_payload={
                'name': name, 'national_id': f'9997{index:06d}',
                'health_center_name': center_text, 'health_center': None,
                'job_title': 'وظيفة اختبارية',
            },
            raw_payload={'health_center': center_text, 'name': name},
        )

    def preview(self, name, target):
        return self.client.post(URL, {
            'action': 'preview', 'source_name': name,
            'target_center_id': target,
        }, format='json')

    def apply(self, preview, **override):
        return self.client.post(URL, {
            'action': 'commit', 'confirmed': True,
            'preview_token': preview.data['preview_token'], **override,
        }, format='json')

    @patch.dict('os.environ', ISOLATED_STAGING)
    def test_group_list_does_not_expose_identity_and_preview_is_read_only(self):
        one = self.make_review(1)
        two = self.make_review(2)
        self.make_review(3, center_text='اسم آخر', name='')
        result = self.client.get(URL)
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['unmatched_count'], 3)
        self.assertEqual(result.data['group_count'], 2)
        self.assertEqual(result.data['groups'][0]['count'], 2)
        self.assertEqual(result.data['missing_name_count'], 1)
        self.assertNotIn('national_id', str(result.data))
        preview = self.preview('المركز من ملف قديم', self.good_center.pk)
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertEqual(preview.data['affected_count'], 2)
        self.assertEqual(preview.data['with_name_and_identity'], 2)
        self.assertEqual(Employee.objects.count(), 0)
        one.refresh_from_db()
        self.assertIsNone(one.employee_payload['health_center'])

    @patch.dict('os.environ', ISOLATED_STAGING)
    def test_manual_confirm_maps_only_exact_label_without_employee_activation(self):
        first = self.make_review(4)
        other = self.make_review(5, center_text='آخر مستقل')
        p = self.preview('المركز من ملف قديم', self.good_center.pk)
        self.assertEqual(p.status_code, 200, p.data)
        result = self.apply(p)
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['mapped_count'], 1)
        self.assertEqual(Employee.objects.count(), 0)
        first.refresh_from_db()
        other.refresh_from_db()
        self.assertEqual(first.employee_payload['health_center'], self.good_center.pk)
        self.assertEqual(first.employee_payload['_source_center_before_mapping'], 'المركز من ملف قديم')
        self.assertEqual(first.raw_payload['health_center'], 'المركز من ملف قديم')
        self.assertIsNone(other.employee_payload['health_center'])
        self.assertEqual(AuditLog.objects.filter(action='staging_review_center_bulk_mapping').count(), 1)
        bulk = self.client.post(BULK_URL, {
            'action': 'preview', 'selection': 'all',
        }, format='json')
        self.assertEqual(bulk.status_code, 200, bulk.data)
        self.assertEqual(bulk.data['eligible_count'], 1)

    @patch.dict('os.environ', ISOLATED_STAGING)
    def test_missing_name_remains_unqualified_after_center_mapping(self):
        review = self.make_review(6, name='')
        preview = self.preview('المركز من ملف قديم', self.good_center.pk)
        self.assertEqual(preview.data['still_missing_basic_info'], 1)
        self.assertEqual(self.apply(preview).status_code, 200)
        result = self.client.post(BULK_URL, {
            'action': 'preview', 'selection': 'all',
        }, format='json')
        self.assertEqual(result.data['eligible_count'], 0, result.data)
        self.assertEqual(Employee.objects.count(), 0)
        review.refresh_from_db()
        self.assertEqual(review.employee_payload['name'], '')

    @patch.dict('os.environ', ISOLATED_STAGING)
    def test_snapshot_conflict_and_confirmation_prevent_changes(self):
        review = self.make_review(7)
        preview = self.preview('المركز من ملف قديم', self.good_center.pk)
        self.assertEqual(self.apply(preview, confirmed=False).status_code, 400)
        review.employee_payload = {**review.employee_payload, 'name': 'اسم آخر للتجربة'}
        review.save()
        self.assertEqual(self.apply(preview).status_code, 409)
        review.refresh_from_db()
        self.assertIsNone(review.employee_payload['health_center'])
        self.assertEqual(AuditLog.objects.count(), 0)

    @patch.dict('os.environ', ISOLATED_STAGING)
    def test_active_reference_and_admin_must_be_verified(self):
        self.make_review(8)
        self.assertEqual(self.preview('المركز من ملف قديم', self.inactive.pk).status_code, 400)
        self.assertEqual(self.preview('unknown center label', self.good_center.pk).status_code, 409)
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get(URL).status_code, 403)
        self.assertEqual(self.preview('المركز من ملف قديم', self.good_center.pk).status_code, 403)

    def test_production_never_exposes_mapping(self):
        self.make_review(9)
        with patch.dict('os.environ', {'STAGING_MODE': 'false', 'RAILWAY_PROJECT_ID': STAGING_PROJECT_ID}):
            self.assertEqual(self.client.get(URL).status_code, 403)
            self.assertEqual(self.preview('المركز من ملف قديم', self.good_center.pk).status_code, 403)
        self.assertEqual(Employee.objects.count(), 0)
