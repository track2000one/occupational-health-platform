from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('health', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='UserProfile',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('role', models.CharField(choices=[('systemAdmin', 'System Admin'), ('ohManager', 'OH Manager'), ('ohDoctor', 'OH Doctor'), ('clinicDoctor', 'Clinic Doctor'), ('labOfficer', 'Lab Officer'), ('vaccinationOfficer', 'Vaccination Officer'), ('needleStickOfficer', 'Needle Stick Officer'), ('medicalCommitteeOfficer', 'Medical Committee Officer'), ('campaignOfficer', 'Campaign Officer'), ('centerManager', 'Center Manager'), ('executive', 'Executive'), ('employee', 'Employee'), ('dataEntry', 'Data Entry'), ('dataQuality', 'Data Quality Officer'), ('reportsOfficer', 'Reports Officer'), ('techSupport', 'Technical Support')], default='employee', max_length=40)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('health_center', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='platform_users', to='health.healthcenter')),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='health_profile', to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]
