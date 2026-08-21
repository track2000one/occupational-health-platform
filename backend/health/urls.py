from rest_framework.routers import DefaultRouter
from .views import AuditLogViewSet, ClinicVisitViewSet, CommitteeReferralViewSet, EmployeeViewSet, HealthCenterViewSet, InjuryCaseViewSet, LabTestViewSet, VaccinationViewSet
router=DefaultRouter()
router.register('health-centers',HealthCenterViewSet)
router.register('employees',EmployeeViewSet)
router.register('lab-tests',LabTestViewSet)
router.register('vaccinations',VaccinationViewSet)
router.register('clinic-visits',ClinicVisitViewSet)
router.register('committee-referrals',CommitteeReferralViewSet)
router.register('injury-cases',InjuryCaseViewSet)
router.register('audit-logs',AuditLogViewSet)
urlpatterns=router.urls
