"""V4-only, two-step internal activation for the confirmed sector-direct full-checkup unit.

Does not alter employees, medical records, center mappings, or organizational
parent relationships. Requires the uniquely identified parent sector to have
been activated independently. Other unit types retain center-parent rules.
"""
from django.core import signing
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AuditLog, OrganizationUnit, OrganizationUnitApprovalLog
from .organization_structure import draft_import_scope
from .v4_operational_activation import operational_activation_enabled
from .v4_sector_direct_unit_draft_create import (
    DRAFT_CODE, SOURCE_PATH,
)
from .v4_sector_direct_unit_preflight import (
    SECTOR_NAME, UNIT_NAME, inspect_full_checkup_unit,
)

TOKEN_SALT = 'v4-sector-direct-fullcheckup-unit-activation-1'
CONFIRM_TEXT = 'تفعيل الوحدة الإدارية للفحص الشامل'


def activation_readiness():
    """Read-only exact-state safety check used in preview and under row locks."""
    check = inspect_full_checkup_unit()
    if check['status'] != 'already_linked':
        return {'status': check['status'], 'detail': check['detail']}, None

    sector = OrganizationUnit.objects.get(pk=check['sector_id'])
    unit = OrganizationUnit.objects.get(pk=check['unit_id'])
    if sector.parent_id or sector.health_center_id or not sector.is_active:
        return {'status': 'invalid_sector', 'detail': 'سجل القطاع غير صالح للتفعيل.'}, None
    if not sector.is_approved:
        return {
            'status': 'parent_pending',
            'detail': 'يلزم تفعيل القطاع الشرقي الاستشاري 1 أولًا من صفحة الهيكل التنظيمي؛ لن يتم تفعيله تلقائيًا.',
        }, None
    if (unit.code != DRAFT_CODE or unit.source_sheet != 'V4 confirmed sector-direct draft'
            or unit.source_path != SOURCE_PATH or unit.kind != OrganizationUnit.Kind.UNIT
            or unit.parent_id != sector.pk or unit.health_center_id is not None):
        return {
            'status': 'unit_identity_mismatch',
            'detail': 'بيانات أو مصدر الوحدة لا يطابق المسودة المؤكدة؛ يلزم مراجعة المسؤول.',
        }, None
    if not unit.is_active:
        return {'status': 'unit_inactive', 'detail': 'الوحدة غير نشطة؛ لا يمكن تفعيلها.'}, None
    if unit.is_approved:
        return {'status': 'already_active', 'detail': 'الوحدة مفعّلة بالفعل؛ لا تكرر العملية.'}, None
    snapshot = {
        'sector_id': sector.pk, 'sector_code': sector.code,
        'sector_updated_at': sector.updated_at.isoformat(),
        'sector_approved': sector.is_approved,
        'unit_id': unit.pk, 'unit_code': unit.code,
        'unit_updated_at': unit.updated_at.isoformat(),
        'unit_approved': unit.is_approved,
    }
    return {'status': 'ready', 'detail': 'الوحدة مؤهلة للتفعيل التشغيلي الفردي بعد التأكيد.'}, snapshot


class V4SectorDirectUnitActivationView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request):
        if (not request.user.is_superuser or draft_import_scope() != 'v4'
                or not operational_activation_enabled()):
            return Response({
                'detail': 'التفعيل التشغيلي الفردي متاح لمسؤول V4 المعزولة فقط.'
            }, status=403)

        action = request.data.get('action')
        if action == 'preview':
            if set(request.data) != {'action'}:
                return Response({'detail': 'بيانات المعاينة غير صحيحة.'}, status=400)
            result, snapshot = activation_readiness()
            if snapshot is None:
                return Response(result, status=409)
            return Response({
                'mode': 'preview', 'status': 'ready', 'sector_name': SECTOR_NAME,
                'unit_name': UNIT_NAME, 'sector_id': snapshot['sector_id'],
                'unit_id': snapshot['unit_id'], 'source_record_count': 8,
                'employee_changes': 0, 'health_center_changes': 0,
                'legal_approval': False, 'confirmation_text': CONFIRM_TEXT,
                'preview_token': signing.dumps(snapshot, salt=TOKEN_SALT),
                'notice': 'معاينة فقط. التفعيل الداخلي للوحدة لا يربط الموظفين أو يغيّر القطاع.',
            })

        if action != 'activate':
            return Response({'detail': 'يجب معاينة التفعيل أولًا.'}, status=400)
        if (set(request.data) != {'action', 'confirmed', 'confirmation_text', 'preview_token'}
                or request.data.get('confirmed') is not True
                or request.data.get('confirmation_text') != CONFIRM_TEXT):
            return Response({'detail': 'يلزم التأكيد الصريح بعد المعاينة.'}, status=400)
        try:
            snapshot = signing.loads(
                request.data.get('preview_token', ''), salt=TOKEN_SALT, max_age=900,
            )
        except (signing.BadSignature, signing.SignatureExpired, TypeError, ValueError):
            return Response({'detail': 'المعاينة غير صالحة أو انتهت؛ أعد الفحص.'}, status=409)
        if not isinstance(snapshot, dict) or snapshot.get('unit_code') != DRAFT_CODE:
            return Response({'detail': 'رمز المعاينة غير مطابق لهذه الوحدة.'}, status=409)

        with transaction.atomic():
            # Lock root first, then child to serialize with updates to the parent.
            sector = OrganizationUnit.objects.select_for_update().filter(
                pk=snapshot.get('sector_id'),
                kind=OrganizationUnit.Kind.SECTOR,
                name=SECTOR_NAME,
            ).first()
            unit = OrganizationUnit.objects.select_for_update().filter(
                pk=snapshot.get('unit_id'),
                kind=OrganizationUnit.Kind.UNIT,
                name=UNIT_NAME,
            ).first()
            if not sector or not unit:
                return Response({'detail': 'تغيّر سجل القطاع أو الوحدة؛ أعد المعاينة.'}, status=409)
            check, current = activation_readiness()
            if current is None or current != snapshot:
                return Response({
                    'detail': 'تغيّرت بيانات الوحدة أو القطاع بعد المعاينة؛ لم تُنفذ أي عملية.'
                }, status=409)
            unit.is_approved = True  # V4 operational flag, NOT formal approval
            unit.approved_by = request.user
            unit.approved_at = timezone.now()
            unit.approval_reference = ''
            unit.save(update_fields=[
                'is_approved', 'approved_by', 'approved_at',
                'approval_reference', 'updated_at',
            ])
            OrganizationUnitApprovalLog.objects.create(
                unit=unit, action='v4-activate', user=request.user,
            )
            AuditLog.objects.create(
                user=str(request.user),
                action='v4_sector_direct_unit_operational_activation',
                model_name='OrganizationUnit', record_id=str(unit.pk),
            )

        return Response({
            'status': 'activated', 'unit_id': unit.pk, 'unit_code': unit.code,
            'parent_id': sector.pk, 'unit_name': unit.name,
            'sector_name': sector.name, 'is_approved': True,
            'employee_changes': 0, 'health_center_changes': 0,
            'legal_approval': False,
            'notice': 'تم التفعيل التشغيلي الداخلي للوحدة فقط؛ ربط الموظفين إجراء مستقل.',
        })
