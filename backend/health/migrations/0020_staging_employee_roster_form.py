from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("health", "0019_temporary_workforce_snapshot"),
    ]

    operations = [
        migrations.AddField(
            model_name="employee", name="job_title_en",
            field=models.CharField(max_length=150, blank=True),
        ),
        migrations.AddField(
            model_name="employee", name="latest_virtual_visit",
            field=models.DateField(null=True, blank=True),
        ),
        migrations.AddField(
            model_name="employee", name="latest_field_visit",
            field=models.DateField(null=True, blank=True),
        ),
        migrations.AddField(
            model_name="employee", name="lab_request",
            field=models.CharField(max_length=120, blank=True),
        ),
        migrations.AddField(
            model_name="employee", name="lab_request_date",
            field=models.DateField(null=True, blank=True),
        ),
        migrations.AlterField(
            model_name="employee", name="gender",
            field=models.CharField(max_length=10, choices=[('male', 'Male'), ('female', 'Female')], default='', blank=True),
        ),
        migrations.AlterField(
            model_name="employee", name="periodic_exam_status",
            field=models.CharField(max_length=20, choices=[('completed', 'Completed'), ('incomplete', 'Incomplete'), ('overdue', 'Overdue'), ('unknown', 'Not assessed')], default='unknown'),
        ),
        migrations.AlterField(
            model_name="employee", name="vaccination_status",
            field=models.CharField(max_length=20, choices=[('completed', 'Completed'), ('due', 'Due'), ('refused', 'Refused'), ('unknown', 'Not assessed')], default='unknown'),
        ),
        migrations.AlterField(
            model_name="employee", name="risk_level",
            field=models.CharField(max_length=20, choices=[('low', 'Low'), ('medium', 'Medium'), ('high', 'High'), ('unknown', 'Not assessed')], default='unknown'),
        ),
    ]
