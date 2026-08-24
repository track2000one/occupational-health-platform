from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.db import models


def full_years_between(start_date, end_date=None):
    if not start_date:
        return 0
    end_date = end_date or date.today()
    years = end_date.year - start_date.year
    if (end_date.month, end_date.day) < (start_date.month, start_date.day):
        years -= 1
    return max(years, 0)


def decimal_years_between(start_date, end_date=None):
    if not start_date:
        return None
    end_date = end_date or date.today()
    days = max((end_date - start_date).days, 0)
    return (Decimal(days) / Decimal('365.25')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


class HealthCenter(models.Model):
    name = models.CharField(max_length=150, unique=True)
    city = models.CharField(max_length=120, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class UserProfile(models.Model):
    ROLE_CHOICES = (
        ('systemAdmin', 'System Admin'),
        ('ohManager', 'OH Manager'),
        ('ohDoctor', 'OH Doctor'),
        ('clinicDoctor', 'Clinic Doctor'),
        ('labOfficer', 'Lab Officer'),
        ('vaccinationOfficer', 'Vaccination Officer'),
        ('needleStickOfficer', 'Needle Stick Officer'),
        ('medicalCommitteeOfficer', 'Medical Committee Officer'),
        ('campaignOfficer', 'Campaign Officer'),
        ('centerManager', 'Center Manager'),
        ('executive', 'Executive'),
        ('employee', 'Employee'),
        ('dataEntry', 'Data Entry'),
        ('dataQuality', 'Data Quality Officer'),
        ('reportsOfficer', 'Reports Officer'),
        ('techSupport', 'Technical Support'),
    )
    PERSON_TYPE_CHOICES = (
        ('admin', 'Administrator'),
        ('healthStaff', 'Health Staff'),
        ('employee', 'Employee'),
        ('patient', 'Patient'),
        ('external', 'External'),
    )
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='health_profile')
    role = models.CharField(max_length=40, choices=ROLE_CHOICES, default='employee')
    person_type = models.CharField(max_length=30, choices=PERSON_TYPE_CHOICES, default='employee')
    health_center = models.ForeignKey(HealthCenter, on_delete=models.SET_NULL, null=True, blank=True, related_name='platform_users')
    national_id = models.CharField(max_length=30, unique=True, null=True, blank=True)
    employee_number = models.CharField(max_length=40, unique=True, null=True, blank=True)
    medical_record_number = models.CharField(max_length=40, unique=True, null=True, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    department = models.CharField(max_length=120, blank=True)
    job_title = models.CharField(max_length=150, blank=True)
    specialty = models.CharField(max_length=150, blank=True)
    license_number = models.CharField(max_length=80, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.user.username} - {self.role}'


class Employee(models.Model):
    GENDER = (('male', 'Male'), ('female', 'Female'))
    MARITAL_STATUS = (
        ('single', 'Single'),
        ('married', 'Married'),
        ('divorced', 'Divorced'),
        ('widowed', 'Widowed'),
    )
    STATUS = (('completed', 'Completed'), ('incomplete', 'Incomplete'), ('overdue', 'Overdue'))
    VACCINE = (('completed', 'Completed'), ('due', 'Due'), ('refused', 'Refused'))
    RISK = (('low', 'Low'), ('medium', 'Medium'), ('high', 'High'))

    name = models.CharField(max_length=200)
    email = models.EmailField(max_length=254, unique=True, null=True, blank=True)
    national_id = models.CharField(max_length=30, unique=True)
    employee_number = models.CharField(max_length=40, unique=True, null=True, blank=True)
    national_address = models.CharField(max_length=255, blank=True)
    mobile = models.CharField(max_length=30, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    birth_place = models.CharField(max_length=120, blank=True)
    age = models.PositiveIntegerField(default=0)
    gender = models.CharField(max_length=10, choices=GENDER, default='male')
    marital_status = models.CharField(max_length=20, choices=MARITAL_STATUS, blank=True)
    health_center = models.ForeignKey(HealthCenter, on_delete=models.PROTECT, related_name='employees')
    job_title = models.CharField(max_length=150, blank=True)
    appointment_date = models.DateField(null=True, blank=True)
    years_of_experience = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    periodic_exam_status = models.CharField(max_length=20, choices=STATUS, default='incomplete')
    vaccination_status = models.CharField(max_length=20, choices=VACCINE, default='due')
    risk_level = models.CharField(max_length=20, choices=RISK, default='low')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if self.email:
            self.email = self.email.strip().lower()
        if self.date_of_birth:
            self.age = full_years_between(self.date_of_birth)
        if self.appointment_date:
            self.years_of_experience = decimal_years_between(self.appointment_date)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class ImportTraceModel(models.Model):
    imported_sheet = models.CharField(max_length=150, blank=True)
    imported_row = models.PositiveIntegerField(null=True, blank=True)
    source_file = models.CharField(max_length=255, blank=True)
    raw_payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class EmployeeHealthProfile(ImportTraceModel):
    employee = models.OneToOneField(Employee, on_delete=models.CASCADE, related_name='detailed_health_profile')
    marital_status = models.CharField(max_length=80, blank=True)
    children_count = models.PositiveSmallIntegerField(null=True, blank=True)
    moh_id = models.CharField(max_length=80, blank=True, db_index=True)
    employment_start_date = models.DateField(null=True, blank=True)
    experience_years = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    current_position = models.CharField(max_length=150, blank=True)
    weight_kg = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    height_cm = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    bmi = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    obesity_status = models.CharField(max_length=80, blank=True)
    physical_activity = models.CharField(max_length=120, blank=True)
    diabetes = models.BooleanField(null=True, blank=True)
    hypertension = models.BooleanField(null=True, blank=True)
    thyroid_disease = models.BooleanField(null=True, blank=True)
    asthma = models.BooleanField(null=True, blank=True)
    blood_disease = models.BooleanField(null=True, blank=True)
    smoking_status = models.CharField(max_length=120, blank=True)
    surgical_history = models.TextField(blank=True)
    family_history = models.TextField(blank=True)
    medical_restrictions = models.TextField(blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        verbose_name = 'Employee health profile'
        verbose_name_plural = 'Employee health profiles'

    def __str__(self):
        return f'Health profile - {self.employee}'


class EmployeeHealthCard(models.Model):
    """A saved, employee-specific occupational health card.

    Identity and employment fields remain sourced from ``Employee`` so they never
    drift from the master employee record.  The Excel health-card sections are
    stored as structured JSON because several source fields accept clinical text,
    dates, Yes/No values, or legacy spreadsheet codes.
    """

    employee = models.OneToOneField(Employee, on_delete=models.CASCADE, related_name='health_card')
    card_number = models.CharField(max_length=40, unique=True, blank=True)
    issue_date = models.DateField(default=date.today)
    next_review_date = models.DateField(null=True, blank=True)
    reviewed_by = models.CharField(max_length=200, blank=True)
    is_approved = models.BooleanField(default=False)
    data = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_employee_health_cards',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_employee_health_cards',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        verbose_name = 'Employee health card'
        verbose_name_plural = 'Employee health cards'

    def save(self, *args, **kwargs):
        if not self.card_number and self.employee_id:
            year = (self.issue_date or date.today()).year
            self.card_number = f'EHC-{year}-{self.employee_id:05d}'
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.card_number or "Health card"} - {self.employee}'


class OccupationalHealthAssessment(models.Model):
    ASSESSMENT_TYPES = (
        ('Pre-employment', 'Pre-employment'),
        ('Periodic', 'Periodic'),
        ('Return to Work', 'Return to Work'),
        ('Special', 'Special'),
        ('Exit', 'Exit'),
    )
    FITNESS_DECISIONS = (
        ('fit', 'Fit'),
        ('fitWithRestrictions', 'Fit with Restrictions'),
        ('temporarilyUnfit', 'Temporarily Unfit'),
        ('permanentlyUnfit', 'Permanently Unfit'),
    )

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name='occupational_health_assessments',
    )
    assessment_date = models.DateField(db_index=True)
    assessment_type = models.CharField(max_length=40, choices=ASSESSMENT_TYPES, default='Periodic')
    fitness_decision = models.CharField(max_length=40, choices=FITNESS_DECISIONS, default='fit', db_index=True)
    restrictions = models.TextField(blank=True)
    next_assessment_date = models.DateField(null=True, blank=True)
    assessor_name = models.CharField(max_length=200, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_occupational_health_assessments',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-assessment_date', '-created_at']

    def __str__(self):
        return f'{self.employee} - {self.assessment_date} - {self.fitness_decision}'


class LabTest(models.Model):
    STATUS = (('pending', 'Pending'), ('completed', 'Completed'), ('missing', 'Missing'))
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='lab_tests')
    test_type = models.CharField(max_length=100)
    result = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=20, choices=STATUS, default='pending')
    date = models.DateField(null=True, blank=True)


