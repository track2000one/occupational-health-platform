"""No-write approval preparation for imported provisional employee roster.

Uses the already-encrypted 1,423-card batch; never uploads Excel, restores
archived records, alters staff, or grants clinical access. An archival reset
provenance + matching name is a technical candidate, NOT HR verification.
"""
from collections import Counter, defaultdict

from django.conf import settings
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .employee_import_classification import normalize_person_name
from .employee_import_v2_matching import norm_text
from .models import Employee, EmployeeRegistryResetBatch, ProvisionalEmployeeImportBatch
from .provisional_employee_roster import NO_CACHE, _masked, _unseal

PAGE_SIZE = 25
MAX_SEARCH = 100
STATES = (
    'technical_review_candidate',
    'identifier_conflict',
    'name_difference',
    'missing_original',
    'original_not_archived',
    'not_active_employment',
    'archive_provenance_review',
)


def _archive_sources():
    """Index active historic bulk-reset records once; no writes or history changes."""
    entries = defaultdict(list)
    for reset in EmployeeRegistryResetBatch.objects.filter(
        restored_at__isnull=True
    ).only('pk', 'employee_ids', 'applied_at', 'reason'):
        for employee_id in (reset.employee_ids or []):
            entries[str(employee_id)].append(reset)
    return entries


def _technical_classification(row, source, employee, resets):
    """Fail closed on conflicts; never treat any match as approved identity."""
    if row.classification == 'identifier_review':
        return 'identifier_conflict'
    if employee is None:
        return 'missing_original'
    if not employee.is_archived:
        return 'original_not_archived'
    if (row.classification == 'name_review' or
            normalize_person_name(source.get('name', '')) !=
            normalize_person_name(employee.name)):
        return 'name_difference'
    if employee.employment_status != Employee.EmploymentStatus.ACTIVE:
        return 'not_active_employment'
    eligible_resets = [
        reset for reset in resets.get(str(employee.pk), ())
        if employee.archived_at is not None
        and reset.applied_at == employee.archived_at
        and norm_text(reset.reason) == norm_text(employee.archive_reason)
    ]
    if len(eligible_resets) != 1:
        return 'archive_provenance_review'
    return 'technical_review_candidate'


def build_plan(batch, *, status_filter='', page=1):
    if status_filter and status_filter not in STATES:
        raise ValueError('تصنيف المراجعة غير معروف.')
    if not 1 <= page <= MAX_SEARCH:
        raise ValueError('رقم الصفحة غير صالح.')

    items = list(batch.rows.only(
        'id', 'source_row', 'classification', 'sealed_payload', 'missing_optional',
    ).order_by('source_row'))
    source_profiles = [_unseal(item.sealed_payload) for item in items]
    source_ids = [str(src.get('national_id') or '') for src in source_profiles]
    employee_by_id = {
        employee.national_id: employee
        for employee in Employee.objects.filter(
            national_id__in=source_ids
        ).only(
            'pk', 'name', 'national_id', 'is_archived', 'archived_at',
            'archive_reason', 'employment_status',
        )
    }
    resets = _archive_sources()
    counts = Counter()
    selected = []
    for row, source in zip(items, source_profiles):
        employee = employee_by_id.get(str(source.get('national_id') or ''))
        classification = _technical_classification(row, source, employee, resets)
        counts[classification] += 1
        if not status_filter or classification == status_filter:
            selected.append({
                'source_row': row.source_row,
                'masked_id': _masked(str(source.get('national_id') or '')),
                'name': source.get('name') or '',
                'status': classification,
                'missing_optional_count': len(row.missing_optional or ()),
                'is_approved_employee': False,
            })
    start = (page - 1) * PAGE_SIZE
    report = {
        'mode': 'employee_approval_preparation_read_only',
        'batch_id': batch.pk,
        'total_source_rows': batch.total_rows,
        'total_scanned': len(items),
        'counts': {key: counts[key] for key in STATES},
        'approval_technically_possible_to_review': counts['technical_review_candidate'],
        'approved_employee_count': 0,
        'needs_independent_hr_verification': True,
        'requires_tested_backup_before_archive_restore': True,
        'archive_restore_enabled': bool(
            getattr(settings, 'EMPLOYEE_V2_ARCHIVE_RESTORE_ENABLED', False)
        ),
        'page': page,
        'page_size': PAGE_SIZE,
        'filtered_count': len(selected),
        'items': selected[start:start + PAGE_SIZE],
        'note': (
            'هذه قائمة فحص فنية وليست اعتمادًا للموظفين. لا تعتمد مطابقة الاسم والهوية '
            'وحدها، ويلزم توثيق الحالة الوظيفية ونسخة احتياطية مختبرة قبل أي استعادة.'
        ),
        'original_records_modified': 0,
        'clinical_records_modified': 0,
    }
    return report


class ProvisionalEmployeeApprovalPlanView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not request.user.is_superuser:
            return Response({'detail': 'كشف تجهيز الاعتماد للمسؤول الأعلى فقط.'},
                            status=403, headers=NO_CACHE)
        try:
            page = int(request.query_params.get('page', 1))
            status_filter = str(request.query_params.get('status') or '').strip()
            if len(status_filter) > 40:
                raise ValueError('تصنيف المراجعة غير صالح.')
            batch = ProvisionalEmployeeImportBatch.objects.order_by(
                '-created_at', '-pk'
            ).first()
            if batch is None:
                return Response({
                    'mode': 'employee_approval_preparation_read_only',
                    'batch_id': None, 'total_source_rows': 0,
                    'total_scanned': 0, 'approved_employee_count': 0,
                    'items': [], 'counts': {},
                    'note': 'لا توجد دفعة موظفين مؤقتة.',
                }, headers=NO_CACHE)
            report = build_plan(batch, status_filter=status_filter, page=page)
        except (ValueError, TypeError) as exc:
            return Response({'detail': str(exc)}, status=400, headers=NO_CACHE)
        return Response(report, headers=NO_CACHE)
