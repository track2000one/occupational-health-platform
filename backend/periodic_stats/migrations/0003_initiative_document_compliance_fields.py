from django.db import migrations, models


def backfill_reference_metadata(apps, schema_editor):
    ReferenceDocument = apps.get_model('periodic_stats', 'ReferenceDocument')

    mapping = {
        'الدليل الإرشادي للبرنامج': {
            'source': 'Occupational Health Clinic 2019',
        },
        'الدليل الإرشادي للحالات الطارئة': {
            'source': 'المركز السعودي للاعتماد',
            'issuing_authority': 'سباهي',
        },
        'آلية الإبلاغ عن الأحداث': {
            'source': 'Email + OVR',
        },
        'أدلة أخرى ذات علاقة': {
            'source': 'المركز السعودي للاعتماد',
            'issuing_authority': 'سباهي',
        },
        'سياسات الصحة المهنية': {
            'source': 'سياسات الصحة المهنية',
            'document_count': 5,
        },
        'دليل تقييم مخاطر المراكز': {
            'source': 'نموذج تقييم المخاطر',
        },
    }

    for title, defaults in mapping.items():
        ReferenceDocument.objects.filter(title=title).update(**defaults)


def reverse_backfill(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ('periodic_stats', '0002_seed_reference_data'),
    ]

    operations = [
        migrations.AddField(
            model_name='initiative',
            name='activities',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='initiative',
            name='department_copy_saved',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='initiative',
            name='evidence_links',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='initiative',
            name='redcap_reference',
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name='initiative',
            name='redcap_upload_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='initiative',
            name='redcap_uploaded',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='initiative',
            name='status',
            field=models.CharField(
                choices=[
                    ('draft', 'Draft'),
                    ('in_progress', 'In progress'),
                    ('completed', 'Completed'),
                    ('submitted', 'Submitted'),
                ],
                db_index=True,
                default='draft',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='initiative',
            name='team_members',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='referencedocument',
            name='document_count',
            field=models.PositiveIntegerField(default=1),
        ),
        migrations.AddField(
            model_name='referencedocument',
            name='evidence_links',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='referencedocument',
            name='issue_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='referencedocument',
            name='issuing_authority',
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name='referencedocument',
            name='responsible_person',
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name='referencedocument',
            name='source',
            field=models.CharField(blank=True, max_length=500),
        ),
        migrations.AddField(
            model_name='referencedocument',
            name='version_number',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.RunPython(backfill_reference_metadata, reverse_backfill),
    ]
