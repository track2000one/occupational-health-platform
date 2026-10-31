from django.contrib.auth import get_user_model
from django.urls import reverse
from django.test import TestCase
from rest_framework.test import APIClient

from .models import AuditLog, Employee, HealthCenter, OrganizationCenterMapping
from .workforce_source_preview import organization_key


class OrganizationMappingApprovalTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_user(
            username="approval_admin", password="no-real-secret", is_staff=True,
        )
        self.regular = User.objects.create_user(
            username="regular_user", password="no-real-secret",
        )
        self.active_center = HealthCenter.objects.create(name="Synthetic Center A")
        self.second_center = HealthCenter.objects.create(name="Synthetic Center B")
        self.inactive_center = HealthCenter.objects.create(name="Inactive Center", is_active=False)
        self.client = APIClient()
        self.list_url = reverse('organization-center-mappings-list')

    def _login_admin(self):
        self.client.force_authenticate(user=self.admin)

    def test_anonymous_and_regular_users_cannot_read_or_approve(self):
        for who in (None, self.regular):
            with self.subTest(user=who):
                self.client.force_authenticate(user=who)
                self.assertIn(self.client.get(self.list_url).status_code, (401, 403))
                response = self.client.post(self.list_url, {
                    'organization_name': 'وحدة تجريبية',
                    'health_center_id': self.active_center.pk,
                }, format='json')
                self.assertIn(response.status_code, (401, 403))
        self.assertEqual(OrganizationCenterMapping.objects.count(), 0)

    def test_approval_records_actor_and_never_creates_employees(self):
        self._login_admin()
        response = self.client.post(self.list_url, {
            'organization_name': 'إدارة تجريبية',
            'health_center_id': self.active_center.pk,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(response.data['is_active'])
        self.assertEqual(response.data['key'], organization_key('إدارة تجريبية'))
        self.assertEqual(response.data['approved_by'], self.admin.username)
        self.assertEqual(OrganizationCenterMapping.objects.get().health_center, self.active_center)
        self.assertTrue(AuditLog.objects.filter(action='approve_organization_center').exists())
        self.assertEqual(Employee.objects.count(), 0)

    def test_approved_organization_reassignment_is_audited(self):
        self._login_admin()
        original = {'organization_name': 'مركز تجريبي', 'health_center_id': self.active_center.pk}
        self.assertEqual(self.client.post(self.list_url, original, format='json').status_code, 201)
        changed = {'organization_name': 'مركز تجريبي', 'health_center_id': self.second_center.pk}
        response = self.client.post(self.list_url, changed, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(OrganizationCenterMapping.objects.count(), 1)
        self.assertEqual(OrganizationCenterMapping.objects.get().health_center, self.second_center)
        self.assertTrue(AuditLog.objects.filter(action='reapprove_organization_center').exists())

    def test_revoke_then_reapprove_does_not_delete_linked_records(self):
        self._login_admin()
        payload = {'organization_name': 'إدارة تجريبية', 'health_center_id': self.active_center.pk}
        approved = self.client.post(self.list_url, payload, format='json').data
        url = reverse('organization-center-mappings-revoke', kwargs={'pk': approved['id']})
        response = self.client.post(url)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data['is_active'])
        self.assertTrue(AuditLog.objects.filter(action='revoke_organization_center').exists())
        response = self.client.post(self.list_url, payload, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['is_active'])
        self.assertEqual(OrganizationCenterMapping.objects.count(), 1)

    def test_invalid_or_inactive_centers_are_rejected(self):
        self._login_admin()
        for center_id in (999999, self.inactive_center.pk, 'invalid', None):
            with self.subTest(center=center_id):
                response = self.client.post(self.list_url, {
                    'organization_name': 'منظمة تجريبية',
                    'health_center_id': center_id,
                }, format='json')
                self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(OrganizationCenterMapping.objects.count(), 0)

    def test_unassigned_organization_cannot_be_approved(self):
        self._login_admin()
        for label in ('', '(unassigned organization)'):
            response = self.client.post(self.list_url, {
                'organization_name': label,
                'health_center_id': self.active_center.pk,
            }, format='json')
            self.assertEqual(response.status_code, 400, response.data)

    def test_center_choices_not_truncated_by_default_pagination(self):
        self._login_admin()
        for index in range(30):
            HealthCenter.objects.create(name=f'Synthetic extra center {index:02d}')
        response = self.client.get(reverse('organization-center-mappings-centers'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 32)
        self.assertNotIn(self.inactive_center.pk, [row['id'] for row in response.data])
