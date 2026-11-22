"""Synthetic V4 source-affiliation readiness: center vs department is never confused."""
from io import BytesIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from openpyxl import load_workbook
from rest_framework.test import APIClient

from .models import Employee, HealthCenter, ProvisionalEmployeeRosterRow
from .test_v4_provisional_roster_import import fake_book


class V4ReadinessAffiliationTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser(
            username='v4-affiliation-readiness-qa', password='synthetic-only')
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_center_and_department_separate_without_approvals_or_employee_writes(self):
        book = load_workbook(BytesIO(fake_book(2)))
        sheet = book['Employees']
        # First synthetic employee belongs to a center.
        # Second synthetic employee belongs to a department, not a center.
        sheet['N3'] = 'لا ينطبق'
        sheet['M3'] = 'لا ينطبق'
        sheet['I3'] = 'الرعاية الأولية والمجتمعية'
        sheet['J3'] = 'الصحة العامة'
        sheet['K3'] = 'الصحة المهنية'
        out = BytesIO(); book.save(out); book.close()
        with patch('health.provisional_employee_roster.draft_import_scope', return_value='v4'):
            saved = self.client.post('/api/provisional-employees/import/', {
                'file': SimpleUploadedFile('synthetic-affiliations.xlsx', out.getvalue())
            }, format='multipart')
        self.assertEqual(saved.status_code, 201, saved.data)

        with patch('health.provisional_employee_approval_readiness.draft_import_scope', return_value='v4'):
            first = self.client.get('/api/provisional-employees/readiness/', {'offset':0, 'limit':1})
            second = self.client.get('/api/provisional-employees/readiness/', {'offset':1, 'limit':1})
        full = self.client.get('/api/provisional-employees/readiness/')
        self.assertEqual(full.status_code, 200, full.data)
        self.assertEqual(full.data['source_affiliation_kind']['center'], 1)
        self.assertEqual(full.data['source_affiliation_kind']['department'], 1)
        self.assertEqual(full.data['approved_center_name_check']['not_matched_to_approved'], 1)
        self.assertEqual(full.data['approved_center_name_check']['not_applicable'], 1)
        self.assertEqual(full.data['approved_center_name_check']['missing_in_file'], 0)
        self.assertEqual(sum(r.data['source_affiliation_kind']['center'] for r in (first,second)),1)
        self.assertEqual(sum(r.data['source_affiliation_kind']['department'] for r in (first,second)),1)
        self.assertEqual(ProvisionalEmployeeRosterRow.objects.count(),2)
        self.assertFalse(Employee.objects.exists())
        self.assertFalse(HealthCenter.objects.exists())
