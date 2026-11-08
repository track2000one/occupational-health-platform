from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('health', '0022_organization_hierarchy'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='employee',
            name='is_archived',
            field=models.BooleanField(default=False, db_index=True),
        ),
        migrations.AddField(
            model_name='employee',
            name='archive_reason',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='employee',
            name='archived_at',
            field=models.DateTimeField(null=True, blank=True),
        ),
        migrations.AddField(
            model_name='employee',
            name='archived_by',
            field=models.ForeignKey(
                to=settings.AUTH_USER_MODEL,
                on_delete=django.db.models.deletion.SET_NULL,
                null=True, blank=True,
                related_name='archived_employee_records',
            ),
        ),
        migrations.CreateModel(
            name='EmployeeArchiveEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action', models.CharField(
                    max_length=12,
                    choices=[('archive', 'Archive'), ('restore', 'Restore')],
                )),
                ('reason', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('employee', models.ForeignKey(
                    to='health.employee',
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='archive_events',
                )),
                ('performed_by', models.ForeignKey(
                    to=settings.AUTH_USER_MODEL,
                    on_delete=django.db.models.deletion.SET_NULL,
                    null=True, blank=True, related_name='employee_archive_events',
                )),
            ],
            options={'ordering': ['-created_at', '-id']},
        ),
    ]
