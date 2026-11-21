from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('health', '0035_provisional_temporary_numbers')]

    operations = [
        migrations.AddField(
            model_name='employee',
            name='source_organizational_hierarchy',
            field=models.JSONField(
                blank=True, default=dict,
                help_text='Imported organization labels as source references, NOT approved unit assignments',
            ),
        ),
    ]
