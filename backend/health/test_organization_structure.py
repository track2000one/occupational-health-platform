"""Synthetic-only organizational matching workflow and employee-link safety checks."""
from io import BytesIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from openpyxl import Workbook
from rest_framework.test import APIClient

from .models import Employee, HealthCenter, OrganizationUnit


STAGING_ENV = {
    'STAGING_MODE': 'true',
    'RAILWAY_PROJECT_ID': 'cf4b2162-5236-4f92-b010-165f505fe2c2',
}


def example_workbook():
    book = Workbook()
    book.remove(book.active)
    sources = [
        ('المراكز المقترحة', [
            'الرمز المؤقت', 'القطاع المقترح', 'اسم المركز المختصر', 'تكرار', 'صفوف',
            'عدد الوحدات', 'تمريض', 'إدارية', 'المسار', 'حالة الاعتماد', 'معرف المركز',
            'اسم رسمي', 'مرجع', 'ملاحظات',
        ], ['TMP-C001', 'قطاع تجريبي واحد', 'مركز صحي اختباري', 1, '21',
            1, 'نعم', 'نعم', 'قطاع تجريبي واحد / مركز صحي اختباري', 'بانتظار الاعتماد',
            '', '', '', '']),
        ('وحدات المراكز', [
            'الرمز المؤقت', 'القطاع', 'المركز', 'اسم الوحدة المختصر', 'نوع', 'تكرار',
            'الصفوف', 'المسار', 'حالة الاعتماد', 'معرف الوحدة', 'رمز المركز المؤقت',
            'مرجع', 'ملاحظة', '',
        ], ['TMP-U001', 'قطاع تجريبي واحد', 'مركز صحي اختباري', 'التمريض',
            'تمريض', 1, '42', 'قطاع تجريبي واحد / مركز صحي اختباري / التمريض',
            'بانتظار الاعتماد', '', 'TMP-C001', '', '', '']),
        ('جهات مركزية', [
            'الرمز المؤقت', 'النوع الأصلي', 'الاسم المختصر', 'التسلسل',
            'الإدارة الأم', 'العدد', 'الصفوف', 'التصنيف', 'الاعتماد',
            'المعرف', 'المرجع', 'الملاحظة', '', '',
        ], ['TMP-O001', 'إدارة', 'إدارة تجريبية', 'إدارة تجريبية',
            '', 1, '7', 'إدارة', 'بانتظار الاعتماد', '', '', '', '', '']),
    ]
    for name, headers, row in sources:
        ws = book.create_sheet(name)
        ws.append(['Reference only'])
        ws.append(['Do not assume approved'])
        ws.append([])
        ws.append(headers)
        ws.append(row)
    result = BytesIO()
    book.save(result)
    return result.getvalue()


