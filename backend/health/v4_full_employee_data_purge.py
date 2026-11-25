"""V4-only explicit destructive employee-data purge, with full dry-run and verification.

Unlike employee_registry_reset (which merely archives records), this endpoint
permanently removes employee records and their linked clinical and intake data.
It never touches health centers, organizational units, accounts, users, or
organizational approval logs. Backup copies and Railway deploy/log history
are OUTSIDE the transactional DB scope and must be handled independently.

This must not be enabled on the main Production service or any restored DB.
"""
import hashlib
from collections import OrderedDict

from django.contrib.auth import get_user_model
from django.core import signing
from django.db import connection, transaction
from django.db.models import Max
from django.db.models.deletion import ProtectedError, RestrictedError
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from . import models
from .organization_structure import draft_import_scope


TOKEN_SALT = 'v4-complete-employee-data-purge-20261125-v1'
TOKEN_LIFETIME_SECONDS = 300
CONFIRM_TEXT = 'أحذف جميع بيانات الموظفين فقط نهائيًا'

# Delete all employee-specific, independent data stores. The declared order
# matters: PROTECT dependencies and source references are deleted BEFORE the
# employee, workforce-import plan, and provisional import batch.
DIRECT_PURGE_MODELS = (
    models.EmployeeOrganizationalHierarchyEvent,
    models.EmployeeProfileCompletionEvent,
    models.EmployeeExcelMatchReview,
    models.EmployeeArchiveEvent,
    models.EmployeeEmploymentChange,
    models.WorkforceImportCreatedEmployee,
    models.EmployeeImportReview,
    models.ProvisionalEmployeeNumberCorrectionEvent,
    models.ProvisionalEmployeeRosterRow,
    models.ProvisionalEmployeeImportBatch,
    models.TemporaryWorkforceSnapshot,
    models.EmployeeRegistryResetBatch,
    models.EmployeeImportReviewCleanupBatch,
    models.Employee,
    models.WorkforceImportPlan,
    models.DataImportBatch,
)

# Clinical and operational records directly linked to Employee are deleted
# by Django's on_delete=CASCADE; confirm zero remains after deletion.
CLINICAL_MODELS = (
    models.EmployeeHealthProfile,
    models.EmployeeHealthCard,
    models.OccupationalHealthAssessment,
    models.LabTest,
    models.LabScreening,
    models.Vaccination,
    models.VaccinationRecord,
    models.VaccinationDose,
    models.ClinicVisit,
    models.OccupationalClinicVisit,
    models.EmployeeClinicVisit,
    models.CommitteeReferral,
    models.MedicalCommitteeCase,
    models.InjuryCase,
    models.NeedleStickExposure,
    models.ScreeningProgramRecord,
)

PRESERVE_MODELS = (
    models.HealthCenter,
    models.OrganizationUnit,
    models.OrganizationUnitApprovalLog,
    models.UserProfile,
    models.WorkforceCenterMapping,
    models.WorkforceCenterMappingRevision,
    models.CenterFoundationBatch,
    models.CenterReferenceCandidate,
    models.CenterNameReviewCase,
)

EMPLOYEE_LOG_MODELS = (
    'Employee', 'EmployeeHealthCard', 'EmployeeHealthProfile',
    'OccupationalHealthAssessment', 'EmployeeImportReview',
    'EmployeeImportReviewCleanupBatch', 'EmployeeRegistryResetBatch',
    'EmployeeArchiveEvent', 'EmployeeEmploymentChange',
    'EmployeeOrganizationalHierarchyEvent', 'EmployeeProfileCompletionEvent',
    'EmployeeExcelMatchReview', 'DataImportBatch', 'WorkforceImportPlan',
    'WorkforceImportCreatedEmployee', 'ProvisionalEmployeeImportBatch',
    'ProvisionalEmployeeRosterRow', 'TemporaryWorkforceSnapshot',
)
EMPLOYEE_LOG_ACTIONS = (
    'bulk_reset_employee_registry', 'staging_synthetic_employee_cards_reset',
    'v4_employee', 'employee_', 'provisional_employee_', 'workforce_import_',
)


