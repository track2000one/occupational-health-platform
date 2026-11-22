"""No-write V4 preview tests with a synthetic 31-column Excel roster."""
from io import BytesIO
import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from openpyxl import load_workbook
from rest_framework.test import APIClient

from .models import (Employee, HealthCenter, OrganizationUnit,
                     ProvisionalEmployeeRosterRow, OrganizationUnitApprovalLog)
from .test_v4_provisional_roster_import import fake_book


URL = '/api/provisional-employees/affiliation-preview/'


class V4AffiliationBatchPreviewTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser(
            username='synthetic-affiliation-admin', password='test-only')
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

        book = load_workbook(BytesIO(fake_book(3)))
        sheet = book['Employees']
        # Row 2: center under an actual V4 sector/center proposal.
        # Row 3: department with an optional consultative-sector label.
        sheet['N3'] = 'لا ينطبق'
        sheet['I3'] = 'الرعاية الأولية والمجتمعية'
        sheet['J3'] = 'الصحة العامة'
        sheet['K3'] = 'الصحة المهنية'
        sheet['L3'] = 'لا ينطبق'
        # Row 4: center not in proposed directory, never guessed or invented.
        sheet['N4'] = 'مركز غير موجود في الدليل'
        output = BytesIO()
        book.save(output)
        book.close()
        with patch('health.provisional_employee_roster.draft_import_scope', return_value='v4'):
            imported = self.client.post('/api/provisional-employees/import/', {
                'file': SimpleUploadedFile('synthetic-v4-affiliations.xlsx', output.getvalue()),
            }, format='multipart')
        self.assertEqual(imported.status_code, 201, imported.data)

        self.sector = OrganizationUnit.objects.create(
            code='TMP-S-TEST', name='القطاع الغربي الاستشاري 1',
            kind='sector', source_path='القطاع الغربي الاستشاري 1')
        self.center = OrganizationUnit.objects.create(
            code='TMP-C001', name='الفيصلية', kind='center',
            parent=self.sector, source_path='شبكة الدمام الصحية / القطاع الغربي الاستشاري 1 / الفيصلية')
        self.root = OrganizationUnit.objects.create(
            code='V4-D-ROOT', name='الرعاية الأولية والمجتمعية',
            kind='department', source_path='الرعاية الأولية والمجتمعية')
        self.sub = OrganizationUnit.objects.create(
            code='V4-D-SUB', name='الصحة العامة', kind='department',
            parent=self.root, source_path='الرعاية الأولية والمجتمعية / الصحة العامة')
        self.dept = OrganizationUnit.objects.create(
            code='V4-D-DEPT', name='الصحة المهنية', kind='department',
            parent=self.sub, source_path='الرعاية الأولية والمجتمعية / الصحة العامة / الصحة المهنية')

    def segment(self, offset=0, limit=2, scope='v4'):
        with patch('health.v4_affiliation_bulk_preview.draft_import_scope', return_value=scope):
            return self.client.get(URL, {'offset':offset, 'limit':limit})

    def test_preview_counts_and_dir_snapshot_are_stable_and_read_only(self):
        first = self.segment()
        second = self.segment(2, 2)
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(first.data['rows_scanned'], 2)
        self.assertEqual(second.data['rows_scanned'], 1)
        self.assertEqual(first.data['directory_snapshot'], second.data['directory_snapshot'])
        self.assertEqual(first.data['source_kinds']['center'], 1)
        self.assertEqual(first.data['source_kinds']['department'], 1)
        self.assertEqual(first.data['statuses']['matched_pending_reference'], 2)
        self.assertEqual(second.data['statuses']['missing_in_directory'], 1)
        self.assertEqual(first.data['segment']['next_offset'], 2)
        self.assertEqual(second.data['segment']['has_more'], False)
        self.assertEqual(first['Cache-Control'], 'private, no-store')
        combined = json.dumps([first.data, second.data], ensure_ascii=False)
        self.assertNotIn('1000010000', combined)
        self.assertNotIn('Synthetic Employee', combined)
        self.assertFalse(Employee.objects.exists())
        self.assertFalse(HealthCenter.objects.exists())
        self.assertFalse(OrganizationUnitApprovalLog.objects.exists())
        self.assertEqual(ProvisionalEmployeeRosterRow.objects.count(), 3)
        self.assertEqual(OrganizationUnit.objects.count(), 5)

    def test_pending_references_only_become_approved_after_explicit_official_mapping(self):
        original = self.segment()
        self.assertEqual(original.data['statuses']['matched_approved'], 0)
        health = HealthCenter.objects.create(
            name='الفيصلية', approval_status=HealthCenter.ApprovalStatus.APPROVED)
        self.center.health_center = health
        self.center.is_approved = True
        self.center.approval_reference = 'Synthetic test reference'
        self.center.save()
        for unit in (self.sector, self.root, self.sub, self.dept):
            unit.is_approved = True
            unit.approval_reference = 'Synthetic test reference'
            unit.save()
        verified = self.segment()
        self.assertEqual(verified.status_code, 200)
        self.assertEqual(verified.data['statuses']['matched_approved'], 2)
        self.assertNotEqual(original.data['directory_snapshot'], verified.data['directory_snapshot'])
        self.assertFalse(Employee.objects.exists())

    def test_wrong_scope_and_missing_privileges_fail_closed(self):
        self.assertEqual(self.segment(scope='staging').status_code, 403)
        self.assertEqual(self.segment(scope='').status_code, 403)
        self.assertEqual(self.segment(offset=-1).status_code, 400)
        self.assertEqual(self.segment(offset=0, limit=101).status_code, 400)
        self.assertEqual(self.client.post(URL, {}, format='json').status_code, 405)
        viewer = get_user_model().objects.create_user(username='synthetic-viewer')
        self.client.force_authenticate(viewer)
        self.assertEqual(self.segment().status_code, 403)

    def test_wrong_sector_is_not_auto_mapped_by_center_name(self):
        self.sector.name = 'القطاع الشرقي الاستشاري 2'
        self.sector.save()
        preview = self.segment()
        self.assertEqual(preview.data['statuses']['missing_in_directory'], 1)
        self.assertEqual(preview.data['statuses']['matched_pending_reference'], 1)
