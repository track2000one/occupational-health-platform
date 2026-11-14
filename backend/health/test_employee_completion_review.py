"""Synthetic employee import regression tests for incomplete and pending cards."""
from datetime import date
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from openpyxl import Workbook
from rest_framework.test import APIClient

from .employee_roster_template import COLUMNS
from .importers import process_excel_import
from .models import (
    Employee, EmployeeImportReview, HealthCenter, HealthCenterAlias,
)


class EmployeeCompletionReviewTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_superuser(
            username='ci_incomplete_staff_admin',
            password='ci-synthetic-password',
            email='ci-incomplete@example.invalid',
        )
        self.viewer = User.objects.create_user(
            username='ci_incomplete_viewer',
            password='ci-synthetic-password',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.center = HealthCenter.objects.create(
            name='علي السلمان بالجلوية', name_ar='علي السلمان بالجلوية',
            code='CI-INCOMPLETE-HC',
        )
        HealthCenterAlias.objects.create(
            center=self.center, name='الجلوية', normalized_name='الجلوية',
        )
        self.missing = Employee.objects.create(
            name='Synthetic Incomplete', national_id='9991000001',
            health_center=self.center,
        )
        self.complete = Employee.objects.create(
            name='Synthetic Complete', national_id='9991000002',
            health_center=self.center,
            employee_number='CI-COMPLETE-002',
            date_of_birth=date(1990, 1, 1),
            appointment_date=date(2014, 1, 1),
            gender='male', nationality='SA', birth_place='Test place',
            marital_status='single', mobile='0501234567',
            email='complete@example.invalid', national_address='Synthetic address',
            job_title='Test physician', current_job='Test physician',
        )
        self.draft = EmployeeImportReview.objects.create(
            source_file='synthetic-source.xlsx',
            source_sheet='Employees', source_row=2,
            fingerprint='a' * 64,
            raw_payload={'name': 'Synthetic Pending'},
            employee_payload={
                'name': 'Synthetic Pending', 'national_id': '9991000051',
                'health_center': None, 'health_center_name': '',
                'employee_number': '', 'email': '',
            },
            issues=['Missing required field: health_center.'],
            status='pending', created_by=self.admin,
        )
        self.conflict = EmployeeImportReview.objects.create(
            source_file='synthetic-source.xlsx',
            source_sheet='Employees', source_row=3,
            fingerprint='b' * 64,
            raw_payload={'name': 'Synthetic Conflict'},
            employee_payload={
                'name': 'Synthetic Conflict', 'national_id': '9991000002',
                'health_center': self.center.pk,
                '_import_classification': 'conflict',
            },
            status='conflict', conflict_employee=self.complete,
            issues=['National ID already exists in PostgreSQL'],
            created_by=self.admin,
        )

    def test_completeness_filter_works_before_pagination_and_is_independent_of_status(self):
        missing_response = self.client.get('/api/employees/?completion=missing')
        self.assertEqual(missing_response.status_code, 200)
        self.assertEqual(missing_response.data['count'], 1)
        self.assertEqual(missing_response.data['results'][0]['id'], self.missing.pk)
        complete_response = self.client.get('/api/employees/?completion=complete')
        self.assertEqual(complete_response.status_code, 200)
        self.assertEqual(complete_response.data['count'], 1)
        self.assertEqual(complete_response.data['results'][0]['id'], self.complete.pk)
        all_response = self.client.get('/api/employees/')
        self.assertEqual(all_response.data['count'], 2)

    def test_pending_reviews_are_not_live_staff_until_identity_and_center_verified(self):
        self.assertEqual(Employee.objects.count(), 2)
        path = '/api/employee-import-reviews/?status=pending&missing_center=true'
        response = self.client.get(path)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], self.draft.pk)
        self.assertEqual(Employee.objects.count(), 2)
        conflict_response = self.client.get('/api/employee-import-reviews/?status=conflict')
        self.assertEqual(conflict_response.data['count'], 1)
        filtered = self.client.get(
            '/api/employee-import-reviews/?status=pending&search=Synthetic%20Pending'
        )
        self.assertEqual(filtered.data['count'], 1)
        self.client.force_authenticate(self.viewer)
        self.assertEqual(self.client.get(path).status_code, 403)

    def test_alias_matches_center_on_employee_excel_import_without_guessing_missing_center(self):
        book = Workbook()
        sheet = book.active
        sheet.title = 'Employees'
        sheet.append(list(COLUMNS))
        first = [''] * len(COLUMNS)
        first[0], first[1], first[2] = 'الجلوية', 'Synthetic New', '9991000031'
        second = [''] * len(COLUMNS)
        second[0], second[1], second[2] = '', 'Synthetic Unassigned', '9991000032'
        sheet.append(first)
        sheet.append(second)
        buffer = BytesIO()
        book.save(buffer)
        book.close()
        raw = buffer.getvalue()

        def workbook():
            return SimpleUploadedFile(
                'ci-import-missing-center.xlsx', raw,
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            )

        preview = process_excel_import(
            workbook(), sheet_name='Employees', commit=False,
            employee_import_mode='template', user=self.admin,
        )
        self.assertEqual(preview['summary']['new_ready'], 1)
        self.assertEqual(preview['summary']['needs_correction'], 1)
        self.assertEqual(Employee.objects.count(), 2)
        commit = process_excel_import(
            workbook(), sheet_name='Employees', commit=True,
            employee_import_mode='template', user=self.admin,
        )
        self.assertEqual(commit['summary']['imported_employees'], 1)
        self.assertEqual(commit['summary']['pending_reviews'], 1)
        added = Employee.objects.get(national_id='9991000031')
        self.assertEqual(added.health_center_id, self.center.pk)
        self.assertEqual(added.employment_status, 'active')
        unassigned = EmployeeImportReview.objects.get(
            source_file='ci-import-missing-center.xlsx',
            source_row=3,
        )
        self.assertEqual(unassigned.status, 'pending')
        self.assertIsNone(unassigned.employee_payload['health_center'])
        self.assertFalse(Employee.objects.filter(national_id='9991000032').exists())
        self.assertEqual(Employee.objects.count(), 3)
        self.missing.refresh_from_db()
        self.assertEqual(self.missing.health_center_id, self.center.pk)
