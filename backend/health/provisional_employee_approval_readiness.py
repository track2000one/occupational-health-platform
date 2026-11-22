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

from .employee_import_classification import (
    normalize_person_name, OPTIONAL_COMPLETENESS_FIELDS, VISIT_DEFERRED_FIELDS,
)
from .employee_import_v2_matching import norm_text
from .models import Employee, HealthCenter, ProvisionalEmployeeImportBatch
from .provisional_employee_roster import NO_CACHE, _unseal
from .organization_structure import draft_import_scope
from .employee_org_template_v4 import clean_org_value


def calculate_readiness(batch, *, offset=None, limit=None):
    rows_query = batch.rows.all().only(
        'source_row', 'sealed_payload', 'classification', 'missing_optional',
    ).order_by('source_row')
    if offset is not None:
        rows_query = rows_query[offset:offset + limit]
    rows = list(rows_query)
    decrypted = [_unseal(item.sealed_payload) for item in rows]
    source_ids = [str(src.get('national_id') or '') for src in decrypted]
    originals = {
        employee.national_id: employee
        for employee in Employee.objects.filter(national_id__in=source_ids).only(
            'id', 'national_id', 'name', 'is_archived', 'employment_status',
            'health_center_id', 'source_center_name',
            *OPTIONAL_COMPLETENESS_FIELDS,
        )
    }

    # ONLY approved and active official center references can count as a match.
    indexed_centers = defaultdict(set)
    approved_centers = list(HealthCenter.objects.filter(
        is_active=True, is_archived=False,
        approval_status=HealthCenter.ApprovalStatus.APPROVED,
    ).only('id', 'name', 'name_ar', 'name_en', 'code'))
    approved_center_ids = {center.pk for center in approved_centers}
    for center in approved_centers:
        for label in (center.name, center.name_ar, center.name_en, center.code):
            if label:
                indexed_centers[norm_text(label)].add(center.pk)

    class_counts = Counter()
    center_counts = Counter()
    affiliation_counts = Counter()
    original_counts = Counter()
    missing_fields = Counter()
    # Distinguish empty imported snapshots from available historical values.
    # Historical values are diagnostic only, not approved import data.
    missing_source_original_same_name = Counter()
    missing_source_original_different_name = Counter()
    missing_both_for_matched_name = Counter()
    historic_center_counts = Counter()
    missing_any = 0
    cards_pending_visit_data = 0
    cards_missing_previsit_data = 0
    original_same_name = 0
    archived_active = 0
    for row, src in zip(rows, decrypted):
        class_counts[row.classification] += 1
        blank_fields = [
            field for field in OPTIONAL_COMPLETENESS_FIELDS
            if not str(src.get(field) or '').strip()
        ]
        missing_fields.update(blank_fields)
        if blank_fields:
            missing_any += 1
        if any(field in VISIT_DEFERRED_FIELDS for field in blank_fields):
            cards_pending_visit_data += 1
        if any(field not in VISIT_DEFERRED_FIELDS for field in blank_fields):
            cards_missing_previsit_data += 1

        # The V4 Excel has two independent affiliation paths. A department
        # employee is not a failed health-center match. Source values such as
        # "لا ينطبق" must never be looked up as health-center names.
        levels = src.get('source_organizational_hierarchy')
        if isinstance(levels, dict):
            source_center = clean_org_value(levels.get('health_center'))
            dept_path = any(clean_org_value(levels.get(level)) for level in (
                'main_administration', 'sub_administration',
                'department', 'sub_unit',
            ))
            if source_center:
                affiliation_counts['center'] += 1
            elif dept_path:
                affiliation_counts['department'] += 1
                center_counts['not_applicable'] += 1
                source_center = ''
            else:
                affiliation_counts['unresolved'] += 1
                center_counts['affiliation_unresolved'] += 1
                source_center = ''
        else:
            # Preserve historical V3 and Staging report semantics unchanged.
            source_center = str(src.get('health_center') or '').strip()
            affiliation_counts['legacy_unknown'] += 1
        if not isinstance(levels, dict) or source_center:
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
            same_name = (
                normalize_person_name(original.name)
                == normalize_person_name(src.get('name'))
            )
            if same_name:
                original_same_name += 1
                if original.is_archived and original.employment_status == Employee.EmploymentStatus.ACTIVE:
                    archived_active += 1
            if original.health_center_id:
                historic_center_counts['original_linked_center'] += 1
                if original.health_center_id in approved_center_ids:
                    historic_center_counts['original_linked_to_currently_approved_center'] += 1
            if original.source_center_name.strip():
                historic_center_counts['original_source_center_text_available'] += 1
            for field in blank_fields:
                original_present = bool(str(getattr(original, field, None) or '').strip())
                if same_name:
                    if original_present:
                        missing_source_original_same_name[field] += 1
                    else:
                        missing_both_for_matched_name[field] += 1
                elif original_present:
                    missing_source_original_different_name[field] += 1

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
                'not_applicable', 'affiliation_unresolved',
            )
        },
        'source_affiliation_kind': {
            key: affiliation_counts.get(key, 0) for key in (
                'center', 'department', 'unresolved', 'legacy_unknown',
            )
        },
        'optional_fields_missing': {
            key: missing_fields.get(key, 0)
            for key in OPTIONAL_COMPLETENESS_FIELDS
        },
        'historical_values_for_missing_source': {
            'same_name_review_only': {
                key: missing_source_original_same_name.get(key, 0)
                for key in OPTIONAL_COMPLETENESS_FIELDS
            },
            'different_name_unverified': {
                key: missing_source_original_different_name.get(key, 0)
                for key in OPTIONAL_COMPLETENESS_FIELDS
            },
            'blank_in_both_for_matching_name': {
                key: missing_both_for_matched_name.get(key, 0)
                for key in OPTIONAL_COMPLETENESS_FIELDS
            },
        },
        'official_center_directory': {
            'active_approved_count': len(approved_center_ids),
            'original_linked_center': historic_center_counts['original_linked_center'],
            'original_linked_to_currently_approved_center': historic_center_counts[
                'original_linked_to_currently_approved_center'
            ],
            'original_source_center_text_available': historic_center_counts[
                'original_source_center_text_available'
            ],
        },
        'source_completeness_basis': 'decrypted_stored_provisional_profile_not_original_excel',
        'source_headers_not_preserved': True,
        'cards_missing_any_optional_field': missing_any,
        'cards_pending_visit_data': cards_pending_visit_data,
        'cards_missing_previsit_data': cards_missing_previsit_data,
        'visit_deferred_fields': sorted(VISIT_DEFERRED_FIELDS),
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
        raw_offset = request.query_params.get('offset')
        raw_limit = request.query_params.get('limit')
        segment_requested = raw_offset is not None or raw_limit is not None
        offset = limit = None
        if segment_requested:
            # Large reports are fetched in bounded read-only slices in the
            # isolated V4 environment. Other environments keep the unchanged API.
            if draft_import_scope() != 'v4':
                return Response({'detail': 'Segmented report is private to isolated V4.'},
                                status=403, headers=NO_CACHE)
            try:
                if raw_offset is None or raw_limit is None:
                    raise ValueError('Both offset and limit are required')
                offset = int(raw_offset)
                limit = int(raw_limit)
                if offset < 0 or offset > batch.total_rows or not 1 <= limit <= 100:
                    raise ValueError('Invalid offset or limit')
            except (TypeError, ValueError):
                return Response({'detail': 'Use offset >= 0 and 1 <= limit <= 100.'},
                                status=400, headers=NO_CACHE)
        try:
            report = calculate_readiness(batch, offset=offset, limit=limit)
        except ValueError:
            # Encryption key rotation may invalidate temporary data.
            return Response({
                'detail': 'تعذّر فك تشفير القائمة المؤقتة. لا تُعد استيرادها قبل مراجعة المسؤول التقني.',
            }, status=409, headers=NO_CACHE)
        if segment_requested:
            report['segment'] = {
                'offset': offset,
                'limit': limit,
                'next_offset': offset + report['rows_scanned'],
                'has_more': offset + report['rows_scanned'] < batch.total_rows,
            }
        return Response(report, headers=NO_CACHE)
