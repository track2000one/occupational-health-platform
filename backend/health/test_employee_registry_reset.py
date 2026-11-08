"""Synthetic, non-destructive regression suite for the Production reset button."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import (
    AuditLog, Employee, EmployeeArchiveEvent, EmployeeHealthCard,
    EmployeeHealthProfile, EmployeeRegistryResetBatch, HealthCenter,
)


class EmployeeRegistryResetTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_superuser(
            username='qa_reset_superuser', email='qa-reset@example.invalid',
            password='fake-only',
        )
        self.staff = User.objects.create_user(
            username='qa_reset_staff', password='fake-only', is_staff=True,
        )
        self.center = HealthCenter.objects.create(
            name='Synthetic Archive Center', is_active=True,
        )
        self.employees = [
            Employee.objects.create(
                name=f'Synthetic Registry Employee {n}',
                employee_number=f'QA-RESET-{n}',
                national_id=f'99981234{n:02d}',
                health_center=self.center,
            ) for n in range(1, 4)
        ]
        self.profile = EmployeeHealthProfile.objects.create(
            employee=self.employees[0], notes='Synthetic medical profile remains',
        )
        self.card = EmployeeHealthCard.objects.create(
            employee=self.employees[0],
            data={'synthetic_test': 'clinical history must survive'},
        )
        # A manually archived employee must stay archived after batch restoration.
        self.older = Employee.objects.create(
            name='Earlier manually archived', employee_number='QA-ARCHIVED',
            national_id='9998123409', health_center=self.center,
            is_archived=True, archive_reason='Separate administrative action',
            archived_at=timezone.now(),
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.url = '/api/employee-registry-reset/'

    def post(self, action, **kwargs):
        return self.client.post(self.url, {'action': action, **kwargs}, format='json')

    def preview(self):
        response = self.post('preview')
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def confirm_archive(self, preview, **overrides):
        params = {
            'preview_token': preview['preview_token'],
            'confirm_phrase': preview['confirm_phrase'],
            'reason': 'Approved synthetic staging test migration / reset',
            'confirmed': True,
        }
        params.update(overrides)
        return self.post('execute', **params)

    def test_preview_read_only_and_masks_employee_identifiers(self):
        data = self.preview()
        self.assertEqual(data['total_active'], 3)
        self.assertEqual(data['will_archive'], 3)
        self.assertEqual(data['already_archived'], 1)
        self.assertEqual(data['confirm_phrase'], 'تصفير 3 موظفًا')
        self.assertNotIn('employee_ids', data)
        self.assertFalse(EmployeeRegistryResetBatch.objects.exists())
        self.assertEqual(Employee.objects.count(), 4)
        self.assertEqual(EmployeeArchiveEvent.objects.count(), 0)

    def test_only_superuser_is_permitted_even_for_preview(self):
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.post('preview').status_code, 403)
        self.assertEqual(self.post('execute', confirmed=True).status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.post('preview').status_code, (401, 403))
        self.assertEqual(Employee.objects.filter(is_archived=False).count(), 3)

    def test_reason_exact_phrase_and_checkbox_mandatory(self):
        preview = self.preview()
        for overrides in (
            {'reason': 'short'},
            {'reason': ''},
            {'confirmed': False},
            {'confirm_phrase': 'تصفير 2 موظفًا'},
            {'preview_token': 'forged'},
        ):
            response = self.confirm_archive(preview, **overrides)
            self.assertIn(response.status_code, (400, 409), response.data)
        self.assertEqual(Employee.objects.filter(is_archived=False).count(), 3)
        self.assertFalse(EmployeeRegistryResetBatch.objects.exists())

    def test_bulk_reset_preserves_clinical_data_unique_id_and_restores_exact_batch(self):
        preview = self.preview()
        result = self.confirm_archive(preview)
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['archived_count'], 3)
        self.assertEqual(result.data['active_count'], 0)
        self.assertEqual(Employee.objects.count(), 4)
        self.assertEqual(Employee.objects.filter(is_archived=True).count(), 4)
        self.assertEqual(EmployeeHealthCard.objects.count(), 1)
        self.assertEqual(EmployeeHealthProfile.objects.count(), 1)
        self.assertEqual(EmployeeHealthCard.objects.get(pk=self.card.pk).data,
                         {'synthetic_test': 'clinical history must survive'})
        self.assertEqual(EmployeeArchiveEvent.objects.filter(action='archive').count(), 3)
        self.assertTrue(AuditLog.objects.filter(action='bulk_reset_employee_registry').exists())
        batch = EmployeeRegistryResetBatch.objects.get()
        self.assertEqual(len(batch.employee_ids), 3)
        self.assertNotIn(self.older.pk, batch.employee_ids)
        self.assertEqual(
            self.client.get('/api/employees/').data['count'], 0,
        )
        self.assertEqual(self.client.get('/api/employees/?archived=true').data['count'], 4)

        rest = self.post('restore_preview')
        self.assertEqual(rest.status_code, 200, rest.data)
        self.assertEqual(rest.data['restorable'], 3)
        restored = self.post(
            'restore', preview_token=rest.data['preview_token'],
            confirm_phrase=rest.data['confirm_phrase'],
            confirmed=True,
            reason='Approved restoration of synthetic registry test batch',
        )
        self.assertEqual(restored.status_code, 200, restored.data)
        self.assertEqual(restored.data['restored_count'], 3)
        self.assertEqual(Employee.objects.filter(is_archived=False).count(), 3)
        self.older.refresh_from_db()
        self.assertTrue(self.older.is_archived)
        self.employees[0].refresh_from_db()
        self.assertEqual(self.employees[0].employment_status, 'active')
        self.assertEqual(EmployeeArchiveEvent.objects.filter(action='restore').count(), 3)
        batch.refresh_from_db()
        self.assertIsNotNone(batch.restored_at)
        self.assertTrue(AuditLog.objects.filter(action='bulk_restore_employee_registry').exists())
        self.assertEqual(self.post('restore_preview').status_code, 409)

    def test_changes_since_signed_preview_block_batch(self):
        preview = self.preview()
        Employee.objects.filter(pk=self.employees[0].pk).update(updated_at=timezone.now())
        response = self.confirm_archive(preview)
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(Employee.objects.filter(is_archived=False).count(), 3)

    def test_stale_token_cannot_archive_twice_or_restore_wrong_batch(self):
        preview = self.preview()
        self.assertEqual(self.confirm_archive(preview).status_code, 200)
        self.assertEqual(self.confirm_archive(preview).status_code, 409)
        rest = self.post('restore_preview').data
        self.assertEqual(self.post(
            'restore', preview_token=preview['preview_token'],
            confirm_phrase=rest['confirm_phrase'],
            confirmed=True,
            reason='Restore the synthetic registry after verified QA',
        ).status_code, 409)
        self.assertEqual(Employee.objects.filter(is_archived=False).count(), 0)

    def test_regular_restore_then_bulk_restores_only_remaining_batch_members(self):
        self.assertEqual(self.confirm_archive(self.preview()).status_code, 200)
        first = self.employees[0]
        self.assertEqual(self.client.post(
            f'/api/employees/{first.pk}/restore/',
            {'reason': 'Restore this one record after manual review',
             'confirmed': True}, format='json',
        ).status_code, 200)
        rest = self.post('restore_preview')
        self.assertEqual(rest.status_code, 200)
        self.assertEqual(rest.data['restorable'], 2)
        answer = self.post(
            'restore', preview_token=rest.data['preview_token'],
            confirm_phrase=rest.data['confirm_phrase'],
            reason='Restore the two remaining approved QA records',
            confirmed=True,
        )
        self.assertEqual(answer.status_code, 200, answer.data)
        self.assertEqual(answer.data['restored_count'], 2)
        self.assertEqual(Employee.objects.filter(is_archived=False).count(), 3)
        self.assertEqual(Employee.objects.count(), 4)
