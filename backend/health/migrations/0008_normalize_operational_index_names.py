from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('health', '0007_employee_health_card'),
    ]

    operations = [
        migrations.RenameIndex(
            model_name='labscreening',
            old_name='health_labs_request_90563f_idx',
            new_name='health_labs_request_3b9786_idx',
        ),
        migrations.RenameIndex(
            model_name='medicalcommitteecase',
            old_name='health_medi_transac_b9452c_idx',
            new_name='health_medi_transac_e27601_idx',
        ),
        migrations.RenameIndex(
            model_name='needlestickexposure',
            old_name='health_need_exposur_26a6c1_idx',
            new_name='health_need_exposur_9375ee_idx',
        ),
    ]
