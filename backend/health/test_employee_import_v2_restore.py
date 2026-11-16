"""Only synthetic employees and clinical records in this regression suite."""
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from openpyxl import Workbook
from rest_framework.test import APIClient

from .models import (
    AuditLog, Employee, EmployeeArchiveEvent, EmployeeHealthProfile,
    EmployeeRegistryResetBatch,
)


class EmployeeV2SafeRestoreTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_superuser(
            username='qa_v2_recovery_admin',
            email='qa-v2-recovery-admin@example.invalid',
            password='synthetic-strong-password',
        )
        self.other = User.objects.create_user(
            username='qa_v2_recovery_staff', password='synthetic-password',
            is_staff=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.url = '/api/employee-import-v2/preview/'
        self.instant = timezone.now()
        self.reason = 'Synthetic bulk reset of active employees'
        self.employee = Employee.objects.create(
            name='QA Restore Existing',
            national_id='1000002911',
            employee_number='QA-2911',
            is_archived=True,
            archived_at=self.instant,
            archive_reason=self.reason,
            employment_status='active',
            nationality='', date_of_birth=None, mobile='',
        )
        self.medical = EmployeeHealthProfile.objects.create(
            employee=self.employee,
            notes='Synthetic clinical history must never be changed',
        )
        self.batch = EmployeeRegistryResetBatch.objects.create(
            employee_ids=[self.employee.pk],
            applied_at=self.instant, reason=self.reason,
            created_by=self.admin,
        )
        wb = Workbook()
        sheet = wb.active
        sheet.title = 'Employees'
        sheet.append([
            'اسم الموظف', 'رقم الهوية / الإقامة', 'الرقم الوظيفي',
            'المركز الصحي', 'الجنسية',
        ])
        sheet.append(['QA Restore Existing', '1000002911', 'QA-2911', '', ''])
        bio = BytesIO()
        wb.save(bio)
        self.raw_file = bio.getvalue()

    def upload(self, action, *, file_bytes=None, **kwargs):
        return self.client.post(self.url, {
            'action': action,
            'file': SimpleUploadedFile(
                'synthetic-staff.xlsx',
                file_bytes if file_bytes is not None else self.raw_file,
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ),
            'sheet_name': 'Employees',
            'selected_rows': '2',
            **kwargs,
        }, format='multipart')

    def confirmation(self, preview):
        return {
            'preview_token': preview.data['preview_token'],
            'confirm_phrase': preview.data['confirm_phrase'],
            'reason': 'Restore verified original synthetic employee identity',
            'hr_reference': 'HR-FAKE-TEST-2026-01',
            'backup_reference': 'QA-BACKUP-RESTORED-SYNTHETIC-2026',
            'verified_current_employment': 'true',
            'verified_backup_restore': 'true',
            'reviewed_original_identity': 'true',
            'confirmed': 'true',
        }

    @override_settings(EMPLOYEE_V2_ARCHIVE_RESTORE_ENABLED=False)
    def test_preview_has_no_write_and_production_gate_stays_closed(self):
        preview = self.upload('restore_preview')
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertEqual(preview.data['count'], 1)
        self.assertFalse(preview.data['restore_available'])
        self.assertEqual(preview.data['selected_rows_masked'][0]['identity_masked'],
                         '10••••2911')
        self.assertNotIn('1000002911', str(preview.data))
        self.assertEqual(preview['Cache-Control'], 'private, no-store')
        denied = self.upload('restore_commit', **self.confirmation(preview))
        self.assertEqual(denied.status_code, 403, denied.data)
        self.employee.refresh_from_db()
        self.assertTrue(self.employee.is_archived)
        self.assertEqual(EmployeeArchiveEvent.objects.count(), 0)
        self.assertEqual(AuditLog.objects.count(), 0)
        self.batch.refresh_from_db()
        self.assertIsNone(self.batch.restored_at)

    @override_settings(EMPLOYEE_V2_ARCHIVE_RESTORE_ENABLED=True)
    def test_only_explicit_reverified_original_is_restored_with_optional_gaps(self):
        preview = self.upload('restore_preview')
        self.assertTrue(preview.data['restore_available'])
        fields = self.confirmation(preview)
        invalid = self.upload('restore_commit', **{**fields, 'backup_reference': ''})
        self.assertEqual(invalid.status_code, 400)
        self.assertTrue(Employee.objects.get(pk=self.employee.pk).is_archived)
        invalid = self.upload('restore_commit', **{**fields, 'confirmed': 'false'})
        self.assertEqual(invalid.status_code, 400)
        good = self.upload('restore_commit', **fields)
        self.assertEqual(good.status_code, 200, good.data)
        self.assertEqual(good.data['restored'], 1)
        self.assertEqual(good.data['new_employees'], 0)
        self.assertEqual(good.data['overwritten_employee_fields'], 0)
        self.employee.refresh_from_db()
        self.assertFalse(self.employee.is_archived)
        self.assertEqual(self.employee.name, 'QA Restore Existing')
        self.assertEqual(self.employee.national_id, '1000002911')
        self.assertEqual(self.employee.employee_number, 'QA-2911')
        self.assertIsNone(self.employee.date_of_birth)
        self.assertEqual(self.employee.nationality, '')
        self.assertEqual(self.employee.mobile, '')
        self.assertEqual(Employee.objects.count(), 1)
        self.medical.refresh_from_db()
        self.assertEqual(
            self.medical.notes,
            'Synthetic clinical history must never be changed',
        )
        self.assertEqual(EmployeeArchiveEvent.objects.filter(
            employee=self.employee, action=EmployeeArchiveEvent.Action.RESTORE,
        ).count(), 1)
        self.assertEqual(AuditLog.objects.filter(
            action='employee_v2_evidenced_batch_restore',
            record_id=str(self.employee.pk),
        ).count(), 1)
        self.batch.refresh_from_db()
        self.assertIsNone(self.batch.restored_at)
        replay = self.upload('restore_commit', **fields)
        self.assertEqual(replay.status_code, 409, replay.data)
        self.assertEqual(EmployeeArchiveEvent.objects.count(), 1)

    @override_settings(EMPLOYEE_V2_ARCHIVE_RESTORE_ENABLED=True)
    def test_changed_file_or_unauthorized_user_cannot_restore(self):
        preview = self.upload('restore_preview')
        self.client.force_authenticate(self.other)
        self.assertEqual(self.upload('restore_preview').status_code, 403)
        self.assertEqual(self.upload('restore_commit', **self.confirmation(preview)).status_code, 403)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.upload('restore_preview', selected_rows='2,2').status_code, 400)
        self.assertEqual(self.upload('restore_preview', selected_rows='999').status_code, 409)
        self.employee.employment_status = 'retired'
        self.employee.save(update_fields=['employment_status'])
        denied = self.upload('restore_commit', **self.confirmation(preview))
        self.assertEqual(denied.status_code, 409, denied.data)
        self.employee.refresh_from_db()
        self.assertTrue(self.employee.is_archived)
        self.assertEqual(EmployeeArchiveEvent.objects.count(), 0)

    @override_settings(EMPLOYEE_V2_ARCHIVE_RESTORE_ENABLED=True)
    def test_name_disagreement_must_not_be_bulk_restored(self):
        wb = Workbook()
        ws = wb.active
        ws.title = 'Employees'
        ws.append(['اسم الموظف', 'رقم الهوية / الإقامة', 'الرقم الوظيفي',
                   'المركز الصحي', 'الجنسية'])
        ws.append(['QA Source Other Name', '1000002911', 'QA-2911', '', ''])
        bio = BytesIO()
        wb.save(bio)
        result = self.upload('restore_preview', file_bytes=bio.getvalue())
        self.assertEqual(result.status_code, 409, result.data)
        self.assertTrue(self.employee.is_archived)
        self.assertEqual(EmployeeArchiveEvent.objects.count(), 0)
