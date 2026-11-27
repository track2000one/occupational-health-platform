from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [('health', '0038_merge_legacy_job_title_en')]
    operations = [
        migrations.AddField(model_name='labtest', name='request_date', field=models.DateField(null=True, blank=True)),
        migrations.AddField(model_name='labtest', name='result_date', field=models.DateField(null=True, blank=True)),
        migrations.AddField(model_name='labtest', name='request_notes', field=models.TextField(blank=True, default='')),
        migrations.AddField(model_name='labtest', name='result_notes', field=models.TextField(blank=True, default='')),
        migrations.AddField(model_name='vaccination', name='dose_date', field=models.DateField(null=True, blank=True)),
        migrations.AddField(model_name='vaccination', name='notes', field=models.TextField(blank=True, default='')),
    ]