class LabScreening(ImportTraceModel):
    STATUS = (('requested', 'Requested'), ('completed', 'Completed'), ('missing', 'Missing'), ('not_required', 'Not required'))
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='lab_screenings')
    request_status = models.CharField(max_length=30, choices=STATUS, default='requested')
    request_date = models.DateField(null=True, blank=True)
    result_status = models.CharField(max_length=60, blank=True)
    result_checked_date = models.DateField(null=True, blank=True)
    anti_hbs = models.CharField(max_length=120, blank=True)
    hbsag = models.CharField(max_length=120, blank=True)
    hcv = models.CharField(max_length=120, blank=True)
    hiv = models.CharField(max_length=120, blank=True)
    rubella_igg = models.CharField(max_length=120, blank=True)
    measles_igg = models.CharField(max_length=120, blank=True)
    varicella_igg = models.CharField(max_length=120, blank=True)
    ppd_test = models.CharField(max_length=120, blank=True)
    follow_up_required = models.BooleanField(default=False)
    follow_up_notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-request_date', '-created_at']
        indexes = [models.Index(fields=['request_status', 'request_date'])]

    def __str__(self):
        return f'Lab screening - {self.employee}'


class Vaccination(models.Model):
    STATUS = (('given', 'Given'), ('due', 'Due'), ('refused', 'Refused'), ('contraindicated', 'Contraindicated'))
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='vaccinations')
    vaccine_type = models.CharField(max_length=100)
    dose = models.CharField(max_length=50)
    status = models.CharField(max_length=20, choices=STATUS, default='due')
    next_due_date = models.DateField(null=True, blank=True)


