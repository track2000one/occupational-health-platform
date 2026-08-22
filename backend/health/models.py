from django.conf import settings
from django.db import models


class HealthCenter(models.Model):
    name=models.CharField(max_length=150,unique=True); city=models.CharField(max_length=120,blank=True); is_active=models.BooleanField(default=True)
    def __str__(self): return self.name


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
    GENDER=(('male','Male'),('female','Female')); STATUS=(('completed','Completed'),('incomplete','Incomplete'),('overdue','Overdue')); VACCINE=(('completed','Completed'),('due','Due'),('refused','Refused')); RISK=(('low','Low'),('medium','Medium'),('high','High'))
    name=models.CharField(max_length=200); national_id=models.CharField(max_length=30,unique=True); mobile=models.CharField(max_length=30,blank=True); gender=models.CharField(max_length=10,choices=GENDER,default='male'); health_center=models.ForeignKey(HealthCenter,on_delete=models.PROTECT,related_name='employees'); job_title=models.CharField(max_length=150,blank=True); age=models.PositiveIntegerField(default=0); periodic_exam_status=models.CharField(max_length=20,choices=STATUS,default='incomplete'); vaccination_status=models.CharField(max_length=20,choices=VACCINE,default='due'); risk_level=models.CharField(max_length=20,choices=RISK,default='low'); created_at=models.DateTimeField(auto_now_add=True); updated_at=models.DateTimeField(auto_now=True)
    def __str__(self): return self.name
class LabTest(models.Model):
    STATUS=(('pending','Pending'),('completed','Completed'),('missing','Missing')); employee=models.ForeignKey(Employee,on_delete=models.CASCADE,related_name='lab_tests'); test_type=models.CharField(max_length=100); result=models.CharField(max_length=200,blank=True); status=models.CharField(max_length=20,choices=STATUS,default='pending'); date=models.DateField(null=True,blank=True)
class Vaccination(models.Model):
    STATUS=(('given','Given'),('due','Due'),('refused','Refused'),('contraindicated','Contraindicated')); employee=models.ForeignKey(Employee,on_delete=models.CASCADE,related_name='vaccinations'); vaccine_type=models.CharField(max_length=100); dose=models.CharField(max_length=50); status=models.CharField(max_length=20,choices=STATUS,default='due'); next_due_date=models.DateField(null=True,blank=True)
class ClinicVisit(models.Model):
    employee=models.ForeignKey(Employee,on_delete=models.CASCADE,related_name='clinic_visits'); clinic_type=models.CharField(max_length=120); diagnosis=models.TextField(blank=True); action_taken=models.TextField(blank=True); visit_date=models.DateField(null=True,blank=True)
class CommitteeReferral(models.Model):
    STATUS=(('draft','Draft'),('under_review','Under Review'),('decision_issued','Decision Issued'),('closed','Closed')); employee=models.ForeignKey(Employee,on_delete=models.CASCADE,related_name='committee_referrals'); diagnosis=models.TextField(blank=True); decision=models.TextField(blank=True); status=models.CharField(max_length=30,choices=STATUS,default='draft'); date=models.DateField(null=True,blank=True)
class InjuryCase(models.Model):
    STATUS=(('new','New'),('under_review','Under Review'),('follow_up_required','Follow-up Required'),('closed','Closed')); employee=models.ForeignKey(Employee,on_delete=models.CASCADE,related_name='injury_cases'); exposure_date=models.DateField(null=True,blank=True); workplace=models.CharField(max_length=150,blank=True); source_known=models.BooleanField(default=False); status=models.CharField(max_length=30,choices=STATUS,default='new')
class AuditLog(models.Model):
    user=models.CharField(max_length=150,blank=True); action=models.CharField(max_length=120); model_name=models.CharField(max_length=120); record_id=models.CharField(max_length=80,blank=True); created_at=models.DateTimeField(auto_now_add=True)


class DataImportBatch(models.Model):
    MODE_CHOICES=(('preview','Preview only'),('commit','Commit to database'))
    STATUS_CHOICES=(('validated','Validated'),('committed','Committed'),('failed','Failed'))
    file_name=models.CharField(max_length=255)
    sheet_name=models.CharField(max_length=150,blank=True)
    mode=models.CharField(max_length=20,choices=MODE_CHOICES,default='preview')
    status=models.CharField(max_length=20,choices=STATUS_CHOICES,default='validated')
    total_rows=models.PositiveIntegerField(default=0)
    valid_rows=models.PositiveIntegerField(default=0)
    duplicate_rows=models.PositiveIntegerField(default=0)
    imported_records=models.PositiveIntegerField(default=0)
    skipped_rows=models.PositiveIntegerField(default=0)
    errors_count=models.PositiveIntegerField(default=0)
    summary=models.JSONField(default=dict,blank=True)
    created_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.SET_NULL,null=True,blank=True,related_name='health_import_batches')
    created_at=models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering=['-created_at']

    def __str__(self):
        return f'{self.file_name} - {self.status}'
