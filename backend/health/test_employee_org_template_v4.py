"""Regression tests for the proposed 31-column employee organization template.

No real employee records are used. Only administrator-only template generation,
header matching, placeholders, and source Hijri date handling are exercised.
"""
from io import BytesIO

from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIRequestFactory, force_authenticate
from openpyxl import load_workbook

from .employee_org_template_v4 import (
    HEADERS, ORGANIZATION_COLUMNS, TOP_LEVELS, template_bytes,
    clean_org_value, is_placeholder, needs_source_org_review,
)
from .employee_import_v2 import detect_header
from .employee_import_v2_commit import normalized_employee_fields


class EmployeeOrganizationalTemplateV4Tests(TestCase):
    def test_exact_source_workbook_columns(self):
        self.assertEqual(len(HEADERS), 31)
        self.assertEqual(len(ORGANIZATION_COLUMNS), 13)
        self.assertEqual(HEADERS[5:18], tuple(label for _, label in ORGANIZATION_COLUMNS))
        self.assertEqual(HEADERS[18], 'حالة المراجعة')
        self.assertEqual(HEADERS[30], 'تاريخ التعيين')

    def test_blank_download_contains_no_employee_rows(self):
        book = load_workbook(BytesIO(template_bytes()), read_only=True)
        self.assertIn('Employees', book.sheetnames)
        sheet = book['Employees']
        self.assertEqual(tuple(cell.value for cell in sheet[1]), HEADERS)
        for values in sheet.iter_rows(min_row=2, values_only=True):
            self.assertFalse(any(value is not None for value in values))
        book.close()

    def test_v4_header_is_recognized_by_existing_v2_preflight(self):
        book = load_workbook(BytesIO(template_bytes()), read_only=True)
        found = detect_header(book['Employees'])
        self.assertIsNotNone(found)
        self.assertIn('name', found[2])
        self.assertIn('national_id', found[2])
        self.assertIn('organization_unit', found[2])
        self.assertIn('health_center', found[2])
        self.assertIn('sector', found[2])
        book.close()

    def test_unknown_levels_never_look_like_official_org_units(self):
        self.assertTrue(is_placeholder('لا ينطبق'))
        self.assertTrue(is_placeholder('غير محدد في المصدر'))
        self.assertEqual(clean_org_value('غير محدد في المصدر'), '')
        self.assertEqual(clean_org_value(' الصحة المهنية '), 'الصحة المهنية')
        self.assertEqual(len(TOP_LEVELS), 3)

    def test_source_review_statuses_are_not_silently_approved(self):
        self.assertFalse(needs_source_org_review('لا توجد ملاحظة تصنيفية سابقة'))
        self.assertFalse(needs_source_org_review('مستكمل من المسار'))
        self.assertTrue(needs_source_org_review('مراجعة تصنيف وظيفي'))
        self.assertTrue(needs_source_org_review('تحديد القسم الفعلي'))
        self.assertTrue(needs_source_org_review('تعارض بين F وG'))

    def test_hijri_appointment_date_preserved_without_false_conversion(self):
        fields = normalized_employee_fields({
            'appointment_date': '1447/07/12',
            'job_title': 'ممرض',
        })
        self.assertEqual(fields['roster_hijri_appointment_date'], '1447/07/12')
        self.assertNotIn('appointment_date', fields)


class EmployeeOrganizationalPreviewV4IntegrationTests(TestCase):
    """Synthetic workbook API checks: never store or upload real identities."""

    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_superuser(
            username='org_v4_preview_test_admin',
            email='org-v4-test@example.invalid',
            password='synthetic-test-password',
        )

    def preview(self, missing_org_field=False):
        from .employee_import_v2 import EmployeeImportV2PreviewView

        book = load_workbook(BytesIO(template_bytes()))
        sheet = book['Employees']
        row = {label: 'لا ينطبق' for label in HEADERS}
        row.update({
            'اسم الموظف': 'موظف اختبار اصطناعي',
            'رقم الهوية / الإقامة': '1000000001',
            'الرقم الوظيفي': 'ORG-V4-TEST-1',
            'الشركة القابضة': 'شركة الصحة القابضة',
            'التجمع الصحي': 'تجمع الشرقية الصحي',
            'الشبكة الصحية': 'شبكة الدمام الصحية',
            'الإدارة الرئيسية': 'الرعاية الأولية والمجتمعية',
            'المركز الصحي': 'غير محدد في المصدر',
            'حالة المراجعة': 'لا توجد ملاحظة تصنيفية سابقة',
            'الجنسية': 'السعودية',
            'تاريخ التعيين': '1447/07/12',
        })
        if missing_org_field:
            row['القسم'] = ''
        sheet.append([row[label] for label in HEADERS])
        output = BytesIO()
        book.save(output)
        book.close()
        upload = SimpleUploadedFile(
            'synthetic_org_v4.xlsx', output.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        request = APIRequestFactory().post(
            '/api/employee-import-v2/preview/',
            {'file': upload, 'sheet_name': 'Employees'},
            format='multipart',
        )
        force_authenticate(request, user=self.admin)
        return EmployeeImportV2PreviewView.as_view()(request)

    def test_preview_recognizes_13_source_hierarchy_levels(self):
        response = self.preview()
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['rows_total'], 1)
        self.assertEqual(response.data['organizational_template']['version'], 'V4')
        self.assertEqual(response.data['organizational_template']['levels'], 13)

    def test_blank_hierarchy_cell_is_rejected_before_commit(self):
        response = self.preview(missing_org_field=True)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['incomplete_organization_count'], 1)



