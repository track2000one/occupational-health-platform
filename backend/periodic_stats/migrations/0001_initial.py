from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]

    operations = [
        migrations.CreateModel(
            name='Indicator',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.SlugField(max_length=100, unique=True)),
                ('name_ar', models.CharField(max_length=255)),
                ('name_en', models.CharField(max_length=255)),
                ('measurement_type', models.CharField(choices=[('count', 'Count'), ('reports', 'Reports')], default='count', max_length=20)),
                ('q1_target', models.PositiveIntegerField(blank=True, null=True)),
                ('q2_target', models.PositiveIntegerField(blank=True, null=True)),
                ('q3_target', models.PositiveIntegerField(blank=True, null=True)),
                ('q4_target', models.PositiveIntegerField(blank=True, null=True)),
                ('is_targeted', models.BooleanField(default=True)),
                ('is_active', models.BooleanField(default=True)),
                ('sort_order', models.PositiveSmallIntegerField(default=0)),
            ],
            options={'ordering': ['sort_order', 'id']},
        ),
        migrations.CreateModel(
            name='ReferenceDocument',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=500)),
                ('status', models.CharField(choices=[('available', 'Available'), ('unavailable', 'Unavailable'), ('not_applicable', 'Not applicable')], default='available', max_length=20)),
                ('reason', models.CharField(blank=True, max_length=500)),
                ('last_review_date', models.DateField(blank=True, null=True)),
                ('notes', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={'ordering': ['id']},
        ),
        migrations.CreateModel(
            name='WorkforceMember',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('category', models.CharField(choices=[('doctor', 'Doctor'), ('nursing', 'Nursing')], db_index=True, max_length=20)),
                ('name', models.CharField(max_length=255)),
                ('employee_number', models.CharField(max_length=50, unique=True)),
                ('job_title', models.CharField(blank=True, max_length=255)),
                ('qualification', models.CharField(blank=True, max_length=255)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={'ordering': ['category', 'name']},
        ),
        migrations.CreateModel(
            name='DailyStatistic',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField(db_index=True)),
                ('count', models.PositiveIntegerField(default=0)),
                ('location', models.CharField(blank=True, max_length=255)),
                ('executor', models.CharField(blank=True, max_length=255)),
                ('notes', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='periodic_stats_entries', to=settings.AUTH_USER_MODEL)),
                ('indicator', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='daily_entries', to='periodic_stats.indicator')),
            ],
            options={'ordering': ['-date', '-created_at']},
        ),
        migrations.CreateModel(
            name='Initiative',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=500)),
                ('network_department', models.CharField(blank=True, max_length=255)),
                ('start_date', models.DateField()),
                ('end_date', models.DateField(blank=True, null=True)),
                ('leader_target', models.CharField(blank=True, max_length=500)),
                ('implementation_team', models.TextField(blank=True)),
                ('goals', models.TextField(blank=True)),
                ('details', models.TextField(blank=True)),
                ('implementation_method', models.TextField(blank=True)),
                ('beneficiaries', models.PositiveIntegerField(default=0)),
                ('achieved_goals', models.TextField(blank=True)),
                ('supporting_documents_notes', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='periodic_stats_initiatives', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-start_date', '-id']},
        ),
        migrations.CreateModel(
            name='WorkforceTarget',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('item', models.CharField(max_length=255)),
                ('annual_target', models.PositiveIntegerField(default=0)),
                ('q1_target', models.PositiveIntegerField(default=0)),
                ('q2_target', models.PositiveIntegerField(default=0)),
                ('q3_target', models.PositiveIntegerField(default=0)),
                ('q4_target', models.PositiveIntegerField(default=0)),
                ('notes', models.CharField(blank=True, max_length=500)),
                ('member', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='targets', to='periodic_stats.workforcemember')),
            ],
            options={'ordering': ['member__name', 'id']},
        ),
        migrations.AddConstraint(
            model_name='workforcetarget',
            constraint=models.UniqueConstraint(fields=('member', 'item'), name='unique_workforce_member_target_item'),
        ),
        migrations.AddIndex(
            model_name='dailystatistic',
            index=models.Index(fields=['date', 'indicator'], name='periodic_st_date_5a9bca_idx'),
        ),
    ]
