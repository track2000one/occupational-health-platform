from django.db import migrations, models
import django.db.models.deletion


def backfill_health_centers(apps, schema_editor):
    DailyStatistic = apps.get_model('periodic_stats', 'DailyStatistic')
    HealthCenter = apps.get_model('health', 'HealthCenter')
    centers = {str(center.name).strip().casefold(): center.id for center in HealthCenter.objects.all()}
    for row in DailyStatistic.objects.exclude(location='').iterator():
        center_id = centers.get(str(row.location).strip().casefold())
        if center_id:
            row.health_center_id = center_id
            row.save(update_fields=['health_center'])


class Migration(migrations.Migration):
    dependencies = [
        ('health', '0012_healthcenter_master_data'),
        ('periodic_stats', '0004_evidenceattachment'),
    ]

    operations = [
        migrations.AddField(
            model_name='dailystatistic',
            name='health_center',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='daily_statistics', to='health.healthcenter'),
        ),
        migrations.RunPython(backfill_health_centers, migrations.RunPython.noop),
    ]
