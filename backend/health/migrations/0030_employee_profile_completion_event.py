from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('health', '0029_employee_provisional_registration'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='EmployeeProfileCompletionEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False,
                                           verbose_name='ID')),
                ('changed_fields', models.JSONField(default=list)),
                ('reason', models.CharField(max_length=500)),
                ('identity_checked', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('employee', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,
                    related_name='completion_events', to='health.employee')),
                ('previous_center', models.ForeignKey(null=True, blank=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='employee_completion_previous', to='health.healthcenter')),
                ('resulting_center', models.ForeignKey(null=True, blank=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='employee_completion_resulting', to='health.healthcenter')),
                ('performed_by', models.ForeignKey(null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='employee_profile_completion_events', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at', '-pk']},
        ),
    ]