class VaccinationRecord(ImportTraceModel):
    STATUS = (('completed', 'Completed'), ('incomplete', 'Incomplete'), ('due', 'Due'), ('refused', 'Refused'), ('contraindicated', 'Contraindicated'))
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='vaccination_records')
    vaccine_type = models.CharField(max_length=120, db_index=True)
    status = models.CharField(max_length=30, choices=STATUS, default='due')
    campaign_name = models.CharField(max_length=150, blank=True)
    first_dose_date = models.DateField(null=True, blank=True)
    second_dose_date = models.DateField(null=True, blank=True)
    third_dose_date = models.DateField(null=True, blank=True)
    booster_date = models.DateField(null=True, blank=True)
    post_vaccine_result = models.CharField(max_length=150, blank=True)
    refusal_reason = models.TextField(blank=True)
    contraindication_notes = models.TextField(blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['employee', 'vaccine_type']
        constraints = [
            models.UniqueConstraint(fields=['employee', 'vaccine_type', 'campaign_name'], name='unique_employee_vaccine_campaign')
        ]

    def __str__(self):
        return f'{self.vaccine_type} - {self.employee}'


class VaccinationDose(ImportTraceModel):
    record = models.ForeignKey(VaccinationRecord, on_delete=models.CASCADE, related_name='doses')
    dose_label = models.CharField(max_length=80)
    dose_date = models.DateField(null=True, blank=True)
    lot_number = models.CharField(max_length=80, blank=True)
    given_by = models.CharField(max_length=150, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['record', 'dose_date']

    def __str__(self):
        return f'{self.record} - {self.dose_label}'


class ClinicVisit(models.Model):
    STATUS = (
        ('open', 'Open'),
        ('completed', 'Completed'),
        ('follow_up', 'Follow-up required'),
    )

    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='clinic_visits')
    clinic_type = models.CharField(max_length=120)
    diagnosis = models.TextField(blank=True)
    action_taken = models.TextField(blank=True)
    visit_date = models.DateField(null=True, blank=True, db_index=True)
    visit_time = models.TimeField(null=True, blank=True)
    sick_leave_days = models.PositiveSmallIntegerField(null=True, blank=True)
    follow_up_date = models.DateField(null=True, blank=True)
    doctor_name = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=20, choices=STATUS, default='completed', db_index=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_clinic_visits',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-visit_date', '-visit_time', '-id']

    def __str__(self):
        return f'Clinic visit {self.id or "new"} - {self.employee}'


class OccupationalClinicVisit(ImportTraceModel):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='occupational_clinic_visits')
    contract_type = models.CharField(max_length=120, blank=True)
    action = models.TextField(blank=True)
    physician = models.CharField(max_length=150, blank=True)
    visit_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-visit_date', '-created_at']

    def __str__(self):
        return f'Occupational visit - {self.employee}'


