"""Synthetic-only regression for fast HealthCenter directory card loading.

The directory must not run several queries per center. A 25-card page should
use a bounded number of queries while preserving employee/user/unit/alias data.
"""
from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from .models import Employee, HealthCenter, HealthCenterAlias, OrganizationUnit


class HealthCenterDirectoryPerformanceTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser(
            username='ci-fast-center-directory', password='test-only-secret',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.centers = [
            HealthCenter.objects.create(
                name=f'CI Center {i:02d}', name_ar=f'مركز تجريبي {i:02d}',
                is_active=True,
            )
            for i in range(25)
        ]
        self.first = self.centers[0]
        HealthCenterAlias.objects.create(
            center=self.first, name='اسم سابق تجريبي',
            normalized_name='اسم سابق تجريبي',
        )
        Employee.objects.create(
            name='Synthetic Staff Only', national_id='9900021001',
            health_center=self.first,
        )
        OrganizationUnit.objects.create(
            code='CI-CENTER-UNIT-FAST',
            kind=OrganizationUnit.Kind.UNIT, name='وحدة تجريبية',
            health_center=self.first, is_active=True,
        )

    def test_25_card_directory_avoids_per_card_queries(self):
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get('/api/health-centers/?page=1')
        self.assertEqual(response.status_code, 200, response.data)
        data = response.data
        rows = data.get('results', []) if isinstance(data, dict) else data
        self.assertGreater(len(rows), 0)
        self.assertLessEqual(len(queries), 9, [
            query['sql'][:180] for query in queries
        ])
        first = next(item for item in rows if item['id'] == self.first.pk)
        self.assertEqual(first['employee_count'], 1)
        self.assertEqual(first['center_units_count'], 1)
        self.assertEqual(first['user_count'], 0)
        self.assertEqual(first['alias_names'], ['اسم سابق تجريبي'])

    def test_individual_center_detail_retains_existing_semantics(self):
        response = self.client.get(f'/api/health-centers/{self.first.pk}/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['employee_count'], 1)
        self.assertEqual(response.data['center_units_count'], 1)
        self.assertEqual(response.data['alias_names'], ['اسم سابق تجريبي'])
