from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('health', '0015_employee_employment_lifecycle'),
    ]

    operations = [
        migrations.AddField(
            model_name='healthcenter',
            name='manager_name',
            field=models.CharField(
                blank=True, help_text='Approved reference name for center manager', max_length=200,
            ),
        ),
    ]
