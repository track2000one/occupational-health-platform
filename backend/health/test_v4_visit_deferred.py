"""Synthetic-only: patient-supplied details are deferred until clinic visit.

A missing visit field never blocks provisional roster intake and must never be
written by the temporary administrative completion endpoint.
"""
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from openpyxl import Workbook
from rest_framework.test import APIClient

from .employee_import_classification import VISIT_DEFERRED_FIELDS
from .models import Employee, ProvisionalEmployeeRosterRow, AuditLog


class V4VisitDeferredFieldsTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser(
            username='v4-synthetic-visit-admin', password='synthetic-only',
        )
        self.api = APIClient()
        self.api.force_authenticate(self.admin)

    def upload(self):
        book = Workbook()
        sheet = book.active
        sheet.title = 'Employees'
        sheet.append([
            'المركز الصحي', 'اسم الموظف', 'رقم الهوية / الإقامة',
            'الرقم الوظيفي', 'البريد الإلكتروني', 'رقم الجوال',
        ])
        sheet.append([
            'Synthetic Center', 'Synthetic Visit Employee', '1000000777',
            '', '', '',
        ])
        output = BytesIO()
        book.save(output)
        book.close()
        return self.api.post('/api/provisional-employees/import/', {
            'file': SimpleUploadedFile('synthetic-visit-only.xlsx', output.getvalue()),
        }, format='multipart')

    def test_missing_visit_data_remains_optional_and_readiness_separates_it(self):
        imported = self.upload()
        self.assertEqual(imported.status_code, 201, imported.data)
        response = self.api.get('/api/provisional-employees/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total'], 1)
        item = response.data['items'][0]
        self.assertTrue(VISIT_DEFERRED_FIELDS.issubset(set(item['missing_optional'])))
        readiness = self.api.get('/api/provisional-employees/readiness/')
        self.assertEqual(readiness.status_code, 200)
        self.assertEqual(readiness.data['cards_pending_visit_data'], 1)
        self.assertEqual(readiness.data['cards_missing_previsit_data'], 1)
        self.assertEqual(readiness.data['cards_missing_any_optional_field'], 1)
        self.assertFalse(Employee.objects.exists())

    def test_provisional_completion_cannot_write_any_visit_field(self):
        self.assertEqual(self.upload().status_code, 201)
        row = ProvisionalEmployeeRosterRow.objects.get()
        sealed_before = row.sealed_payload
        original_logs = AuditLog.objects.count()
        url = f'/api/provisional-employees/{row.pk}/complete/'
        for field in sorted(VISIT_DEFERRED_FIELDS):
            with self.subTest(field=field):
                response = self.api.post(url, {
                    'identity_checked': True,
                    'reason': 'Synthetic administrative review only',
                    'fields': {field: 'synthetic attempted value'},
                }, format='json')
                self.assertEqual(response.status_code, 409, response.data)
                row.refresh_from_db()
                self.assertEqual(row.sealed_payload, sealed_before)
        self.assertEqual(AuditLog.objects.count(), original_logs)
        self.assertFalse(Employee.objects.exists())

        # Other administrative corrections still work and leave visit data alone.
        valid = self.api.post(url, {
            'identity_checked': True,
            'reason': 'Verified synthetic administrative correction',
            'fields': {'email': 'test-only@example.invalid'},
        }, format='json')
        self.assertEqual(valid.status_code, 200, valid.data)
        row.refresh_from_db()
        self.assertTrue(VISIT_DEFERRED_FIELDS.issubset(set(row.missing_optional)))
        self.assertFalse(Employee.objects.exists())
