import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('health', '0030_employee_profile_completion_event'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='EmployeeImportReviewCleanupBatch',
            fields=[
                ('id', models.UUIDField(
                    default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('original_statuses', models.JSONField(default=dict)),
                ('reason', models.CharField(max_length=500)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('applied_at', models.DateTimeField()),
                ('restored_at', models.DateTimeField(null=True, blank=True)),
                ('restoration_reason', models.CharField(max_length=500, blank=True)),
                ('created_by', models.ForeignKey(
                    null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='employee_review_cleanup_batches', to=settings.AUTH_USER_MODEL)),
                ('restored_by', models.ForeignKey(
                    null=True, blank=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='restored_employee_review_cleanup_batches', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at']},
        ),
    ]
