"""Delete temporary encrypted workspaces after retention without exposing employee data."""
import os
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from health.models import TemporaryWorkforceSnapshot, AuditLog


class Command(BaseCommand):
    help = 'Purge expired temporary encrypted workforce snapshots in isolated staging.'

    def handle(self, *args, **options):
        if os.getenv('STAGING_MODE', '').lower() != 'true':
            return
        if os.getenv('RAILWAY_PROJECT_ID') != 'cf4b2162-5236-4f92-b010-165f505fe2c2':
            return
        with transaction.atomic():
            qs = TemporaryWorkforceSnapshot.objects.filter(expires_at__lte=timezone.now())
            expired = qs.count()
            if expired:
                qs.delete()
                AuditLog.objects.create(
                    user='system', action='temporary_workforce_retention_purge',
                    model_name='TemporaryWorkforceSnapshot', record_id=f'{expired} snapshots',
                )
        self.stdout.write(f'Temporary workforce retention purge: {expired} expired snapshots.')
