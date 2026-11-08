from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('health', '0024_employee_registry_reset_batch'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='CenterFoundationBatch',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('source_sha256', models.CharField(max_length=64, unique=True)),
                ('source_filename', models.CharField(max_length=180)),
                ('source_reference_sheet', models.CharField(default='مرجع_المراكز', max_length=80)),
                ('source_review_sheet', models.CharField(default='مراجعة_المراكز', max_length=80)),
                ('reference_count', models.PositiveIntegerField(default=0)),
                ('review_count', models.PositiveIntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('created_by', models.ForeignKey(
                    to=settings.AUTH_USER_MODEL, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='center_foundation_imports',
                )),
            ],
            options={'ordering': ['-created_at', '-pk']},
        ),
        migrations.CreateModel(
            name='CenterReferenceCandidate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('source_row', models.PositiveIntegerField()),
                ('source_number', models.PositiveIntegerField()),
                ('center_name', models.CharField(max_length=150)),
                ('name_key', models.CharField(max_length=180)),
                ('proposed_sector', models.CharField(max_length=180)),
                ('provisional_code', models.CharField(max_length=40)),
                ('source_approval_note', models.CharField(max_length=250)),
                ('center_verification', models.CharField(
                    max_length=12, choices=[
                        ('pending', 'Pending official verification'),
                        ('verified', 'Verified by administrative reference'),
                        ('rejected', 'Rejected'),
                    ], default='pending',
                )),
                ('sector_verification', models.CharField(
                    max_length=12, choices=[
                        ('pending', 'Pending official verification'),
                        ('verified', 'Verified by administrative reference'),
                        ('rejected', 'Rejected'),
                    ], default='pending',
                )),
                ('employee_assignment_verification', models.CharField(
                    max_length=12, choices=[
                        ('pending', 'Pending official verification'),
                        ('verified', 'Verified by administrative reference'),
                        ('rejected', 'Rejected'),
                    ], default='pending',
                )),
                ('center_approval_reference', models.CharField(blank=True, max_length=250)),
                ('sector_approval_reference', models.CharField(blank=True, max_length=250)),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('batch', models.ForeignKey(
                    to='health.centerfoundationbatch',
                    on_delete=django.db.models.deletion.PROTECT, related_name='references',
                )),
                ('mapped_center', models.ForeignKey(
                    to='health.healthcenter', null=True, blank=True,
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='foundation_reference_candidates',
                )),
                ('reviewed_by', models.ForeignKey(
                    to=settings.AUTH_USER_MODEL, null=True, blank=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='reviewed_center_reference_candidates',
                )),
            ],
            options={
                'ordering': ['source_number', 'pk'],
                'constraints': [
                    models.UniqueConstraint(fields=('batch', 'source_row'), name='uniq_center_ref_batch_row'),
                    models.UniqueConstraint(fields=('batch', 'provisional_code'), name='uniq_center_ref_batch_code'),
                    models.UniqueConstraint(fields=('batch', 'name_key'), name='uniq_center_ref_batch_name'),
                ],
            },
        ),
        migrations.CreateModel(
            name='CenterNameReviewCase',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('source_row', models.PositiveIntegerField()),
                ('raw_source_label', models.CharField(max_length=180)),
                ('normalized_key', models.CharField(db_index=True, max_length=180)),
                ('source_row_count', models.PositiveIntegerField()),
                ('missing_employee_name_count', models.PositiveIntegerField(default=0)),
                ('invalid_identity_count', models.PositiveIntegerField(default=0)),
                ('sample_source_rows', models.CharField(blank=True, max_length=250)),
                ('source_resolution_note', models.CharField(blank=True, max_length=250)),
                ('source_instruction', models.TextField(blank=True)),
                ('decision', models.CharField(
                    max_length=18, choices=[
                        ('pending', 'Unreviewed'),
                        ('alias', 'Verified alias of a reference center'),
                        ('branch', 'Branch or subunit'),
                        ('admin_unit', 'Administrative unit'),
                        ('employment', 'Employment status, not a center'),
                        ('unknown', 'Unresolved'),
                        ('new_proposal', 'Requires separate center proposal'),
                    ], default='pending',
                )),
                ('decision_reason', models.TextField(blank=True)),
                ('evidence_reference', models.CharField(blank=True, max_length=250)),
                ('reviewed_at', models.DateTimeField(null=True, blank=True)),
                ('batch', models.ForeignKey(
                    to='health.centerfoundationbatch',
                    on_delete=django.db.models.deletion.PROTECT, related_name='review_cases',
                )),
                ('mapped_reference', models.ForeignKey(
                    to='health.centerreferencecandidate', null=True, blank=True,
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='name_review_cases',
                )),
                ('reviewed_by', models.ForeignKey(
                    to=settings.AUTH_USER_MODEL, null=True, blank=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='reviewed_center_name_cases',
                )),
            ],
            options={
                'ordering': ['-source_row_count', 'source_row', 'pk'],
                'constraints': [
                    models.UniqueConstraint(fields=('batch', 'source_row'), name='uniq_center_review_batch_row'),
                ],
            },
        ),
        migrations.CreateModel(
            name='CenterFoundationAuditEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('entity_type', models.CharField(max_length=30)),
                ('entity_id', models.PositiveIntegerField(blank=True, null=True)),
                ('action', models.CharField(max_length=40)),
                ('prior_state', models.JSONField(default=dict)),
                ('new_state', models.JSONField(default=dict)),
                ('evidence_reference', models.CharField(blank=True, max_length=250)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('batch', models.ForeignKey(
                    to='health.centerfoundationbatch',
                    on_delete=django.db.models.deletion.PROTECT, related_name='audit_events',
                )),
                ('performed_by', models.ForeignKey(
                    to=settings.AUTH_USER_MODEL, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='center_foundation_audit_events',
                )),
            ],
            options={'ordering': ['-created_at', '-pk']},
        ),
    ]
