from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('health', '0033_provisional_employee_roster'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ProvisionalEmployeeNumberCorrectionEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('batch_sha256', models.CharField(max_length=64)),
                ('source_row', models.PositiveIntegerField()),
                ('old_number_digest', models.CharField(max_length=64)),
                ('new_number_digest', models.CharField(max_length=64)),
                ('evidence_reference', models.CharField(max_length=150)),
                ('reason', models.CharField(max_length=500)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('performed_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,
                    related_name='provisional_employee_number_corrections',
                    to=settings.AUTH_USER_MODEL)),
                ('row', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='number_corrections', to='health.provisionalemployeerosterrow')),
            ],
            options={'ordering': ['-created_at', '-pk']},
        ),
    ]