class EmployeeClinicVisit(ImportTraceModel):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='employee_clinic_visits')
    visit_date = models.DateField(null=True, blank=True)
    weight_kg = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    diagnosis = models.TextField(blank=True)
    sick_leave_days = models.PositiveSmallIntegerField(null=True, blank=True)
    physician = models.CharField(max_length=150, blank=True)
    follow_up_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-visit_date', '-created_at']

    def __str__(self):
        return f'Employee clinic visit - {self.employee}'


class CommitteeReferral(models.Model):
    STATUS = (('draft', 'Draft'), ('under_review', 'Under Review'), ('decision_issued', 'Decision Issued'), ('closed', 'Closed'))
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='committee_referrals')
    diagnosis = models.TextField(blank=True)
    decision = models.TextField(blank=True)
    status = models.CharField(max_length=30, choices=STATUS, default='draft')
    date = models.DateField(null=True, blank=True)


class MedicalCommitteeCase(ImportTraceModel):
    STATUS = (('draft', 'Draft'), ('under_review', 'Under Review'), ('decision_issued', 'Decision Issued'), ('closed', 'Closed'))
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='medical_committee_cases')
    transaction_number = models.CharField(max_length=120, blank=True, db_index=True)
    contract_type = models.CharField(max_length=120, blank=True)
    diagnosis = models.TextField(blank=True)
    recommendations = models.TextField(blank=True)
    decision = models.TextField(blank=True)
    decision_date = models.DateField(null=True, blank=True)
    physician = models.CharField(max_length=150, blank=True)
    status = models.CharField(max_length=30, choices=STATUS, default='under_review')
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-decision_date', '-created_at']
        indexes = [models.Index(fields=['transaction_number'])]

    def __str__(self):
        return f'Medical committee - {self.employee}'


class InjuryCase(models.Model):
    STATUS = (('new', 'New'), ('under_review', 'Under Review'), ('follow_up_required', 'Follow-up Required'), ('closed', 'Closed'))
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='injury_cases')
    exposure_date = models.DateField(null=True, blank=True)
    workplace = models.CharField(max_length=150, blank=True)
    source_known = models.BooleanField(default=False)
    status = models.CharField(max_length=30, choices=STATUS, default='new')


class NeedleStickExposure(ImportTraceModel):
    STATUS = (('new', 'New'), ('under_review', 'Under Review'), ('referred', 'Referred'), ('closed', 'Closed'))
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='needle_stick_exposures')
    exposure_date = models.DateField(null=True, blank=True)
    work_nature = models.CharField(max_length=150, blank=True)
    workplace = models.CharField(max_length=150, blank=True)
    injury_method = models.CharField(max_length=200, blank=True)
    anti_hbs_result = models.CharField(max_length=120, blank=True)
    source_known = models.BooleanField(null=True, blank=True)
    source_name = models.CharField(max_length=200, blank=True)
    source_national_id = models.CharField(max_length=30, blank=True, db_index=True)
    source_result = models.CharField(max_length=200, blank=True)
    referred_to_employee_clinic = models.BooleanField(default=False)
    status = models.CharField(max_length=30, choices=STATUS, default='new')
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-exposure_date', '-created_at']
        indexes = [models.Index(fields=['exposure_date', 'status'])]

    def __str__(self):
        return f'Needle stick - {self.employee}'