def _employee_audit_logs():
    from django.db.models import Q
    employee_record_models = set(EMPLOYEE_LOG_MODELS)
    employee_record_models.update(
        model.__name__ for model in DIRECT_PURGE_MODELS + CLINICAL_MODELS
    )
    filters = Q(model_name__in=employee_record_models)
    for prefix in EMPLOYEE_LOG_ACTIONS:
        filters |= Q(action__startswith=prefix)
    return models.AuditLog.objects.filter(filters).exclude(
        model_name='V4EmployeeDataPurge'
    )


def _snapshot():
    counts = OrderedDict()
    digest = hashlib.sha256()
    for model in DIRECT_PURGE_MODELS + CLINICAL_MODELS:
        queryset = model.objects.order_by('pk')
        name = model.__name__
        counts[name] = queryset.count()
        digest.update((name + ':').encode('utf-8'))
        # Ordered PKs prevent stale tokens from accepting a new row merely
        # because the total count happened to stay the same.
        for pk in queryset.values_list('pk', flat=True).iterator(chunk_size=2000):
            digest.update(str(pk).encode('utf-8'))
            digest.update(b'\0')
        # Employee and staging reviews can be edited without changing PKs.
        if model in (models.Employee, models.EmployeeImportReview,
                     models.ProvisionalEmployeeRosterRow):
            latest = model.objects.aggregate(latest=Max('updated_at'))['latest']
            digest.update(str(latest).encode('utf-8'))
    audit_qs = _employee_audit_logs()
    counts['EmployeeAuditLog'] = audit_qs.count()
    for pk in audit_qs.order_by('pk').values_list('pk', flat=True).iterator(chunk_size=2000):
        digest.update(('log:' + str(pk)).encode('utf-8'))
    return counts, digest.hexdigest()


def _preserved_counts():
    result = {model.__name__: model.objects.count() for model in PRESERVE_MODELS}
    result['AuthUser'] = get_user_model().objects.count()
    return result


def _impact(counts):
    return {
        'employees': counts.get('Employee', 0),
        'staged_reviews': counts.get('EmployeeImportReview', 0),
        'provisional_rows': counts.get('ProvisionalEmployeeRosterRow', 0),
        'provisional_batches': counts.get('ProvisionalEmployeeImportBatch', 0),
        'temporary_snapshots': counts.get('TemporaryWorkforceSnapshot', 0),
        'clinical_records': sum(counts.get(m.__name__, 0) for m in CLINICAL_MODELS),
        'workforce_import_plans': counts.get('WorkforceImportPlan', 0),
        'employee_audit_entries': counts.get('EmployeeAuditLog', 0),
    }


def _assert_model_scope():
    """Prevent hidden PROTECT relations from silently forcing partial deletion.

    A newly introduced model pointing to Employee must be listed explicitly
    or safely configured CASCADE. Otherwise the operation fails closed.
    """
    allowed = set(DIRECT_PURGE_MODELS + CLINICAL_MODELS)
    for relation in models.Employee._meta.related_objects:
        remote = relation.related_model
        if remote in allowed:
            continue
        raise RuntimeError(
            'Unexpected employee relationship: ' + remote.__name__
            + ' requires review before a destructive purge.'
        )


