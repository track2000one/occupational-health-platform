from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('health', '0032_employee_excel_match_review'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ProvisionalEmployeeImportBatch',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('file_sha256', models.CharField(max_length=64, unique=True)),
                ('file_name', models.CharField(max_length=255)),
                ('sheet_name', models.CharField(default='Employees', max_length=120)),
                ('total_rows', models.PositiveIntegerField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,
                    related_name='provisional_employee_import_batches', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at', '-pk']},
        ),
        migrations.CreateModel(
            name='ProvisionalEmployeeRosterRow',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('source_row', models.PositiveIntegerField()),
                ('identity_digest', models.CharField(db_index=True, max_length=64)),
                ('sealed_payload', models.TextField()),
                ('classification', models.CharField(db_index=True, max_length=28)),
                ('missing_optional', models.JSONField(default=list)),
                ('last_completion_reason', models.CharField(blank=True, max_length=500)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('batch', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                    related_name='rows', to='health.provisionalemployeeimportbatch')),
                ('last_completed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='provisional_roster_completions', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['source_row', 'pk']},
        ),
        migrations.AddConstraint(
            model_name='provisionalemployeerosterrow',
            constraint=models.UniqueConstraint(fields=('batch', 'source_row'),
                name='unique_provisional_roster_source_row'),
        ),
        migrations.AddConstraint(
            model_name='provisionalemployeerosterrow',
            constraint=models.UniqueConstraint(fields=('batch', 'identity_digest'),
                name='unique_provisional_roster_identity'),
        ),
    ]
