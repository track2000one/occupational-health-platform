from django.urls import path
from rest_framework.routers import DefaultRouter

from .compound_views import InitiativeWithAttachmentsCreateView, ReferenceDocumentWithAttachmentsCreateView
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
    path('initiatives/create-with-attachments/', InitiativeWithAttachmentsCreateView.as_view(), name='initiative-create-with-attachments'),
    path('reference-documents/create-with-attachments/', ReferenceDocumentWithAttachmentsCreateView.as_view(), name='reference-document-create-with-attachments'),
    *router.urls,
]
