from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('health', '0027_health_center_structured_profile'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='CenterDirectoryMatchingBatch',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True,
                                           serialize=False, verbose_name='ID')),
                ('source_sha256', models.CharField(db_index=True, max_length=64)),
                ('fingerprint', models.CharField(max_length=64, unique=True)),
                ('source_filename', models.CharField(max_length=180)),
                ('matching_decisions', models.JSONField(default=list)),
                ('summary', models.JSONField(default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('performed_by', models.ForeignKey(
                    to=settings.AUTH_USER_MODEL, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='center_directory_matching_batches',
                )),
            ],
            options={'ordering': ['-created_at', '-pk']},
        ),
    ]
