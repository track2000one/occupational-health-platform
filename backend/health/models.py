from django.db import models
class HealthCenter(models.Model):
    name=models.CharField(max_length=150,unique=True); city=models.CharField(max_length=120,blank=True); is_active=models.BooleanField(default=True)
    def __str__(self): return self.name
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
