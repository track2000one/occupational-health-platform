from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('health', '0008_normalize_operational_index_names'),
    ]

    operations = [
        migrations.CreateModel(
            name='OccupationalHealthAssessment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('assessment_date', models.DateField(db_index=True)),
                ('assessment_type', models.CharField(choices=[('Pre-employment', 'Pre-employment'), ('Periodic', 'Periodic'), ('Return to Work', 'Return to Work'), ('Special', 'Special'), ('Exit', 'Exit')], default='Periodic', max_length=40)),
                ('fitness_decision', models.CharField(choices=[('fit', 'Fit'), ('fitWithRestrictions', 'Fit with Restrictions'), ('temporarilyUnfit', 'Temporarily Unfit'), ('permanentlyUnfit', 'Permanently Unfit')], db_index=True, default='fit', max_length=40)),
                ('restrictions', models.TextField(blank=True)),
                ('next_assessment_date', models.DateField(blank=True, null=True)),
                ('assessor_name', models.CharField(blank=True, max_length=200)),
                ('notes', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_occupational_health_assessments', to=settings.AUTH_USER_MODEL)),
                ('employee', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='occupational_health_assessments', to='health.employee')),
            ],
            options={
                'ordering': ['-assessment_date', '-created_at'],
            },
        ),
    ]
