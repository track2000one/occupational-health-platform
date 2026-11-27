from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies=[('health','0041_committee_explicit_dates')]
    operations=[migrations.AddField(model_name='userprofile',name='organization_scope',
        field=models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.PROTECT,
            related_name='scoped_users',to='health.organizationunit'))]