class ScreeningProgramRecord(ImportTraceModel):
    PROGRAM_CHOICES = (('colon_cancer', 'Colon cancer'), ('influenza', 'Influenza'), ('other', 'Other'))
    STATUS = (('eligible', 'Eligible'), ('completed', 'Completed'), ('refused', 'Refused'), ('excluded', 'Excluded'), ('pending', 'Pending'))
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='screening_program_records')
    program_type = models.CharField(max_length=40, choices=PROGRAM_CHOICES, default='other')
    program_year = models.PositiveIntegerField(default=2025)
    status = models.CharField(max_length=30, choices=STATUS, default='pending')
    result = models.CharField(max_length=200, blank=True)
    action_taken = models.TextField(blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-program_year', 'program_type']
        constraints = [
            models.UniqueConstraint(fields=['employee', 'program_type', 'program_year'], name='unique_employee_program_year')
        ]

    def __str__(self):
        return f'{self.program_type} {self.program_year} - {self.employee}'


class CampaignCoverage(ImportTraceModel):
    campaign_name = models.CharField(max_length=150)
    health_center = models.ForeignKey(HealthCenter, on_delete=models.SET_NULL, null=True, blank=True, related_name='campaign_coverages')
    year = models.PositiveIntegerField(default=2025)
    target_count = models.PositiveIntegerField(default=0)
    completed_count = models.PositiveIntegerField(default=0)
    refused_count = models.PositiveIntegerField(default=0)
    contraindicated_count = models.PositiveIntegerField(default=0)
    coverage_percent = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-year', 'campaign_name']
        constraints = [
            models.UniqueConstraint(fields=['campaign_name', 'health_center', 'year'], name='unique_campaign_center_year')
        ]

    def __str__(self):
        return f'{self.campaign_name} - {self.health_center or "All centers"}'


class TraineeRotation(ImportTraceModel):
    name = models.CharField(max_length=200)
    national_id = models.CharField(max_length=30, blank=True, db_index=True)
    specialty = models.CharField(max_length=150, blank=True)
    rotation_start_date = models.DateField(null=True, blank=True)
    rotation_end_date = models.DateField(null=True, blank=True)
    duration = models.CharField(max_length=120, blank=True)
    health_center = models.ForeignKey(HealthCenter, on_delete=models.SET_NULL, null=True, blank=True, related_name='trainee_rotations')
    supervisor = models.CharField(max_length=150, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-rotation_start_date', 'name']

    def __str__(self):
        return self.name


class ReferenceLookup(ImportTraceModel):
    CATEGORY_CHOICES = (
        ('center', 'Center'),
        ('job_title', 'Job title'),
        ('vaccine', 'Vaccine'),
        ('lab_test', 'Lab test'),
        ('diagnosis', 'Diagnosis'),
        ('other', 'Other'),
    )
    category = models.CharField(max_length=80, choices=CATEGORY_CHOICES, default='other')
    code = models.CharField(max_length=80, blank=True)
    label_ar = models.CharField(max_length=200)
    label_en = models.CharField(max_length=200, blank=True)
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['category', 'label_ar']
        constraints = [
            models.UniqueConstraint(fields=['category', 'code', 'label_ar'], name='unique_reference_lookup_item')
        ]

    def __str__(self):
        return f'{self.category} - {self.label_ar}'


class AuditLog(models.Model):
    user = models.CharField(max_length=150, blank=True)
    action = models.CharField(max_length=120)
    model_name = models.CharField(max_length=120)
    record_id = models.CharField(max_length=80, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class DataImportBatch(models.Model):
    MODE_CHOICES = (('preview', 'Preview only'), ('commit', 'Commit to database'))
    STATUS_CHOICES = (('validated', 'Validated'), ('committed', 'Committed'), ('failed', 'Failed'))
    file_name = models.CharField(max_length=255)
    sheet_name = models.CharField(max_length=150, blank=True)
    mode = models.CharField(max_length=20, choices=MODE_CHOICES, default='preview')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='validated')
    total_rows = models.PositiveIntegerField(default=0)
    valid_rows = models.PositiveIntegerField(default=0)
    duplicate_rows = models.PositiveIntegerField(default=0)
    imported_records = models.PositiveIntegerField(default=0)
    skipped_rows = models.PositiveIntegerField(default=0)
    errors_count = models.PositiveIntegerField(default=0)
    summary = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='health_import_batches')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.file_name} - {self.status}'


class EmployeeImportReview(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending correction'),
        ('conflict', 'Conflicting existing employee'),
        ('activated', 'Corrected and activated'),
        ('discarded', 'Discarded'),
    )

    batch = models.ForeignKey(
        DataImportBatch,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='employee_reviews',
    )
    source_file = models.CharField(max_length=255, blank=True)
    source_sheet = models.CharField(max_length=150, blank=True)
    source_row = models.PositiveIntegerField()
    fingerprint = models.CharField(max_length=64, unique=True)
    raw_payload = models.JSONField(default=dict, blank=True)
    employee_payload = models.JSONField(default=dict, blank=True)
    issues = models.JSONField(default=list, blank=True)
    warnings = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending', db_index=True)
    conflict_employee = models.ForeignKey(
        Employee,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='import_conflicts',
    )
    activated_employee = models.ForeignKey(
        Employee,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='activated_import_reviews',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='employee_import_reviews',
    )
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='resolved_employee_import_reviews',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at', 'source_row']
        indexes = [models.Index(fields=['status', 'created_at'])]

    def __str__(self):
        name = self.employee_payload.get('name') or self.raw_payload.get('name') or f'Row {self.source_row}'
        return f'{name} - {self.status}'
