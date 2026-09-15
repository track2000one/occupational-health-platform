from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('periodic_stats', '0003_initiative_document_compliance_fields'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='EvidenceAttachment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('owner_type', models.CharField(choices=[('initiative', 'Initiative'), ('reference_document', 'Reference document')], db_index=True, max_length=30)),
                ('file_name', models.CharField(max_length=255)),
                ('content_type', models.CharField(max_length=100)),
                ('byte_size', models.PositiveIntegerField()),
                ('file_data', models.BinaryField(editable=False)),
                ('checksum_sha256', models.CharField(db_index=True, max_length=64)),
                ('description', models.CharField(blank=True, max_length=500)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('initiative', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='attachments', to='periodic_stats.initiative')),
                ('reference_document', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='attachments', to='periodic_stats.referencedocument')),
                ('uploaded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='periodic_stats_evidence_uploads', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at', '-id'],
                'indexes': [
                    models.Index(fields=['owner_type', 'initiative'], name='ps_ev_owner_init_idx'),
                    models.Index(fields=['owner_type', 'reference_document'], name='ps_ev_owner_doc_idx'),
                ],
            },
        ),
    ]
