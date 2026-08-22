from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('health', '0003_userprofile_identity_fields'),
    ]

    operations = [
        migrations.CreateModel(
            name='DataImportBatch',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('file_name', models.CharField(max_length=255)),
                ('sheet_name', models.CharField(blank=True, max_length=150)),
                ('mode', models.CharField(choices=[('preview', 'Preview only'), ('commit', 'Commit to database')], default='preview', max_length=20)),
                ('status', models.CharField(choices=[('validated', 'Validated'), ('committed', 'Committed'), ('failed', 'Failed')], default='validated', max_length=20)),
                ('total_rows', models.PositiveIntegerField(default=0)),
                ('valid_rows', models.PositiveIntegerField(default=0)),
                ('duplicate_rows', models.PositiveIntegerField(default=0)),
                ('imported_records', models.PositiveIntegerField(default=0)),
                ('skipped_rows', models.PositiveIntegerField(default=0)),
                ('errors_count', models.PositiveIntegerField(default=0)),
                ('summary', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='health_import_batches', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
