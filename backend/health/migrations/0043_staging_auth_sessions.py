from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies=[('health','0042_user_organization_scope'),migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations=[
        migrations.CreateModel(name='StagingAuthSession',fields=[
            ('id',models.UUIDField(primary_key=True,editable=False,serialize=False)),
            ('password_stamp',models.CharField(max_length=64)),
            ('refresh_jti',models.CharField(max_length=64)),
            ('expires_at',models.DateTimeField(db_index=True)),
            ('revoked_at',models.DateTimeField(null=True,blank=True)),
            ('created_at',models.DateTimeField(auto_now_add=True)),
            ('user',models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name='staging_auth_sessions',to=settings.AUTH_USER_MODEL)),
        ]),
        migrations.CreateModel(name='StagingLoginWindow',fields=[
            ('key',models.CharField(max_length=64,primary_key=True,serialize=False)),
            ('expires_at',models.DateTimeField(db_index=True)),
            ('attempts',models.PositiveIntegerField(default=0)),
        ]),
    ]
