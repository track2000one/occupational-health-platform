from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('health', '0014_healthcenter_bilingual_names'),
    ]

    operations = [
        migrations.AddField(
            model_name='employee',
            name='employment_status',
            field=models.CharField(
                choices=[
                    ('active', 'Active'), ('transferred', 'Transferred'),
                    ('retired', 'Retired'), ('separated', 'Separated'),
                    ('under_review', 'Under review'),
                ],
                db_index=True,
                default='active',
                max_length=20,
            ),
        ),
        migrations.CreateModel(
            name='EmployeeEmploymentChange',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('previous_status', models.CharField(max_length=20)),
                ('new_status', models.CharField(
                    choices=[
                        ('active', 'Active'), ('transferred', 'Transferred'),
                        ('retired', 'Retired'), ('separated', 'Separated'),
                        ('under_review', 'Under review'),
                    ], max_length=20,
                )),
                ('effective_date', models.DateField()),
                ('evidence_reference', models.CharField(max_length=255)),
                ('notes', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('approved_by', models.ForeignKey(
                    null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='approved_employee_status_changes',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('employee', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='employment_changes', to='health.employee',
                )),
                ('previous_health_center', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='employment_changes_from', to='health.healthcenter',
                )),
                ('new_health_center', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='employment_changes_to', to='health.healthcenter',
                )),
            ],
            options={'ordering': ['-effective_date', '-created_at']},
        ),
    ]
