from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('health', '0017_workforce_center_mappings'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='employee', name='roster_source_status',
            field=models.CharField(blank=True, max_length=120)),
        migrations.AddField(
            model_name='employee', name='roster_hijri_appointment_date',
            field=models.CharField(blank=True, max_length=30)),
        migrations.AlterField(
            model_name='employee', name='periodic_exam_status',
            field=models.CharField(
                choices=[('completed', 'Completed'), ('incomplete', 'Incomplete'),
                         ('overdue', 'Overdue'), ('unknown', 'Not assessed')],
                default='incomplete', max_length=20)),
        migrations.AlterField(
            model_name='employee', name='vaccination_status',
            field=models.CharField(
                choices=[('completed', 'Completed'), ('due', 'Due'),
                         ('refused', 'Refused'), ('unknown', 'Not assessed')],
                default='due', max_length=20)),
        migrations.AlterField(
            model_name='employee', name='risk_level',
            field=models.CharField(
                choices=[('low', 'Low'), ('medium', 'Medium'),
                         ('high', 'High'), ('unknown', 'Not assessed')],
                default='low', max_length=20)),
        migrations.CreateModel(
            name='WorkforceImportPlan',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False, auto_created=True, verbose_name='ID')),
                ('state', models.CharField(
                    choices=[('draft', 'Draft'), ('approved', 'Approved'), ('committed', 'Committed')],
                    default='draft', max_length=12)),
                ('file_sha256', models.CharField(max_length=64)),
                ('mapping_sha256', models.CharField(max_length=64)),
                ('summary', models.JSONField(default=dict)),
                ('approval_reference', models.CharField(blank=True, max_length=255)),
                ('backup_reference', models.CharField(blank=True, max_length=255)),
                ('restore_verification_reference', models.CharField(blank=True, max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('approved_at', models.DateTimeField(blank=True, null=True)),
                ('committed_at', models.DateTimeField(blank=True, null=True)),
                ('created_by', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='workforce_import_plans', to=settings.AUTH_USER_MODEL)),
                ('approved_by', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.PROTECT,
                    related_name='approved_workforce_import_plans', to=settings.AUTH_USER_MODEL)),
            ], options={'ordering': ['-created_at']},
        ),
        migrations.CreateModel(
            name='WorkforceImportCreatedEmployee',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False, auto_created=True, verbose_name='ID')),
                ('source_row', models.PositiveIntegerField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('employee', models.OneToOneField(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='workforce_import_provenance', to='health.employee')),
                ('plan', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='created_employees', to='health.workforceimportplan')),
            ],
        ),
    ]
