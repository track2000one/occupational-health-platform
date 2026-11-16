"""Synthetic tests for reversible bulk hiding of archived employee cards.

No employee row, medical record, archival event or identity is physically deleted.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import AuditLog, Employee, EmployeeArchiveEvent, EmployeeHealthProfile


class ArchivedListVisibilityTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_superuser(
            username='qa_archived_list_admin',
            email='qa-archived-list@example.invalid', password='synthetic-password',
        )
        self.staff = User.objects.create_user(
            username='qa_archived_list_staff', is_staff=True, password='synthetic-password',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.url = '/api/employees/archived-list-visibility/'
        self.employees = [
            Employee.objects.create(
                name=f'QA Archived {index}', national_id=f'1000049{index:03d}',
                employee_number=f'QA-VIS-{index}', is_archived=True,
                archive_reason='Synthetic archive retained',
            )
            for index in range(3)
        ]
        self.active = Employee.objects.create(
            name='QA Active Untouched', national_id='1000049999',
            employee_number='QA-VIS-ACTIVE', is_archived=False,
        )
        self.profile = EmployeeHealthProfile.objects.create(
            employee=self.employees[0], notes='Synthetic clinical history preserved',
        )
        self.history = EmployeeArchiveEvent.objects.create(
            employee=self.employees[0],
            action=EmployeeArchiveEvent.Action.ARCHIVE,
            reason='Synthetic existing archive event', performed_by=self.admin,
        )

    def call(self, action='preview', mode='hide', scope='all', ids=None, **extra):
        return self.client.post(self.url, {
            'action': action, 'mode': mode, 'scope': scope,
            'ids': ids if ids is not None else [],
            **extra,
        }, format='json')

    def commit(self, preview, mode='hide', scope='all', ids=None, **extra):
        arguments = {
            'preview_token': preview.data['preview_token'],
            'confirmed': True,
            'confirm_phrase': preview.data['confirm_phrase'],
            'reason': 'إخفاء دفعة موظفين مؤرشفة من العرض',
        }
        arguments.update(extra)
        return self.call(
            'execute', mode=mode, scope=scope, ids=ids, **arguments,
        )

    def list_archived(self, hidden=False):
        path = '/api/employees/?archived=true'
        if hidden:
            path += '&hidden=true'
        return self.client.get(path)

    def test_bulk_hide_all_pages_is_reversible_without_removing_data(self):
        offer = self.call()
        self.assertEqual(offer.status_code, 200, offer.data)
        self.assertEqual(offer.data['count'], 3)
        self.assertEqual(offer.data['permanent_deleted'], 0)
        self.assertEqual(offer['Cache-Control'], 'private, no-store')
        self.assertEqual(self.list_archived().data['count'], 3)
        self.assertEqual(self.list_archived(hidden=True).data['count'], 0)
        approved = self.commit(offer)
        self.assertEqual(approved.status_code, 200, approved.data)
        self.assertEqual(approved.data['changed'], 3)
        self.assertEqual(approved.data['permanent_deleted'], 0)
        self.assertEqual(self.list_archived().data['count'], 0)
        self.assertEqual(self.list_archived(hidden=True).data['count'], 3)
        self.assertEqual(self.client.get('/api/employees/').data['count'], 1)
        self.assertEqual(Employee.objects.count(), 4)
        self.assertEqual(Employee.objects.filter(is_archived=True).count(), 3)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.notes, 'Synthetic clinical history preserved')
        self.assertTrue(EmployeeArchiveEvent.objects.filter(pk=self.history.pk).exists())
        self.assertEqual(self.commit(offer).status_code, 409)

        reverse_preview = self.call(mode='show')
        self.assertEqual(reverse_preview.status_code, 200, reverse_preview.data)
        self.assertEqual(reverse_preview.data['count'], 3)
        reversed_result = self.commit(reverse_preview, mode='show')
        self.assertEqual(reversed_result.status_code, 200, reversed_result.data)
        self.assertEqual(self.list_archived().data['count'], 3)
        self.assertEqual(self.list_archived(hidden=True).data['count'], 0)
        self.assertEqual(Employee.objects.count(), 4)
        self.assertEqual(AuditLog.objects.filter(
            action__startswith='employee_list_hide:',
        ).count(), 3)
        self.assertEqual(AuditLog.objects.filter(
            action__startswith='employee_list_show:',
        ).count(), 3)

    def test_selected_scope_and_rechecks_protect_other_records(self):
        selected = [self.employees[0].pk, self.employees[1].pk]
        offer = self.call(scope='selected', ids=selected)
        self.assertEqual(offer.status_code, 200, offer.data)
        self.assertEqual(offer.data['count'], 2)
        self.assertEqual(self.commit(offer, scope='selected', ids=[selected[0]]).status_code, 409)
        self.assertEqual(self.commit(offer, scope='selected', ids=selected,
                                     confirm_phrase='different').status_code, 400)
        self.assertEqual(self.commit(offer, scope='selected', ids=selected).status_code, 200)
        self.assertEqual(self.list_archived().data['count'], 1)
        self.assertEqual(self.list_archived(hidden=True).data['count'], 2)
        self.assertEqual(Employee.objects.count(), 4)

    def test_unprivileged_and_invalid_scope_fail_without_writes(self):
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.call().status_code, 403)
        self.assertEqual(self.list_archived(hidden=True).data['count'], 0)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.call(scope='unknown').status_code, 409)
        self.assertEqual(self.call(scope='selected', ids=[self.active.pk]).status_code, 409)
        self.assertEqual(self.call(scope='selected', ids=[self.employees[0].pk] * 2).status_code, 409)
        self.assertEqual(self.call(scope='selected', ids=[]).status_code, 409)
        self.assertEqual(Employee.objects.count(), 4)
        self.assertFalse(AuditLog.objects.exists())
