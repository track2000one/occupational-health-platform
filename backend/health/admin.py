from django.contrib import admin
from .models import AuditLog, ClinicVisit, CommitteeReferral, Employee, HealthCenter, InjuryCase, LabTest, UserProfile, Vaccination


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'role', 'person_type', 'health_center', 'national_id', 'employee_number', 'medical_record_number', 'updated_at')
    list_filter = ('role', 'person_type', 'health_center')
    search_fields = (
        'user__username', 'user__email', 'user__first_name',
        'national_id', 'employee_number', 'medical_record_number',
        'phone', 'department', 'job_title', 'specialty', 'license_number'
    )


for model in [HealthCenter, Employee, LabTest, Vaccination, ClinicVisit, CommitteeReferral, InjuryCase, AuditLog]:
    admin.site.register(model)
