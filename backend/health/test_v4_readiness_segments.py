"""Synthetic segmented V4 readiness report must equal the full read-only report."""
from io import BytesIO
import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from openpyxl import Workbook
from rest_framework.test import APIClient

from .models import Employee, ProvisionalEmployeeImportBatch, ProvisionalEmployeeRosterRow, HealthCenter


class V4ReadinessSegmentsTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser(
            username='v4-segment-qa', password='synthetic-only')
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        book = Workbook()
        sheet = book.active
        sheet.title = 'Employees'
        sheet.append([
            'المركز الصحي', 'اسم الموظف', 'رقم الهوية / الإقامة',
            'الرقم الوظيفي', 'البريد الإلكتروني', 'رقم الجوال',
        ])
        for index in range(5):
            sheet.append(['Synthetic Center', 'Synthetic %s' % index,
                          str(1000000100 + index), 'T-%s' % index, '', ''])
        stream = BytesIO(); book.save(stream); book.close()
        imported = self.client.post('/api/provisional-employees/import/', {
            'file': SimpleUploadedFile('synthetic.xlsx', stream.getvalue()),
        }, format='multipart')
        self.assertEqual(imported.status_code, 201, imported.data)

    def get_segment(self, offset, limit=2, scope='v4'):
        with patch('health.provisional_employee_approval_readiness.draft_import_scope',
                   return_value=scope):
            return self.client.get('/api/provisional-employees/readiness/',
                                   {'offset': offset, 'limit': limit})

    def test_segments_cover_every_row_and_preserve_aggregate_counts(self):
        whole = self.client.get('/api/provisional-employees/readiness/')
        self.assertEqual(whole.status_code, 200)
        chunks = [self.get_segment(offset) for offset in (0, 2, 4)]
        for resp in chunks:
            self.assertEqual(resp.status_code, 200, resp.data)
            self.assertEqual(resp['Cache-Control'], 'private, no-store')
            self.assertEqual(resp.data['rows_total'], 5)
            self.assertEqual(resp.data['batch_id'], whole.data['batch_id'])
            self.assertNotIn('1000000100', json.dumps(resp.data))
        self.assertEqual([r.data['rows_scanned'] for r in chunks], [2, 2, 1])
        self.assertEqual([r.data['segment']['next_offset'] for r in chunks], [2, 4, 5])
        self.assertEqual([r.data['segment']['has_more'] for r in chunks], [True, True, False])
        for category in ('source_classification', 'original_registry',
                         'approved_center_name_check', 'optional_fields_missing'):
            for key, value in whole.data[category].items():
                self.assertEqual(sum(r.data[category].get(key, 0) for r in chunks), value)
        self.assertEqual(sum(r.data['cards_missing_any_optional_field']
                             for r in chunks), whole.data['cards_missing_any_optional_field'])
        self.assertEqual(ProvisionalEmployeeRosterRow.objects.count(), 5)
        self.assertEqual(ProvisionalEmployeeImportBatch.objects.count(), 1)
        self.assertFalse(Employee.objects.exists())
        self.assertFalse(HealthCenter.objects.exists())

    def test_invalid_segments_and_unisolated_use_are_rejected(self):
        for offset, limit in ((-1,2), (0,0), (0,101), (99,2), ('oops',2)):
            self.assertEqual(self.get_segment(offset, limit).status_code, 400)
        self.assertEqual(self.get_segment(0,scope='staging').status_code, 403)
        self.assertEqual(self.get_segment(0,scope='').status_code, 403)
        self.assertEqual(self.client.get('/api/provisional-employees/readiness/').status_code, 200)
        self.assertEqual(ProvisionalEmployeeRosterRow.objects.count(), 5)

    def test_non_superuser_cannot_read_any_segment(self):
        viewer = get_user_model().objects.create_user(
            username='v4-readiness-viewer', password='synthetic-only')
        self.client.force_authenticate(viewer)
        self.assertEqual(self.get_segment(0).status_code, 403)
