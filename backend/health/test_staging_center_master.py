"""Staging source-center master tests: synthetic names only."""
import base64
import hashlib
import json
import zlib
from collections import Counter
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from .models import Employee, HealthCenter, OrganizationUnit, OrganizationUnitApprovalLog
from .management.commands.load_staging_center_master import (
    FINGERPRINT, PAYLOAD, PROJECT_ID,
)

SECTORS = ['القطاع الشرقي الاستشاري 1', 'القطاع الشرقي الاستشاري 2',
           'القطاع الغربي الاستشاري 1', 'القطاع الغربي الاستشاري 2']


def fixture():
    centers = []
    start = 0
    for sector, count in zip(SECTORS, [7, 6, 6, 6]):
        for i in range(start + 1, start + count + 1):
            centers.append({
                'code': f'TMP-C{i:03}', 'name': f'مركز اختباري {i:03}',
                'sector': sector, 'source_rows': str(i),
                'source_path': f'{sector} / مركز اختباري {i:03}',
            })
        start += count
    return centers


def staging_env(payload=None):
    serialized = json.dumps(payload or fixture(), ensure_ascii=False, separators=(',', ':')).encode()
    return {
        'STAGING_MODE': 'true', 'RAILWAY_PROJECT_ID': PROJECT_ID,
        PAYLOAD: base64.b64encode(zlib.compress(serialized)).decode('ascii'),
        FINGERPRINT: hashlib.sha256(serialized).hexdigest(),
    }


class StagingCenterMasterTests(TestCase):
    def setUp(self):
        for sector in SECTORS:
            OrganizationUnit.objects.create(
                code='TMP-S-' + hashlib.sha256(sector.encode()).hexdigest()[:12].upper(),
                kind='sector', name=sector, is_approved=False,
            )
        sectors = {s.name: s for s in OrganizationUnit.objects.filter(kind='sector')}
        for item in fixture():
            OrganizationUnit.objects.create(
                code=item['code'], name=item['name'], kind='center',
                parent=sectors[item['sector']], is_approved=False,
            )

    @patch.dict('os.environ', staging_env())
    def test_import_25_and_link_draft_centers_without_approving_them(self):
        before = Employee.objects.count()
        call_command('load_staging_center_master', stdout=StringIO())
        self.assertEqual(HealthCenter.objects.count(), 25)
        self.assertEqual(HealthCenter.objects.filter(code__startswith='OHP-REF-C').count(), 25)
        self.assertEqual(OrganizationUnit.objects.filter(kind='center', health_center__isnull=False).count(), 25)
        self.assertEqual(OrganizationUnit.objects.filter(is_approved=True).count(), 0)
        self.assertEqual(OrganizationUnitApprovalLog.objects.filter(action='source-center-map').count(), 25)
        self.assertEqual(Employee.objects.count(), before)
        self.assertTrue(all(c.building_type == 'unknown' and not c.manager_name and not c.city
                            for c in HealthCenter.objects.all()))

    @patch.dict('os.environ', staging_env())
    def test_repeat_import_is_idempotent_and_preserves_existing_center_metadata(self):
        call_command('load_staging_center_master', stdout=StringIO())
        center = HealthCenter.objects.get(code='OHP-REF-C001')
        center.manager_name = 'Synthetic Verified QA Manager'
        center.city = 'Test City'
        center.save()
        call_command('load_staging_center_master', stdout=StringIO())
        center.refresh_from_db()
        self.assertEqual(center.manager_name, 'Synthetic Verified QA Manager')
        self.assertEqual(center.city, 'Test City')
        self.assertEqual(HealthCenter.objects.count(), 25)
        self.assertEqual(OrganizationUnitApprovalLog.objects.count(), 25)

    @patch.dict('os.environ', staging_env())
    def test_reuses_exact_existing_real_center_instead_of_making_duplicate(self):
        prior = HealthCenter.objects.create(name='مركز اختباري 001',
                                            name_ar='مركز اختباري 001', code='EXISTING-001',
                                            is_active=True)
        call_command('load_staging_center_master', stdout=StringIO())
        self.assertEqual(HealthCenter.objects.count(), 25)
        self.assertEqual(OrganizationUnit.objects.get(code='TMP-C001').health_center_id, prior.pk)
        prior.refresh_from_db()
        self.assertEqual(prior.code, 'EXISTING-001')

    @patch.dict('os.environ', staging_env())
    def test_hierarchy_conflict_rolls_back_everything(self):
        unit = OrganizationUnit.objects.get(code='TMP-C024')
        unit.parent = OrganizationUnit.objects.filter(kind='sector').first()
        unit.save()
        if unit.parent.name == fixture()[23]['sector']:
            unit.parent = OrganizationUnit.objects.exclude(pk=unit.parent.pk).filter(kind='sector').first()
            unit.save()
        with self.assertRaises(CommandError):
            call_command('load_staging_center_master', stdout=StringIO())
        self.assertEqual(HealthCenter.objects.count(), 0)

    @patch.dict('os.environ', staging_env())
    def test_duplicate_live_center_matches_are_rejected_transactionally(self):
        HealthCenter.objects.create(name='other', name_ar='مركز اختباري 021')
        HealthCenter.objects.create(name='مركز اختباري 021', name_ar='alias')
        with self.assertRaises(CommandError):
            call_command('load_staging_center_master', stdout=StringIO())
        self.assertEqual(HealthCenter.objects.count(), 2)
        self.assertEqual(OrganizationUnitApprovalLog.objects.count(), 0)

    def test_no_production_source_load(self):
        env = staging_env()
        env['STAGING_MODE'] = 'false'
        with patch.dict('os.environ', env):
            with self.assertRaises(CommandError):
                call_command('load_staging_center_master', stdout=StringIO())
        self.assertEqual(HealthCenter.objects.count(), 0)

    @patch.dict('os.environ', staging_env())
    def test_rejects_changed_fingerprint_and_invalid_counts(self):
        changed = staging_env()
        changed[FINGERPRINT] = '0' * 64
        with patch.dict('os.environ', changed):
            with self.assertRaises(CommandError):
                call_command('load_staging_center_master', stdout=StringIO())
        trimmed = staging_env(fixture()[:24])
        with patch.dict('os.environ', trimmed):
            with self.assertRaises(CommandError):
                call_command('load_staging_center_master', stdout=StringIO())

    @patch.dict('os.environ', staging_env())
    def test_existing_center_with_generic_prefix_is_reused_not_duplicated(self):
        prior = HealthCenter.objects.create(name='مركز صحي اختباري 001', name_ar='مركز صحي اختباري 001')
        call_command('load_staging_center_master', stdout=StringIO())
        self.assertEqual(HealthCenter.objects.count(), 25)
        self.assertEqual(OrganizationUnit.objects.get(code='TMP-C001').health_center_id, prior.pk)

    def test_distinct_similar_names_remain_distinct(self):
        from .management.commands.load_staging_center_master import normalized_name
        self.assertEqual(normalized_name('مركز صحي بدر'), normalized_name('بدر'))
        self.assertNotEqual(normalized_name('بدر'), normalized_name('بدر الغربي'))
        self.assertNotEqual(normalized_name('الضاحية'),
                            normalized_name('حمد العمار الخالدي بالضاحية'))
