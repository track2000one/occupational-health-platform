from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [('health','0039_clinical_explicit_dates'), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(
            name='EmployeeHealthObservation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('observation_date', models.DateField(db_index=True)),
                ('data', models.JSONField(default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='created_health_observations', to=settings.AUTH_USER_MODEL)),
                ('employee', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,
                    related_name='health_observations', to='health.employee')),
            ],
            options={'ordering':['-observation_date','-pk']},
        ),
        migrations.AddConstraint(model_name='employeehealthobservation',
            constraint=models.UniqueConstraint(fields=('employee','observation_date'),name='unique_employee_health_observation_date')),
    ]
