from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [('health','0040_employee_health_observation')]
    operations = [
        migrations.AddField(model_name='committeereferral',name='referral_date',field=models.DateField(null=True,blank=True)),
        migrations.AddField(model_name='committeereferral',name='decision_date',field=models.DateField(null=True,blank=True)),
        migrations.AddField(model_name='committeereferral',name='recommendations',field=models.TextField(blank=True,default='')),
        migrations.AddField(model_name='committeereferral',name='qa_workflow',field=models.BooleanField(default=False,editable=False)),
    ]
