from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("health", "0020_staging_employee_roster_form"),
    ]

    operations = [
        migrations.AddField(
            model_name="employee",
            name="nationality",
            field=models.CharField(max_length=2, blank=True, default=""),
        ),
        migrations.AddField(
            model_name="employee",
            name="current_job",
            field=models.CharField(max_length=200, blank=True),
        ),
    ]
