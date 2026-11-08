from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('health', '0026_health_center_reversible_archive'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='healthcenter', name='proposed_parent_name',
            field=models.CharField(max_length=180, blank=True),
        ),
        migrations.AddField(
            model_name='healthcenter', name='proposed_sector_name',
            field=models.CharField(max_length=180, blank=True),
        ),
        migrations.AddField(
            model_name='healthcenter', name='organizational_source_reference',
            field=models.CharField(max_length=250, blank=True),
        ),
        migrations.AddField(
            model_name='healthcenter', name='supporting_document_reference',
            field=models.CharField(max_length=250, blank=True),
        ),
        migrations.AddField(
            model_name='healthcenter', name='approval_status',
            field=models.CharField(
                max_length=12, default='pending', db_index=True,
                choices=[
                    ('pending', 'Awaiting documentation'),
                    ('approved', 'Verified official center reference'),
                    ('revoked', 'Official verification withdrawn'),
                ],
            ),
        ),
        migrations.AddField(
            model_name='healthcenter', name='approval_reference',
            field=models.CharField(max_length=250, blank=True),
        ),
        migrations.AddField(
            model_name='healthcenter', name='approved_at',
            field=models.DateTimeField(null=True, blank=True),
        ),
        migrations.AddField(
            model_name='healthcenter', name='approved_by',
            field=models.ForeignKey(
                to=settings.AUTH_USER_MODEL, null=True, blank=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='verified_health_center_profiles',
            ),
        ),
        migrations.CreateModel(
            name='HealthCenterAlias',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True,
                                          serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=150)),
                ('normalized_name', models.CharField(max_length=180, unique=True)),
                ('source', models.CharField(max_length=24, default='manual')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('added_by', models.ForeignKey(
                    to=settings.AUTH_USER_MODEL, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='added_health_center_aliases',
                )),
                ('center', models.ForeignKey(
                    to='health.healthcenter',
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='aliases',
                )),
            ],
            options={'ordering': ['created_at', 'pk']},
        ),
        migrations.CreateModel(
            name='HealthCenterProfileAuditEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True,
                                          serialize=False, verbose_name='ID')),
                ('action', models.CharField(max_length=40)),
                ('prior_state', models.JSONField(default=dict)),
                ('new_state', models.JSONField(default=dict)),
                ('evidence_reference', models.CharField(max_length=250, blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('performed_by', models.ForeignKey(
                    to=settings.AUTH_USER_MODEL, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='health_center_profile_events',
                )),
                ('center', models.ForeignKey(
                    to='health.healthcenter',
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='profile_audit_events',
                )),
            ],
            options={'ordering': ['-created_at', '-pk']},
        ),
    ]
