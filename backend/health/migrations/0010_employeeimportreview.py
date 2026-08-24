import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('health', '0009_occupational_health_assessment'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='EmployeeImportReview',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('source_file', models.CharField(blank=True, max_length=255)),
                ('source_sheet', models.CharField(blank=True, max_length=150)),
                ('source_row', models.PositiveIntegerField()),
                ('fingerprint', models.CharField(max_length=64, unique=True)),
                ('raw_payload', models.JSONField(blank=True, default=dict)),
                ('employee_payload', models.JSONField(blank=True, default=dict)),
                ('issues', models.JSONField(blank=True, default=list)),
                ('warnings', models.JSONField(blank=True, default=list)),
                ('status', models.CharField(choices=[('pending', 'Pending correction'), ('conflict', 'Conflicting existing employee'), ('activated', 'Corrected and activated'), ('discarded', 'Discarded')], db_index=True, default='pending', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('resolved_at', models.DateTimeField(blank=True, null=True)),
                ('activated_employee', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='activated_import_reviews', to='health.employee')),
                ('batch', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='employee_reviews', to='health.dataimportbatch')),
                ('conflict_employee', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='import_conflicts', to='health.employee')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='employee_import_reviews', to=settings.AUTH_USER_MODEL)),
                ('resolved_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='resolved_employee_import_reviews', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at', 'source_row'],
            },
        ),
        migrations.AddIndex(
            model_name='employeeimportreview',
            index=models.Index(fields=['status', 'created_at'], name='health_empl_status_92cff4_idx'),
        ),
    ]
