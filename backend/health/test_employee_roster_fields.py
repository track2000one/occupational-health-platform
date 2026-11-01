from io import BytesIO

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from openpyxl import Workbook
from rest_framework.test import APIClient

from .importers import process_excel_import
from .models import Employee, HealthCenter


class EmployeeRosterAlignedFormTests(TestCase):
    def setUp(self):
        self.center = HealthCenter.objects.create(name='Synthetic Approved Center')
        self.staff = get_user_model().objects.create_user(
            username='synthetic_staff', password='not-a-real-secret', is_staff=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.staff)
        self.url = reverse('employee-list')

    def test_minimal_employee_create_without_fabricating_clinical_or_gender(self):
        response = self.client.post(self.url, {
            'name': 'موظف اختبار أول',
            'national_id': '1000000001',
            'health_center': self.center.pk,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        record = Employee.objects.get(national_id='1000000001')
        self.assertEqual(record.gender, '')
        self.assertIsNone(record.email)
        self.assertIsNone(record.employee_number)
        self.assertEqual(record.periodic_exam_status, 'unassessed')
        self.assertEqual(record.vaccination_status, 'unassessed')
        self.assertEqual(record.risk_level, 'unassessed')
        self.assertEqual(record.age, 0)
        self.assertIsNone(record.years_of_experience)

    def test_optional_roster_fields_persist_in_employee(self):
        response = self.client.post(self.url, {
            'name': 'موظف اختبار ثان',
            'national_id': '1000000002',
            'health_center': self.center.pk,
            'moh_id': 'MOH-TEST-002',
            'mobile': '0500000000',
            'job_title': 'فني تمريض',
            'job_title_en': 'Nursing Technician',
            'date_of_birth': '1985-01-10',
            'appointment_date': '2015-01-10',
            'employment_start_date': '2010-01-01',
            'latest_virtual_visit': '2025-01-01',
            'latest_field_visit': '2025-06-01',
            'lab_request': 'Requested',
            'lab_request_date': '2025-06-15',
            'marital_status': 'married',
            'children_count': 3,
            'gender': 'female',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        employee = Employee.objects.get(national_id='1000000002')
        self.assertEqual(employee.moh_id, 'MOH-TEST-002')
        self.assertEqual(employee.children_count, 3)
        self.assertEqual(employee.lab_request, 'Requested')
        self.assertEqual(employee.job_title_en, 'Nursing Technician')
        self.assertGreater(employee.age, 0)
        self.assertGreater(employee.years_of_experience, 0)

    def test_duplicate_national_id_cannot_be_created(self):
        payload = {'name': 'اختبار', 'national_id': '1000000003', 'health_center': self.center.pk}
        self.assertEqual(self.client.post(self.url, payload, format='json').status_code, 201)
        self.assertEqual(self.client.post(self.url, payload, format='json').status_code, 400)
        self.assertEqual(Employee.objects.filter(national_id='1000000003').count(), 1)

    def test_email_and_employee_number_both_optional_for_multiple_employees(self):
        for index in range(2):
            response = self.client.post(self.url, {
                'name': f'موظف {index}',
                'national_id': f'100000000{index + 4}',
                'health_center': self.center.pk,
            }, format='json')
            self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Employee.objects.count(), 2)

    def test_invalid_children_count_and_dates_rejected(self):
        base = {'name': 'موظف اختبار', 'national_id': '1000000008', 'health_center': self.center.pk}
        for extra in (
            {'children_count': -1},
            {'latest_field_visit': '2099-12-12'},
            {'employment_start_date': '2099-01-01'},
        ):
            with self.subTest(extra=extra):
                response = self.client.post(self.url, {**base, **extra}, format='json')
                self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(Employee.objects.filter(national_id='1000000008').exists())


class RosterFlexibleImportPreviewTests(TestCase):
    def test_optional_blank_contacts_not_treated_as_duplicates(self):
        HealthCenter.objects.create(name='Synthetic Center')
        workbook = Workbook()
        ws = workbook.active
        ws.title = 'Employees'
        ws.append([
            'Health center', 'Name', 'National ID', 'DOB', 'Mobile #',
            'MOH ID', 'email', 'مسمى الوظيفي', 'Job Title',
            'Gender', 'Latest Virtual Visit', 'Joined',
            'Latest Field Visit', 'LAB Request', 'LAB Request Date',
            'Marital Status', '# of Child', 'Age', 'Date of Start (Old)',
        ])
        for suffix in (1, 2):
            ws.append([
                'Synthetic Center', f'موظف تجريبي {suffix}', f'100000000{suffix}',
                '', '', f'TEST-MOH-{suffix}', '', 'فني', 'Technician',
                '', '', '', '', '', '', '', '', '', '',
            ])
        buffer = BytesIO()
        workbook.save(buffer)
        buffer.seek(0)
        buffer.name = 'synthetic_roster.xlsx'
        report = process_excel_import(buffer, employee_import_mode='flexible', commit=False)
        self.assertEqual(report['summary']['total_rows'], 2)
        self.assertEqual(report['summary']['valid_rows'], 2, report['errors'])
        self.assertEqual(report['summary']['duplicate_rows'], 0)
        self.assertEqual(Employee.objects.count(), 0)
