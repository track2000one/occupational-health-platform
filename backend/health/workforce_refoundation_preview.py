"""Read-only impact assessment before re-founding occupational workforce data.

The old database contains protected employee identity, clinical, administrative
and audit records. Hiding active cards is NOT a clean import reset because
identity uniqueness and protected relations remain. This module deliberately
implements ONLY GET. No endpoint, query, or code path can erase data.

Backup/restore proof cannot be inferred from a mounted Railway volume or the
existence of a passing synthetic CI drill; a separate verified backup is needed.
"""
from django.apps import apps
from django.db.models import PROTECT
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Employee, HealthCenter, OrganizationUnit

# Explicit inventory prevents accidentally omitting reference tables,
# long-lived source evidence, clinical records or archives.
SCOPES = {
    'employees': (
        'Employee',
        'EmployeeRegistryResetBatch',
        'EmployeeArchiveEvent',
        'EmployeeEmploymentChange',
        'EmployeeProfileCompletionEvent',
        'EmployeeOrganizationalHierarchyEvent',
        'EmployeeExcelMatchReview',
    ),
    'clinical_and_health_history': (
        'EmployeeHealthProfile', 'EmployeeHealthCard',
        'OccupationalHealthAssessment', 'LabTest', 'LabScreening',
        'Vaccination', 'VaccinationRecord', 'VaccinationDose',
        'ClinicVisit', 'OccupationalClinicVisit', 'EmployeeClinicVisit',
        'CommitteeReferral', 'MedicalCommitteeCase', 'InjuryCase',
        'NeedleStickExposure', 'ScreeningProgramRecord',
        'CampaignCoverage', 'TraineeRotation',
    ),
    'health_centers': (
        'HealthCenter', 'HealthCenterAlias', 'HealthCenterProfileAuditEvent',
        'HealthCenterResetBatch', 'HealthCenterLifecycleEvent',
        'CenterDirectoryMatchingBatch', 'CenterFoundationBatch',
        'CenterReferenceCandidate', 'CenterNameReviewCase',
        'CenterFoundationAuditEvent',
    ),
    'organizational_structure': (
        'OrganizationUnit', 'OrganizationUnitApprovalLog',
        'WorkforceCenterMapping', 'WorkforceCenterMappingRevision',
    ),
    'import_and_review_queue': (
        'DataImportBatch', 'EmployeeImportReview',
        'EmployeeImportReviewCleanupBatch',
        'WorkforceImportPlan', 'WorkforceImportCreatedEmployee',
        'ProvisionalEmployeeImportBatch', 'ProvisionalEmployeeRosterRow',
        'ProvisionalEmployeeNumberCorrectionEvent',
        'TemporaryWorkforceSnapshot',
    ),
}

DISPLAY_NAMES = {
    'employees': 'الموظفون وسجل الأرشفة والتعديلات',
    'clinical_and_health_history': 'الملفات الطبية والفحوصات والزيارات',
    'health_centers': 'المراكز الصحية وتوثيقها ومراجعتها',
    'organizational_structure': 'الأقسام والتسلسل التنظيمي والارتباطات',
    'import_and_review_queue': 'ملفات الاستيراد وبطاقات المراجعة',
}


def core_protected_links():
    """Count direct PROTECT references to Employee/Center/OrganizationUnit.

    Other protected relations may exist between dependent tables as well.
    These counts describe a risk, NOT permission to delete anything.
    """
    findings = []
    for target in (Employee, HealthCenter, OrganizationUnit):
        for related in target._meta.related_objects:
            fk = getattr(related, 'field', None)
            if fk is None or getattr(getattr(fk, 'remote_field', None), 'on_delete', None) is not PROTECT:
                continue
            related_model = related.related_model
            # Do not return actual row identifiers, names, or source payloads.
            linked = related_model._base_manager.filter(
                **{fk.name + '__isnull': False},
            ).count()
            if linked:
                findings.append({
                    'target': target.__name__,
                    'dependent_model': related_model.__name__,
                    'linked_count': linked,
                })
    return sorted(findings, key=lambda r: (r['target'], r['dependent_model']))


def read_only_inventory():
    sections = []
    for key, class_names in SCOPES.items():
        rows = []
        for name in class_names:
            model = apps.get_model('health', name)
            rows.append({'model': name, 'count': model.objects.count()})
        sections.append({
            'key': key,
            'title': DISPLAY_NAMES[key],
            'total': sum(r['count'] for r in rows),
            'items': rows,
        })
    employees = {
        'active': Employee.objects.filter(is_archived=False).count(),
        'archived': Employee.objects.filter(is_archived=True).count(),
        'total': Employee.objects.count(),
    }
    centers = {
        'active': HealthCenter.objects.filter(is_archived=False).count(),
        'archived': HealthCenter.objects.filter(is_archived=True).count(),
        'total': HealthCenter.objects.count(),
    }
    org_units = {
        'active': OrganizationUnit.objects.filter(is_active=True).count(),
        'inactive': OrganizationUnit.objects.filter(is_active=False).count(),
        'total': OrganizationUnit.objects.count(),
        'approved': OrganizationUnit.objects.filter(is_approved=True).count(),
    }
    return {
        'mode': 'read_only_full_refoundation_impact_preview',
        'version': '1',
        'employees': employees,
        'health_centers': centers,
        'organization_units': org_units,
        'sections': sections,
        'protected_relations': core_protected_links(),
        'operational_reset_is_reversible_archive_only': True,
        'archive_frees_unique_employee_identity': False,
        'production_backup_restored_and_verified': False,
        'backup_verification_source': 'requires_independent_evidence',
        'admin_accounts_and_audit_logs_preserved': True,
        'execution_available': False,
        'recommended_sequence': [
            'وثّق نسخة إنتاجية مشفرة خارج قاعدة البيانات مع اختبار استعادة مستقل.',
            'أوقف الاستيراد والتغييرات مؤقتًا خلال ترحيل البيانات.',
            'احتفظ بالقاعدة الحالية مؤمنة كأرشيف مستقل، بما فيها التاريخ الطبي وسجلات التدقيق.',
            'أسّس قاعدة تشغيل جديدة ونظيفة مع المخطط V4 بدل حذف هويات الموظفين في القاعدة الحالية.',
            'راجع دليل المراكز والأقسام المعتمد، ثم استورد Excel على دفعتين بمعاينة ومنع التعارض.',
        ],
        'notice': (
            'هذه معاينة فقط ولا تحذف أو تؤرشف أي سجل. '
            'النسخ الاحتياطية الاصطناعية أو وجود قرص PostgreSQL لا يثبت إمكانية استعادة الإنتاج.'
        ),
    }


class WorkforceRefoundationImpactPreviewView(APIView):
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'head', 'options']

    def get(self, request):
        if not request.user.is_superuser:
            return Response({'detail': 'المعاينة الشاملة متاحة للمسؤول الأعلى فقط.'}, status=403)
        return Response(read_only_inventory(), headers={
            'Cache-Control': 'private, no-store',
            'Pragma': 'no-cache',
        })
