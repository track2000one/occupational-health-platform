from django.db import migrations, models


def mark_legacy_centers_unknown(apps, schema_editor):
    HealthCenter = apps.get_model('health', 'HealthCenter')
    HealthCenter.objects.filter(created_at__isnull=True, building_type='model').update(building_type='unknown')


class Migration(migrations.Migration):
    dependencies = [('health', '0012_healthcenter_master_data')]

    operations = [
        migrations.RunPython(mark_legacy_centers_unknown, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='healthcenter',
            name='building_type',
            field=models.CharField(
                choices=[('unknown', 'Unspecified'), ('model', 'Model'), ('rented', 'Rented'), ('owned', 'Owned'), ('other', 'Other')],
                db_index=True,
                default='unknown',
                max_length=20,
            ),
        ),
    ]
