"""Synthetic-only regression for V2 single-button Excel import and restoration."""
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from openpyxl import Workbook
from rest_framework.test import APIClient

from .models import (
    Employee, EmployeeArchiveEvent, EmployeeHealthProfile,
    EmployeeRegistryResetBatch, DataImportBatch,
)


class V2DirectApprovalTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.admin = user_model.objects.create_superuser(
            username='qa_direct_v2_admin', password='fake-only',
            email='v2-direct-qa@example.invalid',
        )
        self.staff = user_model.objects.create_user(
            username='qa_direct_v2_staff', password='fake-only', is_staff=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.url = '/api/employee-import-v2/preview/'
        archived_at = timezone.now()
        reason = 'QA synthetic registry reset'
        self.archived = Employee.objects.create(
            name='QA Original Record',
            national_id='1000004401',
            employee_number='QA-4401',
            is_archived=True, archived_at=archived_at,
            archive_reason=reason, employment_status='active',
            nationality='', date_of_birth=None, mobile='',
        )
        self.different = Employee.objects.create(
            name='QA Original Different',
            national_id='1000004402',
            employee_number='QA-4402',
            is_archived=True, archived_at=archived_at,
            archive_reason=reason, employment_status='active',
        )
        self.medical = EmployeeHealthProfile.objects.create(
            employee=self.archived, notes='Synthetic medical history stays unchanged',
        )
        EmployeeRegistryResetBatch.objects.create(
            employee_ids=[self.archived.pk, self.different.pk],
            applied_at=archived_at, reason=reason, created_by=self.admin,
        )
        book = Workbook()
        ws = book.active
        ws.title = 'Employees'
        ws.append(['اسم الموظف', 'رقم الهوية / الإقامة', 'الرقم الوظيفي',
                   'المركز الصحي', 'الجنسية'])
        ws.append(['QA Original Record', '1000004401', 'QA-4401', '', ''])
        ws.append(['QA Brand New', '1000004403', 'QA-4403', '', ''])
        ws.append(['QA Different Source', '1000004402', 'QA-4402', '', ''])
        data = BytesIO()
        book.save(data)
        self.raw = data.getvalue()

    def upload(self, action='preview', *, raw=None, **kwargs):
        file_upload = SimpleUploadedFile(
            'qa-direct.xlsx', self.raw if raw is None else raw,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        return self.client.post(self.url, {
            'action': action, 'file': file_upload,
            'sheet_name': 'Employees', **kwargs,
        }, format='multipart')

    def signed_fields(self, preview, **overrides):
        form = {
            'approval_token': preview.data['direct_approval']['approval_token'],
            'confirm_phrase': preview.data['direct_approval']['confirm_phrase'],
            'reason': 'Approve existing archived identity and new QA employee',
            'confirmed': 'true', 'identity_checked': 'true',
            'verified_current_employment': 'true',
            'verified_backup_restore': 'true',
            'hr_reference': 'HR-QA-VERIFIED-4401',
            'backup_reference': 'QA-RESTORE-TESTED-POSTGRESQL',
        }
        form.update(overrides)
        return form

    def test_default_gates_block_writes_but_optional_data_are_not_blockers(self):
        preview = self.upload()
        self.assertEqual(preview.status_code, 200, preview.data)
        direct = preview.data['direct_approval']
        self.assertEqual(direct['create'], 1)
        self.assertEqual(direct['fill'], 0)
        self.assertEqual(direct['restore_original'], 1)
        self.assertEqual(direct['needs_manual_review'], 1)
        self.assertFalse(direct['available'])
        self.assertGreater(direct['missing_optional_count'], 0)
        self.assertNotIn('1000004401', str(direct))
        denied = self.upload('approve_roster', **self.signed_fields(preview))
        self.assertEqual(denied.status_code, 403, denied.data)
        self.assertEqual(Employee.objects.count(), 2)
        self.assertTrue(self.archived.is_archived)
        self.assertFalse(DataImportBatch.objects.exists())
        self.assertFalse(EmployeeArchiveEvent.objects.exists())

    @override_settings(
        EMPLOYEE_IMPORT_V2_COMMIT_ENABLED=True,
        EMPLOYEE_V2_ARCHIVE_RESTORE_ENABLED=True,
    )
    def test_single_approval_imports_new_and_restores_original_without_erasing_history(self):
        preview = self.upload()
        self.assertTrue(preview.data['direct_approval']['available'])
        missing_backup = self.upload(
            'approve_roster', **self.signed_fields(preview, backup_reference=''),
        )
        self.assertEqual(missing_backup.status_code, 400, missing_backup.data)
        self.assertEqual(Employee.objects.count(), 2)
        approved = self.upload('approve_roster', **self.signed_fields(preview))
        self.assertEqual(approved.status_code, 200, approved.data)
        self.assertEqual(approved.data['created'], 1)
        self.assertEqual(approved.data['filled'], 0)
        self.assertEqual(approved.data['restored'], 1)
        self.assertEqual(approved.data['skipped'], 1)
        self.assertEqual(Employee.objects.count(), 3)
        self.archived.refresh_from_db()
        self.different.refresh_from_db()
        self.medical.refresh_from_db()
        self.assertFalse(self.archived.is_archived)
        self.assertTrue(self.different.is_archived)
        self.assertEqual(self.archived.name, 'QA Original Record')
        self.assertEqual(self.archived.national_id, '1000004401')
        self.assertIsNone(self.archived.date_of_birth)
        self.assertEqual(self.archived.nationality, '')
        self.assertEqual(self.medical.notes, 'Synthetic medical history stays unchanged')
        new = Employee.objects.get(national_id='1000004403')
        self.assertEqual(new.registration_status, 'provisional')
        self.assertIsNone(new.health_center)
        self.assertEqual(EmployeeArchiveEvent.objects.filter(
            employee=self.archived, action=EmployeeArchiveEvent.Action.RESTORE,
        ).count(), 1)
        self.assertEqual(DataImportBatch.objects.filter(mode='commit').count(), 1)
        replay = self.upload('approve_roster', **self.signed_fields(preview))
        self.assertEqual(replay.status_code, 409, replay.data)
        self.assertEqual(Employee.objects.count(), 3)
        self.assertEqual(EmployeeArchiveEvent.objects.count(), 1)

    @override_settings(
        EMPLOYEE_IMPORT_V2_COMMIT_ENABLED=True,
        EMPLOYEE_V2_ARCHIVE_RESTORE_ENABLED=True,
    )
    def test_changed_employment_and_other_user_fail_without_any_write(self):
        preview = self.upload()
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.upload('approve_roster',
                         **self.signed_fields(preview)).status_code, 403)
        self.client.force_authenticate(self.admin)
        self.archived.employment_status = 'retired'
        self.archived.save(update_fields=['employment_status'])
        change = self.upload('approve_roster', **self.signed_fields(preview))
        self.assertEqual(change.status_code, 409, change.data)
        self.assertEqual(Employee.objects.count(), 2)
        self.archived.refresh_from_db()
        self.assertTrue(self.archived.is_archived)
        self.assertFalse(DataImportBatch.objects.exists())
        self.assertFalse(EmployeeArchiveEvent.objects.exists())
