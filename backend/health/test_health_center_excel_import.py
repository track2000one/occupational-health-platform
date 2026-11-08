"""Safe Excel master-center import tests with artificial names only."""
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from openpyxl import Workbook
from rest_framework.test import APIClient

from .models import Employee, HealthCenter, AuditLog


def workbook_upload(rows, header=('اسم المركز الصحي', 'رمز المركز', 'المنطقة')):
    book = Workbook()
    sheet = book.active
    sheet.title = 'المراكز'
    sheet.append(header)
    for row in rows:
        sheet.append(row)
    stream = BytesIO()
    book.save(stream)
    book.close()
    return SimpleUploadedFile(
        'health_centers.xlsx', stream.getvalue(),
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )


class HealthCenterExcelImportTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser(
            username='center_excel_admin', email='center@example.invalid',
            password='fake-only',
        )
        self.viewer = get_user_model().objects.create_user(
            username='center_excel_viewer', password='fake-only',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.url = '/api/health-centers/import-excel/'
        self.center = HealthCenter.objects.create(
            name='مركز الشرق التجريبي', name_ar='مركز الشرق التجريبي',
            code='QA-EAST', is_active=True,
        )
        self.employee = Employee.objects.create(
            name='QA employee', national_id='9998123111',
            employee_number='QA-HC-EXCEL-1', health_center=self.center,
        )

    def post(self, rows, action='preview', **extra):
        return self.client.post(
            self.url, {'file': workbook_upload(rows), 'action': action, **extra},
            format='multipart',
        )

    def test_preview_from_repeated_employee_workbook_deduplicates_center_names(self):
        original = HealthCenter.objects.count()
        rows = [('مركز الشرق التجريبي',), ('غرناطة التجريبي',),
                ('غرناطة التجريبي',), ('غرناطة التجريبي',),
                ('الفيصلية التجريبي',)]
        ans = self.client.post(
            self.url, {
                'file': workbook_upload(
                    rows, header=('Health center',)),
                'action': 'preview',
            }, format='multipart',
        )
        self.assertEqual(ans.status_code, 200, ans.data)
        self.assertEqual(ans.data['source_rows'], 5)
        self.assertEqual(ans.data['distinct_centers'], 3)
        self.assertEqual(ans.data['counts'], {'new': 2, 'existing': 1, 'conflict': 0})
        self.assertEqual(next(x for x in ans.data['preview'] if x['name'] == 'غرناطة التجريبي')['source_count'], 3)
        self.assertEqual(HealthCenter.objects.count(), original)
        self.assertEqual(Employee.objects.get(pk=self.employee.pk).health_center_id, self.center.pk)

    def test_confirm_adds_only_new_centers_without_changing_existing_or_employees(self):
        rows = [('مركز الشرق التجريبي', 'QA-EAST', ''),
                ('مركز جديد تجريبي', 'QA-NEW', 'الشرقية'),
                ('مركز جديد تجريبي', 'QA-NEW', 'الشرقية')]
        prev = self.post(rows)
        self.assertEqual(prev.status_code, 200, prev.data)
        self.assertEqual(prev.data['counts']['new'], 1)
        ret = self.post(
            rows, 'commit', preview_token=prev.data['preview_token'],
            confirmed='true', confirm_text='اعتماد المراكز الجديدة',
        )
        self.assertEqual(ret.status_code, 200, ret.data)
        self.assertEqual(ret.data['created_count'], 1)
        self.assertEqual(HealthCenter.objects.count(), 2)
        new_center = HealthCenter.objects.get(code='QA-NEW')
        self.assertEqual(new_center.name_ar, 'مركز جديد تجريبي')
        self.assertEqual(new_center.building_type, 'unknown')
        self.assertTrue(AuditLog.objects.filter(action='import_health_centers_from_excel').exists())
        self.center.refresh_from_db()
        self.employee.refresh_from_db()
        self.assertEqual(self.center.name_ar, 'مركز الشرق التجريبي')
        self.assertEqual(self.employee.health_center_id, self.center.pk)
        self.assertEqual(self.post(
            rows, 'commit', preview_token=prev.data['preview_token'],
            confirmed='true', confirm_text='اعتماد المراكز الجديدة',
        ).status_code, 409)

    def test_conflicting_codes_in_file_are_not_imported(self):
        rows = [('مركز الاختبار ألف', 'QA-DUP', ''),
                ('مركز الاختبار باء', 'QA-DUP', '')]
        preview = self.post(rows)
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertEqual(preview.data['counts'], {'new': 0, 'existing': 0, 'conflict': 2})
        self.assertEqual(HealthCenter.objects.count(), 1)

    def test_existing_code_used_with_new_name_is_conflict(self):
        prev = self.post([('مركز آخر', 'QA-EAST', '')])
        self.assertEqual(prev.data['counts']['conflict'], 1)
        self.assertEqual(HealthCenter.objects.count(), 1)

    def test_permission_and_confirmation(self):
        rows = [('مركز جديد', 'QA-NEW', '')]
        self.client.force_authenticate(self.viewer)
        self.assertEqual(self.post(rows).status_code, 403)
        self.client.force_authenticate(self.admin)
        preview = self.post(rows)
        self.assertEqual(self.post(rows, 'commit', preview_token=preview.data['preview_token'],
                                   confirmed='false', confirm_text='اعتماد المراكز الجديدة').status_code, 400)
        self.assertEqual(self.post(rows, 'commit', preview_token='bad',
                                   confirmed='true', confirm_text='اعتماد المراكز الجديدة').status_code, 409)
        self.assertEqual(HealthCenter.objects.count(), 1)

    def test_center_directory_changed_since_preview_prevents_commit(self):
        rows = [('مركز جديد تجريبي', 'QA-NEW', '')]
        preview = self.post(rows)
        self.assertEqual(preview.status_code, 200)
        HealthCenter.objects.create(name='مركز أُضيف بالتزامن', name_ar='مركز أُضيف بالتزامن')
        ret = self.post(rows, 'commit', preview_token=preview.data['preview_token'],
                        confirmed='true', confirm_text='اعتماد المراكز الجديدة')
        self.assertEqual(ret.status_code, 409)
        self.assertFalse(HealthCenter.objects.filter(code='QA-NEW').exists())

    def test_different_file_is_rejected_after_preview(self):
        prev = self.post([('مركز جديد', 'QA-1', '')])
        result = self.post([('مركز آخر', 'QA-2', '')], 'commit',
                           preview_token=prev.data['preview_token'],
                           confirmed='true', confirm_text='اعتماد المراكز الجديدة')
        self.assertEqual(result.status_code, 409)
