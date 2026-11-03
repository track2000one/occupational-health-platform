"""Review-and-confirm bulk organizational approvals, restricted to isolated Staging.

No silent approvals: preview first, verify a snapshot fingerprint, then explicit
confirmation with an official reference covering the approved entries.
"""
from hashlib import sha256
import json
import os

from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AuditLog, HealthCenter, OrganizationUnit, OrganizationUnitApprovalLog
from .organization_structure import STAGING_PROJECT, clean


ORDER = {'sector': 0, 'department': 1, 'center': 2, 'unit': 3}
MAX_BULK_SELECTION = 500


def _snapshot_token(selected_ids, units, active_centers):
    return sha256(json.dumps({
        'selected': sorted(selected_ids),
        'organization': [
            [unit.pk, unit.name, unit.kind, unit.parent_id, unit.health_center_id,
             unit.is_approved, unit.is_active, unit.approval_reference,
             unit.updated_at.isoformat()]
            for unit in sorted(units, key=lambda row: row.pk)
        ],
        'active_centers': sorted(active_centers),
    }, ensure_ascii=False, separators=(',', ':')).encode('utf-8')).hexdigest()


def _plan_approvals(selected_ids, units, active_centers):
    units_by_id = {unit.pk: unit for unit in units}
    selected = sorted(
        (units_by_id[key] for key in selected_ids),
        key=lambda unit: (ORDER.get(unit.kind, 10), unit.name, unit.pk),
    )
    selected_ids_set = set(selected_ids)
    previously_approved = {unit.pk for unit in units if unit.is_approved}
    planned = set()
    approved_plan = []
    blocked = []
    already_approved = []
    center_usage = {}
    for unit in units:
        if unit.kind == 'center' and unit.is_active and unit.health_center_id:
            center_usage.setdefault(unit.health_center_id, []).append(unit.pk)

    for unit in selected:
        reason = None
        if unit.is_approved:
            already_approved.append(unit.pk)
            continue
        if not unit.is_active:
            reason = 'inactive'
        elif unit.kind not in ORDER:
            reason = 'invalid_kind'
        elif unit.parent_id and unit.parent_id not in previously_approved | planned:
            reason = 'parent_not_approved_or_selected'
        elif unit.kind == 'center':
            if not unit.health_center_id or unit.health_center_id not in active_centers:
                reason = 'center_mapping_required'
            elif len(center_usage.get(unit.health_center_id, [])) > 1:
                reason = 'duplicate_center_mapping'
        elif unit.kind == 'unit':
            parent = units_by_id.get(unit.parent_id)
            if not parent or parent.kind != 'center':
                reason = 'invalid_parent_center'
            elif not parent.health_center_id or parent.health_center_id not in active_centers:
                reason = 'parent_center_mapping_required'
        elif unit.kind in ('sector', 'department') and unit.parent_id:
            reason = 'unexpected_root_parent'
        if reason:
            blocked.append({
                'id': unit.pk, 'code': unit.code, 'name': unit.name, 'kind': unit.kind,
                'reason': reason,
            })
        else:
            planned.add(unit.pk)
            approved_plan.append(unit)
    return {
        'selected_count': len(selected_ids_set),
        'eligible_count': len(approved_plan),
        'blocked_count': len(blocked),
        'already_approved_count': len(already_approved),
        'eligible_by_kind': {
            kind: sum(unit.kind == kind for unit in approved_plan) for kind in ORDER
        },
        'eligible_ids': [unit.pk for unit in approved_plan],
        'blocked': blocked,
    }, approved_plan


class OrganizationBulkApprovalView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request):
        if not request.user.is_superuser:
            return Response({'detail': 'Bulk approvals require a superuser.'},
                            status=status.HTTP_403_FORBIDDEN)
        if (os.getenv('STAGING_MODE', '').lower() != 'true'
                or os.getenv('RAILWAY_PROJECT_ID') != STAGING_PROJECT):
            return Response({'detail': 'Bulk organization approval is restricted to isolated Staging.'},
                            status=status.HTTP_403_FORBIDDEN)
        action = request.data.get('action')
        if action not in ('preview', 'approve'):
            return Response({'detail': 'Action must be preview or approve.'}, status=400)
        raw_ids = request.data.get('unit_ids')
        if (not isinstance(raw_ids, list) or not raw_ids
                or len(raw_ids) > MAX_BULK_SELECTION
                or any(type(pk) is not int or pk <= 0 for pk in raw_ids)
                or len(raw_ids) != len(set(raw_ids))):
            return Response({'detail': 'Provide 1–500 unique, positive organization IDs.'}, status=400)

        # Lock all relevant hierarchy rows so parent approvals and center references
        # cannot change mid-plan. This is inexpensive (107 rows) in staging.
        with transaction.atomic():
            units = list(OrganizationUnit.objects.select_for_update().order_by('pk'))
            by_id = {unit.pk for unit in units}
            if set(raw_ids) - by_id:
                return Response({'detail': 'One or more selected organizations no longer exist.'},
                                status=status.HTTP_409_CONFLICT)
            center_ids = {unit.health_center_id for unit in units if unit.health_center_id}
            active_centers = set(HealthCenter.objects.filter(
                pk__in=center_ids, is_active=True,
            ).values_list('pk', flat=True))
            plan, eligible = _plan_approvals(raw_ids, units, active_centers)
            fingerprint = _snapshot_token(raw_ids, units, active_centers)
            if action == 'preview':
                return Response({**plan, 'preview_token': fingerprint, 'mode': 'preview'})

            reference = clean(request.data.get('approval_reference'))
            if not 3 <= len(reference) <= 255:
                return Response({'detail': 'Provide an official approval reference (3–255 characters).'}, status=400)
            if request.data.get('reference_covers_all') is not True:
                return Response({'detail': 'Confirm the official reference covers every eligible item.'}, status=400)
            expected = request.data.get('preview_token')
            if not isinstance(expected, str) or expected != fingerprint:
                return Response({'detail': 'The preview is outdated. Recheck before approving.'},
                                status=status.HTTP_409_CONFLICT)
            if not eligible:
                return Response({'detail': 'There are no eligible organizations to approve.'}, status=400)
            now = timezone.now()
            for unit in eligible:
                if unit.kind == 'unit':
                    # Propagate only the explicitly reviewed existing center link.
                    parent = next((parent for parent in units if parent.pk == unit.parent_id), None)
                    if not parent:
                        raise ValueError('Unexpected missing parent during locked bulk transaction.')
                    unit.health_center_id = parent.health_center_id
                unit.is_approved = True
                unit.approved_by = request.user
                unit.approved_at = now
                unit.approval_reference = reference
                unit.save()
                OrganizationUnitApprovalLog.objects.create(
                    unit=unit, action='bulk-approve',
                    approval_reference=reference, user=request.user,
                )
            AuditLog.objects.create(
                user=str(request.user), action='organization_bulk_approve',
                model_name='OrganizationUnit',
                record_id='bulk:' + sha256(','.join(str(unit.pk) for unit in eligible).encode()).hexdigest()[:20],
            )
            return Response({
                'mode': 'approved', 'approved_count': len(eligible),
                'approved_ids': [unit.pk for unit in eligible],
                'blocked_count': plan['blocked_count'],
                'blocked': plan['blocked'],
                'approval_reference': reference,
                'notice': 'No employees or health center master records were changed.',
            }, status=status.HTTP_200_OK)
