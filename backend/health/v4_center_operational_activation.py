"""Atomic, review-first activation of health-center master data for isolated V4.

This is an INTERNAL operational status, not verification of an official decree.
No organizations, medical histories or employee assignments are changed.
"""
from collections import Counter
from hashlib import sha256
import json

from django.db import transaction
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AuditLog, HealthCenter, HealthCenterProfileAuditEvent
from .v4_operational_activation import operational_activation_enabled, OPERATIONAL_NOTE

MAX_CENTERS = 500
CONFIRM_PHRASE = 'تفعيل تشغيلي'


def center_key(center):
    return ' '.join(str(center.name_ar or center.name or '').split()).casefold()


def center_plan(selected_ids, all_centers):
    keys = Counter(center_key(center) for center in all_centers
                   if not center.is_archived and center.is_active)
    by_id = {center.pk: center for center in all_centers}
    eligible = []
    blocked = []
    already = []
    for center_id in sorted(selected_ids):
        center = by_id[center_id]
        reason = None
        if center.is_archived:
            reason = 'archived'
        elif not center.is_active:
            reason = 'inactive'
        elif not center_key(center):
            reason = 'missing_name'
        elif keys[center_key(center)] > 1:
            reason = 'duplicate_display_name'
        elif center.approval_status == HealthCenter.ApprovalStatus.APPROVED:
            already.append(center.pk)
            continue
        if reason:
            blocked.append({'id': center.pk, 'name': center.name_ar or center.name,
                            'reason': reason})
        else:
            eligible.append(center)
    return {'selected_count': len(selected_ids),
            'eligible_count': len(eligible),
            'already_active_count': len(already),
            'blocked_count': len(blocked),
            'eligible_ids': [center.pk for center in eligible],
            'blocked': blocked}, eligible


def center_snapshot(selected_ids, centers):
    # Include the entire directory to detect newly introduced duplicate names,
    # edits, archives and activations between preview and actual confirmation.
    state = [[center.pk, center.name, center.name_ar, center.code,
              center.is_active, center.is_archived, center.approval_status,
              center.approval_reference, center.updated_at.isoformat()]
             for center in centers]
    return sha256(json.dumps({'ids': sorted(selected_ids), 'state': state},
                             ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


class V4HealthCenterOperationalActivationView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request):
        if not request.user.is_superuser:
            return Response({'detail': 'يلزم حساب المسؤول الأعلى.'}, status=403)
        if not operational_activation_enabled():
            return Response({'detail': 'التفعيل التشغيلي متاح فقط في نسخة V4 المعزولة عند تفعيله.'},
                            status=403)
        action = request.data.get('action')
        if action not in ('preview', 'activate'):
            return Response({'detail': 'الإجراء يجب أن يكون معاينة أو تفعيلًا.'}, status=400)
        raw = request.data.get('center_ids')
        if (not isinstance(raw, list) or not raw or len(raw) > MAX_CENTERS
                or any(type(value) is not int or value <= 0 for value in raw)
                or len(raw) != len(set(raw))):
            return Response({'detail': 'اختر 1 إلى 500 مركز دون تكرار.'}, status=400)
        with transaction.atomic():
            centers = list(HealthCenter.objects.select_for_update().order_by('pk'))
            by_id = {center.pk for center in centers}
            if set(raw) - by_id:
                return Response({'detail': 'أحد المراكز المحددة غير موجود؛ أعد المعاينة.'}, status=409)
            plan, eligible = center_plan(raw, centers)
            token = center_snapshot(raw, centers)
            if action == 'preview':
                return Response({**plan, 'mode': 'preview', 'preview_token': token,
                                 'commit_enabled': True, 'notice': OPERATIONAL_NOTE})
            if (request.data.get('confirmed') is not True or
                    request.data.get('confirm_text') != CONFIRM_PHRASE):
                return Response({'detail': 'أكد التفعيل التشغيلي صراحة.'}, status=400)
            if request.data.get('preview_token') != token:
                return Response({'detail': 'تغيرت بيانات دليل المراكز؛ أعد المعاينة.'}, status=409)
            if not eligible:
                return Response({'detail': 'لا توجد مراكز مؤهلة للتفعيل.'}, status=409)
            activated_at = timezone.now()
            for center in eligible:
                prior = {'approval_status': center.approval_status,
                         'approval_reference': center.approval_reference}
                center.approval_status = HealthCenter.ApprovalStatus.APPROVED
                center.approval_reference = ''  # No fictional official decision.
                center.approved_by = request.user
                center.approved_at = activated_at
                center.save(update_fields=['approval_status', 'approval_reference',
                                           'approved_by', 'approved_at', 'updated_at'])
                HealthCenterProfileAuditEvent.objects.create(
                    center=center, action='v4_operational_activate',
                    prior_state=prior,
                    new_state={'approval_status': center.approval_status,
                               'activation_type': 'internal_operational',
                               'decision_reference_required': False},
                    performed_by=request.user, evidence_reference='',
                )
            AuditLog.objects.create(
                user=str(request.user), action='v4_operational_activate_centers',
                model_name='HealthCenter',
                record_id='bulk:' + sha256(','.join(str(c.pk) for c in eligible).encode()).hexdigest()[:20],
            )
            return Response({'mode': 'activated', 'activated_count': len(eligible),
                             'blocked_count': len(plan['blocked']),
                             'blocked': plan['blocked'], 'notice': OPERATIONAL_NOTE,
                             'employee_records_modified': 0,
                             'organization_links_modified': 0})
