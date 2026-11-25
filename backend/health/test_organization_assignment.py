from django.test import TestCase
from .models import HealthCenter, OrganizationUnit
from .organization_assignment import employee_assignment_hierarchy


class OrganizationAssignmentTests(TestCase):
    def test_approved_path_and_pending_ancestor(self):
        cluster = OrganizationUnit.objects.create(code='TEST-CL', name='تجمع الشرقية الصحي', kind='department', is_approved=True)
        network = OrganizationUnit.objects.create(code='TEST-NET', name='شبكة الدمام الصحية', kind='department', parent=cluster, is_approved=True)
        sector = OrganizationUnit.objects.create(code='TEST-SEC', name='القطاع الشرقي الاستشاري 2', kind='sector', parent=network, is_approved=True)
        center = HealthCenter.objects.create(name='الجلوية', name_ar='الجلوية')
        OrganizationUnit.objects.create(code='TEST-C', name='الجلوية', kind='center', parent=sector, health_center=center, is_approved=True)
        configured, labels = employee_assignment_hierarchy(center, None)
        self.assertTrue(configured)
        self.assertEqual(labels['consultative_sector'], sector.name)
        network.is_approved = False
        network.save()
        self.assertEqual(employee_assignment_hierarchy(center, None), (True, None))

    def test_department_uses_verified_ancestry(self):
        parent = None
        for index, name in enumerate(('تجمع الشرقية الصحي', 'شبكة الدمام الصحية', 'الرعاية الأولية والمجتمعية', 'الصحة العامة', 'الصحة المهنية')):
            parent = OrganizationUnit.objects.create(code='TEST-D' + str(index), name=name, kind='department', parent=parent, is_approved=True)
        configured, labels = employee_assignment_hierarchy(None, parent)
        self.assertTrue(configured)
        self.assertEqual(labels['main_administration'], 'الرعاية الأولية والمجتمعية')
        self.assertEqual(labels['sub_administration'], 'الصحة العامة')
        self.assertEqual(labels['department'], 'الصحة المهنية')
        self.assertEqual(labels['health_center'], 'لا ينطبق')
