"""Safe, synthetic provisional employee registration and clinic completion tests."""
from io import BytesIO
from datetime import date

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from openpyxl import Workbook
from rest_framework.test import APIClient

from .employee_roster_template import COLUMNS
from .importers import process_excel_import
from .models import (
    AuditLog, Employee, EmployeeImportReview, EmployeeProfileCompletionEvent,
    HealthCenter, ClinicVisit, UserProfile,
)


class ProvisionalRegistrationAndVisitTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_superuser(
            username='ci_provisional_admin',
            password='synthetic-ci-secret',
            email='synthetic-provisional@example.invalid',
        )
        self.viewer = User.objects.create_user(
            username='ci_provisional_viewer', password='synthetic-ci-secret',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.center = HealthCenter.objects.create(
            name='Synthetic Clinician Center', code='CI-CLINIC-PROV',
        )

    def upload(self, entries):
        book = Workbook()
        sheet = book.active
        sheet.title = 'Employees'
        sheet.append(list(COLUMNS))
        for idx, (name, nid, center, mobile) in enumerate(entries, start=1):
            row = [''] * len(COLUMNS)
            row[0], row[1], row[2], row[5] = center, name, nid, mobile
            sheet.append(row)
        output = BytesIO()
        book.save(output)
        book.close()
        return SimpleUploadedFile(
            'synthetic-provisional.xlsx', output.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )

    def test_missing_unmapped_center_and_invalid_optional_mobile_do_not_block_unique_identity(self):
        entries = [
            ('Synthetic Unmapped', '9998111001', 'Unverified source label', ''),
            ('Synthetic Missing', '9998111002', '', '0501234567'),
            ('Synthetic Invalid Mobile', '9998111003', '', 'abc'),
        ]
        preview = process_excel_import(
            self.upload(entries), sheet_name='Employees',
            employee_import_mode='template', commit=False, user=self.admin,
        )
        self.assertEqual(preview['summary']['new_ready'], 3)
        self.assertEqual(preview['summary']['provisional_ready'], 3)
        self.assertEqual(Employee.objects.count(), 0)
        committed = process_excel_import(
            self.upload(entries), sheet_name='Employees',
            employee_import_mode='template', commit=True, user=self.admin,
        )
        self.assertEqual(committed['summary']['imported_employees'], 3)
        self.assertEqual(committed['summary']['imported_provisional'], 3)
        self.assertEqual(Employee.objects.count(), 3)
        first = Employee.objects.get(national_id='9998111001')
        self.assertIsNone(first.health_center_id)
        self.assertEqual(first.source_center_name, 'Unverified source label')
        self.assertEqual(first.registration_status, 'provisional')
        self.assertFalse(Employee.objects.get(national_id='9998111003').mobile)
        review = EmployeeImportReview.objects.get(activated_employee=first)
        self.assertEqual(review.status, 'activated')
        self.assertTrue(review.issues)
        self.assertEqual(self.client.get('/api/employees/?completion=missing').data['count'], 3)
        found = self.client.get('/api/employees/?search=9998111001')
        self.assertEqual(found.status_code, 200)
        self.assertEqual(found.data['count'], 1)

    def test_duplicate_or_identity_invalid_records_never_create_staff(self):
        prior = Employee.objects.create(
            name='Previously Exists', national_id='9998111005', health_center=self.center,
        )
        entries = [
            ('Previously Exists', '9998111005', '', ''),
            ('No ID', '123', '', ''),
            ('New Valid', '9998111006', '', ''),
            ('Duplicate New', '9998111006', '', ''),
        ]
        result = process_excel_import(
            self.upload(entries), sheet_name='Employees',
            employee_import_mode='template', commit=True, user=self.admin,
        )
        self.assertEqual(result['summary']['imported_employees'], 1)
        self.assertEqual(result['summary']['imported_provisional'], 1)
        self.assertEqual(Employee.objects.count(), 2)
        prior.refresh_from_db()
        self.assertEqual(prior.health_center_id, self.center.pk)
        self.assertEqual(prior.name, 'Previously Exists')
        self.assertFalse(Employee.objects.filter(national_id='123').exists())

    def test_provisional_can_visit_only_after_identity_check(self):
        employee = Employee.objects.create(
            name='Synthetic Patient', national_id='9998111020',
            health_center=None, registration_status='provisional',
        )
        params = {
            'employee': employee.pk, 'visit_date': date.today().isoformat(),
            'clinic_type': 'Employee Clinic', 'diagnosis': 'CI-only synthetic visit',
            'status': 'open',
        }
        refused = self.client.post('/api/clinic-visits/', params, format='json')
        self.assertEqual(refused.status_code, 400)
        self.assertEqual(ClinicVisit.objects.count(), 0)
        passed = self.client.post('/api/clinic-visits/', {
            **params, 'identity_checked': True,
        }, format='json')
        self.assertEqual(passed.status_code, 201, passed.data)
        self.assertEqual(ClinicVisit.objects.count(), 1)
        self.assertEqual(passed.data['health_center_name'], '')
        employee.refresh_from_db()
        self.assertIsNone(employee.health_center_id)

    def test_clinic_time_completion_assigns_first_center_and_maintains_audit(self):
        employee = Employee.objects.create(
            name='Synthetic Completion Patient', national_id='9998111021',
            health_center=None, registration_status='provisional',
            source_center_name='Source name for review',
        )
        path = '/api/employees/%d/complete-profile/' % employee.pk
        request = {
            'identity_checked': True,
            'reason': 'Identity checked at front desk and center confirmed',
            'fields': {
                'health_center': self.center.pk,
                'mobile': '0501234567', 'date_of_birth': '1988-01-01',
            },
        }
        denied = self.client.post(path, {**request, 'identity_checked': False}, format='json')
        self.assertEqual(denied.status_code, 400)
        self.assertEqual(EmployeeProfileCompletionEvent.objects.count(), 0)
        ok = self.client.post(path, request, format='json')
        self.assertEqual(ok.status_code, 200, ok.data)
        employee.refresh_from_db()
        self.assertEqual(employee.health_center_id, self.center.pk)
        self.assertEqual(employee.registration_status, 'verified')
        self.assertEqual(employee.source_center_name, 'Source name for review')
        self.assertEqual(employee.mobile, '0501234567')
        self.assertEqual(employee.date_of_birth, date(1988, 1, 1))
        self.assertEqual(EmployeeProfileCompletionEvent.objects.count(), 1)
        event = EmployeeProfileCompletionEvent.objects.first()
        self.assertEqual(event.changed_fields, ['date_of_birth', 'health_center', 'mobile'])
        self.assertEqual(event.performed_by_id, self.admin.pk)
        self.assertTrue(event.identity_checked)
        self.assertFalse('9998111021' in event.reason)
        self.assertTrue(AuditLog.objects.filter(action='employee_profile_completed_at_visit').exists())
        repeated = self.client.post(path, request, format='json')
        self.assertEqual(repeated.status_code, 409)
        self.assertEqual(EmployeeProfileCompletionEvent.objects.count(), 1)

    def test_data_entry_role_can_complete_yellow_card_but_cannot_overwrite_existing_data(self):
        UserProfile.objects.update_or_create(
            user=self.viewer, defaults={'role': 'dataEntry'},
        )
        employee = Employee.objects.create(
            name='Synthetic Missing Profile', national_id='9998111032',
            employee_number='QA-EXISTING-1032', health_center=None,
            registration_status='provisional', mobile='', nationality='',
        )
        self.client.force_authenticate(self.viewer)
        path = '/api/employees/%d/complete-profile/' % employee.pk
        denied = self.client.post(path, {
            'identity_checked': False,
            'reason': 'Identity verification is still outstanding',
            'fields': {'mobile': '0501112222'},
        }, format='json')
        self.assertEqual(denied.status_code, 400, denied.data)
        self.assertEqual(EmployeeProfileCompletionEvent.objects.count(), 0)
        saved = self.client.post(path, {
            'identity_checked': True,
            'reason': 'Identity checked and confirmed at front desk',
            'fields': {
                'mobile': '0501112222',
                'health_center': self.center.pk,
                'nationality': 'SA',
            },
        }, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        employee.refresh_from_db()
        self.assertEqual(employee.mobile, '0501112222')
        self.assertEqual(employee.health_center_id, self.center.pk)
        self.assertEqual(employee.nationality, 'SA')
        self.assertEqual(employee.employee_number, 'QA-EXISTING-1032')
        self.assertEqual(employee.registration_status, 'verified')
        event = EmployeeProfileCompletionEvent.objects.get(employee=employee)
        self.assertEqual(event.performed_by_id, self.viewer.pk)
        self.assertEqual(event.changed_fields, ['health_center', 'mobile', 'nationality'])
        self.assertTrue(AuditLog.objects.filter(
            action='employee_profile_completed_at_visit', record_id=str(employee.pk)
        ).exists())
        repeat = self.client.post(path, {
            'identity_checked': True,
            'reason': 'Attempt to overwrite a previously verified field',
            'fields': {'mobile': '0503334444'},
        }, format='json')
        self.assertEqual(repeat.status_code, 409, repeat.data)
        invalid_identity_edit = self.client.post(path, {
            'identity_checked': True,
            'reason': 'Attempt to change identity using completion endpoint',
            'fields': {'national_id': '9998111033'},
        }, format='json')
        self.assertEqual(invalid_identity_edit.status_code, 400, invalid_identity_edit.data)
        unauthorized_patch = self.client.patch(
            '/api/employees/%d/' % employee.pk,
            {'name': 'Wrong New Name'}, format='json',
        )
        self.assertEqual(unauthorized_patch.status_code, 403, unauthorized_patch.data)
        employee.refresh_from_db()
        self.assertEqual(employee.name, 'Synthetic Missing Profile')
        self.assertEqual(employee.mobile, '0501112222')
        self.assertEqual(EmployeeProfileCompletionEvent.objects.count(), 1)

    def test_nonstaff_user_cannot_edit_employee_admin_fields(self):
        employee = Employee.objects.create(
            name='Synthetic Provisional Restricted', national_id='9998111022',
            health_center=None, registration_status='provisional',
        )
        self.client.force_authenticate(self.viewer)
        response = self.client.post('/api/employees/%d/complete-profile/' % employee.pk, {
            'identity_checked': True, 'reason': 'Reviewed identity with the patient',
            'fields': {'mobile': '0501234567'},
        }, format='json')
        self.assertEqual(response.status_code, 403)
        employee.refresh_from_db()
        self.assertEqual(employee.mobile, '')
        self.assertEqual(EmployeeProfileCompletionEvent.objects.count(), 0)
