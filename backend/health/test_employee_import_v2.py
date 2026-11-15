"""Synthetic-only tests for Employee Excel Import V2 Phase 1.

No employee, review card, import batch, archive or medical writes are allowed.
"""
from io import BytesIO
import re
from zipfile import ZipFile

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from openpyxl import Workbook
from rest_framework.test import APIClient

from .models import AuditLog, Employee, EmployeeImportReview, DataImportBatch, HealthCenter, OrganizationUnit, EmployeeProfileCompletionEvent


class EmployeeImportV2PreviewTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_superuser(
            username='qa_import_v2_admin',
            email='qa-v2-admin@example.invalid',
            password='synthetic-admin-password',
        )
        self.staff = User.objects.create_user(
            username='qa_import_v2_staff',
            is_staff=True, password='synthetic-staff-password',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.url = '/api/employee-import-v2/preview/'

    def workbook(self, rows, headers=None, sheet_name='Employees'):
        wb = Workbook()
        ws = wb.active
        ws.title = sheet_name
        ws.append(headers or ['اسم الموظف', 'رقم الهوية / الإقامة',
                              'الرقم الوظيفي', 'المركز الصحي', 'الجنسية'])
        for item in rows:
            ws.append(item)
        bio = BytesIO()
        wb.save(bio)
        bio.seek(0)
        bio.name = 'employee-v2-synthetic.xlsx'
        return bio

    def preview(self, rows, headers=None):
        return self.client.post(
            self.url,
            {'file': self.workbook(rows, headers=headers),
             'sheet_name': 'Employees'},
            format='multipart',
        )

    def test_structure_preview_and_masking_are_read_only(self):
        response = self.preview([
            ['QA One', '1000000001', 'E-1', 'Center X', 'Saudi'],
            ['QA Two', '1000000002', '', 'Center X', 'Saudi'],
            ['QA Repeat', '1000000001', 'E-3', 'Center X', 'Saudi'],
            ['QA Invalid', '777', 'E-4', 'Center Y', 'Saudi'],
        ])
        self.assertEqual(response.status_code, 200, response.data)
        result = response.data
        self.assertEqual(result['mode'], 'read_only_registry_match_v2')
        self.assertEqual(result['rows_total'], 4)
        self.assertEqual(result['counts']['structurally_valid'], 1)
        self.assertEqual(result['counts']['incomplete_source'], 1)
        self.assertEqual(result['counts']['duplicate_in_file'], 1)
        self.assertEqual(result['counts']['invalid_core'], 1)
        self.assertEqual(result['recognized_columns'][0], 'name')
        self.assertTrue(result['database_identity_checked'])
        self.assertEqual(result['registry_counts']['new_provisional'], 1)
        self.assertEqual(result['registry_counts']['duplicate_file_identity'], 2)
        self.assertEqual(result['registry_counts']['invalid_identity'], 1)
        self.assertFalse(result['import_enabled'])
        self.assertEqual(result['employee_count_created'], 0)
        self.assertEqual(result['employee_count_updated'], 0)
        self.assertNotIn('1000000001', str(result))
        self.assertNotIn('QA One', str(result))
        self.assertEqual(response['Cache-Control'], 'private, no-store')
        self.assertEqual(Employee.objects.count(), 0)
        self.assertEqual(EmployeeImportReview.objects.count(), 0)
        self.assertEqual(DataImportBatch.objects.count(), 0)
        self.assertEqual(AuditLog.objects.count(), 0)

    def test_arabic_indic_digits_and_minimal_template(self):
        response = self.preview(
            [['محمد اختبار', '١٠٠٠٠٠٠٠٠٢']],
            headers=['اسم الموظف', 'رقم الهوية الوطنية'],
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['rows_total'], 1)
        self.assertEqual(response.data['counts'], {'structurally_valid': 1})
        self.assertEqual(response.data['sample_masked'][0]['identity_masked'], '10••••0002')
        self.assertEqual(response.data['registry_counts']['new_incomplete'], 1)
        self.assertEqual(response.data['yellow_missing_information'], 1)

    def test_masked_national_ids_are_rejected_with_safe_row_numbers(self):
        for masked in ('10••••1681', '10****1681', '10xx1681', '10…1681'):
            with self.subTest(masked_format=masked[-4:]):
                result = self.preview([
                    ['QA Masked Identity', masked, 'QA-MASK-1', '', 'السعودية'],
                ])
                self.assertEqual(result.status_code, 400, result.data)
                self.assertEqual(result.data['masked_identity_count'], 1)
                self.assertEqual(result.data['masked_identity_source_rows'], [2])
                self.assertNotIn(masked, str(result.data))
                self.assertFalse(Employee.objects.exists())
                self.assertFalse(DataImportBatch.objects.exists())

    @override_settings(EMPLOYEE_IMPORT_V2_COMMIT_ENABLED=True)
    def test_approval_cannot_import_redacted_source_national_id(self):
        from io import BytesIO
        file = self.workbook([
            ['QA Masked Identity', '10••••1681', 'QA-MASK-2', '', 'السعودية'],
        ])
        response = self.client.post(self.url, {
            'action': 'commit', 'file': file, 'sheet_name': 'Employees',
            'commit_token': 'not-a-valid-preview-token',
            'confirmed': 'true', 'identity_checked': 'true',
            'reason': 'Synthetic request must never import masked identifiers.',
        }, format='multipart')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(response.data['masked_identity_count'], 1)
        self.assertFalse(Employee.objects.exists())
        self.assertFalse(AuditLog.objects.exists())

    def test_full_excel_identity_is_masked_only_in_preview_not_in_source(self):
        response = self.preview([
            ['QA Valid Identity', '1000001681', 'QA-1681', '', 'السعودية'],
        ])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['sample_masked'][0]['identity_masked'],
                         '10••••1681')
        self.assertNotIn('1000001681', str(response.data))

    def _file_with_missing_or_false_dimensions(self, rows, *, dimension='missing'):
        """Rewrite only XLSX worksheet dimension metadata, as external generators do."""
        headers = [
            'المركز الصحي', 'اسم الموظف', 'رقم الهوية / الإقامة',
            'الرقم الوظيفي', 'البريد الإلكتروني', 'رقم الجوال',
            'تاريخ الميلاد', 'مكان الميلاد', 'الجنس', 'الحالة الاجتماعية',
            'العنوان الوطني', 'المسمى الوظيفي', 'تاريخ التعيين',
            'الجنسية', 'الوظيفة الحالية', 'المسمى الوظيفي بالإنجليزية',
            'عدد الأطفال', 'رمز الوحدة التنظيمية',
            'مسمى المركز المرجعي (للعرض فقط)',
            'مسمى الجهة أو الوحدة من المصدر (للعرض فقط)',
            'المسار التنظيمي الأصلي (للعرض فقط)',
            'نوع التبعية التنظيمية (للعرض فقط)',
            'حالة التحقق من الاعتماد (للعرض فقط)',
            'المعرف المؤقت من الدليل (للعرض فقط)',
            'القطاع الاستشاري المقترح (للعرض فقط)',
            'الجهة أو الوحدة المعتمدة في المنصة (بعد التحقق)',
            'معرف الجهة المعتمد في المنصة (بعد التحقق)',
            'ملاحظة الربط والتحقق (للعرض فقط)',
        ]
        workbook = self.workbook(rows, headers=headers).getvalue()
        output = BytesIO()
        with ZipFile(BytesIO(workbook)) as source:
            with ZipFile(output, 'w') as sink:
                for entry in source.infolist():
                    content = source.read(entry.filename)
                    if entry.filename == 'xl/worksheets/sheet1.xml':
                        if dimension == 'missing':
                            content, changed = re.subn(
                                rb'<dimension\s+ref="[^"]*"\s*/>', b'', content,
                            )
                        else:
                            content, changed = re.subn(
                                rb'<dimension\s+ref="[^"]*"\s*/>',
                                b'<dimension ref="A1"/>', content,
                            )
                        self.assertEqual(changed, 1, 'Fixture must change Excel dimension')
                    sink.writestr(entry, content)
        output.seek(0)
        output.name = 'synthetic-review-no-dimensions.xlsx'
        return output

    def test_reviewed_1423_row_file_with_no_dimension_is_read_completely(self):
        # Structural reproduction of the uploaded file: 28 columns, no
        # worksheet dimension element, and 1,423 unique synthetic IDs.
        rows = []
        for index in range(1423):
            row = [''] * 28
            row[1] = f'Synthetic Worker {index:04d}'
            row[2] = str(1000000000 + index)
            row[3] = f'QA-{index:04d}'
            row[13] = 'السعودية'
            rows.append(row)
        original = self._file_with_missing_or_false_dimensions(rows)
        result = self.client.post(
            self.url, {'file': original, 'sheet_name': 'Employees'}, format='multipart',
        )
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['rows_total'], 1423)
        self.assertEqual(result.data['header_row'], 1)
        self.assertIn('name', result.data['recognized_columns'])
        self.assertIn('national_id', result.data['recognized_columns'])
        self.assertEqual(result.data['sample_masked'][0]['identity_masked'], '10••••0000')
        self.assertNotIn('1000000000', str(result.data))
        self.assertFalse(Employee.objects.exists())
        self.assertFalse(DataImportBatch.objects.exists())

    def test_false_a1_only_dimension_does_not_hide_real_header_columns(self):
        row = [''] * 28
        row[1] = 'QA Known Staff'
        row[2] = '1000001777'
        row[3] = 'QA-1777'
        row[13] = 'السعودية'
        original = self._file_with_missing_or_false_dimensions(
            [row], dimension='false_A1',
        )
        result = self.client.post(
            self.url, {'file': original, 'sheet_name': 'Employees'}, format='multipart',
        )
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['rows_total'], 1)
        self.assertEqual(result.data['header_row'], 1)
        self.assertEqual(result.data['sample_masked'][0]['identity_masked'], '10••••1777')
        self.assertFalse(Employee.objects.exists())

    def test_exact_reviewed_employee_workbook_header_layout_is_recognized(self):
        # Only synthetic rows; column labels match the real 28-column template.
        headers = [
            'المركز الصحي', 'اسم الموظف', 'رقم الهوية / الإقامة',
            'الرقم الوظيفي', 'البريد الإلكتروني', 'رقم الجوال',
            'تاريخ الميلاد', 'مكان الميلاد', 'الجنس', 'الحالة الاجتماعية',
            'العنوان الوطني', 'المسمى الوظيفي', 'تاريخ التعيين',
            'الجنسية', 'الوظيفة الحالية', 'المسمى الوظيفي بالإنجليزية',
            'عدد الأطفال', 'رمز الوحدة التنظيمية',
            'مسمى المركز المرجعي (للعرض فقط)',
            'مسمى الجهة أو الوحدة من المصدر (للعرض فقط)',
            'المسار التنظيمي الأصلي (للعرض فقط)',
            'نوع التبعية التنظيمية (للعرض فقط)',
            'حالة التحقق من الاعتماد (للعرض فقط)',
            'المعرف المؤقت من الدليل (للعرض فقط)',
            'القطاع الاستشاري المقترح (للعرض فقط)',
            'الجهة أو الوحدة المعتمدة في المنصة (بعد التحقق)',
            'معرف الجهة المعتمد في المنصة (بعد التحقق)',
            'ملاحظة الربط والتحقق (للعرض فقط)',
        ]
        row = [''] * len(headers)
        row[1] = 'Synthetic Excel Test'
        row[2] = '1000001981'
        row[3] = 'QA-1981'
        row[13] = 'السعودية'
        response = self.preview([row], headers=headers)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['rows_total'], 1)
        self.assertEqual(response.data['header_row'], 1)
        self.assertIn('name', response.data['recognized_columns'])
        self.assertIn('national_id', response.data['recognized_columns'])
        self.assertEqual(response.data['sample_masked'][0]['identity_masked'],
                         '10••••1981')
        self.assertNotIn('1000001981', str(response.data))
        self.assertFalse(Employee.objects.exists())

    def test_fallback_column_selector_recovers_unusual_headers_without_edits(self):
        headers = ['المركز الصحي', 'اسم العامل حسب المصدر', 'معرف العامل الأصلي']
        rows = [['', 'QA Unusual Header', '1000001982']]
        result = self.preview(rows, headers=headers)
        self.assertEqual(result.status_code, 400, result.data)
        self.assertIn('name', result.data['missing_required'])
        self.assertIn('national_id', result.data['missing_required'])
        self.assertEqual(result.data['header_row'], 1)
        self.assertEqual(len(result.data['available_columns']), len(headers))
        response = self.client.post(self.url, {
            'file': self.workbook(rows, headers=headers),
            'sheet_name': 'Employees',
            'map_name_column': '2',
            'map_national_id_column': '3',
        }, format='multipart')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['rows_total'], 1)
        self.assertEqual(response.data['sample_masked'][0]['identity_masked'],
                         '10••••1982')
        self.assertNotIn('1000001982', str(response.data))
        self.assertFalse(Employee.objects.exists())

    def test_manual_mappings_reject_same_column_and_masked_source(self):
        rows = [['QA Mask Source', '10••••1983']]
        headers = ['اسم الموظف المختلف', 'رقم الهوية المختلف']
        same = self.client.post(self.url, {
            'file': self.workbook(rows, headers=headers),
            'map_name_column': '1', 'map_national_id_column': '1',
        }, format='multipart')
        self.assertEqual(same.status_code, 400, same.data)
        masked = self.client.post(self.url, {
            'file': self.workbook(rows, headers=headers),
            'map_name_column': '1', 'map_national_id_column': '2',
        }, format='multipart')
        self.assertEqual(masked.status_code, 400, masked.data)
        self.assertEqual(masked.data['masked_identity_count'], 1)
        self.assertFalse(Employee.objects.exists())

    def test_missing_required_headers_rejected(self):
        response = self.preview([['QA', 'Center 1']],
                                headers=['اسم الموظف', 'المركز الصحي'])
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('national_id', response.data['missing_required'])
        self.assertFalse(EmployeeImportReview.objects.exists())

    def test_role_permissions_and_invalid_file(self):
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.preview([['QA', '1000000001']]).status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.preview([['QA', '1000000001']]).status_code, (401, 403))
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            self.url, {'file': BytesIO(b'not an xlsx file')}, format='multipart',
        )
        self.assertEqual(response.status_code, 400)

    @override_settings(LEGACY_EMPLOYEE_EXCEL_IMPORTS_ENABLED=False)
    def test_old_employee_import_endpoints_are_retired_but_v2_works(self):
        legacy = (
            '/api/employee-roster/reconcile/',
            '/api/employee-import-reviews/cleanup/',
            '/api/employee-roster-template/',
            '/api/workforce-roster/preview/',
            '/api/workforce-roster/import-plan/',
        )
        for endpoint in legacy:
            with self.subTest(endpoint=endpoint):
                response = self.client.post(endpoint, {}, format='multipart')
                self.assertEqual(response.status_code, 403, response.content[:250])
                self.assertTrue(response.json()['legacy_import_disabled'])
                self.assertEqual(response['Cache-Control'], 'private, no-store')
        old_excel = self.client.post(
            '/api/excel-import/upload/',
            {'file': self.workbook([['QA Authorized', '1000000001']])},
            format='multipart',
        )
        self.assertEqual(old_excel.status_code, 410, old_excel.data)
        self.assertFalse(DataImportBatch.objects.exists())
        current = self.preview([['QA Authorized', '1000000001']],
                               headers=['اسم الموظف', 'رقم الهوية الوطنية'])
        self.assertEqual(current.status_code, 200, current.data)
        self.assertEqual(Employee.objects.count(), 0)
        self.assertEqual(EmployeeImportReview.objects.count(), 0)
        self.assertEqual(DataImportBatch.objects.count(), 0)

    def test_approved_center_and_new_identity_are_candidates_only(self):
        center = HealthCenter.objects.create(
            name='QA Official Center', name_ar='المركز الاختباري',
            code='QA-HC-100', approval_status='approved', is_active=True,
        )
        response = self.preview([
            ['موظف اختباري جديد', '1000001011', 'QA-NEW-11',
             'المركز الاختباري', 'السعودية'],
        ])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['registry_counts']['new_candidate'], 1)
        self.assertEqual(response.data['employee_count_created'], 0)
        self.assertEqual(response.data['employee_count_updated'], 0)
        self.assertFalse(response.data['import_enabled'])
        self.assertEqual(Employee.objects.count(), 0)
        center.refresh_from_db()
        self.assertEqual(center.approval_status, 'approved')

    def test_unapproved_center_is_reviewed_without_placeholder_assignment(self):
        HealthCenter.objects.create(
            name='QA Draft Center', name_ar='المركز غير المعتمد',
            code='QA-HC-101', approval_status='pending',
        )
        preview = self.preview([
            ['موظف اختبار', '1000001012', 'QA-NEW-12',
             'المركز غير المعتمد', 'السعودية'],
        ])
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertEqual(preview.data['registry_counts']['new_provisional'], 1)
        self.assertEqual(Employee.objects.count(), 0)
        self.assertFalse(EmployeeImportReview.objects.exists())

    def test_archived_employee_is_never_reactivated_on_preview(self):
        archived = Employee.objects.create(
            name='موظف اختبار مؤرشف', national_id='1000001013',
            is_archived=True, employee_number='QA-A13',
        )
        response = self.preview([
            ['موظف اختبار مؤرشف', '1000001013', 'QA-A13', '', ''],
        ])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['registry_counts']['archived_review'], 1)
        self.assertEqual(response.data['identity_found'], 1)
        self.assertTrue(response.data['review_examples_masked'][0]['archived_record'])
        archived.refresh_from_db()
        self.assertTrue(archived.is_archived)
        self.assertIsNone(archived.health_center_id)
        self.assertFalse(EmployeeImportReview.objects.exists())

    def test_identity_is_unique_even_when_name_has_same_language_variation(self):
        Employee.objects.create(
            name='محمد عبدالله القحطاني',
            national_id='1000001014', employee_number='QA-A14',
        )
        response = self.preview([
            ['محمد سالم القحطاني', '1000001014', 'QA-A14', '', ''],
        ])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['registry_counts']['name_review'], 1)
        self.assertEqual(response.data['identity_found'], 1)
        self.assertFalse(response.data['import_enabled'])
        self.assertEqual(Employee.objects.count(), 1)

    def test_existing_empty_fields_only_reported_for_later_fill(self):
        center = HealthCenter.objects.create(
            name='QA Active Center', name_ar='المركز الفعال',
            code='QA-HC-102', approval_status='approved',
        )
        employee = Employee.objects.create(
            name='موظف فعال', national_id='1000001015',
            health_center=center, nationality='',
        )
        response = self.preview([
            ['موظف فعال', '1000001015', 'QA-EN15',
             'المركز الفعال', 'السعودية'],
        ])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['registry_counts']['existing_fill_only'], 1)
        employee.refresh_from_db()
        self.assertEqual(employee.nationality, '')
        self.assertEqual(employee.employee_number, None)
        self.assertEqual(employee.health_center_id, center.pk)
        self.assertEqual(EmployeeImportReview.objects.count(), 0)

    def test_other_employee_email_or_job_number_cannot_be_claimed(self):
        Employee.objects.create(
            name='صاحب الرقم', national_id='1000001016',
            employee_number='QA-DUP-16', email='qa-owner@example.invalid',
        )
        response = self.preview([
            ['موظف جديد', '1000001017', 'QA-DUP-16', '', ''],
        ])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['registry_counts']['identifier_owned_by_other'], 1)
        self.assertEqual(Employee.objects.count(), 1)

    def test_existing_employee_job_number_mismatch_requires_review(self):
        Employee.objects.create(
            name='موظف رقم', national_id='1000001018', employee_number='QA-OLD-18',
        )
        response = self.preview([
            ['موظف رقم', '1000001018', 'QA-NEW-18', '', ''],
        ])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['registry_counts']['identifier_disagreement'], 1)
        self.assertEqual(Employee.objects.get(national_id='1000001018').employee_number, 'QA-OLD-18')

    def test_organization_name_must_be_unique_and_formally_approved(self):
        center = HealthCenter.objects.create(
            name='QA Organization Center', name_ar='المركز التنظيمي',
            code='QA-HC-201', approval_status='approved',
        )
        org = OrganizationUnit.objects.create(
            code='QA-UNIT-201', name='الوحدة التنظيمية الرسمية',
            kind='unit', health_center=center,
            is_approved=True, is_active=True,
        )
        headers = [
            'اسم الموظف', 'رقم الهوية / الإقامة', 'الرقم الوظيفي',
            'المركز الصحي', 'الجنسية', 'الجهة / الوحدة التنظيمية المعتمدة',
        ]
        response = self.preview(
            [['موظف التنظيم', '1000001111', 'QA-1111',
              'المركز التنظيمي', 'السعودية', 'الوحدة التنظيمية الرسمية']],
            headers=headers,
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['registry_counts']['new_candidate'], 1)
        self.assertEqual(Employee.objects.count(), 0)
        org.refresh_from_db()
        self.assertTrue(org.is_approved)

        org.is_approved = False
        org.save(update_fields=['is_approved'])
        blocked = self.preview(
            [['موظف التنظيم', '1000001112', 'QA-1112',
              'المركز التنظيمي', 'السعودية', 'الوحدة التنظيمية الرسمية']],
            headers=headers,
        )
        self.assertEqual(blocked.status_code, 200, blocked.data)
        self.assertEqual(blocked.data['registry_counts']['new_provisional'], 1)
        self.assertFalse(Employee.objects.exists())

    def test_mismatched_organization_center_is_review_only(self):
        center = HealthCenter.objects.create(
            name='QA Source Center', code='QA-HC-202', approval_status='approved',
        )
        other_center = HealthCenter.objects.create(
            name='QA Other Center', code='QA-HC-203', approval_status='approved',
        )
        OrganizationUnit.objects.create(
            name='QA Other Unit', code='QA-UNIT-203', kind='unit',
            health_center=other_center, is_approved=True,
        )
        rows = [['QA Test Org User', '1000001113', 'QA-1113',
                 'QA Source Center', 'SA', 'QA Other Unit']]
        headers = [
            'اسم الموظف', 'رقم الهوية الوطنية', 'الرقم الوظيفي',
            'المركز الصحي', 'الجنسية', 'الجهة / الوحدة التنظيمية المعتمدة',
        ]
        response = self.preview(rows, headers=headers)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['registry_counts']['new_provisional'], 1)
        self.assertFalse(Employee.objects.exists())

    def test_independent_archived_and_name_mismatch_counts_include_overlap(self):
        cases = [
            ('QA Active Original', '1000001771', False, 'QA Active Modified'),
            ('QA Archived Original', '1000001772', True, 'QA Archived Modified'),
            ('QA Archived Same', '1000001773', True, 'QA Archived Same'),
            ('QA Active Same', '1000001774', False, 'QA Active Same'),
        ]
        for database_name, national_id, archived, _ in cases:
            Employee.objects.create(
                name=database_name, national_id=national_id, is_archived=archived,
            )
        preview = self.preview([
            [source_name, national_id, '', '', '']
            for _, national_id, _, source_name in cases
        ])
        self.assertEqual(preview.status_code, 200, preview.data)
        flags = preview.data['registry_facets']
        self.assertEqual(flags['matched_identity_total'], 4)
        self.assertEqual(flags['active_identity_total'], 2)
        self.assertEqual(flags['archived_identity_total'], 2)
        self.assertEqual(flags['name_difference_total'], 2)
        self.assertEqual(flags['archived_with_name_difference'], 1)
        # Primary status is exclusive; facets are NOT exclusive.
        self.assertEqual(preview.data['registry_counts']['name_review'], 2)
        self.assertEqual(preview.data['registry_counts']['archived_review'], 1)
        self.assertEqual(preview.data['safe_import_candidate_counts']['create'], 0)
        self.assertEqual(preview.data['safe_import_candidate_counts']['fill_only'], 0)
        self.assertEqual(Employee.objects.count(), 4)
        self.assertEqual(Employee.objects.filter(is_archived=True).count(), 2)
        self.assertFalse(EmployeeImportReview.objects.exists())
        self.assertFalse(DataImportBatch.objects.exists())

    def test_duplicate_identity_columns_cannot_silently_choose_one(self):
        response = self.preview(
            [['QA Header', '1000001211', '1000001212', 'QA-1211']],
            headers=['اسم الموظف', 'رقم الهوية الوطنية', 'رقم الهوية', 'الرقم الوظيفي'],
        )
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('national_id', response.data['ambiguous_columns'])
        self.assertFalse(Employee.objects.exists())

    def test_employee_number_owner_matching_is_case_insensitive(self):
        Employee.objects.create(
            name='صاحب الرقم القديم', national_id='1000001213',
            employee_number='QA-AbC-1213',
        )
        response = self.preview([
            ['موظف مختلف', '1000001214', 'qa-abc-1213', '', ''],
        ])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            response.data['registry_counts']['identifier_owned_by_other'], 1
        )
        self.assertEqual(Employee.objects.count(), 1)

    def apply_v2(self, rows, *, different_file=False):
        original = self.workbook(rows).getvalue()
        def infile(b):
            f = BytesIO(b)
            f.name = 'qa-v2-upload.xlsx'
            return f
        preview = self.client.post(self.url, {
            'action': 'preview', 'file': infile(original),
            'sheet_name': 'Employees',
        }, format='multipart')
        self.assertEqual(preview.status_code, 200, preview.data)
        changed = (self.workbook([['Other Name', '1000001999']]).getvalue()
                   if different_file else original)
        result = self.client.post(self.url, {
            'action': 'commit', 'file': infile(changed),
            'sheet_name': 'Employees',
            'commit_token': preview.data['commit_token'],
            'confirm_phrase': preview.data['confirm_phrase'],
            'confirmed': 'true', 'identity_checked': 'true',
            'reason': 'Approved synthetic staff source with verified employee identities',
        }, format='multipart')
        return preview, result

    @override_settings(EMPLOYEE_IMPORT_V2_COMMIT_ENABLED=False)
    def test_v2_commit_disabled_by_default(self):
        preview, result = self.apply_v2([
            ['QA Candidate', '1000001501', 'QA-1501', '', 'السعودية'],
        ])
        self.assertFalse(preview.data['commit_available'])
        self.assertEqual(result.status_code, 403, result.data)
        self.assertFalse(Employee.objects.exists())
        self.assertFalse(DataImportBatch.objects.exists())

    @override_settings(EMPLOYEE_IMPORT_V2_COMMIT_ENABLED=True)
    def test_v2_creates_new_provisional_with_normalized_nationality(self):
        preview, result = self.apply_v2([
            ['QA Candidate', '1000001502', 'QA-1502', '', 'السعودية'],
        ])
        self.assertEqual(preview.data['safe_import_candidate_counts']['create'], 1)
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['created'], 1)
        self.assertEqual(result.data['provisional'], 1)
        self.assertEqual(result.data['archived_restored'], 0)
        employee = Employee.objects.get(national_id='1000001502')
        self.assertEqual(employee.nationality, 'SA')
        self.assertEqual(employee.registration_status, 'provisional')
        self.assertIsNone(employee.health_center)
        self.assertEqual(DataImportBatch.objects.filter(mode='commit').count(), 1)
        self.assertEqual(AuditLog.objects.filter(
            action='employee_import_v2_controlled_commit').count(), 1)

    @override_settings(EMPLOYEE_IMPORT_V2_COMMIT_ENABLED=True)
    def test_v2_fill_only_does_not_restore_archived_employee(self):
        active = Employee.objects.create(
            name='QA Active', national_id='1000001503',
            employee_number='QA-1503', nationality='', email='keep.qa@example.invalid',
        )
        archived = Employee.objects.create(
            name='QA Archived', national_id='1000001504',
            employee_number='QA-1504', nationality='', is_archived=True,
        )
        preview, result = self.apply_v2([
            ['QA Active', '1000001503', 'QA-1503', '', 'السعودية'],
            ['QA Archived', '1000001504', 'QA-1504', '', 'السعودية'],
        ])
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['filled'], 1)
        self.assertEqual(result.data['skipped'], 1)
        active.refresh_from_db()
        archived.refresh_from_db()
        self.assertEqual(active.nationality, 'SA')
        self.assertEqual(active.email, 'keep.qa@example.invalid')
        self.assertTrue(archived.is_archived)
        self.assertEqual(archived.nationality, '')
        self.assertEqual(EmployeeProfileCompletionEvent.objects.count(), 1)

    @override_settings(EMPLOYEE_IMPORT_V2_COMMIT_ENABLED=True)
    def test_v2_changed_workbook_is_rejected(self):
        _, result = self.apply_v2(
            [['QA Candidate', '1000001505', 'QA-1505', '', 'السعودية']],
            different_file=True,
        )
        self.assertEqual(result.status_code, 409, result.data)
        self.assertFalse(Employee.objects.exists())

    @override_settings(EMPLOYEE_IMPORT_V2_COMMIT_ENABLED=True)
    def test_v2_skips_conflicting_job_number_but_adds_safe_candidate(self):
        Employee.objects.create(
            name='QA Owner', national_id='1000001506', employee_number='QA-DUP',
        )
        preview, result = self.apply_v2([
            ['QA Different', '1000001507', 'QA-DUP', '', 'السعودية'],
            ['QA New', '1000001508', 'QA-1508', '', 'السعودية'],
        ])
        self.assertEqual(preview.data['registry_counts']['identifier_owned_by_other'], 1)
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['created'], 1)
        self.assertEqual(result.data['skipped'], 1)
        self.assertFalse(Employee.objects.filter(national_id='1000001507').exists())
        self.assertTrue(Employee.objects.filter(national_id='1000001508').exists())
