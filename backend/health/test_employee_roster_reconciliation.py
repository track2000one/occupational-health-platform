"""Synthetic-only tests for verified Excel restore/fill reconciliation."""
from datetime import date
from io import BytesIO

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from openpyxl import Workbook
from rest_framework.test import APIClient

from .models import (
    AuditLog, Employee, EmployeeArchiveEvent, EmployeeExcelMatchReview, EmployeeHealthCard,
    EmployeeProfileCompletionEvent, EmployeeRegistryResetBatch, HealthCenter,
)

ROUTE = '/api/employee-roster/reconcile/'


class EmployeeRosterReconciliationTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_superuser(
            username='qa_reconcile_excel_admin', email='qa-reconcile-excel@example.invalid',
            password='synthetic-test-secret',
        )
        self.staff = User.objects.create_user(
            username='qa_reconcile_excel_staff', password='synthetic-test-secret',
            is_staff=True,
        )
        self.center = HealthCenter.objects.create(
            name='Synthetic Existing Center', code='QA-RECONCILE-001', is_active=True,
        )
        self.stamp = timezone.now()
        self.old = Employee.objects.create(
            name='QA Archived One', national_id='9999930001',
            is_archived=True, archived_at=self.stamp,
            health_center=self.center, job_title='Existing Job',
        )
        self.archived_unchanged = Employee.objects.create(
            name='QA Archived Two', national_id='9999930002',
            is_archived=True, archived_at=self.stamp,
            employee_number='QA-ARCH2',
        )
        self.active = Employee.objects.create(
            name='QA Active Three', national_id='9999930003',
            employee_number='QA-ACT3',
        )
        self.manual = Employee.objects.create(
            name='QA Manual Four', national_id='9999930004',
            is_archived=True, archived_at=self.stamp,
        )
        self.name_conflict = Employee.objects.create(
            name='QA Original Five', national_id='9999930005',
            is_archived=True, archived_at=self.stamp,
        )
        self.unique_conflict = Employee.objects.create(
            name='QA Unique Six', national_id='9999930006',
            is_archived=True, archived_at=self.stamp,
            employee_number='QA-KEEP6',
        )
        self.health = EmployeeHealthCard.objects.create(
            employee=self.old, data={'qa': 'existing health data'},
        )
        self.batch = EmployeeRegistryResetBatch.objects.create(
            employee_ids=[self.old.pk, self.archived_unchanged.pk,
                          self.name_conflict.pk, self.unique_conflict.pk],
            created_by=self.admin, reason='synthetic bulk reset of test employees only',
            applied_at=self.stamp,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def spreadsheet(self, rows):
        # XLSX ZIP timestamps are nondeterministic when created on each call.
        # Keep the very same source bytes for preview/commit/review in a test,
        # exactly as a real user does by re-uploading one unchanged workbook.
        if not hasattr(self, '_workbook_cache'):
            self._workbook_cache = {}
        key = repr(rows)
        if key not in self._workbook_cache:
            wb = Workbook()
            ws = wb.active
            ws.title = 'Employees'
            ws.append([
                'اسم الموظف', 'رقم الهوية / الإقامة', 'الرقم الوظيفي',
                'البريد الإلكتروني', 'الجنسية', 'المركز الصحي', 'تاريخ الميلاد',
            ])
            for row in rows:
                ws.append(row)
            buffer = BytesIO()
            wb.save(buffer)
            self._workbook_cache[key] = buffer.getvalue()
        file = BytesIO(self._workbook_cache[key])
        file.name = 'synthetic-employee-master.xlsx'
        return file

    @staticmethod
    def row(name, identity, number='', email='', nationality='', dob=''):
        return [name, identity, number, email, nationality, '', dob]

    def upload(self, action, rows, **kwargs):
        payload = {
            'action': action, 'sheet_name': 'Employees',
            'file': self.spreadsheet(rows), **kwargs,
        }
        return self.client.post(ROUTE, payload, format='multipart')

    def standard_rows(self):
        return [
            self.row('QA Archived One', '9999930001', 'QA-NEW1',
                     'qa-one@example.invalid', 'السعودية', '1980-01-01'),
            self.row('QA Archived Two', '9999930002', 'QA-ARCH2'),
            self.row('QA Active Three', '9999930003', 'QA-ACT3', nationality='SA'),
            self.row('QA Manual Four', '9999930004'),
            self.row('QA Revised Five', '9999930005'),
            self.row('QA Unique Six', '9999930006', 'QA-NEW6'),
            self.row('QA Not Registered', '9999930007'),
        ]

    def test_preview_is_read_only_and_show_breakdown(self):
        response = self.upload('preview', self.standard_rows())
        self.assertEqual(response.status_code, 200, response.data)
        summary = response.data
        self.assertEqual(summary['total_rows'], 7)
        self.assertEqual(summary['eligible_count'], 3)
        self.assertEqual(summary['breakdown']['restore_and_fill'], 1)
        self.assertEqual(summary['breakdown']['restore_only'], 1)
        self.assertEqual(summary['breakdown']['fill_only'], 1)
        self.assertEqual(summary['breakdown']['individually_archived_requires_review'], 1)
        self.assertEqual(summary['breakdown']['name_mismatch'], 1)
        self.assertEqual(summary['breakdown']['unique_field_mismatch'], 1)
        self.assertEqual(summary['breakdown']['new_identity_requires_normal_import'], 1)
        self.assertEqual(summary['fill_field_counts']['nationality'], 2)
        self.assertNotIn('9999930001', str(summary))
        self.assertNotIn('qa-one@example.invalid', str(summary))
        self.old.refresh_from_db()
        self.assertTrue(self.old.is_archived)
        self.assertFalse(EmployeeProfileCompletionEvent.objects.exists())
        self.assertEqual(Employee.objects.count(), 6)

    def test_verified_commit_restores_and_fills_without_overwriting_or_medical_change(self):
        rows = self.standard_rows()
        preview = self.upload('preview', rows)
        self.assertEqual(preview.status_code, 200)
        data = preview.data
        result = self.upload(
            'commit', rows, preview_token=data['preview_token'],
            confirm_phrase=data['confirm_phrase'], confirmed='true',
            identity_checked='true', reason='Reviewed verified employee master and source records',
        )
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['restored'], 2)
        self.assertEqual(result.data['matched_and_updated'], 3)
        self.assertEqual(Employee.objects.count(), 6)
        self.old.refresh_from_db()
        self.archived_unchanged.refresh_from_db()
        self.active.refresh_from_db()
        self.manual.refresh_from_db()
        self.unique_conflict.refresh_from_db()
        self.name_conflict.refresh_from_db()
        self.assertFalse(self.old.is_archived)
        self.assertFalse(self.archived_unchanged.is_archived)
        self.assertTrue(self.manual.is_archived)
        self.assertTrue(self.name_conflict.is_archived)
        self.assertTrue(self.unique_conflict.is_archived)
        self.assertEqual(self.old.nationality, 'SA')
        self.assertEqual(self.old.employee_number, 'QA-NEW1')
        self.assertEqual(self.old.email, 'qa-one@example.invalid')
        self.assertEqual(self.old.date_of_birth, date(1980, 1, 1))
        self.assertEqual(self.old.job_title, 'Existing Job')
        self.assertEqual(self.old.health_center.pk, self.center.pk)
        self.assertEqual(self.active.nationality, 'SA')
        self.assertEqual(EmployeeArchiveEvent.objects.filter(
            action=EmployeeArchiveEvent.Action.RESTORE).count(), 2)
        self.assertEqual(EmployeeProfileCompletionEvent.objects.count(), 3)
        self.assertEqual(AuditLog.objects.filter(
            action='employee_excel_restore_and_fill_only').count(), 1)
        self.health.refresh_from_db()
        self.assertEqual(self.health.data, {'qa': 'existing health data'})

    def test_changed_workbook_or_registry_rejected(self):
        rows = self.standard_rows()
        data = self.upload('preview', rows).data
        args = {
            'preview_token': data['preview_token'],
            'confirm_phrase': data['confirm_phrase'], 'confirmed': 'true',
            'identity_checked': 'true',
            'reason': 'Valid documented reason for synthetic verification',
        }
        edited = list(rows)
        edited[-1] = self.row('QA Different Unknown', '9999930007')
        result = self.upload('commit', edited, **args)
        self.assertEqual(result.status_code, 409)
        self.old.job_title = 'Updated by another person'
        self.old.save(update_fields=['job_title', 'updated_at'])
        result = self.upload('commit', rows, **args)
        self.assertEqual(result.status_code, 409)
        self.old.refresh_from_db()
        self.assertTrue(self.old.is_archived)

    def test_commit_requires_confirmation_reason_identity_and_admin(self):
        rows = self.standard_rows()
        data = self.upload('preview', rows).data
        defaults = {
            'preview_token': data['preview_token'],
            'confirm_phrase': data['confirm_phrase'], 'confirmed': 'true',
            'identity_checked': 'true',
            'reason': 'Valid documented reason for synthetic verification',
        }
        for override in [
            {'confirmed': 'false'},
            {'identity_checked': 'false'},
            {'confirm_phrase': 'مطابقة 100 موظفًا'},
            {'reason': 'short'},
        ]:
            resp = self.upload('commit', rows, **{**defaults, **override})
            self.assertEqual(resp.status_code, 400, resp.data)
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.upload('preview', rows).status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.upload('preview', rows).status_code, (401, 403))
        self.assertEqual(Employee.objects.count(), 6)

    def test_name_mismatch_does_not_restore_archived_employee(self):
        rows = [self.row('A Different Person', '9999930001')]
        data = self.upload('preview', rows).data
        self.assertEqual(data['eligible_count'], 0)
        self.assertEqual(data['breakdown']['name_mismatch'], 1)
        result = self.upload('commit', rows,
                             preview_token=data['preview_token'],
                             confirm_phrase=data['confirm_phrase'],
                             reason='Synthetic review of mismatched employee identity',
                             confirmed='true', identity_checked='true')
        self.assertEqual(result.status_code, 409)
        self.old.refresh_from_db()
        self.assertTrue(self.old.is_archived)

    def test_compare_discrepancies_shows_source_and_registry_without_mutating(self):
        rows = self.standard_rows()
        preview = self.upload('preview', rows)
        self.assertEqual(preview.status_code, 200, preview.data)
        response = self.upload('review', rows, review_filter='name_mismatch', review_offset='0')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['mode'], 'review')
        self.assertEqual(response.data['total'], 1)
        record = response.data['rows'][0]
        self.assertEqual(record['registry_name'], 'QA Original Five')
        self.assertEqual(record['source_name'], 'QA Revised Five')
        self.assertEqual(record['national_id_masked'], '99••••0005')
        self.assertTrue(record['archived'])
        self.assertEqual(record['decision_status'], 'pending')
        self.assertNotIn('9999930005', str(response.data))
        self.assertNotIn('qa-one@example.invalid', str(response.data))
        self.assertEqual(response['Cache-Control'], 'private, no-store')
        self.name_conflict.refresh_from_db()
        self.assertTrue(self.name_conflict.is_archived)
        self.assertEqual(EmployeeExcelMatchReview.objects.count(), 0)

        archived = self.upload(
            'review', rows,
            review_filter='individually_archived_requires_review',
        )
        self.assertEqual(archived.status_code, 200, archived.data)
        self.assertEqual(archived.data['total'], 1)
        self.assertEqual(archived.data['rows'][0]['registry_name'], 'QA Manual Four')

        conflicts = self.upload('review', rows, review_filter='unique_field_mismatch')
        self.assertEqual(conflicts.status_code, 200, conflicts.data)
        self.assertEqual(conflicts.data['total'], 1)
        self.assertEqual(conflicts.data['rows'][0]['registry_employee_number'], 'QA-KEEP6')
        self.assertEqual(conflicts.data['rows'][0]['source_employee_number'], 'QA-NEW6')

    def test_arabic_vs_latin_names_are_a_separate_blocked_review_category(self):
        self.old.name = 'سعود عبدالله الشمري'
        self.old.save(update_fields=['name', 'updated_at'])
        source = [self.row('Saud Abdullah Alshammari', '9999930001')]

        preview = self.upload('preview', source)
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertEqual(preview.data['eligible_count'], 0)
        self.assertEqual(preview.data['breakdown']['name_different_scripts'], 1)
        self.assertEqual(preview.data['breakdown'].get('name_mismatch', 0), 0)
        self.assertEqual(Employee.objects.count(), 6)

        bilingual = self.upload(
            'review', source, review_filter='name_different_scripts',
        )
        self.assertEqual(bilingual.status_code, 200, bilingual.data)
        self.assertEqual(bilingual.data['total'], 1)
        comparison = bilingual.data['rows'][0]
        self.assertEqual(comparison['registry_name'], 'سعود عبدالله الشمري')
        self.assertEqual(comparison['source_name'], 'Saud Abdullah Alshammari')
        self.assertTrue(comparison['archived'])
        self.assertEqual(comparison['status'], 'name_different_scripts')

        ordinary = self.upload('review', source, review_filter='name_mismatch')
        self.assertEqual(ordinary.status_code, 200, ordinary.data)
        self.assertEqual(ordinary.data['total'], 0)
        blocked = self.upload('commit', source,
            preview_token=preview.data['preview_token'],
            confirm_phrase=preview.data['confirm_phrase'],
            reason='Synthetic test without independent bilingual identity verification',
            confirmed='true', identity_checked='true')
        self.assertEqual(blocked.status_code, 409, blocked.data)
        self.old.refresh_from_db()
        self.assertEqual(self.old.name, 'سعود عبدالله الشمري')
        self.assertTrue(self.old.is_archived)
        self.assertEqual(EmployeeArchiveEvent.objects.count(), 0)
        self.assertEqual(EmployeeProfileCompletionEvent.objects.count(), 0)

    def test_same_script_name_difference_still_requires_manual_review(self):
        self.old.name = 'QA Different Name'
        self.old.save(update_fields=['name', 'updated_at'])
        preview = self.upload('preview', [
            self.row('QA Archived One', '9999930001'),
        ])
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertEqual(preview.data['breakdown']['name_mismatch'], 1)
        self.assertEqual(preview.data['breakdown'].get('name_different_scripts', 0), 0)

    def test_evidenced_match_decision_does_not_restore_or_change_employee(self):
        rows = self.standard_rows()
        details = self.upload('review', rows, review_filter='name_mismatch')
        self.assertEqual(details.status_code, 200, details.data)
        token = details.data['rows'][0]['decision_token']
        response = self.upload(
            'review_decision', rows, decision_token=token, decision='verified',
            evidence_reference='QA-IDENTITY-CHECK-1001',
            reason='Reviewed independent personnel records and original registry name',
            confirmed='true',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['employee_modified'], False)
        record = EmployeeExcelMatchReview.objects.get()
        self.assertEqual(record.employee_id, self.name_conflict.pk)
        self.assertEqual(record.decision, 'verified')
        self.assertEqual(record.workbook_sha256.__len__(), 64)
        self.assertNotIn('QA Original Five', str(record.__dict__))
        self.name_conflict.refresh_from_db()
        self.assertTrue(self.name_conflict.is_archived)
        self.assertEqual(self.name_conflict.name, 'QA Original Five')
        self.assertEqual(Employee.objects.count(), 6)
        self.assertEqual(EmployeeArchiveEvent.objects.count(), 0)
        self.assertEqual(EmployeeProfileCompletionEvent.objects.count(), 0)
        self.assertEqual(self.health.data, {'qa': 'existing health data'})
        self.assertEqual(AuditLog.objects.filter(
            action='employee_excel_match_review_decision').count(), 1)
        updated = self.upload('review', rows, review_filter='name_mismatch')
        self.assertEqual(updated.data['rows'][0]['decision_status'], 'verified')
        repeated = self.upload(
            'review_decision', rows, decision_token=token, decision='not_verified',
            evidence_reference='QA-IDENTITY-CHECK-1002',
            reason='Verified source differs and followup is needed for correction',
            confirmed='true',
        )
        self.assertEqual(repeated.status_code, 409)
        self.assertEqual(EmployeeExcelMatchReview.objects.count(), 1)

    def test_match_decision_requires_evidence_authorization_and_fresh_registry(self):
        rows = self.standard_rows()
        data = self.upload('review', rows, review_filter='name_mismatch').data
        token = data['rows'][0]['decision_token']
        valid = {
            'decision_token': token,
            'decision': 'not_verified',
            'evidence_reference': 'QA-IDENTITY-REVIEW-124',
            'reason': 'Need independent clarification of differing official staff names',
            'confirmed': 'true',
        }
        for override in [
            {'confirmed': 'false'},
            {'evidence_reference': 'x'},
            {'reason': 'short'},
            {'decision': 'unknown'},
        ]:
            response = self.upload('review_decision', rows, **{**valid, **override})
            self.assertEqual(response.status_code, 400, response.data)
        changed_rows = list(rows)
        changed_rows[4] = self.row('QA Changed Input Five', '9999930005')
        invalid_file = self.upload('review_decision', changed_rows, **valid)
        self.assertEqual(invalid_file.status_code, 409)
        self.name_conflict.job_title = 'Someone corrected the registry after review'
        self.name_conflict.save(update_fields=['job_title', 'updated_at'])
        changed_record = self.upload('review_decision', rows, **valid)
        self.assertEqual(changed_record.status_code, 409, changed_record.data)
        self.assertEqual(EmployeeExcelMatchReview.objects.count(), 0)
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.upload('review', rows).status_code, 403)
        self.assertEqual(self.upload('review_decision', rows, **valid).status_code, 403)
        self.assertEqual(Employee.objects.count(), 6)

    def test_review_discrepancies_are_paginated_instead_of_dumping_all_names(self):
        rows = []
        for num in range(27):
            employee_id = f'999994{num:04d}'
            Employee.objects.create(name=f'QA Original {num}', national_id=employee_id)
            rows.append(self.row(f'QA Incorrect {num}', employee_id))
        first = self.upload('review', rows, review_filter='name_mismatch', review_offset='0')
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(first.data['total'], 27)
        self.assertEqual(len(first.data['rows']), 25)
        second = self.upload('review', rows, review_filter='name_mismatch', review_offset='25')
        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(len(second.data['rows']), 2)
        self.assertEqual(self.upload('review', rows, review_offset='-1').status_code, 400)
        self.assertEqual(self.upload('review', rows, review_filter='secret').status_code, 400)
