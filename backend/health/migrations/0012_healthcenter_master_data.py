from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('health', '0011_expand_clinic_visit_history')]

    operations = [
        migrations.AddField(model_name='healthcenter', name='code', field=models.CharField(blank=True, max_length=40, null=True, unique=True)),
        migrations.AddField(model_name='healthcenter', name='region', field=models.CharField(blank=True, db_index=True, max_length=120)),
        migrations.AddField(model_name='healthcenter', name='district', field=models.CharField(blank=True, db_index=True, max_length=120)),
        migrations.AddField(model_name='healthcenter', name='building_type', field=models.CharField(choices=[('model', 'Model'), ('rented', 'Rented'), ('owned', 'Owned'), ('other', 'Other')], db_index=True, default='model', max_length=20)),
        migrations.AddField(model_name='healthcenter', name='notes', field=models.TextField(blank=True)),
        migrations.AddField(model_name='healthcenter', name='created_at', field=models.DateTimeField(auto_now_add=True, null=True)),
        migrations.AddField(model_name='healthcenter', name='updated_at', field=models.DateTimeField(auto_now=True, null=True)),
        migrations.AlterField(model_name='healthcenter', name='city', field=models.CharField(blank=True, db_index=True, max_length=120)),
        migrations.AlterField(model_name='healthcenter', name='is_active', field=models.BooleanField(db_index=True, default=True)),
        migrations.AlterModelOptions(name='healthcenter', options={'ordering': ['region', 'city', 'name']}),
    ]
