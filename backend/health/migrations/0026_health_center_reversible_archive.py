import uuid
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('health', '0025_center_foundation_registry'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='healthcenter', name='is_archived',
            field=models.BooleanField(default=False, db_index=True),
        ),
        migrations.AddField(
            model_name='healthcenter', name='archived_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='healthcenter', name='archive_reason',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='healthcenter', name='archived_by',
            field=models.ForeignKey(
                to=settings.AUTH_USER_MODEL, null=True, blank=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='archived_health_centers',
            ),
        ),
        migrations.CreateModel(
            name='HealthCenterResetBatch',
            fields=[
                ('id', models.UUIDField(primary_key=True, default=uuid.uuid4,
                                       editable=False, serialize=False)),
                ('center_ids', models.JSONField(default=list)),
                ('reason', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('archived_at', models.DateTimeField()),
                ('restored_at', models.DateTimeField(blank=True, null=True)),
                ('restore_reason', models.TextField(blank=True)),
                ('created_by', models.ForeignKey(
                    to=settings.AUTH_USER_MODEL, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='health_center_reset_batches',
                )),
                ('restored_by', models.ForeignKey(
                    to=settings.AUTH_USER_MODEL, null=True, blank=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='health_center_restored_batches',
                )),
            ],
            options={'ordering': ['-created_at']},
        ),
        migrations.CreateModel(
            name='HealthCenterLifecycleEvent',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False,
                                           auto_created=True, verbose_name='ID')),
                ('action', models.CharField(max_length=30)),
                ('reason', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('batch', models.ForeignKey(
                    to='health.healthcenterresetbatch', null=True, blank=True,
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='events',
                )),
                ('center', models.ForeignKey(
                    to='health.healthcenter',
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='lifecycle_events',
                )),
                ('performed_by', models.ForeignKey(
                    to=settings.AUTH_USER_MODEL, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='health_center_lifecycle_events',
                )),
            ],
            options={'ordering': ['-created_at', '-pk']},
        ),
    ]
