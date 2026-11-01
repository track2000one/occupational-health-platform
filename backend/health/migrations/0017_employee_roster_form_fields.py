from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('health', '0016_organization_center_mapping'),
    ]

    operations = [
        migrations.AddField('employee', 'moh_id', models.CharField(max_length=80, blank=True)),
        migrations.AddField('employee', 'children_count', models.PositiveSmallIntegerField(null=True, blank=True)),
        migrations.AddField('employee', 'latest_virtual_visit', models.DateField(null=True, blank=True)),
        migrations.AddField('employee', 'latest_field_visit', models.DateField(null=True, blank=True)),
        migrations.AddField('employee', 'lab_request', models.CharField(max_length=120, blank=True)),
        migrations.AddField('employee', 'lab_request_date', models.DateField(null=True, blank=True)),
        migrations.AddField('employee', 'employment_start_date', models.DateField(null=True, blank=True)),
        migrations.AlterField('employee', 'gender', models.CharField(max_length=10, choices=[('male', 'Male'), ('female', 'Female')], default='', blank=True)),
        migrations.AlterField('employee', 'periodic_exam_status', models.CharField(max_length=20, choices=[('unassessed', 'Not assessed'), ('completed', 'Completed'), ('incomplete', 'Incomplete'), ('overdue', 'Overdue')], default='unassessed')),
        migrations.AlterField('employee', 'vaccination_status', models.CharField(max_length=20, choices=[('unassessed', 'Not assessed'), ('completed', 'Completed'), ('due', 'Due'), ('refused', 'Refused')], default='unassessed')),
        migrations.AlterField('employee', 'risk_level', models.CharField(max_length=20, choices=[('unassessed', 'Not assessed'), ('low', 'Low'), ('medium', 'Medium'), ('high', 'High')], default='unassessed')),
    ]
