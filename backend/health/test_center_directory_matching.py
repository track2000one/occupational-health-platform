"""Synthetic-only tests for non-destructive 25/47-style Excel directory matching."""
from io import BytesIO

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import Workbook
from rest_framework.test import APIClient

from .models import (
    AuditLog, Employee, HealthCenter, HealthCenterAlias,
    HealthCenterProfileAuditEvent, OrganizationUnit,
    CenterDirectoryMatchingBatch, UserProfile,
)
from .center_directory_matching import parse_directory


CENTER_HEADER = [
    'م', 'معرف داخلي مؤقت', 'اسم المركز الصحي',
    'القطاع المقترح', 'المظلة التنظيمية المقترحة', 'حالة الاعتماد',
    'عدد مرات الورود', 'صفوف المصدر', 'عدد الوحدات المسجلة',
    'وحدة التمريض', 'الوحدة الإدارية', 'ملاحظات التدقيق',
    'مدير المركز (للاستكمال)', 'الرمز الرسمي (للاستكمال)',
]
UNIT_HEADER = [
    'م', 'معرف وحدة مؤقت', 'اسم الوحدة الموحد', 'نوع المصدر',
    'معرف المركز', 'المركز الصحي', 'القطاع المقترح', 'حالة الاعتماد',
    'عدد مرات الورود', 'صفوف المصدر', 'تصنيف الوحدة',
    'ملاحظة تنسيق/تكرار', 'مرجع اعتماد الوحدة',
]


def demo_workbook(*, duplicate=False):
    wb = Workbook()
    sheet = wb.active
    sheet.title = 'المراكز_الصحية'
    sheet.append(['دليل تجريبي - اصطناعي'])
    sheet.append(['ليس للموظفين'])
    sheet.append([])
    sheet.append(CENTER_HEADER)
    rows = [
        [1, 'HC-001', 'الجلوية', 'القطاع الشرقي الاستشاري 1',
         'الرعاية الأولية والمجتمعية (تسلسل مقترح)', 'مسودة', 1, '12'],
        [2, 'HC-002', 'الاثير', 'القطاع الشرقي الاستشاري 1',
         'الرعاية الأولية والمجتمعية (تسلسل مقترح)', 'مسودة', 1, '15'],
        [3, 'HC-003' if not duplicate else 'HC-002', 'مركز غير موجود',
         'القطاع الغربي الاستشاري 2',
         'الرعاية الأولية والمجتمعية (تسلسل مقترح)', 'مسودة', 1, '19'],
    ]
    for row in rows:
        sheet.append(row)
    units = wb.create_sheet('وحدات_المراكز')
    units.append(['وحدات تجريبية'])
    units.append(['لا تحتوي بيانات شخصية'])
    units.append([])
    units.append(UNIT_HEADER)
    for row in [
        [1, 'UNIT-001', 'التمريض', 'وحدة', 'HC-001', 'الجلوية',
         'القطاع الشرقي الاستشاري 1', 'مسودة', 1, '21'],
        [2, 'UNIT-002', 'الوحدة الإدارية', 'وحدة', 'HC-001', 'الجلوية',
         'القطاع الشرقي الاستشاري 1', 'مسودة', 1, '22'],
        [3, 'UNIT-003', 'وحدة التمريض', 'وحدة', 'HC-002', 'الاثير',
         'القطاع الشرقي الاستشاري 1', 'مسودة', 1, '23'],
        [4, 'UNIT-004', 'المختبر', 'وحدة', 'HC-003', 'مركز غير موجود',
         'القطاع الغربي الاستشاري 2', 'مسودة', 1, '24'],
    ]:
        units.append(row)
    wb.create_sheet('بيانات الموظفين - لا تقرأ').append(['National ID', '9990001111'])
    out = BytesIO()
    wb.save(out)
    wb.close()
    return out.getvalue()


class CenterDirectoryMatchingTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_superuser(
            username='ci_directory_admin',
            password='synthetic-only', email='directory-ci@example.invalid',
        )
        self.manager = User.objects.create_user(
            username='ci_directory_manager', password='synthetic-only',
        )
        UserProfile.objects.create(user=self.manager, role='ohManager')
        self.viewer = User.objects.create_user(
            username='ci_directory_viewer', password='synthetic-only',
        )
        self.c1 = HealthCenter.objects.create(
            name='علي السلمان بالجلوية', name_ar='علي السلمان بالجلوية',
            code='CI-CENTER-01',
        )
        self.c2 = HealthCenter.objects.create(
            name='الاثير', name_ar='الاثير', code='CI-CENTER-02',
        )
        self.c3 = HealthCenter.objects.create(
            name='مركز قائم آخر', name_ar='مركز قائم آخر', code='CI-CENTER-03',
        )
        HealthCenterAlias.objects.create(
            center=self.c1, name='الجلوية', normalized_name='الجلوية',
        )
        self.existing_unit = OrganizationUnit.objects.create(
            code='CI-UNIT-EXISTING', kind='unit', name='التمريض',
            health_center=self.c1, is_approved=True, is_active=True,
        )
        self.employee = Employee.objects.create(
            name='Synthetic CI worker', national_id='9998550111',
            employee_number='CI-MATCH-001', health_center=self.c1,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.url = '/api/center-directory/match/'
        self.data = demo_workbook()

    def send(self, action='preview', **options):
        return self.client.post(self.url, {
            'file': SimpleUploadedFile(
                'synthetic-clean-directory.xlsx', self.data,
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ),
            'action': action,
            'include_units': options.pop('include_units', 'true'),
            'selections': options.pop('selections', '{}'),
            'manual_evidence': options.pop('manual_evidence', '{}'),
            **options,
        }, format='multipart')

    def commit(self, preview, **kwargs):
        default = {
            'preview_token': preview['preview_token'],
            'confirmation_phrase': preview['confirmation_phrase'],
            'confirmed': 'true',
            'reason': 'فحص إداري موثق لمسودات الوحدات والمراكز',
            'selections': '{"HC-001": %d, "HC-002": %d, "HC-003": null}'
                          % (self.c1.pk, self.c2.pk),
        }
        default.update(kwargs)
        return self.send('commit', **default)

    def test_preview_counts_alias_exact_unknown_and_units_without_writes(self):
        res = self.send()
        self.assertEqual(res.status_code, 200, res.data)
        info = res.data['summary']
        self.assertEqual(info['source_centers'], 3)
        self.assertEqual(info['source_units'], 4)
        self.assertEqual(info['database_centers'], 3)
        self.assertEqual(info['ready_centers'], 2)
        self.assertEqual(info['unmapped_centers'], 1)
        self.assertEqual(info['units_to_create_as_drafts'], 2)
        self.assertEqual(info['existing_units'], 1)
        self.assertEqual(info['units_not_mapped'], 1)
        self.assertEqual(res.data['matches'][0]['match_status'], 'alias')
        self.assertEqual(res.data['matches'][1]['match_status'], 'exact')
        self.assertEqual(OrganizationUnit.objects.count(), 1)
        self.assertEqual(CenterDirectoryMatchingBatch.objects.count(), 0)
        self.assertEqual(HealthCenter.objects.count(), 3)
        self.assertEqual(Employee.objects.count(), 1)

    def test_commit_preserves_existing_centers_and_employees_and_creates_drafts(self):
        preview = self.send().data
        committed = self.commit(preview)
        self.assertEqual(committed.status_code, 200, committed.data)
        self.assertEqual(committed.data['summary']['draft_units_created'], 2)
        self.assertEqual(committed.data['summary']['draft_fields_updated'], 2)
        self.c1.refresh_from_db()
        self.c2.refresh_from_db()
        self.assertEqual(self.c1.name_ar, 'علي السلمان بالجلوية')
        self.assertEqual(self.c1.proposed_sector_name, 'القطاع الشرقي الاستشاري 1')
        self.assertEqual(self.c1.approval_status, 'pending')
        self.assertEqual(self.c2.approval_status, 'pending')
        self.assertEqual(HealthCenter.objects.count(), 3)
        self.assertEqual(Employee.objects.count(), 1)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.health_center_id, self.c1.pk)
        self.assertEqual(OrganizationUnit.objects.count(), 3)
        self.assertEqual(OrganizationUnit.objects.filter(
            is_approved=False, kind='unit',
        ).count(), 2)
        self.assertEqual(HealthCenterProfileAuditEvent.objects.filter(
            action='directory_draft_match',
        ).count(), 2)
        self.assertEqual(HealthCenterProfileAuditEvent.objects.filter(
            action='directory_draft_unit',
        ).count(), 2)
        self.assertEqual(CenterDirectoryMatchingBatch.objects.count(), 1)
        self.assertTrue(AuditLog.objects.filter(
            action='center_directory_draft_match',
        ).exists())
        old = self.commit(preview)
        self.assertEqual(old.status_code, 409)
        new = self.send().data
        repeated = self.commit(new)
        self.assertEqual(repeated.status_code, 409)
        self.assertEqual(OrganizationUnit.objects.count(), 3)
        history = self.client.get('/api/center-directory/match-history/')
        self.assertEqual(history.status_code, 200)
        self.assertEqual(len(history.data['results']), 1)

    def test_manual_link_requires_individual_documented_evidence(self):
        selections = '{"HC-001": %d, "HC-002": %d, "HC-003": %d}' % (
            self.c1.pk, self.c2.pk, self.c3.pk,
        )
        preview = self.send(selections=selections).data
        self.assertEqual(preview['summary']['blocked_centers'], 1)
        self.assertIn('مرجعًا', preview['matches'][2]['reason'])
        refused = self.commit(preview, selections=selections)
        self.assertEqual(refused.status_code, 409)
        evidence = '{"HC-003": "CI-VERIFY-MANUAL-003"}'
        fixed = self.send(selections=selections, manual_evidence=evidence).data
        self.assertEqual(fixed['summary']['ready_centers'], 3)
        committed = self.commit(fixed, selections=selections, manual_evidence=evidence)
        self.assertEqual(committed.status_code, 200, committed.data)
        self.assertEqual(committed.data['summary']['draft_units_created'], 3)
        self.c3.refresh_from_db()
        self.assertEqual(self.c3.name, 'مركز قائم آخر')
        self.assertEqual(self.c3.approval_status, 'pending')

    def test_duplicate_target_and_inconsistent_draft_sector_block_all_commit(self):
        choices = '{"HC-001": %d, "HC-002": %d, "HC-003": %d}' % (
            self.c1.pk, self.c2.pk, self.c1.pk,
        )
        preview = self.send(selections=choices).data
        self.assertGreater(preview['summary']['blocked_centers'], 0)
        denied = self.commit(preview, selections=choices)
        self.assertEqual(denied.status_code, 409)
        self.assertFalse(CenterDirectoryMatchingBatch.objects.exists())
        self.c2.proposed_sector_name = 'قطاع آخر مثبت سابقًا'
        self.c2.save(update_fields=['proposed_sector_name', 'updated_at'])
        conflict = self.send().data
        self.assertEqual(conflict['summary']['blocked_centers'], 1)
        denied2 = self.commit(conflict)
        self.assertEqual(denied2.status_code, 409)
        self.assertFalse(CenterDirectoryMatchingBatch.objects.exists())

    def test_stale_preview_and_changed_file_choices_are_rejected(self):
        preview = self.send().data
        self.c1.name_ar = 'اسم معدل بعد المعاينة'
        self.c1.save(update_fields=['name_ar', 'updated_at'])
        result = self.commit(preview)
        self.assertEqual(result.status_code, 409)
        self.assertFalse(CenterDirectoryMatchingBatch.objects.exists())

    def test_viewer_cannot_preview_or_commit_and_manager_cannot_commit(self):
        self.client.force_authenticate(self.viewer)
        self.assertEqual(self.send().status_code, 403)
        self.assertEqual(self.client.get('/api/center-directory/match-history/').status_code, 403)
        self.client.force_authenticate(self.manager)
        preview = self.send()
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(self.commit(preview.data).status_code, 403)

    def test_invalid_source_duplicate_ref_not_imported(self):
        broken = SimpleUploadedFile('duplicate.xlsx', demo_workbook(duplicate=True))
        with self.assertRaises(ValueError):
            parse_directory(broken)
        self.assertEqual(CenterDirectoryMatchingBatch.objects.count(), 0)

    def test_units_checkbox_can_disable_unit_creation(self):
        preview = self.send(include_units='false').data
        self.assertEqual(preview['summary']['units_to_create_as_drafts'], 0)
        committed = self.commit(preview, include_units='false')
        self.assertEqual(committed.status_code, 200, committed.data)
        self.assertEqual(committed.data['summary']['draft_units_created'], 0)
        self.assertEqual(OrganizationUnit.objects.count(), 1)
