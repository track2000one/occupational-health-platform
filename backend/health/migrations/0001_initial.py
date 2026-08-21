# Generated initial migration for occupational health platform
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='HealthCenter',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=150, unique=True)),
                ('city', models.CharField(blank=True, max_length=120)),
                ('is_active', models.BooleanField(default=True)),
            ],
        ),
        migrations.CreateModel(
            name='AuditLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('user', models.CharField(blank=True, max_length=150)),
                ('action', models.CharField(max_length=120)),
                ('model_name', models.CharField(max_length=120)),
                ('record_id', models.CharField(blank=True, max_length=80)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.CreateModel(
            name='Employee',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('national_id', models.CharField(max_length=30, unique=True)),
                ('mobile', models.CharField(blank=True, max_length=30)),
                ('gender', models.CharField(choices=[('male', 'Male'), ('female', 'Female')], default='male', max_length=10)),
                ('job_title', models.CharField(blank=True, max_length=150)),
                ('age', models.PositiveIntegerField(default=0)),
                ('periodic_exam_status', models.CharField(choices=[('completed', 'Completed'), ('incomplete', 'Incomplete'), ('overdue', 'Overdue')], default='incomplete', max_length=20)),
                ('vaccination_status', models.CharField(choices=[('completed', 'Completed'), ('due', 'Due'), ('refused', 'Refused')], default='due', max_length=20)),
                ('risk_level', models.CharField(choices=[('low', 'Low'), ('medium', 'Medium'), ('high', 'High')], default='low', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('health_center', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='employees', to='health.healthcenter')),
            ],
        ),
        migrations.CreateModel(
            name='LabTest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('test_type', models.CharField(max_length=100)),
                ('result', models.CharField(blank=True, max_length=200)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('completed', 'Completed'), ('missing', 'Missing')], default='pending', max_length=20)),
                ('date', models.DateField(blank=True, null=True)),
                ('employee', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='lab_tests', to='health.employee')),
            ],
        ),
        migrations.CreateModel(
            name='Vaccination',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('vaccine_type', models.CharField(max_length=100)),
                ('dose', models.CharField(max_length=50)),
                ('status', models.CharField(choices=[('given', 'Given'), ('due', 'Due'), ('refused', 'Refused'), ('contraindicated', 'Contraindicated')], default='due', max_length=20)),
                ('next_due_date', models.DateField(blank=True, null=True)),
                ('employee', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='vaccinations', to='health.employee')),
            ],
        ),
        migrations.CreateModel(
            name='ClinicVisit',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('clinic_type', models.CharField(max_length=120)),
                ('diagnosis', models.TextField(blank=True)),
                ('action_taken', models.TextField(blank=True)),
                ('visit_date', models.DateField(blank=True, null=True)),
                ('employee', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='clinic_visits', to='health.employee')),
            ],
        ),
        migrations.CreateModel(
            name='CommitteeReferral',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('diagnosis', models.TextField(blank=True)),
                ('decision', models.TextField(blank=True)),
                ('status', models.CharField(choices=[('draft', 'Draft'), ('under_review', 'Under Review'), ('decision_issued', 'Decision Issued'), ('closed', 'Closed')], default='draft', max_length=30)),
                ('date', models.DateField(blank=True, null=True)),
                ('employee', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='committee_referrals', to='health.employee')),
            ],
        ),
        migrations.CreateModel(
            name='InjuryCase',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('exposure_date', models.DateField(blank=True, null=True)),
                ('workplace', models.CharField(blank=True, max_length=150)),
                ('source_known', models.BooleanField(default=False)),
                ('status', models.CharField(choices=[('new', 'New'), ('under_review', 'Under Review'), ('follow_up_required', 'Follow-up Required'), ('closed', 'Closed')], default='new', max_length=30)),
                ('employee', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='injury_cases', to='health.employee')),
            ],
        ),
    ]
