"""Synthetic-only regression tests: temporary employee roster never mutates clinical data."""
from io import BytesIO
from datetime import date
import json

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from openpyxl import Workbook
from rest_framework.test import APIClient

from .models import (
    AuditLog, Employee, EmployeeRegistryResetBatch, HealthCenter, ProvisionalEmployeeImportBatch,
    ProvisionalEmployeeRosterRow, UserProfile,
)


class ProvisionalEmployeeRosterTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_superuser(
            username='qa_temp_admin', password='synthetic',
            email='qa-temp-admin@example.invalid',
        )
        self.data_entry = User.objects.create_user(
            username='qa_temp_data_entry', password='synthetic',
        )
        UserProfile.objects.create(user=self.data_entry, role='dataEntry')
        self.viewer = User.objects.create_user(username='qa_temp_viewer', password='synthetic')
        self.api = APIClient()
        self.api.force_authenticate(self.admin)
        Employee.objects.create(
            name='Original Match', national_id='1000000001',
            employee_number='ORIGINAL-1', is_archived=True,
            archive_reason='Synthetic archived record',
        )
        Employee.objects.create(
            name='Original Different Name', national_id='1000000002',
            is_archived=True, archive_reason='Synthetic archived record',
        )

    def workbook(self, rows=None):
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = 'Employees'
        sheet.append([
            'المركز الصحي', 'اسم الموظف', 'رقم الهوية / الإقامة',
            'الرقم الوظيفي', 'البريد الإلكتروني', 'رقم الجوال',
        ])
        for row in rows or [
            ('Test Center', 'Original Match', '1000000001', 'ORIGINAL-1', '', ''),
            ('Test Center', 'Source Mismatched', '1000000002', '', '', ''),
            ('Test Center', 'New Source Only', '1000000003', '', '', ''),
        ]:
            sheet.append(row)
        output = BytesIO()
        workbook.save(output)
        workbook.close()
        return output.getvalue()

    def upload(self, raw=None):
        return self.api.post('/api/provisional-employees/import/', {
            'file': SimpleUploadedFile(
                'synthetic-employees.xlsx', raw or self.workbook(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ),
        }, format='multipart')

    def test_one_upload_creates_only_encrypted_temporary_cards(self):
        response = self.upload()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['total'], 3)
        self.assertEqual(response.data['counts']['name_match'], 1)
        self.assertEqual(response.data['counts']['name_review'], 1)
        self.assertEqual(response.data['counts']['not_in_registry'], 1)
        self.assertEqual(Employee.objects.count(), 2)
        self.assertTrue(Employee.objects.filter(pk__in=[1, 2], is_archived=True).count() <= 2)
        self.assertEqual(ProvisionalEmployeeRosterRow.objects.count(), 3)
        row = ProvisionalEmployeeRosterRow.objects.get(source_row=2)
        self.assertNotIn('1000000001', row.sealed_payload)
        self.assertNotIn('Original Match', row.sealed_payload)
        self.assertEqual(response['Cache-Control'], 'private, no-store')

        listing = self.api.get('/api/provisional-employees/')
        self.assertEqual(listing.status_code, 200, listing.data)
        self.assertEqual(listing.data['total'], 3)
        self.assertEqual(listing.data['items'][0]['masked_id'], '10••••0001')
        self.assertNotIn('1000000001', json.dumps(listing.data, ensure_ascii=False))
        self.assertTrue(all(item['temporary_only'] for item in listing.data['items']))

    def test_upload_same_file_is_idempotent(self):
        raw = self.workbook()
        self.assertEqual(self.upload(raw).status_code, 201)
        repeated = self.upload(raw)
        self.assertEqual(repeated.status_code, 200)
        self.assertTrue(repeated.data['already_imported'])
        self.assertEqual(ProvisionalEmployeeImportBatch.objects.count(), 1)
        self.assertEqual(ProvisionalEmployeeRosterRow.objects.count(), 3)
        self.assertEqual(Employee.objects.count(), 2)

    def test_duplicate_and_bad_ids_rejected_without_partial_data(self):
        bad = self.workbook([
            ('Center', 'One', '1000000001', '', '', ''),
            ('Center', 'Two', '1000000001', '', '', ''),
        ])
        result = self.upload(bad)
        self.assertEqual(result.status_code, 400)
        self.assertEqual(ProvisionalEmployeeRosterRow.objects.count(), 0)
        masked = self.workbook([('Center', 'One', '10••••0001', '', '', '')])
        self.assertEqual(self.upload(masked).status_code, 400)
        self.assertEqual(Employee.objects.count(), 2)

    def test_permissions_and_safe_search(self):
        self.assertEqual(self.upload().status_code, 201)
        self.api.force_authenticate(self.viewer)
        self.assertEqual(self.api.get('/api/provisional-employees/').status_code, 403)
        self.assertEqual(self.upload().status_code, 403)
        self.api.force_authenticate(self.data_entry)
        self.assertEqual(self.api.get('/api/provisional-employees/').status_code, 200)
        self.assertEqual(self.upload().status_code, 403)
        self.assertEqual(self.api.get('/api/provisional-employees/?search=1000000001').status_code, 400)
        self.assertEqual(self.api.get('/api/provisional-employees/?search=Mismatched').data['total'], 1)

    def test_safe_lookup_does_not_expose_original_id_or_activate(self):
        self.upload()
        result = self.api.post('/api/provisional-employees/lookup/',
                               {'national_id': '1000000001'}, format='json')
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['original_record'], 'archived')
        self.assertTrue(result.data['temporary_match'])
        self.assertFalse(result.data['clinical_link_allowed_from_temporary'])
        self.assertNotIn('1000000001', json.dumps(result.data))

    def test_data_entry_fills_missing_field_only_and_never_changes_employee(self):
        self.upload()
        row = ProvisionalEmployeeRosterRow.objects.get(source_row=3)
        self.api.force_authenticate(self.data_entry)
        url = f'/api/provisional-employees/{row.pk}/complete/'
        payload = {'identity_checked': True,
                   'reason': 'Synthetic verified identification during administrative visit',
                   'fields': {'mobile': '0500000000'}}
        result = self.api.post(url, payload, format='json')
        self.assertEqual(result.status_code, 200, result.data)
        self.assertNotIn('mobile', result.data['item']['missing_optional'])
        self.assertEqual(Employee.objects.count(), 2)
        self.assertTrue(Employee.objects.get(national_id='1000000002').is_archived)
        second = self.api.post(url, payload, format='json')
        self.assertEqual(second.status_code, 409)
        self.assertTrue(AuditLog.objects.filter(action='provisional_employee_roster_completed').exists())

    def test_batch_remove_only_deletes_temporary_rows(self):
        result = self.upload()
        batch_id = result.data['batch_id']
        remove = self.api.post(
            f'/api/provisional-employees/batches/{batch_id}/remove/',
            {'confirmed': True, 'reason': 'Synthetic administrative rollback requested'},
            format='json',
        )
        self.assertEqual(remove.status_code, 200, remove.data)
        self.assertEqual(ProvisionalEmployeeRosterRow.objects.count(), 0)
        self.assertEqual(Employee.objects.count(), 2)
        self.assertEqual(Employee.objects.filter(is_archived=True).count(), 2)


    def test_full_1423_row_roster_import_and_repeat_are_safe(self):
        """Large synthetic workbook covers the real expected batch size, never real PII."""
        rows = []
        for n in range(1, 1424):
            label = ('Original Match' if n == 1
                     else 'Source Mismatched' if n == 2
                     else f'Synthetic Workforce Person {n:04d}')
            number = 'ORIGINAL-1' if n == 1 else ''
            rows.append((
                'Synthetic Center', label, str(1000000000 + n),
                number, '', '',
            ))
        original_count = Employee.objects.count()
        raw = self.workbook(rows)
        response = self.upload(raw)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['total'], 1423)
        self.assertEqual(response.data['counts']['name_match'], 1)
        self.assertEqual(response.data['counts']['name_review'], 1)
        self.assertEqual(response.data['counts']['not_in_registry'], 1421)
        self.assertEqual(Employee.objects.count(), original_count)
        self.assertEqual(Employee.objects.filter(is_archived=True).count(), original_count)
        self.assertEqual(ProvisionalEmployeeRosterRow.objects.count(), 1423)
        page = self.api.get('/api/provisional-employees/')
        self.assertEqual(page.status_code, 200)
        self.assertEqual(page.data['total'], 1423)
        self.assertEqual(len(page.data['items']), 24)
        self.assertNotIn('1000000001', json.dumps(page.data))
        repeated = self.upload(raw)
        self.assertEqual(repeated.status_code, 200)
        self.assertTrue(repeated.data['already_imported'])
        self.assertEqual(ProvisionalEmployeeImportBatch.objects.count(), 1)
        self.assertEqual(ProvisionalEmployeeRosterRow.objects.count(), 1423)


    def test_approval_readiness_is_privacy_safe_and_read_only(self):
        """Aggregate only; technical agreement must not cause restore/activation."""
        HealthCenter.objects.create(
            name='Test Center', name_ar='مركز اختباري',
            approval_status=HealthCenter.ApprovalStatus.APPROVED,
            is_active=True, is_archived=False,
        )
        upload = self.upload()
        self.assertEqual(upload.status_code, 201, upload.data)
        before_employee_count = Employee.objects.count()
        before_audit_count = AuditLog.objects.count()

        readiness = self.api.get('/api/provisional-employees/readiness/')
        self.assertEqual(readiness.status_code, 200, readiness.data)
        self.assertEqual(readiness['Cache-Control'], 'private, no-store')
        report = readiness.data
        self.assertEqual(report['mode'], 'provisional_final_approval_readiness_read_only')
        self.assertEqual(report['rows_scanned'], 3)
        self.assertEqual(report['rows_total'], 3)
        self.assertEqual(report['original_registry']['archived'], 2)
        self.assertEqual(report['original_registry']['no_original_record'], 1)
        self.assertEqual(report['original_registry']['active'], 0)
        self.assertEqual(report['source_name_matches_original'], 1)
        self.assertEqual(report['archived_active_name_match_for_review'], 1)
        self.assertEqual(report['approved_center_name_check']['approved_exact_unique'], 3)
        self.assertEqual(report['approved_center_name_check']['missing_in_file'], 0)
        self.assertEqual(report['source_classification']['name_match'], 1)
        self.assertEqual(report['source_classification']['name_review'], 1)
        self.assertEqual(report['source_classification']['not_in_registry'], 1)
        self.assertEqual(report['approved_count'], 0)
        self.assertFalse(report['clinical_activation_enabled_from_this_report'])
        self.assertFalse(report['modifies_employee_records'])
        self.assertFalse(report['modifies_clinical_records'])
        safe_json = json.dumps(report, ensure_ascii=False)
        for secret in ('1000000001', '1000000002', 'Original Match', 'Source Mismatched'):
            self.assertNotIn(secret, safe_json)
        self.assertEqual(Employee.objects.count(), before_employee_count)
        self.assertEqual(Employee.objects.filter(is_archived=True).count(), 2)
        self.assertEqual(AuditLog.objects.count(), before_audit_count)
        self.assertEqual(ProvisionalEmployeeRosterRow.objects.count(), 3)

    def test_readiness_reports_missing_centers_without_auto_guessing(self):
        self.assertEqual(self.upload().status_code, 201)
        response = self.api.get('/api/provisional-employees/readiness/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['approved_center_name_check']['approved_exact_unique'], 0)
        self.assertEqual(response.data['approved_center_name_check']['not_matched_to_approved'], 3)
        self.assertEqual(response.data['approved_count'], 0)
        self.api.force_authenticate(self.data_entry)
        denied = self.api.get('/api/provisional-employees/readiness/')
        self.assertEqual(denied.status_code, 403)
        self.assertEqual(denied['Cache-Control'], 'private, no-store')
        self.api.force_authenticate(self.viewer)
        self.assertEqual(self.api.get('/api/provisional-employees/readiness/').status_code, 403)

    def test_readiness_without_import_is_read_only(self):
        report = self.api.get('/api/provisional-employees/readiness/')
        self.assertEqual(report.status_code, 200)
        self.assertIsNone(report.data['batch_id'])
        self.assertEqual(report.data['approved_count'], 0)
        self.assertFalse(ProvisionalEmployeeImportBatch.objects.exists())


    def test_readiness_distinguishes_blank_imported_snapshot_from_original_registry(self):
        """Historical fields are counted, never copied, approved or returned as PII."""
        approved_center = HealthCenter.objects.create(
            name='Test Center', approval_status=HealthCenter.ApprovalStatus.APPROVED,
            is_active=True, is_archived=False,
        )
        Employee.objects.filter(national_id='1000000001').update(
            birth_place='Private Historical City',
            national_address='Private Historical Street',
            date_of_birth=date(1987, 1, 2),
            appointment_date=date(2010, 7, 1),
            health_center=approved_center,
            source_center_name='Historical label',
        )
        Employee.objects.filter(national_id='1000000002').update(
            birth_place='Unverified Private City',
        )
        self.assertEqual(self.upload().status_code, 201)
        before = list(Employee.objects.order_by('national_id').values(
            'national_id', 'is_archived', 'birth_place', 'health_center_id',
        ))
        result = self.api.get('/api/provisional-employees/readiness/')
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result['Cache-Control'], 'private, no-store')
        report = result.data
        historical = report['historical_values_for_missing_source']
        self.assertEqual(historical['same_name_review_only']['birth_place'], 1)
        self.assertEqual(historical['different_name_unverified']['birth_place'], 1)
        self.assertEqual(historical['blank_in_both_for_matching_name']['mobile'], 1)
        self.assertEqual(historical['same_name_review_only']['national_address'], 1)
        self.assertEqual(historical['same_name_review_only']['appointment_date'], 1)
        centers = report['official_center_directory']
        self.assertEqual(centers['active_approved_count'], 1)
        self.assertEqual(centers['original_linked_center'], 1)
        self.assertEqual(centers['original_linked_to_currently_approved_center'], 1)
        self.assertEqual(centers['original_source_center_text_available'], 1)
        self.assertTrue(report['source_headers_not_preserved'])
        self.assertEqual(report['approved_count'], 0)
        self.assertEqual(report['clinical_activation_enabled_from_this_report'], False)
        for secret in ('Private Historical City', 'Private Historical Street', '1000000001',
                       'Unverified Private City', 'Historical label'):
            self.assertNotIn(secret, json.dumps(report, ensure_ascii=False))
        self.assertEqual(before, list(Employee.objects.order_by('national_id').values(
            'national_id', 'is_archived', 'birth_place', 'health_center_id',
        )))


    def test_approval_plan_only_classifies_restore_candidates_without_mutations(self):
        """Existing bulk reset provenance is a technical screen, NOT final HR approval."""
        original = Employee.objects.get(national_id='1000000001')
        archived_at = timezone.now()
        original.archived_at = archived_at
        original.archive_reason = 'Verified synthetic bulk reset provenance'
        original.save(update_fields=['archived_at', 'archive_reason'])
        EmployeeRegistryResetBatch.objects.create(
            employee_ids=[str(original.pk)],
            reason='Verified synthetic bulk reset provenance',
            applied_at=archived_at,
            created_by=self.admin,
        )
        self.assertEqual(self.upload().status_code, 201)
        original_snapshot = list(Employee.objects.order_by('national_id').values(
            'pk', 'name', 'is_archived', 'employment_status', 'archive_reason', 'archived_at',
        ))
        result = self.api.get('/api/provisional-employees/approval-plan/')
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result['Cache-Control'], 'private, no-store')
        self.assertEqual(result.data['total_source_rows'], 3)
        self.assertEqual(result.data['total_scanned'], 3)
        self.assertEqual(result.data['counts']['technical_review_candidate'], 1)
        self.assertEqual(result.data['counts']['name_difference'], 1)
        self.assertEqual(result.data['counts']['missing_original'], 1)
        self.assertEqual(result.data['approved_employee_count'], 0)
        self.assertTrue(result.data['requires_tested_backup_before_archive_restore'])
        self.assertTrue(result.data['needs_independent_hr_verification'])
        self.assertEqual(result.data['original_records_modified'], 0)
        self.assertEqual(result.data['clinical_records_modified'], 0)
        self.assertEqual(result.data['items'][0]['masked_id'], '10••••0001')
        for secret in ('1000000001', '1000000002', '1000000003'):
            self.assertNotIn(secret, json.dumps(result.data))

        qualified = self.api.get(
            '/api/provisional-employees/approval-plan/?status=technical_review_candidate'
        )
        self.assertEqual(qualified.status_code, 200)
        self.assertEqual(qualified.data['filtered_count'], 1)
        self.assertEqual(len(qualified.data['items']), 1)
        self.assertFalse(qualified.data['items'][0]['is_approved_employee'])
        self.assertEqual(qualified.data['items'][0]['source_row'], 2)
        self.assertEqual(original_snapshot, list(Employee.objects.order_by('national_id').values(
            'pk', 'name', 'is_archived', 'employment_status', 'archive_reason', 'archived_at',
        )))

    def test_approval_plan_is_admin_only_validates_filters_and_never_restores(self):
        self.assertEqual(self.upload().status_code, 201)
        response = self.api.get('/api/provisional-employees/approval-plan/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['counts']['archive_provenance_review'], 1)
        self.assertEqual(response.data['counts']['name_difference'], 1)
        self.assertEqual(response.data['counts']['missing_original'], 1)
        self.assertEqual(response.data['approved_employee_count'], 0)
        self.assertEqual(self.api.get('/api/provisional-employees/approval-plan/?page=abc').status_code, 400)
        self.assertEqual(self.api.get('/api/provisional-employees/approval-plan/?page=101').status_code, 400)
        self.assertEqual(self.api.get('/api/provisional-employees/approval-plan/?status=not-a-status').status_code, 400)
        self.api.force_authenticate(self.data_entry)
        self.assertEqual(self.api.get('/api/provisional-employees/approval-plan/').status_code, 403)
        self.api.force_authenticate(self.viewer)
        self.assertEqual(self.api.get('/api/provisional-employees/approval-plan/').status_code, 403)
        self.assertEqual(Employee.objects.filter(is_archived=True).count(), 2)

    def test_approval_plan_rechecks_modified_archive_state(self):
        """Stale imported class labels never determine approval eligibility alone."""
        archived_at = timezone.now()
        original = Employee.objects.get(national_id='1000000001')
        original.archived_at = archived_at
        original.archive_reason = 'Synthetic bulk reason'
        original.save(update_fields=['archive_reason', 'archived_at'])
        EmployeeRegistryResetBatch.objects.create(
            employee_ids=[str(original.pk)],
            reason='Synthetic bulk reason',
            applied_at=archived_at,
            created_by=self.admin,
        )
        self.assertEqual(self.upload().status_code, 201)
        start = self.api.get('/api/provisional-employees/approval-plan/')
        self.assertEqual(start.data['counts']['technical_review_candidate'], 1)
        original.employment_status = Employee.EmploymentStatus.RETIRED
        original.save(update_fields=['employment_status'])
        rechecked = self.api.get('/api/provisional-employees/approval-plan/')
        self.assertEqual(rechecked.data['counts']['technical_review_candidate'], 0)
        self.assertEqual(rechecked.data['counts']['not_active_employment'], 1)
        self.assertEqual(Employee.objects.get(pk=original.pk).is_archived, True)
