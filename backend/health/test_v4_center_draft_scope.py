"""The explicit V4 draft gate must never match the original live backend."""
from unittest.mock import patch

from django.test import SimpleTestCase

from health import organization_structure as org


class V4CenterDraftScopeTests(SimpleTestCase):
    def setUp(self):
        self.env = {
            'OHP_V4_CENTER_DRAFT_IMPORT_ENABLED': 'true',
            'RAILWAY_PROJECT_ID': org.V4_PROJECT,
            'RAILWAY_ENVIRONMENT_ID': org.V4_ENVIRONMENT,
            'RAILWAY_SERVICE_ID': org.V4_SERVICE,
        }

    def scope(self, values, host):
        with patch.dict('os.environ', values, clear=True):
            with patch.object(org, 'connections', {'default': type(
                    'ConnectionStub', (), {'settings_dict': {'HOST': host}})()}):
                return org.draft_import_scope()

    def test_explicit_isolated_v4_scope(self):
        self.assertEqual(self.scope(self.env, org.V4_DB_HOST), 'v4')

    def test_disabled_by_default(self):
        env = dict(self.env)
        env.pop('OHP_V4_CENTER_DRAFT_IMPORT_ENABLED')
        self.assertEqual(self.scope(env, org.V4_DB_HOST), '')

    def test_all_scope_checks_fail_closed(self):
        for key in ('RAILWAY_PROJECT_ID', 'RAILWAY_ENVIRONMENT_ID', 'RAILWAY_SERVICE_ID'):
            self.assertEqual(self.scope(dict(self.env, **{key: 'other'}), org.V4_DB_HOST), '')
        self.assertEqual(self.scope(self.env, 'original-db.railway.internal'), '')
        self.assertEqual(self.scope(self.env, ''), '')

    def test_staging_remains_supported(self):
        self.assertEqual(self.scope({
            'STAGING_MODE': 'true',
            'RAILWAY_PROJECT_ID': org.STAGING_PROJECT,
        }, ''), 'staging')
