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
    ProvisionalEmployeeNumberCorrectionEvent,
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


    def test_conflict_diagnostics_reveals_field_not_other_identity(self):
        """Existing registry owner clashes and in-file duplicate fields remain private."""
        Employee.objects.filter(national_id='1000000001').update(
            email='private-owner@example.invalid',
        )
        raw = self.workbook([
            ('Center', 'Original Match', '1000000001', 'ORIGINAL-1', '', ''),
            ('Center', 'Other Source', '1000000002', 'ORIGINAL-1', 'SAME@EXAMPLE.INVALID', ''),
            ('Center', 'Third Source', '1000000003', '', 'same@example.invalid', ''),
            ('Center', 'Fourth Source', '1000000004', '', 'private-owner@example.invalid', ''),
        ])
        original_count = Employee.objects.count()
        result = self.upload(raw)
        self.assertEqual(result.status_code, 201, result.data)
        diagnosis = self.api.get('/api/provisional-employees/conflict-diagnostics/')
        self.assertEqual(diagnosis.status_code, 200, diagnosis.data)
        self.assertEqual(diagnosis['Cache-Control'], 'private, no-store')
        self.assertEqual(diagnosis.data['flagged_rows'], 3)
        self.assertEqual(diagnosis.data['clinical_or_employee_modified'], False)
        items = {item['source_row']: item for item in diagnosis.data['items']}
        self.assertEqual(set(items), {3, 4, 5})
        self.assertIn(
            'employee_number_used_by_different_registry_identity', items[3]['reason_codes']
        )
        self.assertIn('employee_number_repeated_in_excel', items[3]['reason_codes'])
        self.assertIn('email_repeated_in_excel', items[4]['reason_codes'])
        self.assertEqual(items[4]['other_excel_rows'], [3])
        self.assertIn(
            'email_used_by_different_registry_identity', items[5]['reason_codes']
        )
        content = json.dumps(diagnosis.data, ensure_ascii=False)
        for secret in (
            '1000000001', '1000000002', '1000000003', '1000000004',
            'private-owner@example.invalid', 'SAME@EXAMPLE.INVALID', 'ORIGINAL-1',
        ):
            self.assertNotIn(secret, content)
        self.assertEqual(Employee.objects.count(), original_count)
        self.assertEqual(Employee.objects.get(national_id='1000000001').email,
                         'private-owner@example.invalid')

    def test_conflict_diagnostics_access_and_stale_classification(self):
        self.assertEqual(self.upload(self.workbook([
            ('Center', 'Original Match', '1000000001', 'ORIGINAL-1', '', ''),
            ('Center', 'Other Source', '1000000002', 'ORIGINAL-1', '', ''),
        ])).status_code, 201)
        response = self.api.get('/api/provisional-employees/conflict-diagnostics/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['flagged_rows'], 1)
        self.assertIn('employee_number_repeated_in_excel',
                      response.data['items'][0]['reason_codes'])
        # Source rows are frozen at import time. Removing registry ownership
        # cannot clear a conflict between source rows from that snapshot.
        Employee.objects.filter(national_id='1000000001').update(employee_number=None)
        again = self.api.get('/api/provisional-employees/conflict-diagnostics/')
        self.assertEqual(again.data['flagged_rows'], 1)
        self.assertNotIn('employee_number_used_by_different_registry_identity',
                         again.data['items'][0]['reason_codes'])
        self.assertIn('employee_number_repeated_in_excel',
                      again.data['items'][0]['reason_codes'])
        self.api.force_authenticate(self.data_entry)
        self.assertEqual(self.api.get('/api/provisional-employees/conflict-diagnostics/').status_code, 403)
        self.api.force_authenticate(self.viewer)
        self.assertEqual(self.api.get('/api/provisional-employees/conflict-diagnostics/').status_code, 403)


    def test_edit_conflicting_employee_number_previews_then_commits_only_temporary_row(self):
        original = self.workbook([
            ('Center', 'Original Match', '1000000001', 'ORIGINAL-1', '', ''),
            ('Center', 'Original Different Name', '1000000002', 'ORIGINAL-1', '', ''),
        ])
        self.assertEqual(self.upload(original).status_code, 201)
        from .models import ProvisionalEmployeeRosterRow
        row = ProvisionalEmployeeRosterRow.objects.get(source_row=3)
        url = f'/api/provisional-employees/{row.pk}/employee-number-edit/'
        edit = self.api.get(url)
        self.assertEqual(edit.status_code, 200, edit.data)
        self.assertEqual(edit['Cache-Control'], 'private, no-store')
        self.assertEqual(edit.data['current_employee_number'], 'ORIGINAL-1')
        preview = self.api.post(url, {'action': 'preview', 'employee_number': 'NEW-002'}, format='json')
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertEqual(preview.data['status'], 'preview_only')
        self.assertEqual(preview.data['next_classification'], 'name_match')
        self.assertEqual(ProvisionalEmployeeRosterRow.objects.get(pk=row.pk).classification, 'identifier_review')
        self.assertEqual(Employee.objects.get(national_id='1000000002').employee_number, None)
        self.assertEqual(ProvisionalEmployeeNumberCorrectionEvent.objects.count(), 0)
        no_evidence = self.api.post(url, {
            'action': 'commit', 'employee_number': 'NEW-002',
            'preview_token': preview.data['preview_token'], 'confirmed': True,
            'verified_hr_document': False, 'reason': 'Synthetic HR number correction',
            'evidence_reference': 'HR-SYNTH-2026',
        }, format='json')
        self.assertEqual(no_evidence.status_code, 400)
        saved = self.api.post(url, {
            'action': 'commit', 'employee_number': 'NEW-002',
            'preview_token': preview.data['preview_token'], 'confirmed': True,
            'verified_hr_document': True, 'reason': 'Synthetic HR number correction',
            'evidence_reference': 'HR-SYNTH-2026',
        }, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertTrue(saved.data['saved'])
        self.assertFalse(saved.data['original_employee_modified'])
        self.assertFalse(saved.data['medical_records_modified'])
        self.assertNotIn('NEW-002', json.dumps(saved.data))
        row.refresh_from_db()
        self.assertEqual(row.classification, 'name_match')
        self.assertNotIn('NEW-002', row.sealed_payload)
        self.assertEqual(Employee.objects.get(national_id='1000000001').employee_number, 'ORIGINAL-1')
        self.assertIsNone(Employee.objects.get(national_id='1000000002').employee_number)
        self.assertTrue(Employee.objects.get(national_id='1000000002').is_archived)
        audit = ProvisionalEmployeeNumberCorrectionEvent.objects.get()
        self.assertEqual(audit.source_row, 3)
        self.assertEqual(audit.performed_by, self.admin)
        self.assertNotEqual(audit.old_number_digest, audit.new_number_digest)
        self.assertNotIn('ORIGINAL-1', str(audit.__dict__))
        self.assertNotIn('NEW-002', str(audit.__dict__))
        self.assertTrue(AuditLog.objects.filter(action='provisional_employee_number_corrected').exists())
        again = self.upload(original)
        self.assertEqual(again.status_code, 200)
        self.assertTrue(again.data['already_imported'])
        row.refresh_from_db()
        self.assertEqual(row.classification, 'name_match')
        diagnosed = self.api.get('/api/provisional-employees/conflict-diagnostics/')
        self.assertEqual(diagnosed.status_code, 200)
        self.assertEqual(diagnosed.data['flagged_rows'], 0)

    def test_number_editor_refuses_other_employee_or_excel_owners(self):
        raw = self.workbook([
            ('Center', 'Original Match', '1000000001', 'ORIGINAL-1', '', ''),
            ('Center', 'Other Source', '1000000002', 'ORIGINAL-1', '', ''),
            ('Center', 'Source Three', '1000000003', 'ANOTHER-3', '', ''),
        ])
        self.assertEqual(self.upload(raw).status_code, 201)
        row = ProvisionalEmployeeRosterRow.objects.get(source_row=3)
        url = f'/api/provisional-employees/{row.pk}/employee-number-edit/'
        self.assertEqual(self.api.post(url, {
            'action': 'preview', 'employee_number': 'ORIGINAL-1',
        }, format='json').status_code, 409)
        self.assertEqual(self.api.post(url, {
            'action': 'preview', 'employee_number': 'ANOTHER-3',
        }, format='json').status_code, 409)
        self.assertEqual(self.api.post(url, {
            'action': 'preview', 'employee_number': 'incorrect with spaces',
        }, format='json').status_code, 400)
        self.assertEqual(row.classification, 'identifier_review')
        self.api.force_authenticate(self.data_entry)
        self.assertEqual(self.api.get(url).status_code, 403)
        self.assertEqual(self.api.post(url, {
            'action': 'preview', 'employee_number': 'NEW-3',
        }, format='json').status_code, 403)
        self.api.force_authenticate(self.viewer)
        self.assertEqual(self.api.get(url).status_code, 403)
        self.assertEqual(Employee.objects.count(), 2)
        self.assertEqual(ProvisionalEmployeeNumberCorrectionEvent.objects.count(), 0)

    def test_number_editor_rejects_stale_preview_and_preserves_completion(self):
        self.assertEqual(self.upload(self.workbook([
            ('Center', 'Original Match', '1000000001', 'ORIGINAL-1', '', ''),
            ('Center', 'Different source', '1000000002', 'ORIGINAL-1', '', ''),
        ])).status_code, 201)
        row = ProvisionalEmployeeRosterRow.objects.get(source_row=3)
        url = f'/api/provisional-employees/{row.pk}/employee-number-edit/'
        preview = self.api.post(url, {'action': 'preview', 'employee_number': 'NEW-20'}, format='json')
        self.assertEqual(preview.status_code, 200, preview.data)
        completion = self.api.post(f'/api/provisional-employees/{row.pk}/complete/', {
            'identity_checked': True,
            'reason': 'Synthetic HR verification to update optional phone',
            'fields': {'mobile': '0550000200'},
        }, format='json')
        self.assertEqual(completion.status_code, 200, completion.data)
        save = self.api.post(url, {
            'action': 'commit', 'employee_number': 'NEW-20',
            'preview_token': preview.data['preview_token'],
            'confirmed': True, 'verified_hr_document': True,
            'reason': 'Synthetic corrected staff number',
            'evidence_reference': 'HR-REF-2026',
        }, format='json')
        self.assertEqual(save.status_code, 409, save.data)
        row.refresh_from_db()
        self.assertEqual(row.classification, 'identifier_review')
        self.assertEqual(ProvisionalEmployeeNumberCorrectionEvent.objects.count(), 0)
        self.assertEqual(Employee.objects.count(), 2)


    def test_name_comparison_categories_are_suggestions_not_identity_matches(self):
        from .provisional_employee_name_review import classify_name
        cases = (
            ('احمد محمد صالح', 'أحمد محمد صالح', 'format_variation'),
            ('صالح محمد أحمد', 'محمد احمد صالح', 'token_order_variation'),
            ('محمد صالح العتيبي', 'محمد بن صالح العتيبي', 'genealogy_particle_variation'),
            ('محمد صالح', 'محمد صالح العتيبي', 'incomplete_name'),
            ('عبدالرحمان محمد العتيبي', 'عبدالرحمن محمد العتيبي', 'minor_spelling_variation'),
            ('محمد صالح الحربي', 'محمد صالح الغامدي', 'substantial_difference'),
            ('محمد صالح', '', 'missing_original'),
        )
        for new, original, category in cases:
            with self.subTest(category=category):
                self.assertEqual(classify_name(new, original), category)

    def test_smart_name_review_only_compares_same_id_and_never_restores(self):
        Employee.objects.create(
            name='محمد أحمد صالح', national_id='1000000011',
            is_archived=True,
        )
        Employee.objects.create(
            name='محمد بن صالح العتيبي', national_id='1000000012',
            is_archived=True,
        )
        Employee.objects.create(
            name='عبدالرحمن محمد العتيبي', national_id='1000000013',
            is_archived=True,
        )
        Employee.objects.create(
            name='محمد صالح الغامدي', national_id='1000000014',
            is_archived=True,
        )
        raw = self.workbook([
            ('Test Center', 'صالح محمد أحمد', '1000000011', '', '', ''),
            ('Test Center', 'محمد صالح العتيبي', '1000000012', '', '', ''),
            ('Test Center', 'عبدالرحمان محمد العتيبي', '1000000013', '', '', ''),
            ('Test Center', 'محمد صالح الحربي', '1000000014', '', '', ''),
            ('Test Center', 'Original Match', '1000000001', 'ORIGINAL-1', '', ''),
        ])
        imported = self.upload(raw)
        self.assertEqual(imported.status_code, 201, imported.data)
        original_snapshot = list(Employee.objects.order_by('national_id').values(
            'pk', 'national_id', 'name', 'is_archived', 'employment_status',
        ))
        result = self.api.get('/api/provisional-employees/name-review/')
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result['Cache-Control'], 'private, no-store')
        self.assertEqual(result.data['mode'], 'provisional_employee_name_review_read_only')
        self.assertEqual(result.data['total_name_review_rows'], 4)
        self.assertEqual(result.data['category_counts']['token_order_variation'], 1)
        self.assertEqual(result.data['category_counts']['genealogy_particle_variation'], 1)
        self.assertEqual(result.data['category_counts']['minor_spelling_variation'], 1)
        self.assertEqual(result.data['category_counts']['substantial_difference'], 1)
        self.assertEqual(sum(result.data['category_counts'].values()), 4)
        self.assertEqual(result.data['auto_approved'], 0)
        self.assertFalse(result.data['original_employee_modified'])
        self.assertFalse(result.data['clinical_records_modified'])
        self.assertEqual([item['source_row'] for item in result.data['items']], [2, 3, 4, 5])
        for item in result.data['items']:
            self.assertTrue(item['requires_human_verification'])
            self.assertFalse(item['is_approved'])
            self.assertNotIn('national_id', item)
        for identity in ('1000000011', '1000000012', '1000000013', '1000000014'):
            self.assertNotIn(identity, json.dumps(result.data))
        filtered = self.api.get(
            '/api/provisional-employees/name-review/?category=substantial_difference'
        )
        self.assertEqual(filtered.status_code, 200, filtered.data)
        self.assertEqual(filtered.data['filtered_count'], 1)
        self.assertEqual(filtered.data['items'][0]['source_row'], 5)
        self.assertEqual(original_snapshot, list(Employee.objects.order_by('national_id').values(
            'pk', 'national_id', 'name', 'is_archived', 'employment_status',
        )))
        self.assertEqual(ProvisionalEmployeeRosterRow.objects.count(), 5)

    def test_smart_name_review_privacy_and_invalid_filters(self):
        self.assertEqual(self.upload().status_code, 201)
        self.assertEqual(self.api.get(
            '/api/provisional-employees/name-review/?page=not-an-integer'
        ).status_code, 400)
        self.assertEqual(self.api.get(
            '/api/provisional-employees/name-review/?category=auto_approve'
        ).status_code, 400)
        self.assertEqual(self.api.get(
            '/api/provisional-employees/name-review/?page=101'
        ).status_code, 400)
        self.api.force_authenticate(self.data_entry)
        self.assertEqual(self.api.get('/api/provisional-employees/name-review/').status_code, 403)
        self.api.force_authenticate(self.viewer)
        self.assertEqual(self.api.get('/api/provisional-employees/name-review/').status_code, 403)
        self.assertEqual(Employee.objects.filter(is_archived=True).count(), 2)
