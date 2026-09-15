from django.conf import settings
from django.db import models


class Indicator(models.Model):
    class MeasurementType(models.TextChoices):
        COUNT = 'count', 'Count'
        REPORTS = 'reports', 'Reports'

    code = models.SlugField(max_length=100, unique=True)
    name_ar = models.CharField(max_length=255)
    name_en = models.CharField(max_length=255)
    measurement_type = models.CharField(max_length=20, choices=MeasurementType.choices, default=MeasurementType.COUNT)
    q1_target = models.PositiveIntegerField(null=True, blank=True)
    q2_target = models.PositiveIntegerField(null=True, blank=True)
    q3_target = models.PositiveIntegerField(null=True, blank=True)
    q4_target = models.PositiveIntegerField(null=True, blank=True)
    is_targeted = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'id']

    @property
    def annual_target(self):
        if not self.is_targeted:
            return None
        values = [self.q1_target, self.q2_target, self.q3_target, self.q4_target]
        return sum(value or 0 for value in values)

    def __str__(self):
        return self.name_ar


class DailyStatistic(models.Model):
    indicator = models.ForeignKey(Indicator, on_delete=models.PROTECT, related_name='daily_entries')
    date = models.DateField(db_index=True)
    count = models.PositiveIntegerField(default=0)
    health_center = models.ForeignKey('health.HealthCenter', on_delete=models.PROTECT, null=True, blank=True, related_name='daily_statistics')
    location = models.CharField(max_length=255, blank=True)
    executor = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='periodic_stats_entries')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', '-created_at']
        indexes = [models.Index(fields=['date', 'indicator'], name='periodic_st_date_5a9bca_idx')]

    def __str__(self):
        return f'{self.indicator} - {self.date} - {self.count}'


class WorkforceMember(models.Model):
    class Category(models.TextChoices):
        DOCTOR = 'doctor', 'Doctor'
        NURSING = 'nursing', 'Nursing'

    category = models.CharField(max_length=20, choices=Category.choices, db_index=True)
    name = models.CharField(max_length=255)
    employee_number = models.CharField(max_length=50, unique=True)
    job_title = models.CharField(max_length=255, blank=True)
    qualification = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['category', 'name']

    def __str__(self):
        return self.name


class WorkforceTarget(models.Model):
    member = models.ForeignKey(WorkforceMember, on_delete=models.CASCADE, related_name='targets')
    item = models.CharField(max_length=255)
    annual_target = models.PositiveIntegerField(default=0)
    q1_target = models.PositiveIntegerField(default=0)
    q2_target = models.PositiveIntegerField(default=0)
    q3_target = models.PositiveIntegerField(default=0)
    q4_target = models.PositiveIntegerField(default=0)
    notes = models.CharField(max_length=500, blank=True)

    class Meta:
        ordering = ['member__name', 'id']
        constraints = [models.UniqueConstraint(fields=['member', 'item'], name='unique_workforce_member_target_item')]

    def __str__(self):
        return f'{self.member} - {self.item}'


class Initiative(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        IN_PROGRESS = 'in_progress', 'In progress'
        COMPLETED = 'completed', 'Completed'
        SUBMITTED = 'submitted', 'Submitted'

    name = models.CharField(max_length=500)
    network_department = models.CharField(max_length=255, blank=True)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    leader_target = models.CharField(max_length=500, blank=True)
    implementation_team = models.TextField(blank=True)
    team_members = models.JSONField(default=list, blank=True)
    goals = models.TextField(blank=True)
    details = models.TextField(blank=True)
    implementation_method = models.TextField(blank=True)
    beneficiaries = models.PositiveIntegerField(default=0)
    activities = models.JSONField(default=list, blank=True)
    achieved_goals = models.TextField(blank=True)
    supporting_documents_notes = models.TextField(blank=True)
    evidence_links = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True)
    redcap_uploaded = models.BooleanField(default=False)
    redcap_upload_date = models.DateField(null=True, blank=True)
    redcap_reference = models.CharField(max_length=255, blank=True)
    department_copy_saved = models.BooleanField(default=False)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='periodic_stats_initiatives')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-start_date', '-id']

    @property
    def total_beneficiaries(self):
        total = 0
        for activity in self.activities or []:
            try:
                total += max(0, int(activity.get('beneficiary_count') or 0))
            except (TypeError, ValueError, AttributeError):
                continue
        return total if total else self.beneficiaries

    def __str__(self):
        return self.name


class ReferenceDocument(models.Model):
    class Status(models.TextChoices):
        AVAILABLE = 'available', 'Available'
        UNAVAILABLE = 'unavailable', 'Unavailable'
        NOT_APPLICABLE = 'not_applicable', 'Not applicable'

    title = models.CharField(max_length=500)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.AVAILABLE)
    reason = models.CharField(max_length=500, blank=True)
    source = models.CharField(max_length=500, blank=True)
    issuing_authority = models.CharField(max_length=255, blank=True)
    version_number = models.CharField(max_length=100, blank=True)
    issue_date = models.DateField(null=True, blank=True)
    document_count = models.PositiveIntegerField(default=1)
    responsible_person = models.CharField(max_length=255, blank=True)
    evidence_links = models.JSONField(default=list, blank=True)
    last_review_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return self.title


class EvidenceAttachment(models.Model):
    class OwnerType(models.TextChoices):
        INITIATIVE = 'initiative', 'Initiative'
        REFERENCE_DOCUMENT = 'reference_document', 'Reference document'

    owner_type = models.CharField(max_length=30, choices=OwnerType.choices, db_index=True)
    initiative = models.ForeignKey(Initiative, on_delete=models.CASCADE, related_name='attachments', null=True, blank=True)
    reference_document = models.ForeignKey(ReferenceDocument, on_delete=models.CASCADE, related_name='attachments', null=True, blank=True)
    file_name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    byte_size = models.PositiveIntegerField()
    file_data = models.BinaryField(editable=False)
    checksum_sha256 = models.CharField(max_length=64, db_index=True)
    description = models.CharField(max_length=500, blank=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='periodic_stats_evidence_uploads')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']
        indexes = [
            models.Index(fields=['owner_type', 'initiative'], name='ps_ev_owner_init_idx'),
            models.Index(fields=['owner_type', 'reference_document'], name='ps_ev_owner_doc_idx'),
        ]

    @property
    def is_image(self):
        return self.content_type.startswith('image/')

    def __str__(self):
        return self.file_name
