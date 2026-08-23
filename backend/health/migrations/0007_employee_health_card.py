import datetime

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('health', '0006_employee_identity_employment_fields'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='EmployeeHealthCard',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('card_number', models.CharField(blank=True, max_length=40, unique=True)),
                ('issue_date', models.DateField(default=datetime.date.today)),
                ('next_review_date', models.DateField(blank=True, null=True)),
                ('reviewed_by', models.CharField(blank=True, max_length=200)),
                ('is_approved', models.BooleanField(default=False)),
                ('data', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_employee_health_cards', to=settings.AUTH_USER_MODEL)),
                ('employee', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='health_card', to='health.employee')),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='updated_employee_health_cards', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Employee health card',
                'verbose_name_plural': 'Employee health cards',
                'ordering': ['-updated_at'],
            },
        ),
    ]
