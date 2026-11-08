import uuid
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('health', '0023_employee_safe_archive'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='EmployeeRegistryResetBatch',
            fields=[
                ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('employee_ids', models.JSONField(default=list)),
                ('reason', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('applied_at', models.DateTimeField()),
                ('restored_at', models.DateTimeField(null=True, blank=True)),
                ('restoration_reason', models.TextField(blank=True)),
                ('created_by', models.ForeignKey(
                    to=settings.AUTH_USER_MODEL, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='employee_registry_resets',
                )),
                ('restored_by', models.ForeignKey(
                    to=settings.AUTH_USER_MODEL, null=True, blank=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='restored_employee_registry_resets',
                )),
            ],
            options={'ordering': ['-created_at']},
        ),
    ]
