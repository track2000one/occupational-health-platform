"""Synthetic regression tests for the V4 canonical department path."""
from types import SimpleNamespace
from django.contrib.auth import get_user_model
from django.test import TestCase
from .models import OrganizationUnit, Employee
from .employee_org_template_v4 import ORGANIZATION_COLUMNS, TOP_LEVELS
from .serializers import EmployeeSerializer
from .v4_department_paths import v4_department_path, v4_department_labels


class V4AffiliationPathTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser(
            username='v4-affiliation-qa', password='synthetic-test-only')
        self.root = OrganizationUnit.objects.create(code='V4-D-ROOT', name='Main',
            kind='department', is_approved=True)
        self.sub = OrganizationUnit.objects.create(code='V4-D-SUB', name='Sub',
            kind='department', parent=self.root, is_approved=True)
        self.section = OrganizationUnit.objects.create(code='V4-D-SECTION', name='Section',
            kind='department', parent=self.sub, is_approved=True)
        self.unit = OrganizationUnit.objects.create(code='V4-D-UNIT', name='Unit',
            kind='department', parent=self.section, is_approved=True)
        self.other = OrganizationUnit.objects.create(code='V4-D-OTHER', name='Other',
            kind='department', is_approved=True)

    def serializer(self, node, **overrides):
        path = v4_department_path(node)
        source = {key: TOP_LEVELS.get(key, 'غير محدد في المصدر')
                  for key, _ in ORGANIZATION_COLUMNS}
        source.update({key: value or 'لا ينطبق'
                       for key, value in v4_department_labels(path).items()})
        source.update(overrides)
        return EmployeeSerializer(data={
            'name': 'Synthetic Employee', 'national_id': '9998800001',
            'organization_unit': node.pk, 'source_organizational_hierarchy': source,
        }, context={'request': SimpleNamespace(user=self.admin)})

    def test_ancestor_labels_are_saved_in_correct_columns(self):
        serializer = self.serializer(self.unit)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        employee = serializer.save()
        self.assertEqual(employee.organization_unit, self.unit)
        self.assertIsNone(employee.health_center_id)
        self.assertEqual(employee.source_organizational_hierarchy['department'], 'Section')
        self.assertEqual(employee.source_organizational_hierarchy['sub_unit'], 'Unit')

    def test_main_or_sub_department_can_be_leaf_without_false_section(self):
        serializer = self.serializer(self.sub, consultative_sector='القطاع الشرقي الاستشاري 1')
        self.assertTrue(serializer.is_valid(), serializer.errors)
        employee = serializer.save()
        self.assertEqual(employee.source_organizational_hierarchy['sub_administration'], 'Sub')
        self.assertNotIn('department', employee.source_organizational_hierarchy)
        self.assertEqual(employee.source_organizational_hierarchy['consultative_sector'],
                         'القطاع الشرقي الاستشاري 1')

    def test_mixed_or_unapproved_ancestors_are_rejected(self):
        serializer = self.serializer(self.unit, main_administration='Other')
        self.assertFalse(serializer.is_valid())
        self.assertIn('source_organizational_hierarchy', serializer.errors)
        self.root.is_approved = False
        self.root.save(update_fields=['is_approved'])
        self.unit.refresh_from_db()
        self.assertFalse(v4_department_path(self.unit))
        self.assertFalse(self.serializer(self.unit).is_valid())
        self.assertEqual(Employee.objects.count(), 0)
