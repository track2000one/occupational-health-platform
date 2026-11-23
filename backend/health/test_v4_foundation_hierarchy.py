"""Synthetic-only tests for Excel-aligned organizational foundation in isolated V4."""
from hashlib import sha256
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import AuditLog, Employee, HealthCenter, OrganizationUnit


class V4FoundationHierarchyTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser(
            username='synthetic-v4-hierarchy-admin', password='test-only',
        )
        self.api = APIClient()
        self.api.force_authenticate(self.admin)

    def send_path(self, path, scope='v4'):
        with patch('health.department_directory.draft_import_scope',
                   return_value=scope):
            return self.api.post('/api/departments/', {
                'hierarchy': {
                    'main_administration': path[0],
                    'sub_administration': path[1],
                    'department': path[2],
                    'sub_unit': path[3],
                },
            }, format='json')

    def test_creates_four_levels_parent_first_with_deterministic_codes(self):
        path = ['الخدمات الطبية والإكلينيكية', 'الخدمات الصحية المساندة',
                'خدمات إعادة التأهيل', 'العلاج الطبيعي']
        result = self.send_path(path)
        self.assertEqual(result.status_code, 201, result.data)
        self.assertEqual(result.data['created_count'], 4)
        last = OrganizationUnit.objects.get(name=path[3])
        self.assertEqual(last.parent.name, path[2])
        self.assertEqual(last.parent.parent.name, path[1])
        self.assertEqual(last.parent.parent.parent.name, path[0])
        self.assertEqual(last.code, 'V4-D-' + sha256(
            '\x1f'.join(path).encode('utf-8'),
        ).hexdigest()[:24].upper())
        self.assertFalse(OrganizationUnit.objects.filter(is_approved=True).exists())
        self.assertEqual(Employee.objects.count(), 0)
        self.assertEqual(HealthCenter.objects.count(), 0)
        self.assertTrue(AuditLog.objects.filter(
            action='v4_manual_hierarchical_department_created').exists())

    def test_reuses_prefixes_without_duplicate_nodes_or_writes_to_roster(self):
        path = ['الرعاية الأولية والمجتمعية', 'الصحة العامة',
                'مكافحة الأمراض المعدية', '']
        self.assertEqual(self.send_path(path).status_code, 201)
        before = OrganizationUnit.objects.count()
        same = self.send_path(path)
        self.assertEqual(same.status_code, 409)
        self.assertEqual(OrganizationUnit.objects.count(), before)
        sibling = self.send_path([
            'الرعاية الأولية والمجتمعية', 'الصحة العامة', 'الصحة المهنية', '',
        ])
        self.assertEqual(sibling.status_code, 201, sibling.data)
        self.assertEqual(sibling.data['created_count'], 1)
        self.assertEqual(sibling.data['reused_count'], 2)
        self.assertEqual(OrganizationUnit.objects.count(), before + 1)

    def test_rejects_invalid_missing_intermediate_and_excluded_paths(self):
        invalid = [
            ['', 'الصحة العامة', 'الصحة المهنية', ''],
            ['الرعاية الأولية والمجتمعية', '', 'الصحة المهنية', ''],
            ['الرعاية الأولية والمجتمعية', '', '', 'وحدة بلا قسم'],
            ['التشغيل', 'خدمات الأعمال', '', ''],
            ['الرعاية الأولية والمجتمعية', 'لا ينطبق', '', ''],
            ['الرعاية الأولية والمجتمعية', 'الصحة العامة',
             'القطاع الشرقي الاستشاري 1', ''],
        ]
        for path in invalid:
            with self.subTest(path=path):
                self.assertEqual(self.send_path(path).status_code, 400)
        self.assertFalse(OrganizationUnit.objects.exists())

    def test_conflicting_late_prefix_rolls_back_earlier_creation(self):
        OrganizationUnit.objects.create(
            code='DEP-LEGACY', name='الصحة المهنية',
            kind=OrganizationUnit.Kind.DEPARTMENT,
        )
        result = self.send_path([
            'الرعاية الأولية والمجتمعية', 'الصحة المهنية', '', '',
        ])
        self.assertEqual(result.status_code, 409, result.data)
        self.assertFalse(OrganizationUnit.objects.filter(
            name='الرعاية الأولية والمجتمعية',
        ).exists())
        self.assertEqual(OrganizationUnit.objects.count(), 1)

    def test_non_v4_department_hierarchy_request_does_not_create(self):
        result = self.send_path(['Main', 'Sub', 'Section', ''], scope='staging')
        self.assertEqual(result.status_code, 403)
        self.assertFalse(OrganizationUnit.objects.exists())

    def test_v4_center_requires_source_based_main_and_sector(self):
        with patch('health.organization_structure.draft_import_scope',
                   return_value='v4'):
            bad = self.api.post('/api/health-centers/', {
                'name': 'Synthetic Center', 'name_ar': 'مركز اصطناعي',
                'proposed_parent_name': 'الرعاية الأولية والمجتمعية',
                'proposed_sector_name': '',
            }, format='json')
            self.assertEqual(bad.status_code, 400)
            invalid_main = self.api.post('/api/health-centers/', {
                'name': 'Synthetic Center', 'name_ar': 'مركز اصطناعي',
                'proposed_parent_name': 'الإدارة غير الصحيحة',
                'proposed_sector_name': 'القطاع الشرقي الاستشاري 1',
            }, format='json')
            self.assertEqual(invalid_main.status_code, 400)
            accepted = self.api.post('/api/health-centers/', {
                'name': 'Synthetic Center', 'name_ar': 'مركز اصطناعي',
                'proposed_parent_name': 'الرعاية الأولية والمجتمعية',
                'proposed_sector_name': 'القطاع الشرقي الاستشاري 1',
            }, format='json')
            self.assertEqual(accepted.status_code, 201, accepted.data)
        center = HealthCenter.objects.get()
        self.assertEqual(center.proposed_sector_name, 'القطاع الشرقي الاستشاري 1')
        self.assertEqual(center.proposed_parent_name, 'الرعاية الأولية والمجتمعية')
        self.assertFalse(OrganizationUnit.objects.exists())
        self.assertFalse(Employee.objects.exists())
