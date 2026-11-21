"""Guard against unwanted legacy centers after workforce organizational refoundation."""
from io import StringIO
from unittest.mock import patch
import os

from django.core.management import call_command
from django.test import TestCase

from .models import HealthCenter


class BootstrapAdminLegacyCenterTests(TestCase):
    def run_bootstrap(self, flag=None):
        env = {'DJANGO_SUPERUSER_PASSWORD': ''}
        if flag is not None:
            env['OHP_BOOTSTRAP_LEGACY_CENTERS'] = flag
        with patch.dict(os.environ, env):
            if flag is None:
                os.environ.pop('OHP_BOOTSTRAP_LEGACY_CENTERS', None)
            output = StringIO()
            call_command('bootstrap_admin', stdout=output)
            return output.getvalue()

    def test_no_demo_centers_are_recreated_by_default(self):
        self.assertEqual(HealthCenter.objects.count(), 0)
        output = self.run_bootstrap()
        self.assertEqual(HealthCenter.objects.count(), 0)
        self.assertIn('Legacy demo center bootstrap disabled', output)

    def test_existing_real_center_is_left_untouched(self):
        center = HealthCenter.objects.create(
            name='المركز الصحي المعتمد تجريبي',
            name_ar='المركز الصحي المعتمد تجريبي',
        )
        self.run_bootstrap()
        self.assertEqual(HealthCenter.objects.count(), 1)
        center.refresh_from_db()
        self.assertEqual(center.name_ar, 'المركز الصحي المعتمد تجريبي')

    def test_legacy_seed_is_explicit_opt_in(self):
        self.run_bootstrap('true')
        self.assertEqual(HealthCenter.objects.count(), 3)
        self.run_bootstrap('false')
        self.assertEqual(HealthCenter.objects.count(), 3)
