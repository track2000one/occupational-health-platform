from django.contrib import admin
from .models import (
    AuditLog,
    CampaignCoverage,
    ClinicVisit,
    CommitteeReferral,
    DataImportBatch,
    Employee,
    EmployeeClinicVisit,
    EmployeeHealthProfile,
    HealthCenter,
    InjuryCase,
    LabScreening,
    LabTest,
    MedicalCommitteeCase,
    NeedleStickExposure,
    OccupationalClinicVisit,
    ReferenceLookup,
    ScreeningProgramRecord,
    TraineeRotation,
    UserProfile,
    Vaccination,
    VaccinationDose,
    VaccinationRecord,
)


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'role', 'person_type', 'health_center', 'national_id', 'employee_number', 'medical_record_number', 'updated_at')
    list_filter = ('role', 'person_type', 'health_center')
    search_fields = (
        'user__username', 'user__email', 'user__first_name',
        'national_id', 'employee_number', 'medical_record_number',
        'phone', 'department', 'job_title', 'specialty', 'license_number'
    )


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = (
        'name', 'employee_number', 'email', 'national_id', 'mobile', 'health_center',
        'job_title', 'date_of_birth', 'age', 'appointment_date', 'years_of_experience'
    )
    list_filter = ('health_center', 'gender', 'marital_status', 'periodic_exam_status', 'vaccination_status', 'risk_level')
    search_fields = ('name', 'email', 'employee_number', 'national_id', 'mobile', 'job_title', 'birth_place', 'national_address')
    readonly_fields = ('age', 'years_of_experience', 'created_at', 'updated_at')


@admin.register(EmployeeHealthProfile)
class EmployeeHealthProfileAdmin(admin.ModelAdmin):
    list_display = ('employee', 'moh_id', 'current_position', 'bmi', 'smoking_status', 'updated_at')
    list_filter = ('diabetes', 'hypertension', 'asthma', 'smoking_status')
    search_fields = ('employee__name', 'employee__national_id', 'moh_id', 'current_position')
    readonly_fields = ('raw_payload', 'created_at', 'updated_at')


@admin.register(LabScreening)
class LabScreeningAdmin(admin.ModelAdmin):
    list_display = ('employee', 'request_status', 'request_date', 'result_status', 'follow_up_required')
    list_filter = ('request_status', 'follow_up_required', 'request_date')
    search_fields = ('employee__name', 'employee__national_id', 'anti_hbs', 'hbsag', 'hcv', 'hiv')
    readonly_fields = ('raw_payload', 'created_at', 'updated_at')


@admin.register(VaccinationRecord)
class VaccinationRecordAdmin(admin.ModelAdmin):
    list_display = ('employee', 'vaccine_type', 'status', 'campaign_name', 'first_dose_date', 'second_dose_date', 'third_dose_date')
    list_filter = ('vaccine_type', 'status', 'campaign_name')
    search_fields = ('employee__name', 'employee__national_id', 'vaccine_type', 'campaign_name')
    readonly_fields = ('raw_payload', 'created_at', 'updated_at')


@admin.register(VaccinationDose)
class VaccinationDoseAdmin(admin.ModelAdmin):
    list_display = ('record', 'dose_label', 'dose_date', 'given_by')
    list_filter = ('dose_label', 'dose_date')
    search_fields = ('record__employee__name', 'record__employee__national_id', 'record__vaccine_type', 'given_by')
    readonly_fields = ('raw_payload', 'created_at', 'updated_at')


@admin.register(NeedleStickExposure)
class NeedleStickExposureAdmin(admin.ModelAdmin):
    list_display = ('employee', 'exposure_date', 'workplace', 'injury_method', 'source_known', 'referred_to_employee_clinic', 'status')
    list_filter = ('status', 'source_known', 'referred_to_employee_clinic', 'exposure_date')
    search_fields = ('employee__name', 'employee__national_id', 'workplace', 'source_name', 'source_national_id')
    readonly_fields = ('raw_payload', 'created_at', 'updated_at')


@admin.register(OccupationalClinicVisit)
class OccupationalClinicVisitAdmin(admin.ModelAdmin):
    list_display = ('employee', 'visit_date', 'contract_type', 'physician')
    list_filter = ('visit_date', 'contract_type')
    search_fields = ('employee__name', 'employee__national_id', 'physician', 'action')
    readonly_fields = ('raw_payload', 'created_at', 'updated_at')


@admin.register(EmployeeClinicVisit)
class EmployeeClinicVisitAdmin(admin.ModelAdmin):
    list_display = ('employee', 'visit_date', 'diagnosis', 'sick_leave_days', 'physician', 'follow_up_date')
    list_filter = ('visit_date', 'follow_up_date')
    search_fields = ('employee__name', 'employee__national_id', 'diagnosis', 'physician')
    readonly_fields = ('raw_payload', 'created_at', 'updated_at')


@admin.register(MedicalCommitteeCase)
class MedicalCommitteeCaseAdmin(admin.ModelAdmin):
    list_display = ('employee', 'transaction_number', 'status', 'decision_date', 'physician')
    list_filter = ('status', 'decision_date', 'contract_type')
    search_fields = ('employee__name', 'employee__national_id', 'transaction_number', 'diagnosis', 'recommendations')
    readonly_fields = ('raw_payload', 'created_at', 'updated_at')


@admin.register(ScreeningProgramRecord)
class ScreeningProgramRecordAdmin(admin.ModelAdmin):
    list_display = ('employee', 'program_type', 'program_year', 'status', 'result')
    list_filter = ('program_type', 'program_year', 'status')
    search_fields = ('employee__name', 'employee__national_id', 'result')
    readonly_fields = ('raw_payload', 'created_at', 'updated_at')


@admin.register(CampaignCoverage)
class CampaignCoverageAdmin(admin.ModelAdmin):
    list_display = ('campaign_name', 'health_center', 'year', 'target_count', 'completed_count', 'refused_count', 'coverage_percent')
    list_filter = ('campaign_name', 'health_center', 'year')
    search_fields = ('campaign_name', 'health_center__name')
    readonly_fields = ('raw_payload', 'created_at', 'updated_at')


@admin.register(TraineeRotation)
class TraineeRotationAdmin(admin.ModelAdmin):
    list_display = ('name', 'national_id', 'specialty', 'health_center', 'rotation_start_date', 'rotation_end_date', 'supervisor')
    list_filter = ('specialty', 'health_center', 'rotation_start_date')
    search_fields = ('name', 'national_id', 'specialty', 'supervisor')
    readonly_fields = ('raw_payload', 'created_at', 'updated_at')


@admin.register(ReferenceLookup)
class ReferenceLookupAdmin(admin.ModelAdmin):
    list_display = ('category', 'code', 'label_ar', 'label_en', 'is_active')
    list_filter = ('category', 'is_active')
    search_fields = ('code', 'label_ar', 'label_en')
    readonly_fields = ('raw_payload', 'created_at', 'updated_at')


@admin.register(DataImportBatch)
class DataImportBatchAdmin(admin.ModelAdmin):
    list_display = ('file_name', 'sheet_name', 'mode', 'status', 'total_rows', 'valid_rows', 'duplicate_rows', 'imported_records', 'created_by', 'created_at')
    list_filter = ('mode', 'status', 'created_at')
    search_fields = ('file_name', 'sheet_name', 'created_by__username')
    readonly_fields = ('summary', 'created_at')


for model in [HealthCenter, LabTest, Vaccination, ClinicVisit, CommitteeReferral, InjuryCase, AuditLog]:
    admin.site.register(model)
