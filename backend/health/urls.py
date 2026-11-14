from django.urls import path
from .organization_structure import OrganizationDirectoryView, OrganizationImportView, OrganizationUnitReviewView
from .organization_bulk_approval import OrganizationBulkApprovalView
from .employee_roster_template import EmployeeRosterTemplateView
from .employee_review_bulk_activation import StagingEmployeeReviewBulkActivationView
from .employee_review_bulk_discard import StagingEmployeeReviewBulkDiscardView
from .staging_review_center_reconciliation import StagingReviewCenterReconciliationView
from .staging_employee_reset import StagingEmployeeCardResetView
from .health_center_excel_import import HealthCenterExcelImportView
from .health_center_archive import HealthCenterArchiveView
from .center_foundation import (CenterFoundationRegistryView, CenterFoundationImportView, CenterFoundationDecisionView)
from .center_directory_matching import CenterDirectoryMatchingView, CenterDirectoryMatchingHistoryView
from .employee_registry_reset import EmployeeRegistryResetView
from .employee_review_cleanup import EmployeeImportReviewCleanupView
from .employee_review_identity_reconciliation import EmployeeReviewIdentityReconciliationPreviewView
from .employee_roster_reconciliation import EmployeeRosterReconciliationView
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
    path('employee-roster-template/', EmployeeRosterTemplateView.as_view(), name='employee-roster-template'),
    path('employee-import-reviews/cleanup/', EmployeeImportReviewCleanupView.as_view(), name='employee-review-safe-cleanup'),
    path('employee-import-reviews/reconciliation-preview/', EmployeeReviewIdentityReconciliationPreviewView.as_view(), name='employee-import-reconciliation-preview'),
    path('employee-roster/reconcile/', EmployeeRosterReconciliationView.as_view(), name='employee-roster-safe-reconcile'),
    path('employee-import-reviews/bulk-activate/', StagingEmployeeReviewBulkActivationView.as_view(), name='employee-import-review-bulk-activate'),
    path('employee-import-reviews/bulk-discard/', StagingEmployeeReviewBulkDiscardView.as_view(), name='employee-import-review-bulk-discard'),
    path('employee-import-reviews/center-reconciliation/', StagingReviewCenterReconciliationView.as_view(), name='employee-review-center-reconciliation'),
    path('staging-employee-card-reset/', StagingEmployeeCardResetView.as_view(), name='staging-employee-card-reset'),
    path('health-centers/import-excel/', HealthCenterExcelImportView.as_view(), name='health-center-excel-import'),
    path('health-centers/archive/', HealthCenterArchiveView.as_view(), name='health-center-archive'),
    path('center-foundation/', CenterFoundationRegistryView.as_view(), name='center-foundation-registry'),
    path('center-foundation/import/', CenterFoundationImportView.as_view(), name='center-foundation-import'),
    path('center-foundation/decision/', CenterFoundationDecisionView.as_view(), name='center-foundation-decision'),
    path('center-directory/match/', CenterDirectoryMatchingView.as_view(), name='center-directory-match'),
    path('center-directory/match-history/', CenterDirectoryMatchingHistoryView.as_view(), name='center-directory-match-history'),
    path('employee-registry-reset/', EmployeeRegistryResetView.as_view(), name='employee-registry-reset'),
    path('organization-units/', OrganizationDirectoryView.as_view(), name='organization-units'),
    path('organization-units/import/', OrganizationImportView.as_view(), name='organization-units-import'),
    path('organization-units/bulk-approval/', OrganizationBulkApprovalView.as_view(), name='organization-units-bulk-approval'),
    path('organization-units/<int:pk>/review/', OrganizationUnitReviewView.as_view(), name='organization-units-review'),
    path('workforce-roster/temporary/', TemporaryWorkforceView.as_view(), name='workforce-temporary'),
    path('workforce-roster/import-plan/', WorkforceImportPlanView.as_view(), name='workforce-import-plan'),
    path('workforce-roster/import-plan/<int:pk>/approve/', WorkforceImportApproveView.as_view(), name='workforce-import-approve'),
    path('workforce-roster/import-plan/<int:pk>/commit/', WorkforceImportCommitView.as_view(), name='workforce-import-commit'),
    path('workforce-roster/mapping/', WorkforceCenterMappingView.as_view(), name='workforce-roster-mapping'),
    path('workforce-roster/preview/', WorkforceRosterPreviewView.as_view(), name='workforce-roster-preview'),
    path('health-card-verification/<str:token>/', HealthCardVerificationView.as_view(), name='health-card-verification'),
] + router.urls
