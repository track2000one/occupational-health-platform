from rest_framework.routers import DefaultRouter
from .views import AuditLogViewSet, ClinicVisitViewSet, CommitteeReferralViewSet, EmployeeImportReviewViewSet, EmployeeViewSet, ExcelImportViewSet, HealthCenterViewSet, InjuryCaseViewSet, LabTestViewSet, OccupationalHealthAssessmentViewSet, UserViewSet, VaccinationViewSet
router=DefaultRouter()
router.register('users',UserViewSet,basename='users')
router.register('excel-import',ExcelImportViewSet,basename='excel-import')
router.register('employee-import-reviews',EmployeeImportReviewViewSet,basename='employee-import-reviews')
router.register('health-centers',HealthCenterViewSet)
router.register('employees',EmployeeViewSet)
router.register('lab-tests',LabTestViewSet)
router.register('occupational-health-assessments',OccupationalHealthAssessmentViewSet)
router.register('vaccinations',VaccinationViewSet)
router.register('clinic-visits',ClinicVisitViewSet)
router.register('committee-referrals',CommitteeReferralViewSet)
router.register('injury-cases',InjuryCaseViewSet)
router.register('audit-logs',AuditLogViewSet)
urlpatterns=router.urls
