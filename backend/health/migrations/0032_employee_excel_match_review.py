from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('health', '0031_employee_import_review_cleanup_batch'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='EmployeeExcelMatchReview',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('workbook_sha256', models.CharField(db_index=True, max_length=64)),
                ('sheet_name', models.CharField(max_length=128)),
                ('source_row', models.PositiveIntegerField()),
                ('source_row_sha256', models.CharField(max_length=64)),
                ('registry_snapshot_sha256', models.CharField(max_length=64)),
                ('discrepancy_type', models.CharField(max_length=64)),
                ('decision', models.CharField(choices=[
                    ('verified', 'Same person verified externally'),
                    ('not_verified', 'Needs correction / not verified'),
                ], max_length=16)),
                ('evidence_reference', models.CharField(max_length=255)),
                ('reason', models.CharField(max_length=500)),
                ('reviewed_at', models.DateTimeField(auto_now_add=True)),
                ('employee', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT, related_name='excel_match_reviews',
                    to='health.employee')),
                ('reviewed_by', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='employee_excel_match_reviews',
                    to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-reviewed_at', '-pk']},
        ),
        migrations.AddConstraint(
            model_name='employeeexcelmatchreview',
            constraint=models.UniqueConstraint(
                fields=('workbook_sha256', 'sheet_name', 'source_row'),
                name='unique_employee_excel_review_row',
            ),
        ),
    ]
