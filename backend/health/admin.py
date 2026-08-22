from django.contrib import admin
from .models import AuditLog, ClinicVisit, CommitteeReferral, Employee, HealthCenter, InjuryCase, LabTest, UserProfile, Vaccination


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'role', 'health_center', 'updated_at')
    list_filter = ('role', 'health_center')
    search_fields = ('user__username', 'user__email', 'user__first_name')


for model in [HealthCenter, Employee, LabTest, Vaccination, ClinicVisit, CommitteeReferral, InjuryCase, AuditLog]:
    admin.site.register(model)
