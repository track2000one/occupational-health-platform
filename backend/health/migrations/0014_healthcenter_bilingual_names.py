from django.db import migrations, models


def backfill_bilingual_names(apps, schema_editor):
    HealthCenter = apps.get_model('health', 'HealthCenter')
    arabic_names = {
        'Main Occupational Health Center': 'مركز الصحة المهنية الرئيسي',
        'Employee Clinic': 'عيادة الموظفين',
        'Medical Committee Unit': 'وحدة اللجنة الطبية',
    }
    for center in HealthCenter.objects.all().iterator():
        update_fields = []
        if not center.name_en:
            center.name_en = center.name
            update_fields.append('name_en')
        if not center.name_ar and center.name in arabic_names:
            center.name_ar = arabic_names[center.name]
            update_fields.append('name_ar')
        if update_fields:
            center.save(update_fields=update_fields)


class Migration(migrations.Migration):
    dependencies = [('health', '0013_healthcenter_unknown_building_type')]

    operations = [
        migrations.AddField(
            model_name='healthcenter',
            name='name_ar',
            field=models.CharField(blank=True, db_index=True, max_length=150),
        ),
        migrations.AddField(
            model_name='healthcenter',
            name='name_en',
            field=models.CharField(blank=True, db_index=True, max_length=150),
        ),
        migrations.RunPython(backfill_bilingual_names, migrations.RunPython.noop),
    ]
