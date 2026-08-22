from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('health', '0002_userprofile'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='person_type',
            field=models.CharField(choices=[('admin', 'Administrator'), ('healthStaff', 'Health Staff'), ('employee', 'Employee'), ('patient', 'Patient'), ('external', 'External')], default='employee', max_length=30),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='national_id',
            field=models.CharField(blank=True, max_length=30, null=True, unique=True),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='employee_number',
            field=models.CharField(blank=True, max_length=40, null=True, unique=True),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='medical_record_number',
            field=models.CharField(blank=True, max_length=40, null=True, unique=True),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='phone',
            field=models.CharField(blank=True, max_length=30),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='department',
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='job_title',
            field=models.CharField(blank=True, max_length=150),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='specialty',
            field=models.CharField(blank=True, max_length=150),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='license_number',
            field=models.CharField(blank=True, max_length=80),
        ),
    ]
