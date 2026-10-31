from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("health", "0014_healthcenter_bilingual_names"),
    ]

    operations = [
        migrations.AddField(
            model_name="employee",
            name="job_title_en",
            field=models.CharField(blank=True, max_length=150),
        ),
    ]
