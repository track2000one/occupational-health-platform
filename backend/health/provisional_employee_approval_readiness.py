"""Read-only final-approval readiness report for a provisional employee roster.

No writes to Employee, clinical tables, temporary source records, or archive states.
A technical name/ID match does NOT verify employment or authorize restoration.
Only high-level counts are returned; IDs, names, contacts and sources stay private.
"""
from collections import Counter, defaultdict

from django.db.models import Q
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .employee_import_classification import normalize_person_name, OPTIONAL_COMPLETENESS_FIELDS
from .employee_import_v2_matching import norm_text
from .models import Employee, HealthCenter, ProvisionalEmployeeImportBatch
from .provisional_employee_roster import NO_CACHE, _unseal


def calculate_readiness(batch):
    rows = list(batch.rows.all().only(
        'source_row', 'sealed_payload', 'classification', 'missing_optional',
    ).order_by('source_row'))
    decrypted = [_unseal(item.sealed_payload) for item in rows]
    source_ids = [str(src.get('national_id') or '') for src in decrypted]
    originals = {
        employee.national_id: employee
        for employee in Employee.objects.filter(national_id__in=source_ids).only(
            'id', 'national_id', 'name', 'is_archived', 'employment_status',
            'health_center_id', 'source_center_name',
        )
    }

    # ONLY approved and active official center references can count as a match.
    indexed_centers = defaultdict(set)
    for center in HealthCenter.objects.filter(
        is_active=True, is_archived=False,
        approval_status=HealthCenter.ApprovalStatus.APPROVED,
    ).only('id', 'name', 'name_ar', 'name_en', 'code'):
        for label in (center.name, center.name_ar, center.name_en, center.code):
            if label:
                indexed_centers[norm_text(label)].add(center.pk)

    class_counts = Counter()
    center_counts = Counter()
    original_counts = Counter()
    missing_fields = Counter()
    missing_any = 0
    original_same_name = 0
    archived_active = 0
    for row, src in zip(rows, decrypted):
        class_counts[row.classification] += 1
        for field in OPTIONAL_COMPLETENESS_FIELDS:
            if not str(src.get(field) or '').strip():
                missing_fields[field] += 1
        if any(not str(src.get(field) or '').strip() for field in OPTIONAL_COMPLETENESS_FIELDS):
            missing_any += 1

        source_center = str(src.get('health_center') or '').strip()
        if not source_center:
            center_counts['missing_in_file'] += 1
        else:
            linked = indexed_centers.get(norm_text(source_center), set())
            if len(linked) == 1:
                center_counts['approved_exact_unique'] += 1
            elif linked:
                center_counts['ambiguous'] += 1
            else:
                center_counts['not_matched_to_approved'] += 1

        original = originals.get(str(src.get('national_id') or ''))
        if original is None:
            original_counts['no_original_record'] += 1
        else:
            original_counts['archived' if original.is_archived else 'active'] += 1
            if original.employment_status != Employee.EmploymentStatus.ACTIVE:
                original_counts['non_active_employment_status'] += 1
            if normalize_person_name(original.name) == normalize_person_name(src.get('name')):
                original_same_name += 1
                if original.is_archived and original.employment_status == Employee.EmploymentStatus.ACTIVE:
                    archived_active += 1

    # Deliberately do not transform technical matches into "approved".
    return {
        'mode': 'provisional_final_approval_readiness_read_only',
        'batch_id': batch.pk,
        'rows_total': batch.total_rows,
        'rows_scanned': len(rows),
        'source_classification': {
            key: class_counts.get(key, 0) for key in (
                'name_match', 'name_review', 'identifier_review', 'not_in_registry',
            )
        },
        'original_registry': {
            key: original_counts.get(key, 0) for key in (
                'archived', 'active', 'no_original_record', 'non_active_employment_status',
            )
        },
        'source_name_matches_original': original_same_name,
        'archived_active_name_match_for_review': archived_active,
        'approved_center_name_check': {
            key: center_counts.get(key, 0) for key in (
                'approved_exact_unique', 'missing_in_file',
                'not_matched_to_approved', 'ambiguous',
            )
        },
        'optional_fields_missing': {
            key: missing_fields.get(key, 0)
            for key in OPTIONAL_COMPLETENESS_FIELDS
        },
        'cards_missing_any_optional_field': missing_any,
        'blocking_conditions': [
            'technical_identity_match_is_not_independent_identity_verification',
            'current_employment_must_be_verified',
            'real_restore_tested_backup_evidence_must_be_verified_before_restore',
            'archived_records_require_explicit_approved_restoration',
            'name_or_identifier_discrepancies_require_human_review',
        ],
        'clinical_activation_enabled_from_this_report': False,
        'approved_count': 0,
        'creates_employee_records': False,
        'modifies_employee_records': False,
        'modifies_clinical_records': False,
        'notice': 'فحص جاهزية فقط. لا ينفّذ أي اعتماد أو استعادة أو تعديل على السجلات الأصلية.',
    }


class ProvisionalEmployeeApprovalReadinessView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not request.user.is_superuser:
            return Response(
                {'detail': 'تقرير الجاهزية للمسؤول الأعلى فقط.'},
                status=403, headers=NO_CACHE,
            )
        batch = ProvisionalEmployeeImportBatch.objects.order_by('-created_at', '-pk').first()
        if batch is None:
            return Response({
                'mode': 'provisional_final_approval_readiness_read_only',
                'batch_id': None, 'rows_total': 0, 'approved_count': 0,
                'notice': 'لم تُرفع قائمة مؤقتة بعد.',
            }, headers=NO_CACHE)
        try:
            report = calculate_readiness(batch)
        except ValueError:
            # Encryption key rotation may invalidate temporary data.
            return Response({
                'detail': 'تعذّر فك تشفير القائمة المؤقتة. لا تُعد استيرادها قبل مراجعة المسؤول التقني.',
            }, status=409, headers=NO_CACHE)
        return Response(report, headers=NO_CACHE)
