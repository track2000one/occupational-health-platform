from django.urls import path
from .workforce_preview import WorkforceRosterPreviewView, WorkforceCenterMappingView
from .temporary_workforce import TemporaryWorkforceView
from .workforce_import import WorkforceImportPlanView, WorkforceImportApproveView, WorkforceImportCommitView
from rest_framework.routers import DefaultRouter
from .views import AuditLogViewSet, ClinicVisitViewSet, CommitteeReferralViewSet, EmployeeImportReviewViewSet, EmployeeViewSet, ExcelImportViewSet, HealthCardVerificationView, HealthCenterViewSet, InjuryCaseViewSet, LabTestViewSet, OccupationalHealthAssessmentViewSet, UserViewSet, VaccinationViewSet

router = DefaultRouter()
router.register('users', UserViewSet, basename='users')
router.register('excel-import', ExcelImportViewSet, basename='excel-import')
router.register('employee-import-reviews', EmployeeImportReviewViewSet, basename='employee-import-reviews')
router.register('health-centers', HealthCenterViewSet, basename='health-centers')
router.register('employees', EmployeeViewSet)
router.register('lab-tests', LabTestViewSet)
router.register('occupational-health-assessments', OccupationalHealthAssessmentViewSet)
router.register('vaccinations', VaccinationViewSet)
router.register('clinic-visits', ClinicVisitViewSet)
router.register('committee-referrals', CommitteeReferralViewSet)
router.register('injury-cases', InjuryCaseViewSet)
router.register('audit-logs', AuditLogViewSet)

urlpatterns = [
    path('workforce-roster/temporary/', TemporaryWorkforceView.as_view(), name='workforce-temporary'),
    path('workforce-roster/import-plan/', WorkforceImportPlanView.as_view(), name='workforce-import-plan'),
    path('workforce-roster/import-plan/<int:pk>/approve/', WorkforceImportApproveView.as_view(), name='workforce-import-approve'),
    path('workforce-roster/import-plan/<int:pk>/commit/', WorkforceImportCommitView.as_view(), name='workforce-import-commit'),
    path('workforce-roster/mapping/', WorkforceCenterMappingView.as_view(), name='workforce-roster-mapping'),
    path('workforce-roster/preview/', WorkforceRosterPreviewView.as_view(), name='workforce-roster-preview'),
    path('health-card-verification/<str:token>/', HealthCardVerificationView.as_view(), name='health-card-verification'),
] + router.urls
