"""Synthetic V4 31-column roster safety checks; no real employee data."""
from io import BytesIO
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from openpyxl import Workbook
from rest_framework.test import APIClient

from .employee_org_template_v4 import HEADERS, TOP_LEVELS
from .models import Employee, ProvisionalEmployeeRosterRow, OrganizationUnit
from .provisional_employee_roster import _unseal


def fake_book(rows=2):
    book = Workbook()
    sheet = book.active
    sheet.title = 'Employees'
    sheet.append(HEADERS)
    for n in range(rows):
        src = {label: 'لا ينطبق' for label in HEADERS}
        src.update({
            'اسم الموظف': 'Synthetic Employee %s' % n,
            'رقم الهوية / الإقامة': str(1000010000+n),
            'الرقم الوظيفي': 'TEST-%s' % n,
            'البريد الإلكتروني': 'test%s@example.invalid' % n,
            'الشركة القابضة': TOP_LEVELS['holding_company'],
            'التجمع الصحي': TOP_LEVELS['health_cluster'],
            'الشبكة الصحية': TOP_LEVELS['health_network'],
            'الإدارة الرئيسية': 'الرعاية الأولية والمجتمعية',
            'الإدارة الفرعية': 'القطاعات التشغيلية للرعاية الأولية',
            'القسم': 'غير محدد في المصدر',
            'الوحدة الفرعية': 'لا ينطبق',
            'القطاع الاستشاري': 'القطاع الغربي الاستشاري 1',
            'المركز الصحي': 'الفيصلية',
            'الخدمة / البرنامج': 'تمريض الرعاية الصحية الأولية',
            'نطاق تقديم الخدمة': 'PHC',
            'الفئة الخدمية': 'لا ينطبق',
            'التخصص داخل المسار': 'لا ينطبق',
            'حالة المراجعة': 'مراجعة تصنيف وظيفي' if n else 'لا توجد ملاحظة تصنيفية سابقة',
            'ملاحظات المراجعة': 'Synthetic classification note' if n else '',
            'تاريخ التعيين': '1447/07/12',
        })
        sheet.append([src[label] for label in HEADERS])
    out = BytesIO()
    book.save(out)
    book.close()
    return out.getvalue()


class V4ProvisionalRosterImportTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser(
            username='v4-test-admin',password='synthetic-test-secret')
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def send(self, url, content, scope='v4'):
        with patch('health.provisional_employee_roster.draft_import_scope', return_value=scope):
            return self.client.post(url, {
                'file':SimpleUploadedFile('synthetic-v4.xlsx',content,
                    content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            },format='multipart')

    def test_preflight_and_import_preserve_all_13_levels_and_review_notes(self):
        data = fake_book()
        preview = self.send('/api/provisional-employees/template-preflight/',data)
        self.assertEqual(preview.status_code,200,preview.data)
        self.assertEqual(preview.data['schema_version'],'OHP-EMPLOYEE-ORGANIZATIONAL-V4')
        self.assertEqual(preview.data['valid_rows'],2)
        self.assertEqual(preview.data['organizational_source_levels_preserved'],13)
        self.assertEqual(preview.data['source_review_required_count'],1)
        self.assertFalse(preview.data['medical_or_original_records_modified'])
        result = self.send('/api/provisional-employees/import/',data)
        self.assertEqual(result.status_code,201,result.data)
        self.assertEqual(result.data['total'],2)
        row = ProvisionalEmployeeRosterRow.objects.get(source_row=3)
        self.assertNotIn('1000010001',row.sealed_payload)
        source = _unseal(row.sealed_payload)
        self.assertEqual(len(source['source_organizational_hierarchy']),13)
        self.assertEqual(source['source_organizational_hierarchy']['service_scope'],'PHC')
        self.assertEqual(source['source_organizational_hierarchy']['main_administration'],'الرعاية الأولية والمجتمعية')
        self.assertEqual(source['source_review_status'],'مراجعة تصنيف وظيفي')
        self.assertEqual(source['appointment_date'],'1447/07/12')
        self.assertEqual(Employee.objects.count(),0)
        self.assertEqual(OrganizationUnit.objects.count(),0)
        second = self.send('/api/provisional-employees/import/',data)
        self.assertTrue(second.data['already_imported'])
        self.assertEqual(ProvisionalEmployeeRosterRow.objects.count(),2)

    def test_incomplete_or_changed_excel_blocks_without_writes(self):
        book = Workbook()
        sheet = book.active
        sheet.title='Employees'
        sheet.append(HEADERS)
        line = {key:'لا ينطبق' for key in HEADERS}
        line.update({
            'اسم الموظف':'Synthetic', 'رقم الهوية / الإقامة':'1000010002',
            'الشركة القابضة':TOP_LEVELS['holding_company'],
            'التجمع الصحي':TOP_LEVELS['health_cluster'],
            'الشبكة الصحية':TOP_LEVELS['health_network'],
            'الإدارة الرئيسية':'', 'المركز الصحي':'الفيصلية',
        })
        sheet.append([line[key] for key in HEADERS])
        output=BytesIO(); book.save(output); book.close()
        response=self.send('/api/provisional-employees/import/',output.getvalue())
        self.assertEqual(response.status_code,400)
        self.assertFalse(ProvisionalEmployeeRosterRow.objects.exists())

    def test_original_production_or_staging_rejects_v4_workbook(self):
        data = fake_book()
        for scope in ('staging', ''):
            result = self.send('/api/provisional-employees/import/', data, scope=scope)
            self.assertEqual(result.status_code, 400)
        self.assertFalse(ProvisionalEmployeeRosterRow.objects.exists())
        self.assertFalse(Employee.objects.exists())
