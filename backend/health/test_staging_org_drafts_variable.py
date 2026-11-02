"""Safety tests use synthetic organizational labels, never source workbook names."""
import base64
import hashlib
import json
import zlib
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from health.models import Employee, HealthCenter, OrganizationUnit
from health.management.commands.load_staging_org_drafts import (
    STAGING_PROJECT_ID, EXPECTED_COUNTS, PAYLOAD_VARIABLE, DIGEST_VARIABLE,
)


def synthetic_plans():
    sector_codes = [f'TMP-S-{i:012X}' for i in range(4)]
    payload = [
        {'code': code, 'name': f'Synthetic Sector {i}',
         'kind': 'sector', 'parent_code': '', 'source_path': 'synthetic',
         'source_sheet': 'synthetic', 'source_rows': ''}
        for i, code in enumerate(sector_codes)
    ]
    for i in range(25):
        payload.append({
            'code': f'TMP-C{i+1:03}', 'name': f'Synthetic Center {i+1}',
            'kind': 'center', 'parent_code': sector_codes[i % 4], 'source_path': 'synthetic',
            'source_sheet': 'synthetic', 'source_rows': f'{i+1}',
        })
    for i in range(47):
        payload.append({
            'code': f'TMP-U{i+1:03}', 'name': f'Synthetic Unit {i+1}',
            'kind': 'unit', 'parent_code': f'TMP-C{i%25+1:03}', 'source_path': 'synthetic',
            'source_sheet': 'synthetic', 'source_rows': '',
        })
    for i in range(31):
        payload.append({
            'code': f'TMP-O{i+1:03}', 'name': f'Synthetic HQ {i+1}',
            'kind': 'department', 'parent_code': '', 'source_path': 'synthetic',
            'source_sheet': 'synthetic', 'source_rows': '',
        })
    return payload


def fake_env():
    plain = json.dumps(synthetic_plans(), ensure_ascii=False, separators=(',', ':')).encode()
    return {
        'STAGING_MODE': 'true',
        'RAILWAY_PROJECT_ID': STAGING_PROJECT_ID,
        PAYLOAD_VARIABLE: base64.b64encode(zlib.compress(plain)).decode(),
        DIGEST_VARIABLE: hashlib.sha256(plain).hexdigest(),
    }


class OrganizationalStagingVariableLoadTests(TestCase):
    def test_reviewed_structure_inserted_as_drafts_without_employee_or_center_changes(self):
        existing_center = HealthCenter.objects.create(name='Pre-existing QA center')
        before = Employee.objects.count()
        with patch.dict('os.environ', fake_env()):
            stdout = StringIO()
            call_command('load_staging_org_drafts', stdout=stdout)
            self.assertIn('107 proposed', stdout.getvalue())
        self.assertEqual(OrganizationUnit.objects.count(), 107)
        self.assertEqual(OrganizationUnit.objects.filter(is_approved=True).count(), 0)
        self.assertEqual(OrganizationUnit.objects.filter(health_center__isnull=False).count(), 0)
        self.assertEqual(HealthCenter.objects.count(), 1)
        self.assertEqual(HealthCenter.objects.get(pk=existing_center.pk).name, 'Pre-existing QA center')
        self.assertEqual(Employee.objects.count(), before)
        for kind, count in EXPECTED_COUNTS.items():
            self.assertEqual(OrganizationUnit.objects.filter(kind=kind).count(), count)

    def test_idempotent_and_does_not_revoke_previous_approvals(self):
        with patch.dict('os.environ', fake_env()):
            call_command('load_staging_org_drafts', stdout=StringIO())
            unit = OrganizationUnit.objects.get(code='TMP-C001')
            unit.is_approved = True
            unit.approval_reference = 'QA-approved'
            unit.save()
            call_command('load_staging_org_drafts', stdout=StringIO())
            unit.refresh_from_db()
        self.assertTrue(unit.is_approved)
        self.assertEqual(unit.approval_reference, 'QA-approved')
        self.assertEqual(OrganizationUnit.objects.count(), 107)

    def test_rejects_wrong_environment_and_does_not_write(self):
        vars = fake_env()
        vars['RAILWAY_PROJECT_ID'] = 'different-project'
        with patch.dict('os.environ', vars):
            with self.assertRaises(CommandError):
                call_command('load_staging_org_drafts', stdout=StringIO())
        self.assertEqual(OrganizationUnit.objects.count(), 0)

    def test_rejects_tampered_source_and_does_not_write(self):
        vars = fake_env()
        vars[DIGEST_VARIABLE] = '0' * 64
        with patch.dict('os.environ', vars):
            with self.assertRaises(CommandError):
                call_command('load_staging_org_drafts', stdout=StringIO())
        self.assertEqual(OrganizationUnit.objects.count(), 0)

    def test_rejects_unsupported_hierarchy_without_partial_writes(self):
        vars = fake_env()
        payload = synthetic_plans()
        payload[4]['parent_code'] = 'TMP-C002'
        plain = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode()
        vars[PAYLOAD_VARIABLE] = base64.b64encode(zlib.compress(plain)).decode()
        vars[DIGEST_VARIABLE] = hashlib.sha256(plain).hexdigest()
        with patch.dict('os.environ', vars):
            with self.assertRaises(CommandError):
                call_command('load_staging_org_drafts', stdout=StringIO())
        self.assertEqual(OrganizationUnit.objects.count(), 0)
