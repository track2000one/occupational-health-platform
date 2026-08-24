from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('health', '0010_employeeimportreview'),
    ]

    operations = [
        migrations.AlterField(
            model_name='clinicvisit',
            name='visit_date',
            field=models.DateField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name='clinicvisit',
            name='visit_time',
            field=models.TimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='clinicvisit',
            name='sick_leave_days',
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='clinicvisit',
            name='follow_up_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='clinicvisit',
            name='doctor_name',
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name='clinicvisit',
            name='status',
            field=models.CharField(
                choices=[('open', 'Open'), ('completed', 'Completed'), ('follow_up', 'Follow-up required')],
                db_index=True,
                default='completed',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='clinicvisit',
            name='notes',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='clinicvisit',
            name='created_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='created_clinic_visits',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='clinicvisit',
            name='created_at',
            field=models.DateTimeField(auto_now_add=True, default=django.utils.timezone.now),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='clinicvisit',
            name='updated_at',
            field=models.DateTimeField(auto_now=True),
        ),
        migrations.AlterModelOptions(
            name='clinicvisit',
            options={'ordering': ['-visit_date', '-visit_time', '-id']},
        ),
    ]
