from django.contrib import admin
from .models import *
for model in [HealthCenter,Employee,LabTest,Vaccination,ClinicVisit,CommitteeReferral,InjuryCase,AuditLog]: admin.site.register(model)
