"""Synthetic center foundation governance tests: no personal or clinical data."""
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from openpyxl import Workbook
from rest_framework.test import APIClient

from .models import (
    AuditLog, HealthCenter, Employee,
    CenterFoundationBatch, CenterReferenceCandidate, CenterNameReviewCase,
    CenterFoundationAuditEvent, UserProfile,
)

REFERENCE_HEADERS = [
    'م', 'اسم المركز', 'القطاع الاستشاري المقترح',
    'الرمز المؤقت', 'حالة اعتماد المرجع',
]
REVIEW_HEADERS = [
    'اسم المركز أو الحالة بالمصدر 01', 'عدد الصفوف',
    'دون اسم موظف', 'هوية غير صالحة', 'أمثلة أرقام صفوف المصدر',
    'المركز المعتمد بعد المراجعة', 'تعليمات',
]


def file_fixture(extra_name=None, omit_review=False):
    workbook = Workbook()
    reference = workbook.active
    reference.title = 'مرجع_المراكز'
    reference.append(REFERENCE_HEADERS)
    reference.append([1, 'مركز الاختبار ألف', 'القطاع الشرقي الاستشاري 1',
                      'TMP-C001', 'مسودة — يحتاج اعتمادًا'])
    reference.append([2, extra_name or 'مركز الاختبار باء',
                      'القطاع الغربي الاستشاري 2', 'TMP-C002',
                      'مسودة — يحتاج اعتمادًا'])
    if not omit_review:
        review = workbook.create_sheet('مراجعة_المراكز')
        review.append(REVIEW_HEADERS)
        review.append(['(فارغ في المصدر)', 5, 0, 1, '30, 31',
                       'غير محدد — يحتاج اعتماد', 'يحتاج إلى التحقق'])
        review.append(['نقل', 3, 0, 0, '11, 12',
                       'غير محدد — يحتاج اعتماد', 'حالة وظيفية ليست مركزًا'])
    # User workbook also contains staff tables, deliberately excluded here.
    people = workbook.create_sheet('الموظفون_الموحدون')
    people.append(['اسم الموظف', 'رقم الهوية / الإقامة'])
    people.append(['SHOULD-NOT-IMPORT-EMPLOYEE', '9999999999'])
    out = BytesIO()
    workbook.save(out)
    workbook.close()
    return SimpleUploadedFile(
        'synthetic-reference-with-employee-tab.xlsx', out.getvalue(),
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )


class CenterFoundationTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_superuser(
            username='ci_center_owner', password='synthetic-ci-only',
            email='ci-owner@example.invalid',
        )
        self.manager = User.objects.create_user(
            username='ci_center_manager', password='synthetic-ci-only',
        )
        UserProfile.objects.create(user=self.manager, role='ohManager')
        self.viewer = User.objects.create_user(
            username='ci_center_viewer', password='synthetic-ci-only',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.existing = HealthCenter.objects.create(
            name='مركز مصرح به', name_ar='مركز مصرح به', is_active=True,
        )
        self.employee = Employee.objects.create(
            name='CI test only', national_id='9998776611',
            employee_number='CI-FOUNDATION-1', health_center=self.existing,
        )
        # Reuse identical XLSX bytes between preview and commit:
        # creating a new ZIP at a different second changes its SHA-256.
        self.fixture_bytes = file_fixture().read()
        self.upload_url = '/api/center-foundation/import/'
        self.registry_url = '/api/center-foundation/'
        self.decision_url = '/api/center-foundation/decision/'

    def post_file(self, action='preview', extra_name=None, **options):
        return self.client.post(
            self.upload_url,
            {'file': (
                file_fixture(extra_name=extra_name)
                if extra_name is not None else
                SimpleUploadedFile(
                    'synthetic-reference-with-employee-tab.xlsx', self.fixture_bytes,
                    content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                )
            ), 'action': action, **options},
            format='multipart',
        )

    def stage(self):
        preview = self.post_file()
        self.assertEqual(preview.status_code, 200, preview.data)
        confirm = self.post_file(
            'commit', preview_token=preview.data['preview_token'],
            confirmed='true', confirm_text='حفظ مرجع المراكز للمراجعة فقط',
        )
        self.assertEqual(confirm.status_code, 200, confirm.data)
        return confirm.data['batch_id']

    def test_preview_has_correct_counts_and_does_not_import_people_or_centers(self):
        ans = self.post_file()
        self.assertEqual(ans.status_code, 200, ans.data)
        self.assertEqual(ans.data['reference_count'], 2)
        self.assertEqual(ans.data['review_count'], 2)
        self.assertEqual(ans.data['unresolved_source_rows'], 8)
        self.assertEqual(ans.data['references'][0]['source_approval_note'],
                         'مسودة — يحتاج اعتمادًا')
        self.assertEqual(ans.data['review_cases'][0]['invalid_identity_count'], 1)
        self.assertFalse(CenterFoundationBatch.objects.exists())
        self.assertEqual(HealthCenter.objects.count(), 1)
        self.assertEqual(Employee.objects.count(), 1)

    def test_import_draft_creates_versioned_audit_and_never_changes_health_centers(self):
        batch_id = self.stage()
        batch = CenterFoundationBatch.objects.get(pk=batch_id)
        self.assertEqual(batch.reference_count, 2)
        self.assertEqual(batch.review_count, 2)
        self.assertEqual(batch.references.count(), 2)
        self.assertEqual(batch.review_cases.count(), 2)
        self.assertEqual(batch.references.filter(
            center_verification='pending',
            sector_verification='pending',
            employee_assignment_verification='pending',
            mapped_center__isnull=True,
        ).count(), 2)
        self.assertEqual(HealthCenter.objects.count(), 1)
        self.assertEqual(Employee.objects.count(), 1)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.health_center_id, self.existing.pk)
        self.assertEqual(batch.audit_events.filter(action='draft_import').count(), 1)
        self.assertTrue(AuditLog.objects.filter(action='center_foundation_draft_import').exists())
        duplicate = self.post_file()
        self.assertEqual(duplicate.data['existing_batch_id'], batch.pk)
        old = self.post_file(
            'commit', preview_token=duplicate.data['preview_token'],
            confirmed='true', confirm_text='حفظ مرجع المراكز للمراجعة فقط',
        )
        self.assertEqual(old.status_code, 409)
        self.assertEqual(CenterFoundationBatch.objects.count(), 1)
        directory = self.client.get(self.registry_url)
        self.assertEqual(directory.status_code, 200)
        self.assertEqual(directory.data['current']['reference_count'], 2)
        self.assertEqual(directory.data['current']['unresolved_source_rows'], 8)

    def test_preview_token_binds_file_account_and_requires_explicit_confirmation(self):
        preview = self.post_file().data
        for extra in (
            {'preview_token': 'tampered'},
            {'preview_token': preview['preview_token'], 'confirmed': 'false',
             'confirm_text': 'حفظ مرجع المراكز للمراجعة فقط'},
        ):
            reply = self.post_file('commit', **extra)
            self.assertIn(reply.status_code, (400, 409))
        changed = self.post_file(
            'commit', extra_name='مركز ثالث',
            preview_token=preview['preview_token'], confirmed='true',
            confirm_text='حفظ مرجع المراكز للمراجعة فقط',
        )
        self.assertEqual(changed.status_code, 409)
        self.client.force_authenticate(self.manager)
        cross_user = self.post_file(
            'commit', preview_token=preview['preview_token'],
            confirmed='true', confirm_text='حفظ مرجع المراكز للمراجعة فقط',
        )
        self.assertEqual(cross_user.status_code, 409)
        self.assertEqual(CenterFoundationBatch.objects.count(), 0)

    def test_reader_cannot_import_or_modify(self):
        self.client.force_authenticate(self.viewer)
        self.assertEqual(self.post_file().status_code, 403)
        self.assertEqual(self.client.get(self.registry_url).status_code, 403)
        self.assertEqual(self.client.post(self.decision_url, {}, format='json').status_code, 403)

    def test_missing_sheet_is_rejected_and_old_import_cannot_publish_workbook(self):
        missing = self.client.post(
            self.upload_url, {'file': file_fixture(omit_review=True), 'action': 'preview'},
            format='multipart',
        )
        self.assertEqual(missing.status_code, 400)
        legacy = self.client.post(
            '/api/health-centers/import-excel/',
            {'file': file_fixture(), 'action': 'preview'}, format='multipart',
        )
        self.assertEqual(legacy.status_code, 400)
        self.assertEqual(HealthCenter.objects.count(), 1)

    def test_classification_does_not_automatically_transfer_employees(self):
        bid = self.stage()
        case = CenterNameReviewCase.objects.get(batch_id=bid, raw_source_label='نقل')
        reply = self.client.post(self.decision_url, {
            'action': 'classify', 'batch_id': bid, 'entry_id': case.pk,
            'decision': 'employment', 'reason': 'حالة نقل وليست اسم مركز صحي',
        }, format='json')
        self.assertEqual(reply.status_code, 200, reply.data)
        case.refresh_from_db()
        self.assertEqual(case.decision, 'employment')
        self.assertIsNone(case.mapped_reference)
        self.assertEqual(CenterFoundationAuditEvent.objects.filter(
            action='classify', entity_id=case.pk,
        ).count(), 1)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.health_center_id, self.existing.pk)

    def test_alias_needs_evidence_and_same_batch_reference(self):
        bid = self.stage()
        case = CenterNameReviewCase.objects.get(batch_id=bid, raw_source_label='نقل')
        ref = CenterReferenceCandidate.objects.filter(batch_id=bid).first()
        no_evidence = self.client.post(self.decision_url, {
            'action': 'classify', 'batch_id': bid, 'entry_id': case.pk,
            'decision': 'alias', 'reference_id': ref.pk,
            'reason': 'هذه مجرد تجربة تحتاج مرجعًا مثبتًا',
        }, format='json')
        self.assertEqual(no_evidence.status_code, 400)
        evidence = self.client.post(self.decision_url, {
            'action': 'classify', 'batch_id': bid, 'entry_id': case.pk,
            'decision': 'alias', 'reference_id': ref.pk,
            'reason': 'مطابقة موثقة للاختبار الصناعي',
            'evidence_reference': 'CI-FAKE-APPROVAL',
        }, format='json')
        self.assertEqual(evidence.status_code, 200, evidence.data)
        self.assertEqual(CenterNameReviewCase.objects.get(pk=case.pk).mapped_reference_id, ref.pk)
        empty = CenterNameReviewCase.objects.get(batch_id=bid, raw_source_label='(فارغ في المصدر)')
        result = self.client.post(self.decision_url, {
            'action': 'classify', 'batch_id': bid, 'entry_id': empty.pk,
            'decision': 'alias', 'reference_id': ref.pk,
            'reason': 'محاولة رفض تحويل قيمة فارغة',
            'evidence_reference': 'CI-FAKE-APPROVAL',
        }, format='json')
        self.assertEqual(result.status_code, 400)

    def test_center_sector_verify_are_independent_and_superuser_only(self):
        bid = self.stage()
        ref = CenterReferenceCandidate.objects.filter(batch_id=bid).first()
        self.client.force_authenticate(self.manager)
        denied = self.client.post(self.decision_url, {
            'action': 'verify_center', 'batch_id': bid, 'entry_id': ref.pk,
            'center_id': self.existing.pk, 'reason': 'قرار اعتماد مستقل',
            'evidence_reference': 'QA-REF-123',
        }, format='json')
        self.assertEqual(denied.status_code, 403)
        self.client.force_authenticate(self.admin)
        verified = self.client.post(self.decision_url, {
            'action': 'verify_center', 'batch_id': bid, 'entry_id': ref.pk,
            'center_id': self.existing.pk,
            'reason': 'مطابقة المركز القائم بناءً على مستند اختبار',
            'evidence_reference': 'QA-REF-123',
        }, format='json')
        self.assertEqual(verified.status_code, 200, verified.data)
        ref.refresh_from_db()
        self.assertEqual(ref.center_verification, 'verified')
        self.assertEqual(ref.sector_verification, 'pending')
        self.assertEqual(ref.employee_assignment_verification, 'pending')
        sector = self.client.post(self.decision_url, {
            'action': 'verify_sector', 'batch_id': bid, 'entry_id': ref.pk,
            'reason': 'اعتماد تبعية مستقلة بمستند مختلف',
            'evidence_reference': 'QA-SECTOR-123',
        }, format='json')
        self.assertEqual(sector.status_code, 200, sector.data)
        ref.refresh_from_db()
        self.assertEqual(ref.sector_verification, 'verified')
        self.assertEqual(ref.employee_assignment_verification, 'pending')
        self.assertEqual(HealthCenter.objects.count(), 1)
