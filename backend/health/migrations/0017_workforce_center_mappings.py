from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [
        ('health', '0016_healthcenter_manager_name'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='WorkforceCenterMapping',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False, auto_created=True, verbose_name='ID')),
                ('fingerprint', models.CharField(max_length=64, unique=True)),
                ('organization', models.TextField()),
                ('organization_type', models.CharField(max_length=100, blank=True)),
                ('approval_reference', models.CharField(max_length=255)),
                ('approved_at', models.DateTimeField(auto_now=True)),
                ('is_active', models.BooleanField(default=True, db_index=True)),
                ('approved_by', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='approved_workforce_mappings', to=settings.AUTH_USER_MODEL)),
                ('health_center', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='workforce_mappings', to='health.healthcenter')),
            ],
        ),
        migrations.CreateModel(
            name='WorkforceCenterMappingRevision',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False, auto_created=True, verbose_name='ID')),
                ('approval_reference', models.CharField(max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('approved_by', models.ForeignKey(
                    null=True, blank=True, on_delete=django.db.models.deletion.SET_NULL,
                    to=settings.AUTH_USER_MODEL)),
                ('mapping', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT, related_name='revisions',
                    to='health.workforcecentermapping')),
                ('previous_center', models.ForeignKey(
                    null=True, blank=True, on_delete=django.db.models.deletion.PROTECT,
                    related_name='workforce_mapping_previous_revisions', to='health.healthcenter')),
                ('new_center', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='workforce_mapping_new_revisions', to='health.healthcenter')),
            ],
            options={'ordering': ['-created_at', '-id']},
        ),
    ]
