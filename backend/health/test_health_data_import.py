from io import BytesIO
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from openpyxl import Workbook, load_workbook
from rest_framework.test import APIClient
from .health_data_import import HEADERS, HEALTH_FIELDS, TARGETS, AMBIGUOUS, template_bytes
from .models import Employee, EmployeeHealthCard
from .organization_structure import STAGING_PROJECT
from .staging_employee_reset import QA_EXAMPLES

URL = '/api/health-data-import/preview/'
ENV = {'STAGING_MODE': 'true', 'RAILWAY_PROJECT_ID': STAGING_PROJECT}


class HealthDataImportTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser(username='synthetic_health_admin', password='test-only')
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        nid, name = QA_EXAMPLES['OHP-QA-01']
        self.employee = Employee.objects.create(name=name, national_id=nid, employee_number='OHP-QA-01', email='ohp-qa-01@example.invalid')
        self.card = EmployeeHealthCard.objects.create(employee=self.employee,
            data={'conditions': {'diabetes': 'No'}, 'physical': {'weight_kg': '70'}})

    def upload(self, rows, headers=HEADERS, confirmed='true'):
        book = Workbook()
        sheet = book.active
        sheet.title = 'HealthData'
        sheet.append(headers)
        for row in rows:
            sheet.append([row.get(key) for key in headers])
        stream = BytesIO()
        book.save(stream)
        book.close()
        return self.client.post(URL, {'file': SimpleUploadedFile('synthetic.xlsx', stream.getvalue()),
                                     'synthetic_confirmed': confirmed}, format='multipart')

    def test_template_contract(self):
        self.assertEqual(len(HEADERS), 65)
        self.assertEqual(len(HEALTH_FIELDS), 61)
        self.assertEqual(set(TARGETS) | AMBIGUOUS, set(HEALTH_FIELDS))
        book = load_workbook(BytesIO(template_bytes()))
        self.assertEqual(tuple(c.value for c in book['HealthData'][1]), HEADERS)
        self.assertEqual(book['HealthData'].max_row, 1)
        book.close()

    @patch.dict('os.environ', ENV)
    def test_preview_is_read_only_and_preserves_uncertainty(self):
        original = self.card.data.copy()
        result = self.upload([{'national_id': '9990000001', 'employee_name': self.employee.name,
            'weight_kg': 70, 'diabetes': 'Yes', 'hypertension': 'Yes - Controlled',
            'latest_field_visit_source': 'No', 'joined_program': 'No', 'ppd_date': '2025-02-01'}])
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['identity_counts']['matched'], 1)
        self.assertEqual(result.data['field_totals']['same_card_value'], 1)
        self.assertEqual(result.data['field_totals']['card_conflict'], 1)
        self.assertEqual(result.data['field_totals']['review'], 2)
        self.assertEqual(result.data['field_totals']['proposed'], 2)
        self.assertFalse(result.data['commit_available'])
        self.assertNotIn('9990000001', str(result.data))
        self.card.refresh_from_db()
        self.assertEqual(self.card.data, original)
        self.assertEqual(Employee.objects.count(), 1)
        self.assertEqual(EmployeeHealthCard.objects.count(), 1)

    @patch.dict('os.environ', ENV)
    def test_block_mismatched_identity_duplicate_formula_and_unconfirmed(self):
        row = {'national_id': '9990000001', 'employee_name': 'اسم مختلف', 'diabetes': 'Yes'}
        res = self.upload([row])
        self.assertEqual(res.data['identity_counts']['identity_review'], 1)
        self.assertEqual(res.data['field_totals']['identity_blocked'], 1)
        self.assertEqual(self.upload([row, row]).data['identity_counts']['duplicate'], 2)
        self.assertEqual(self.upload([{**row, 'weight_kg': '=1+1'}]).status_code, 400)
        self.assertEqual(self.upload([row], confirmed='false').status_code, 400)
        self.assertEqual(self.upload([row], headers=HEADERS[:-1]).status_code, 400)

    @patch.dict('os.environ', {'STAGING_MODE': 'false'})
    def test_production_denied(self):
        self.assertEqual(self.upload([{'national_id': '9990000001'}]).status_code, 403)

    @patch.dict('os.environ', ENV)
    def test_non_superuser_denied(self):
        staff = get_user_model().objects.create_user(username='synthetic_staff', password='test-only', is_staff=True)
        self.client.force_authenticate(staff)
        self.assertEqual(self.upload([{'national_id': '9990000001'}]).status_code, 403)
