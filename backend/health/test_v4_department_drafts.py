"""V4 department-only draft import: previews, isolation and idempotency."""
from io import BytesIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from openpyxl import Workbook
from rest_framework.test import APIRequestFactory, force_authenticate

from health import organization_structure as org
from health.models import OrganizationUnit, HealthCenter, Employee


def workbook(rows):
    book = Workbook()
    sheet = book.active
    sheet.title = org.V4_DEPARTMENT_SHEET
    sheet.append(org.V4_DEPARTMENT_HEADERS)
    for row in rows:
        sheet.append(row)
    data = BytesIO()
    book.save(data)
    book.close()
    return SimpleUploadedFile('departments.xlsx', data.getvalue())


class V4DepartmentDraftTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser(
            username='department-test', password='synthetic-test-password')
        self.factory = APIRequestFactory()
        self.sector = OrganizationUnit.objects.create(
            code='TMP-S-TEST', name='قطاع تجريبي', kind='sector')
        self.center = OrganizationUnit.objects.create(
            code='TMP-C999', name='مركز تجريبي', kind='center', parent=self.sector)

    def send(self, rows, confirm='', scope='v4', enabled='true'):
        request = self.factory.post('/api/organization-units/import/', {
            'phase': 'departments', 'file': workbook(rows), 'confirm': confirm,
        }, format='multipart')
        force_authenticate(request, user=self.admin)
        with patch.object(org, 'draft_import_scope', return_value=scope):
            with patch.dict('os.environ', {'OHP_V4_DEPARTMENT_DRAFT_IMPORT_ENABLED': enabled}):
                return org.OrganizationImportView.as_view()(request)

    def test_preview_and_commit_preserve_center_hierarchy(self):
        rows = [('Main', 'Sub', 'Section', 'Unit'), ('Main', 'Other', '', '')]
        preview = self.send(rows)
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.data['total'], 5)
        self.assertEqual(preview.data['created'], 0)
        self.assertEqual(OrganizationUnit.objects.count(), 2)
        committed = self.send(rows, org.V4_DEPARTMENT_MARKER)
        self.assertEqual(committed.status_code, 201)
        self.assertEqual(committed.data['created'], 5)
        unit = OrganizationUnit.objects.get(name='Unit')
        self.assertEqual(unit.parent.name, 'Section')
        self.assertEqual(unit.parent.parent.parent.name, 'Main')
        self.assertFalse(OrganizationUnit.objects.filter(is_approved=True).exists())
        self.assertFalse(HealthCenter.objects.exists())
        self.assertFalse(Employee.objects.exists())
        self.center.refresh_from_db()
        self.assertEqual(self.center.parent_id, self.sector.pk)
        self.assertEqual(self.send(rows, org.V4_DEPARTMENT_MARKER).data['created'], 0)

    def test_gate_denies_other_environments_and_disabled_flag(self):
        for scope, enabled in [('staging', 'true'), ('', 'true'), ('v4', 'false')]:
            response = self.send([('Main', '', '', '')], org.V4_DEPARTMENT_MARKER, scope, enabled)
            self.assertEqual(response.status_code, 403)
        self.assertEqual(OrganizationUnit.objects.count(), 2)

    def test_invalid_paths_are_not_written(self):
        for rows in [
            [('Main', '', 'Section', '')],
            [('Main', 'لا ينطبق', '', '')],
            [('Main', 'القطاع الشرقي الاستشاري 1', '', '')],
            [('Main', '', '', ''), ('Main', '', '', '')],
            [('=1+1', '', '', '')],
        ]:
            self.assertEqual(self.send(rows, org.V4_DEPARTMENT_MARKER).status_code, 400)
        self.assertEqual(OrganizationUnit.objects.count(), 2)

    def test_existing_name_conflict_is_atomic(self):
        OrganizationUnit.objects.create(code='EXISTING', name='Main', kind='department')
        response = self.send([('Other', '', '', ''), ('Main', 'Sub', '', '')],
                             org.V4_DEPARTMENT_MARKER)
        self.assertEqual(response.status_code, 409)
        self.assertFalse(OrganizationUnit.objects.filter(name='Other').exists())
