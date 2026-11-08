"""Synthetic regression tests for structured center metadata and alias governance."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import (
    AuditLog, Employee, HealthCenter, HealthCenterAlias,
    HealthCenterProfileAuditEvent, OrganizationUnit, UserProfile,
)


class StructuredHealthCenterTests(TestCase):
    def setUp(self):
        users = get_user_model()
        self.superuser = users.objects.create_superuser(
            username='qa_center_profile_admin', password='synthetic-password',
            email='center-profile@example.invalid',
        )
        self.manager = users.objects.create_user(
            username='qa_center_profile_manager', password='synthetic-password',
        )
        UserProfile.objects.create(user=self.manager, role='ohManager')
        self.viewer = users.objects.create_user(
            username='qa_center_profile_viewer', password='synthetic-password',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.superuser)
        self.center = HealthCenter.objects.create(
            name='علي السلمان بالجلوية', name_ar='علي السلمان بالجلوية',
            code='QA-JALAWI-TEST',
        )
        self.other = HealthCenter.objects.create(
            name='مركز آخر اصطناعي', name_ar='مركز آخر اصطناعي',
            code='QA-SECOND-TEST',
        )
        self.employee = Employee.objects.create(
            name='Synthetic employee only', national_id='9998055801',
            employee_number='QA-SCTR-EMP', health_center=self.center,
        )
        self.url = f'/api/health-centers/{self.center.pk}/'

    def test_form_metadata_does_not_approve_a_center_or_transfer_staff(self):
        res = self.client.patch(self.url, {
            'name': 'الجلوية', 'name_ar': 'الجلوية',
            'name_en': '', 'alternate_name': 'علي السلمان بالجلوية',
            'proposed_parent_name': 'الرعاية الأولية والمجتمعية',
            'proposed_sector_name': 'القطاع الشرقي الاستشاري 1',
            'organizational_source_reference': 'مراكز:7',
            'supporting_document_reference': 'مستند قيد التحقق',
            'approval_status': 'approved',
            'approval_reference': 'FAKE-UNAPPROVED',
        }, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.center.refresh_from_db()
        self.assertEqual(self.center.name_ar, 'الجلوية')
        self.assertEqual(self.center.name, 'الجلوية')
        self.assertEqual(self.center.proposed_sector_name, 'القطاع الشرقي الاستشاري 1')
        self.assertEqual(self.center.approval_status, 'pending')
        self.assertEqual(self.center.approval_reference, '')
        self.assertEqual(self.center.aliases.count(), 1)
        self.assertEqual(self.center.aliases.first().name, 'علي السلمان بالجلوية')
        self.assertEqual(self.center.aliases.first().source, 'previous_name')
        self.assertEqual(self.client.get(self.url).data['alias_names'], ['علي السلمان بالجلوية'])
        self.assertEqual(self.client.get(self.url).data['center_units_count'], 0)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.health_center_id, self.center.pk)
        event = HealthCenterProfileAuditEvent.objects.get(action='update_profile')
        self.assertEqual(event.prior_state['name_ar'], 'علي السلمان بالجلوية')
        self.assertEqual(event.new_state['name_ar'], 'الجلوية')
        self.assertEqual(HealthCenter.objects.count(), 2)

    def test_manual_alias_is_additive_and_name_cannot_reappear_on_another_center(self):
        self.client.patch(self.url, {'alternate_name': 'الاسم القديم للمركز'}, format='json')
        self.assertEqual(HealthCenterAlias.objects.filter(
            center=self.center, name='الاسم القديم للمركز',
        ).count(), 1)
        self.client.patch(self.url, {'alternate_name': 'الاسم القديم للمركز'}, format='json')
        self.assertEqual(HealthCenterAlias.objects.filter(
            center=self.center, name='الاسم القديم للمركز',
        ).count(), 1)
        conflict = self.client.patch(
            f'/api/health-centers/{self.other.pk}/',
            {'name': 'الاسم القديم للمركز'}, format='json',
        )
        self.assertEqual(conflict.status_code, 400)
        self.assertEqual(self.other.aliases.count(), 0)

    def test_approval_requires_superuser_and_evidence_and_is_independent_of_sector(self):
        url = self.url + 'verify-reference/'
        self.client.force_authenticate(self.manager)
        denied = self.client.post(url, {
            'decision': 'approve', 'reason': 'معاينة رقم اعتماد تجريبي موثق',
            'approval_reference': 'CI-DOC-0001', 'confirmed': True,
        }, format='json')
        self.assertEqual(denied.status_code, 403)
        self.client.force_authenticate(self.superuser)
        bad = self.client.post(url, {
            'decision': 'approve', 'reason': 'قصير',
            'approval_reference': 'FAKE', 'confirmed': True,
        }, format='json')
        self.assertEqual(bad.status_code, 400)
        ok = self.client.post(url, {
            'decision': 'approve', 'reason': 'مراجعة قرار اصطناعي لمرجع المركز',
            'approval_reference': 'CI-VERIFIED-REF', 'confirmed': True,
        }, format='json')
        self.assertEqual(ok.status_code, 200, ok.data)
        self.center.refresh_from_db()
        self.assertEqual(self.center.approval_status, 'approved')
        self.assertEqual(self.center.approval_reference, 'CI-VERIFIED-REF')
        self.assertEqual(self.center.proposed_sector_name, '')
        self.assertEqual(HealthCenterProfileAuditEvent.objects.filter(
            action='verify_center_reference_approve',
        ).count(), 1)
        self.assertTrue(AuditLog.objects.filter(
            action='verify_center_reference_approve',
        ).exists())
        undone = self.client.post(url, {
            'decision': 'revoke', 'reason': 'إلغاء التوثيق الاصطناعي بناء على طلب تجريبي',
            'approval_reference': 'CI-WITHDRAW-REF', 'confirmed': True,
        }, format='json')
        self.assertEqual(undone.status_code, 200, undone.data)
        self.center.refresh_from_db()
        self.assertEqual(self.center.approval_status, 'revoked')
        self.assertEqual(self.center.approval_reference, '')
        self.assertEqual(HealthCenterProfileAuditEvent.objects.filter(
            action='verify_center_reference_revoke',
        ).count(), 1)

    def test_units_are_distinct_provisional_organization_records_without_approvals(self):
        url = self.url + 'units/'
        self.client.force_authenticate(self.manager)
        before = self.client.get(url)
        self.assertEqual(before.status_code, 200)
        self.assertEqual(before.data['results'], [])
        added = self.client.post(url, {
            'name': 'وحدة التمريض', 'source_reference': 'Sheet 01 Row 14',
        }, format='json')
        self.assertEqual(added.status_code, 201, added.data)
        unit = OrganizationUnit.objects.get(pk=added.data['id'])
        self.assertEqual(unit.health_center_id, self.center.pk)
        self.assertEqual(unit.kind, OrganizationUnit.Kind.UNIT)
        self.assertFalse(unit.is_approved)
        self.assertEqual(unit.source_sheet, 'إضافة يدوية للمراجعة')
        self.assertEqual(self.client.get(url).data['results'][0]['name'], 'وحدة التمريض')
        self.assertEqual(self.client.get(self.url).data['center_units_count'], 1)
        repeat = self.client.post(url, {'name': ' وحدة التمريض '}, format='json')
        self.assertEqual(repeat.status_code, 409)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.health_center_id, self.center.pk)
        self.assertTrue(HealthCenterProfileAuditEvent.objects.filter(
            action='create_draft_unit', center=self.center,
        ).exists())
        self.client.force_authenticate(self.viewer)
        no_access = self.client.post(url, {'name': 'وحدة أخرى'}, format='json')
        self.assertEqual(no_access.status_code, 403)

    def test_existing_approved_org_unit_does_not_make_new_unit_approved(self):
        org = OrganizationUnit.objects.create(
            code='QA-ORG-CENTER-1', name='مركز ضمن الهيكل',
            kind=OrganizationUnit.Kind.CENTER, health_center=self.center,
            is_approved=True, is_active=True,
        )
        res = self.client.post(self.url + 'units/', {
            'name': 'الوحدة الإدارية',
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        unit = OrganizationUnit.objects.get(pk=res.data['id'])
        self.assertEqual(unit.parent_id, org.pk)
        self.assertFalse(unit.is_approved)
        self.assertEqual(self.client.get(self.url).data['center_units_count'], 1)

    def test_create_new_center_uses_pending_approval_and_retains_alias(self):
        result = self.client.post('/api/health-centers/', {
            'name': 'مركز صحي جديد اصطناعي',
            'name_ar': 'مركز صحي جديد اصطناعي',
            'alternate_name': 'اسم سابق للمركز التجريبي',
            'proposed_sector_name': 'القطاع الغربي الاستشاري 2',
            'approval_status': 'approved',
        }, format='json')
        self.assertEqual(result.status_code, 201, result.data)
        item = HealthCenter.objects.get(pk=result.data['id'])
        self.assertEqual(item.approval_status, 'pending')
        self.assertEqual(list(item.aliases.values_list('name', flat=True)),
                         ['اسم سابق للمركز التجريبي'])
        self.assertTrue(HealthCenterProfileAuditEvent.objects.filter(
            center=item, action='create_profile',
        ).exists())
