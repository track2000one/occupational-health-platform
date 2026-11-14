from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('health', '0028_center_directory_matching_batch'),
    ]

    operations = [
        migrations.AlterField(
            model_name='employee',
            name='health_center',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.PROTECT,
                related_name='employees', to='health.healthcenter',
            ),
        ),
        migrations.AddField(
            model_name='employee',
            name='source_center_name',
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name='employee',
            name='registration_status',
            field=models.CharField(
                choices=[
                    ('verified', 'Verified registry record'),
                    ('provisional', 'Awaiting identity/placement verification'),
                ], db_index=True, default='verified', max_length=20,
            ),
        ),
    ]