class OrganizationHierarchySafetyTests(TestCase):
    def setUp(self):
        self.center = HealthCenter.objects.create(name='Synthetic Center')
        self.other_center = HealthCenter.objects.create(name='Other Synthetic Center')
        self.admin = get_user_model().objects.create_superuser(
            username='org_review_admin', email='qa@example.invalid', password='fake-qa-only',
        )
        self.reader = get_user_model().objects.create_user(
            username='org_review_reader', password='fake-qa-only',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def upload(self, confirm=False):
        data = {'file': SimpleUploadedFile(
            'synthetic-org-review.xlsx', example_workbook(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )}
        if confirm:
            data['confirm'] = 'IMPORT_ORGANIZATION_DRAFTS_ONLY'
        return self.client.post('/api/organization-units/import/', data, format='multipart')

    def test_preview_does_not_write_anything_and_normal_user_cannot_upload(self):
        preview = self.upload()
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertEqual(preview.data['total'], 4)
        self.assertEqual(OrganizationUnit.objects.count(), 0)
        self.client.force_authenticate(self.reader)
        response = self.upload(confirm=True)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(OrganizationUnit.objects.count(), 0)

    @patch.dict('os.environ', STAGING_ENV)
    def test_draft_import_remains_unapproved_and_idempotent(self):
        first = self.upload(confirm=True)
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(first.data['created'], 4)
        self.assertEqual(OrganizationUnit.objects.filter(is_approved=True).count(), 0)
        second = self.upload(confirm=True)
        self.assertEqual(second.status_code, 201, second.data)
        self.assertEqual(second.data['created'], 0)

        self.client.force_authenticate(self.reader)
        hidden = self.client.get('/api/organization-units/')
        self.assertEqual(hidden.status_code, 200)
        self.assertEqual(hidden.data['summary']['total'], 0)

    def test_draft_import_rejected_outside_explicit_staging(self):
        with patch.dict('os.environ', {'STAGING_MODE': 'false', **{
            'RAILWAY_PROJECT_ID': STAGING_ENV['RAILWAY_PROJECT_ID'],
        }}):
            denied = self.upload(confirm=True)
        self.assertEqual(denied.status_code, 403)
        self.assertEqual(OrganizationUnit.objects.count(), 0)

    @patch.dict('os.environ', STAGING_ENV)
    def test_approved_parent_then_mapped_center_then_unit_and_employee(self):
        self.assertEqual(self.upload(confirm=True).status_code, 201)
        sector = OrganizationUnit.objects.get(kind='sector')
        center = OrganizationUnit.objects.get(kind='center')
        unit = OrganizationUnit.objects.get(kind='unit')
        self.assertEqual(center.parent, sector)
        self.assertEqual(unit.parent, center)

        blocked = self.client.post('/api/organization-units/' + str(center.pk) + '/review/', {
            'action': 'approve', 'approval_reference': 'QA-APPROVAL-001',
        }, format='json')
        self.assertEqual(blocked.status_code, 409)

        self.assertEqual(self.client.post('/api/organization-units/' + str(sector.pk) + '/review/', {
            'action': 'approve', 'approval_reference': 'QA-APPROVAL-001',
        }, format='json').status_code, 200)
        self.assertEqual(self.client.post('/api/organization-units/' + str(center.pk) + '/review/', {
            'action': 'map-center', 'center_id': self.center.pk,
        }, format='json').status_code, 200)
        self.assertEqual(self.client.post('/api/organization-units/' + str(center.pk) + '/review/', {
            'action': 'approve', 'approval_reference': 'QA-APPROVAL-001',
        }, format='json').status_code, 200)
        self.assertEqual(self.client.post('/api/organization-units/' + str(unit.pk) + '/review/', {
            'action': 'approve', 'approval_reference': 'QA-APPROVAL-001',
        }, format='json').status_code, 200)
        unit.refresh_from_db()
        self.assertEqual(unit.health_center_id, self.center.pk)
        allowed = self.client.post('/api/employees/', {
            'name': 'موظف تجريبي',
            'national_id': '9998999001',
            'health_center': self.center.pk,
            'organization_unit': unit.pk,
        }, format='json')
        self.assertEqual(allowed.status_code, 201, allowed.data)
        self.assertEqual(Employee.objects.get(pk=allowed.data['id']).organization_unit, unit)

        wrong = self.client.post('/api/employees/', {
            'name': 'موظف آخر', 'national_id': '9998999002',
            'health_center': self.other_center.pk, 'organization_unit': unit.pk,
        }, format='json')
        self.assertEqual(wrong.status_code, 400, wrong.data)
        self.assertFalse(Employee.objects.filter(national_id='9998999002').exists())

    @patch.dict('os.environ', STAGING_ENV)
    def test_unapproved_unit_cannot_be_saved_to_employee(self):
        self.assertEqual(self.upload(confirm=True).status_code, 201)
        unit = OrganizationUnit.objects.get(kind='unit')
        response = self.client.post('/api/employees/', {
            'name': 'موظف قبل الاعتماد',
            'national_id': '9998999003', 'health_center': self.center.pk,
            'organization_unit': unit.pk,
        }, format='json')
        self.assertEqual(response.status_code, 400, response.data)
