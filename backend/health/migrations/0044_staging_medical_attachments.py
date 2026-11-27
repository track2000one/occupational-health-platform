from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies=[('health','0043_staging_auth_sessions'),migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations=[migrations.CreateModel(name='StagingMedicalAttachment',fields=[
        ('id',models.UUIDField(primary_key=True,editable=False,serialize=False)),
        ('content_type',models.CharField(max_length=32)),
        ('byte_size',models.PositiveIntegerField()),
        ('checksum_sha256',models.CharField(max_length=64)),
        ('file_data',models.BinaryField(editable=False)),
        ('created_at',models.DateTimeField(auto_now_add=True)),
        ('card',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='staging_medical_attachments',to='health.employeehealthcard')),
        ('uploaded_by',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='staging_medical_attachments',to=settings.AUTH_USER_MODEL)),
    ],options={'ordering':['-created_at','id'],'constraints':[models.UniqueConstraint(fields=['card','checksum_sha256'],name='qa_medical_card_checksum_unique')]})]