class V4FullEmployeeDataPurgeView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request):
        if not request.user.is_superuser or draft_import_scope() != 'v4':
            return Response({'detail': 'الحذف الشامل متاح للمسؤول في نسخة V4 المعزولة فقط.'}, status=403)
        try:
            _assert_model_scope()
        except RuntimeError:
            return Response({'detail': 'توجد علاقة جديدة ببيانات الموظفين لم تُفحص؛ أُوقف الحذف لحماية البيانات.'}, status=409)

        action = request.data.get('action')
        if action == 'preview':
            if set(request.data.keys()) != {'action'}:
                return Response({'detail': 'طلب المعاينة غير صالح.'}, status=400)
            counts, signature = _snapshot()
            protected = _preserved_counts()
            return Response({
                'mode': 'preview',
                'scope': 'isolated_v4_database_only',
                'counts': counts,
                'impact': _impact(counts),
                'protected_counts': protected,
                'irreversible': True,
                'includes_clinical_records': True,
                'excludes': [
                    'health_centers', 'organization_units',
                    'user_accounts', 'health_center_reference_data',
                    'external_backups', 'Railway_deploy_logs',
                    'other_Railway_databases',
                ],
                'confirm_phrase': CONFIRM_TEXT,
                'preview_token': signing.dumps({
                    'scope': 'isolated_v4_database_only',
                    'digest': signature,
                    'protected': protected,
                }, salt=TOKEN_SALT),
            })

        if action != 'execute':
            return Response({'detail': 'يجب إجراء معاينة أولًا.'}, status=400)
        if (set(request.data.keys()) !=
            {'action', 'preview_token', 'confirmed', 'confirm_phrase', 'reason'}
            or request.data.get('confirmed') is not True
            or request.data.get('confirm_phrase') != CONFIRM_TEXT
            or not isinstance(request.data.get('reason'), str)
            or not (20 <= len(request.data['reason'].strip()) <= 500)):
            return Response({'detail': 'يلزم تأكيد صريح وسبب واضح للحذف النهائي.'}, status=400)
        try:
            token = signing.loads(
                request.data.get('preview_token', ''),
                salt=TOKEN_SALT, max_age=TOKEN_LIFETIME_SECONDS,
            )
        except (signing.BadSignature, signing.SignatureExpired, TypeError, ValueError):
            return Response({'detail': 'انتهت المعاينة أو تغيرت؛ أعد الفحص.'}, status=409)
        if not isinstance(token, dict) or token.get('scope') != 'isolated_v4_database_only':
            return Response({'detail': 'رمز المعاينة لا يخص قاعدة V4.'}, status=409)

        try:
            with transaction.atomic():
                if connection.vendor == 'postgresql':
                    # Serializes simultaneous PURGE requests. Normal imports
                    # must be paused by the administrator for this maintenance.
                    with connection.cursor() as cursor:
                        cursor.execute('SELECT pg_advisory_xact_lock(%s)', [2026112502])
                original, signature = _snapshot()
                protected_before = _preserved_counts()
                if (token.get('digest') != signature or
                    token.get('protected') != protected_before):
                    return Response({'detail': 'تغيرت البيانات بعد المعاينة؛ لم يبدأ الحذف.'}, status=409)

                # Employee-related audit records can carry employee row IDs;
                # preserve the independent organizational and system logs.
                _employee_audit_logs().delete()
                for model in DIRECT_PURGE_MODELS:
                    model.objects.all().delete()

                remaining, _ = _snapshot()
                if any(remaining.values()):
                    raise RuntimeError('Employee/staging/clinical rows remain; transaction rolled back.')
                if _preserved_counts() != protected_before:
                    raise RuntimeError('Protected organization or user counts changed; transaction rolled back.')

                reason_reference = hashlib.sha256(
                    request.data['reason'].strip().encode('utf-8')
                ).hexdigest()[:24]
                models.AuditLog.objects.create(
                    user=str(request.user), action='v4_employee_data_purge_completed',
                    model_name='V4EmployeeDataPurge',
                    record_id='purge-' + reason_reference,
                )
        except (ProtectedError, RestrictedError, RuntimeError) as exc:
            # Never expose employee or healthcare values in an error.
            return Response({
                'detail': 'أُلغي الحذف وأُعيدت المعاملة؛ تعارض في العلاقات أو فشل تحقق السلامة.'
            }, status=409)

        return Response({
            'status': 'deleted', 'scope': 'isolated_v4_database_only',
            'deleted_counts': original, 'impact': _impact(original),
            'remaining_employee_records': 0,
            'preserved_counts': protected_before,
            'purge_reference': 'purge-' + reason_reference,
            'note': 'تم الحذف داخل قاعدة V4 فقط، وليس من نسخ Railway الاحتياطية أو قواعد البيانات الأخرى.',
        })
