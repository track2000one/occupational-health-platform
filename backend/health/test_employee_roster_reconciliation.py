"""Synthetic-only tests for verified Excel restore/fill reconciliation."""
from datetime import date
from io import BytesIO

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from openpyxl import Workbook
from rest_framework.test import APIClient

from .models import (
    AuditLog, Employee, EmployeeArchiveEvent, EmployeeHealthCard,
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
        wb = Workbook()
        ws = wb.active
        ws.title = 'Employees'
        ws.append([
            'اسم الموظف', 'رقم الهوية / الإقامة', 'الرقم الوظيفي',
            'البريد الإلكتروني', 'الجنسية', 'المركز الصحي', 'تاريخ الميلاد',
        ])
        for row in rows:
            ws.append(row)
        file = BytesIO()
        wb.save(file)
        file.seek(0)
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
