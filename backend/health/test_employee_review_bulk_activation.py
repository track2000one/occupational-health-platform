"""QA-only verification of selected/all employee import activation.

No real employee details are used; preview must not write. Only confirmed
staging batches may add employees with valid identity/center information.
"""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import AuditLog, Employee, EmployeeImportReview, HealthCenter
from .employee_review_bulk_activation import STAGING_PROJECT_ID

URL = '/api/employee-import-reviews/bulk-activate/'
STAGING_ENV = {'STAGING_MODE': 'true', 'RAILWAY_PROJECT_ID': STAGING_PROJECT_ID}


class StagingEmployeeBulkActivationTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_superuser(
            username='bulk_import_qa_admin', email='admin@example.invalid',
            password='fake-qa-password',
        )
        self.staff = User.objects.create_user(
            username='bulk_import_qa_staff', is_staff=True, password='fake-qa-password',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.center = HealthCenter.objects.create(
            name='مركز صحة QA تجريبي', name_ar='المركز التجريبي',
            code='QA-BULK-001', is_active=True,
        )
        self.other = HealthCenter.objects.create(
            name='مركز QA آخر', code='QA-BULK-002', is_active=True,
        )
        self.inactive = HealthCenter.objects.create(
            name='مركز تجريبي غير نشط', code='QA-BULK-003', is_active=False,
        )

    def review(self, idx, **overrides):
        payload = {
            'name': f'موظف وهمي {idx}',
            'national_id': f'9998{idx:06d}',
            'health_center_name': 'المركز التجريبي',
            'nationality': 'السعودية',
            'email': f'qa.{idx}@example.invalid',
            'job_title': 'فني تجريبي',
            'date_of_birth': '1987-02-28',
            'appointment_date': '2020-01-01',
        }
        payload.update(overrides)
        return EmployeeImportReview.objects.create(
            source_file='synthetic-only.xlsx', source_row=idx,
            fingerprint=f'{idx:064x}', employee_payload=payload,
            status='pending', issues=['Invalid nationality'],
        )

    def preview(self, ids=None, scope='selected'):
        data = {'action': 'preview', 'selection': scope}
        if ids is not None:
            data['review_ids'] = ids
        return self.client.post(URL, data, format='json')

    def commit(self, preview, ids, **overrides):
        data = {
            'action': 'commit', 'preview_token': preview.data['preview_token'],
            'review_ids': ids, 'confirmed': True,
        }
        data.update(overrides)
        return self.client.post(URL, data, format='json')

    @patch.dict('os.environ', STAGING_ENV)
    def test_preview_never_activates_reviews_and_selected_can_commit(self):
        first, second = self.review(1), self.review(2)
        preview = self.preview([first.pk, second.pk])
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertEqual(preview.data['selected_count'], 2)
        self.assertEqual(preview.data['eligible_count'], 2, preview.data)
        self.assertEqual(Employee.objects.count(), 0)
        response = self.commit(preview, [first.pk])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['created_count'], 1)
        employee = Employee.objects.get(national_id='9998000001')
        self.assertEqual(employee.health_center_id, self.center.pk)
        self.assertEqual(employee.nationality, 'SA')
        self.assertEqual(employee.job_title, 'فني تجريبي')
        first.refresh_from_db()
        self.assertEqual(first.status, 'activated')
        self.assertIsNotNone(first.activated_employee_id)
        self.assertTrue(AuditLog.objects.filter(
            action='bulk_activate_employee_review', record_id=str(first.pk),
        ).exists())
        self.assertFalse(Employee.objects.filter(national_id='9998000002').exists())
        second.refresh_from_db()
        self.assertEqual(second.status, 'pending')
        response2 = self.commit(preview, [second.pk])
        self.assertEqual(response2.status_code, 200, response2.data)
        self.assertEqual(response2.data['created_count'], 1)
        self.assertEqual(Employee.objects.count(), 2)

    @patch.dict('os.environ', STAGING_ENV)
    def test_select_all_blocks_missing_or_ambiguous_centers_and_invalid_identity(self):
        good = self.review(3)
        missing = self.review(4, health_center_name='لا يوجد مركز')
        invalid = self.review(5, national_id='123')
        first_bad = self.review(6, national_id='9998000003')
        self.review(7, health_center_name='مركز تجريبي غير نشط')
        result = self.preview(scope='all')
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['selected_count'], 5)
        self.assertEqual(result.data['eligible_count'], 0, result.data)
        self.assertEqual(result.data['blocked_count'], 5)
        reasons = {x['reason'] for x in result.data['blocked_reasons']}
        self.assertIn('missing_center', reasons)
        self.assertIn('invalid_identity', reasons)
        self.assertIn('identity_repeated', reasons)
        self.assertEqual(Employee.objects.count(), 0)

    @patch.dict('os.environ', STAGING_ENV)
    def test_incorrect_optional_data_skipped_but_core_data_activated(self):
        row = self.review(
            8, nationality='not-country', email='bad-email',
            appointment_date='1448/01/01', date_of_birth='future date',
            job_title='وظيفة سليمة',
        )
        preview = self.preview([row.pk])
        response = self.commit(preview, [row.pk])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['created_count'], 1, response.data)
        employee = Employee.objects.get(national_id='9998000008')
        self.assertEqual(employee.job_title, 'وظيفة سليمة')
        self.assertIsNone(employee.date_of_birth)
        self.assertIsNone(employee.appointment_date)
        self.assertEqual(employee.nationality, '')
        self.assertIsNone(employee.email)
        row.refresh_from_db()
        self.assertIn('nationality', ' '.join(row.warnings))
        self.assertEqual(row.employee_payload['_original_import_payload']['nationality'], 'not-country')

    @patch.dict('os.environ', STAGING_ENV)
    def test_confirmation_and_snapshot_required_with_no_side_effects(self):
        row = self.review(9)
        preview = self.preview([row.pk])
        self.assertEqual(self.commit(preview, [row.pk], confirmed=False).status_code, 400)
        row.name = 'nothing'
        row.employee_payload = {**row.employee_payload, 'name': 'Updated QA name'}
        row.save()
        response = self.commit(preview, [row.pk])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['created_count'], 0)
        self.assertEqual(response.data['skipped_count'], 1)
        self.assertEqual(Employee.objects.count(), 0)

    @patch.dict('os.environ', STAGING_ENV)
    def test_duplicate_identity_already_in_database_is_blocked(self):
        row = self.review(10)
        Employee.objects.create(name='Other QA', national_id='9998000010', health_center=self.center)
        preview = self.preview([row.pk])
        self.assertEqual(preview.data['eligible_count'], 0)
        self.assertIn('identity_exists', [r['reason'] for r in preview.data['blocked_reasons']])
        self.assertEqual(Employee.objects.count(), 1)

    @patch.dict('os.environ', STAGING_ENV)
    def test_superuser_only_and_review_ids_validation(self):
        row = self.review(11)
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.preview([row.pk]).status_code, 403)
        self.client.force_authenticate(self.admin)
        for bad_ids in [[], ['11'], [True], [row.pk, row.pk], [0]]:
            response = self.preview(bad_ids)
            self.assertEqual(response.status_code, 400, response.data)
        result = self.preview([row.pk])
        self.assertEqual(self.commit(result, [row.pk, row.pk]).status_code, 400)
        self.assertEqual(Employee.objects.count(), 0)

    def test_production_and_other_project_reject_activation_even_preview(self):
        row = self.review(12)
        with patch.dict('os.environ', {'STAGING_MODE': 'false', 'RAILWAY_PROJECT_ID': STAGING_PROJECT_ID}):
            self.assertEqual(self.preview([row.pk]).status_code, 403)
        with patch.dict('os.environ', {'STAGING_MODE': 'true', 'RAILWAY_PROJECT_ID': 'production-elsewhere'}):
            self.assertEqual(self.preview([row.pk]).status_code, 403)
        self.assertEqual(Employee.objects.count(), 0)

    @patch.dict('os.environ', STAGING_ENV)
    def test_renamed_center_after_preview_does_not_assign_wrong_master(self):
        row = self.review(13)
        preview = self.preview([row.pk])
        self.assertEqual(preview.data['eligible_count'], 1)
        self.center.name_ar = 'اسم مركز تغير بعد المعاينة'
        self.center.save()
        response = self.commit(preview, [row.pk])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['created_count'], 0)
        self.assertEqual(response.data['skipped_count'], 1)
        self.assertEqual(Employee.objects.count(), 0)

    @patch.dict('os.environ', STAGING_ENV)
    def test_duplicate_optional_email_does_not_block_new_distinct_employee(self):
        row = self.review(14, email='existing@example.invalid',
                          current_job='QA front desk')
        Employee.objects.create(name='Synthetic existing employee',
                                national_id='9998999977',
                                email='existing@example.invalid',
                                health_center=self.center)
        preview = self.preview([row.pk])
        self.assertEqual(preview.data['eligible_count'], 1, preview.data)
        result = self.commit(preview, [row.pk])
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['created_count'], 1)
        new_employee = Employee.objects.get(national_id='9998000014')
        self.assertIsNone(new_employee.email)
        self.assertEqual(new_employee.current_job, 'QA front desk')
        self.assertEqual(Employee.objects.count(), 2)