class EmployeeManualV4FormTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_superuser(
            username='org_manual_admin', email='org-manual@example.invalid',
            password='synthetic-test-password',
        )
        cls.manager = get_user_model().objects.create_user(
            username='org_manual_staff', email='org-staff@example.invalid',
            password='synthetic-test-password', is_staff=True,
        )
        from .models import HealthCenter
        cls.center = HealthCenter.objects.create(
            name='مركز صحي تجريبي', name_ar='مركز صحي تجريبي',
            approval_status=HealthCenter.ApprovalStatus.APPROVED,
        )

    def hierarchy(self):
        return {
            key: TOP_LEVELS.get(key, 'غير محدد في المصدر')
            for key, _ in ORGANIZATION_COLUMNS
        } | {'health_center': self.center.name, 'main_administration': 'الرعاية الأولية والمجتمعية'}

    def create_payload(self):
        return {
            'name': 'موظف افتراضي للاختبار',
            'national_id': '1000000001',
            'health_center': self.center.pk,
            'source_organizational_hierarchy': self.hierarchy(),
        }

    def test_superuser_adds_v4_source_without_approving_new_org_unit(self):
        from types import SimpleNamespace
        from .serializers import EmployeeSerializer
        from .models import OrganizationUnit, EmployeeOrganizationalHierarchyEvent
        serializer = EmployeeSerializer(
            data=self.create_payload(),
            context={'request': SimpleNamespace(user=self.admin)},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        created = serializer.save()
        self.assertEqual(created.source_organizational_hierarchy['health_center'], self.center.name)
        self.assertEqual(created.source_organizational_hierarchy['holding_company'], 'شركة الصحة القابضة')
        self.assertEqual(created.source_organizational_hierarchy.get('sub_unit'), None)
        self.assertEqual(OrganizationUnit.objects.count(), 0)
        event = EmployeeOrganizationalHierarchyEvent.objects.get(employee=created)
        self.assertEqual(event.action, 'created')
        self.assertEqual(created.health_center_id, self.center.pk)

    def test_non_admin_cannot_submit_proposed_hierarchy(self):
        from types import SimpleNamespace
        from .serializers import EmployeeSerializer
        serializer = EmployeeSerializer(
            data=self.create_payload(),
            context={'request': SimpleNamespace(user=self.manager)},
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn('source_organizational_hierarchy', serializer.errors)

    def test_mismatching_center_name_is_rejected(self):
        from types import SimpleNamespace
        from .serializers import EmployeeSerializer
        payload = self.create_payload()
        payload['source_organizational_hierarchy']['health_center'] = 'مركز آخر غير معتمد'
        serializer = EmployeeSerializer(
            data=payload, context={'request': SimpleNamespace(user=self.admin)},
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn('source_organizational_hierarchy', serializer.errors)

    def test_existing_source_hierarchy_correction_requires_reason(self):
        from types import SimpleNamespace
        from .serializers import EmployeeSerializer
        from .models import Employee, EmployeeOrganizationalHierarchyEvent
        existing = Employee.objects.create(
            name='موظف اختبار', national_id='1000000002',
            health_center=self.center,
            source_organizational_hierarchy={
                'holding_company': 'شركة الصحة القابضة',
                'health_cluster': 'تجمع الشرقية الصحي',
                'health_network': 'شبكة الدمام الصحية',
                'health_center': self.center.name,
                'main_administration': 'التشغيل',
            },
        )
        updated = self.hierarchy()
        serializer = EmployeeSerializer(
            existing, data={'source_organizational_hierarchy': updated},
            partial=True, context={'request': SimpleNamespace(user=self.admin)},
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn('hierarchy_change_reason', serializer.errors)
        serializer = EmployeeSerializer(
            existing, data={
                'source_organizational_hierarchy': updated,
                'hierarchy_change_reason': 'تصحيح مستوى الإدارة بعد مراجعة المصدر التنظيمي',
            },
            partial=True, context={'request': SimpleNamespace(user=self.admin)},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()
        existing.refresh_from_db()
        self.assertEqual(
            existing.source_organizational_hierarchy['main_administration'],
            'الرعاية الأولية والمجتمعية',
        )
        event = EmployeeOrganizationalHierarchyEvent.objects.get(employee=existing)
        self.assertIn('main_administration', event.changed_levels)
        self.assertEqual(event.action, 'corrected')
        self.assertIn('المصدر التنظيمي', event.reason)

    def test_verified_employee_edit_preserves_source_until_explicit_sync(self):
        from types import SimpleNamespace
        from .models import Employee, OrganizationUnit, EmployeeOrganizationalHierarchyEvent
        from .serializers import EmployeeSerializer
        from .organization_assignment import employee_assignment_hierarchy

        cluster = OrganizationUnit.objects.create(
            code='SYNC-CL', name='تجمع الشرقية الصحي', kind='department', is_approved=True)
        network = OrganizationUnit.objects.create(
            code='SYNC-NET', name='شبكة الدمام الصحية', kind='department',
            parent=cluster, is_approved=True)
        sector = OrganizationUnit.objects.create(
            code='SYNC-SEC', name='القطاع الشرقي الاستشاري 1', kind='sector',
            parent=network, is_approved=True)
        OrganizationUnit.objects.create(
            code='SYNC-C', name=self.center.name, kind='center',
            parent=sector, health_center=self.center, is_approved=True)
        old_source = {**TOP_LEVELS, 'health_center': self.center.name,
                      'consultative_sector': 'قطاع سابق', 'service_program': 'برنامج محفوظ'}
        employee = Employee.objects.create(
            name='موظف اختبار', national_id='1000000003',
            health_center=self.center, source_organizational_hierarchy=old_source)
        context = {'request': SimpleNamespace(user=self.admin)}
        ordinary = EmployeeSerializer(employee, data={'current_job': 'وظيفة اختبار'},
                                      partial=True, context=context)
        self.assertTrue(ordinary.is_valid(), ordinary.errors)
        ordinary.save()
        employee.refresh_from_db()
        self.assertEqual(employee.source_organizational_hierarchy, old_source)
        self.assertFalse(EmployeeOrganizationalHierarchyEvent.objects.filter(employee=employee).exists())
        configured, labels = employee_assignment_hierarchy(self.center, None)
        self.assertTrue(configured)
        self.assertIsNotNone(labels)
        updated = {**self.hierarchy(), **labels, 'service_program': 'برنامج محفوظ'}
        invalid = EmployeeSerializer(employee, data={
            'source_organizational_hierarchy': {**updated, 'consultative_sector': 'قطاع غير مطابق'},
            'hierarchy_change_reason': 'تصحيح موثق بعد مراجعة المسار المعتمد'},
            partial=True, context=context)
        self.assertFalse(invalid.is_valid())
        self.assertIn('source_organizational_hierarchy', invalid.errors)
        no_reason = EmployeeSerializer(employee, data={'source_organizational_hierarchy': updated},
                                       partial=True, context=context)
        self.assertFalse(no_reason.is_valid())
        self.assertIn('hierarchy_change_reason', no_reason.errors)
        sync = EmployeeSerializer(employee, data={
            'source_organizational_hierarchy': updated,
            'hierarchy_change_reason': 'تصحيح موثق بعد مراجعة المسار المعتمد'},
            partial=True, context=context)
        self.assertTrue(sync.is_valid(), sync.errors)
        sync.save()
        employee.refresh_from_db()
        self.assertEqual(employee.health_center_id, self.center.pk)
        self.assertEqual(employee.source_organizational_hierarchy['consultative_sector'], sector.name)
        self.assertEqual(employee.source_organizational_hierarchy['service_program'], 'برنامج محفوظ')
        self.assertEqual(EmployeeOrganizationalHierarchyEvent.objects.filter(employee=employee).count(), 1)
