from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    DailyStatisticViewSet,
    EvidenceAttachmentViewSet,
    IndicatorViewSet,
    InitiativeViewSet,
    PeriodicStatisticsSummaryView,
    ReferenceDocumentViewSet,
    WorkforceMemberViewSet,
    WorkforceTargetViewSet,
)

router = DefaultRouter()
router.register('indicators', IndicatorViewSet, basename='periodic-indicators')
router.register('daily-statistics', DailyStatisticViewSet, basename='daily-statistics')
router.register('workforce-members', WorkforceMemberViewSet, basename='workforce-members')
router.register('workforce-targets', WorkforceTargetViewSet, basename='workforce-targets')
router.register('initiatives', InitiativeViewSet, basename='periodic-initiatives')
router.register('reference-documents', ReferenceDocumentViewSet, basename='reference-documents')
router.register('evidence-attachments', EvidenceAttachmentViewSet, basename='evidence-attachments')

urlpatterns = [
    path('summary/', PeriodicStatisticsSummaryView.as_view(), name='periodic-statistics-summary'),
    *router.urls,
]
