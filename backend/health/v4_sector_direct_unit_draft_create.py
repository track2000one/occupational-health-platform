"""Explicit, audit-logged creation of ONE sector-direct full-checkup unit draft on isolated V4.

Two-phase API: POST action=preview returns a short-lived signed token; POST
action=create with this exact token and human-confirmation phrase creates a
single UNAPPROVED OrganizationUnit draft, with FK parent set to the existing
sector. No activation and no employee or clinical writes.
"""
from hashlib import sha256

from django.core import signing
from django.db import IntegrityError, transaction
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AuditLog, OrganizationUnit, OrganizationUnitApprovalLog
from .organization_structure import draft_import_scope
from .v4_sector_direct_unit_preflight import (
    SECTOR_NAME, UNIT_NAME, inspect_full_checkup_unit,
)

PREVIEW_SALT = 'v4-sector-direct-full-checkup-unit-v1'
CONFIRM_TEXT = 'إنشاء مسودة وحدة الفحص الشامل'
SOURCE_PATH = 'الرعاية الأولية والمجتمعية / ' + SECTOR_NAME + ' / ' + UNIT_NAME
DRAFT_CODE = 'V4-SU-' + sha256(
    (SECTOR_NAME + '\x1f' + UNIT_NAME).encode('utf-8')
).hexdigest()[:24].upper()


class V4SectorDirectUnitDraftCreateView(APIView):
    permission_classes = [permissions.IsAdminUser]

    @staticmethod
    def _forbidden(request):
        return not request.user.is_superuser or draft_import_scope() != 'v4'

    @staticmethod
    def _ready_snapshot():
        check = inspect_full_checkup_unit()
        if check['status'] != 'unit_missing':
            return check, None
        sector = OrganizationUnit.objects.get(
            pk=check['sector_id'], kind=OrganizationUnit.Kind.SECTOR,
        )
        if not sector.is_approved or not sector.is_active:
            check.update(
                status='sector_pending_activation', can_create_link=False,
                detail='القطاع موجود لكنه غير مفعّل تشغيليًا؛ لا يُنشأ الارتباط قبل تفعيله.',
            )
            return check, None
        if OrganizationUnit.objects.filter(code=DRAFT_CODE).exists():
            check.update(status='code_collision', can_create_link=False,
                         detail='الرمز الداخلي محجوز بسجل آخر؛ يلزم مراجعة التعارض.')
            return check, None
        snapshot = {
            'sector_id': sector.pk,
            'sector_updated_at': sector.updated_at.isoformat(),
            'sector_code': sector.code,
            'unit_code': DRAFT_CODE,
        }
        return check, snapshot

    def post(self, request):
        if self._forbidden(request):
            return Response({'detail': 'إنشاء المسودة متاح لمسؤول V4 المعزولة فقط.'},
                            status=status.HTTP_403_FORBIDDEN)
        action = request.data.get('action')
        if action == 'preview':
            if set(request.data.keys()) != {'action'}:
                return Response({'detail': 'بيانات المعاينة غير صحيحة.'}, status=400)
            check, snapshot = self._ready_snapshot()
            if snapshot is None:
                return Response(check, status=status.HTTP_409_CONFLICT)
            return Response({
                'mode': 'preview', 'sector': SECTOR_NAME, 'unit': UNIT_NAME,
                'source_record_count': 8,
                'sector_id': snapshot['sector_id'], 'unit_code': DRAFT_CODE,
                'target_kind': 'unit', 'target_status': 'مسودة غير مفعّلة',
                'employee_changes': 0, 'health_center_changes': 0,
                'preview_token': signing.dumps(snapshot, salt=PREVIEW_SALT),
                'confirmation_text': CONFIRM_TEXT,
                'notice': 'المعاينة لا تكتب أي بيانات. التأكيد ينشئ مسودة واحدة فقط تحت القطاع الحالي.',
            })

        if action != 'create':
            return Response({'detail': 'استخدم المعاينة قبل الإنشاء.'}, status=400)
        if set(request.data.keys()) != {
            'action', 'preview_token', 'confirmed', 'confirmation_text',
        } or request.data.get('confirmed') is not True or (
            request.data.get('confirmation_text') != CONFIRM_TEXT
        ):
            return Response({'detail': 'يلزم التأكيد الصريح بعد المعاينة.'}, status=400)

        try:
            provided = signing.loads(
                request.data.get('preview_token', ''),
                salt=PREVIEW_SALT, max_age=900,
            )
        except (signing.BadSignature, signing.SignatureExpired, TypeError, ValueError):
            return Response({'detail': 'انتهت أو تغيّرت المعاينة؛ أعد الفحص.'}, status=409)

        if not isinstance(provided, dict) or provided.get('unit_code') != DRAFT_CODE:
            return Response({'detail': 'المعاينة غير صالحة لإنشاء هذه الوحدة.'}, status=409)

        try:
            with transaction.atomic():
                # Serializes competing requests for the same parent in PostgreSQL.
                sector = OrganizationUnit.objects.select_for_update().filter(
                    pk=provided.get('sector_id'),
                    kind=OrganizationUnit.Kind.SECTOR, name=SECTOR_NAME,
                ).first()
                if sector is None:
                    return Response({'detail': 'تغير سجل القطاع؛ أعد المعاينة.'}, status=409)
                check, current = self._ready_snapshot()
                if current != provided or check['status'] != 'unit_missing':
                    return Response({
                        'detail': 'تغير وضع القطاع أو الوحدة بعد المعاينة؛ لم يُنشأ أي سجل.'
                    }, status=409)

                created = OrganizationUnit.objects.create(
                    code=DRAFT_CODE, name=UNIT_NAME,
                    kind=OrganizationUnit.Kind.UNIT,
                    parent=sector, health_center=None,
                    is_active=True, is_approved=False,
                    approval_reference='',
                    source_sheet='V4 confirmed sector-direct draft',
                    source_path=SOURCE_PATH,
                    source_rows='',
                )
                OrganizationUnitApprovalLog.objects.create(
                    unit=created, action='create-draft', user=request.user,
                )
                AuditLog.objects.create(
                    user=str(request.user),
                    action='v4_direct_sector_unit_draft_created',
                    model_name='OrganizationUnit',
                    record_id=str(created.pk),
                )
            return Response({
                'id': created.pk, 'code': created.code, 'name': created.name,
                'parent_id': sector.pk, 'sector_name': sector.name,
                'kind': created.kind, 'is_active': created.is_active,
                'is_approved': created.is_approved, 'employee_changes': 0,
                'health_center_changes': 0, 'created_count': 1,
                'notice': 'حُفظت الوحدة مسودة تحت القطاع مباشرة. ربط الموظفين وتفعيل استخدام الوحدة يتطلبان إجراءين منفصلين.',
            }, status=201)
        except IntegrityError:
            return Response({
                'detail': 'حدث إنشاء متزامن أو تعارض؛ أعد الفحص قبل أي محاولة.'
            }, status=409)
