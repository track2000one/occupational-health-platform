from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('health', '0015_employee_job_title_en'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='OrganizationCenterMapping',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('organization_name', models.CharField(max_length=250)),
                ('organization_key', models.CharField(max_length=64, unique=True)),
                ('is_active', models.BooleanField(default=True)),
                ('approved_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('health_center', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='approved_organization_mappings', to='health.healthcenter',
                )),
                ('approved_by', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='approved_organization_mappings', to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'ordering': ['organization_name']},
        ),
    ]
