"""Administrative department directory backed by the canonical OrganizationUnit model.

Creation is always a DRAFT; only explicit approval with an official reference
permits its use for employee affiliation. Existing staff/clinical records are never
rewritten by these endpoints. No synthetic HealthCenter is created.
"""
import re
import uuid
from hashlib import sha256

from django.db import IntegrityError, transaction
from django.db.models import Count
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AuditLog, OrganizationUnit, OrganizationUnitApprovalLog
from .organization_structure import clean, draft_import_scope, V4_MISSING_LABELS


def is_department_admin(request):
    return bool(request.user.is_authenticated and request.user.is_superuser)


def department_payload(unit):
    return {
        'id': unit.pk,
        'name': unit.name,
        'code': unit.code,
        'is_active': unit.is_active,
        'is_approved': unit.is_approved,
        'approval_reference': unit.approval_reference,
        'health_center_id': unit.health_center_id,
        'parent_id': unit.parent_id,
        'employee_count': unit.employee_count,
        'created_at': unit.created_at.isoformat(),
        'updated_at': unit.updated_at.isoformat(),
    }


def duplicate_name(name, exclude_pk=None):
    records = OrganizationUnit.objects.filter(kind=OrganizationUnit.Kind.DEPARTMENT, name__iexact=name)
    if exclude_pk is not None:
        records = records.exclude(pk=exclude_pk)
    return records.exists()



V4_PATH_LEVELS = ('main_administration', 'sub_administration', 'department', 'sub_unit')


def create_v4_department_hierarchy(request):
    """Create one reviewed draft path in V4, reusing existing prefixes atomically.

    Does not activate any unit or touch Employee/HealthCenter. A prefix with
    a different existing code or parent must be resolved, not duplicated.
    """
    if draft_import_scope() != 'v4':
        return Response({'detail': 'هذه الميزة مخصصة لنسخة V4 المعزولة.'}, status=403)
    if set(request.data) != {'hierarchy'} or not isinstance(request.data['hierarchy'], dict):
        return Response({'detail': 'استخدم حقول التسلسل التنظيمي المحددة فقط.'}, status=400)
    source = request.data['hierarchy']
    if set(source) - set(V4_PATH_LEVELS):
        return Response({'detail': 'حقول غير معروفة ضمن التسلسل التنظيمي.'}, status=400)
    values = [clean(source.get(key)) for key in V4_PATH_LEVELS]
    if not values[0]:
        return Response({'detail': 'الإدارة الرئيسية مطلوبة.'}, status=400)
    path = tuple(label for label in values if label)
    if list(path) != values[:len(path)]:
        return Response({'detail': 'لا يمكن تجاوز مستوى تنظيمي وسيط.'}, status=400)
    if (any(label in V4_MISSING_LABELS or len(label) > 220
            or '/' in label or label.startswith('القطاع ') for label in path)
            or path[0] == 'التشغيل'):
        return Response({
            'detail': 'اسم غير صالح أو مسار مستبعد من التأسيس؛ راجع ملف المصدر والتسلسل.'
        }, status=400)
    try:
        with transaction.atomic():
            created = []
            parent = None
            final = None
            for depth in range(1, len(path) + 1):
                prefix = path[:depth]
                expected_code = 'V4-D-' + sha256(
                    '\x1f'.join(prefix).encode('utf-8')
                ).hexdigest()[:24].upper()
                existing = OrganizationUnit.objects.select_for_update().filter(
                    code=expected_code,
                ).first()
                if existing:
                    if (existing.name != prefix[-1] or
                            existing.kind != OrganizationUnit.Kind.DEPARTMENT or
                            existing.parent_id != (parent.pk if parent else None) or
                            existing.health_center_id or not existing.is_active):
                        return Response({'detail': 'تعارض في التسلسل الحالي؛ لم تُجرَ أي إضافة.'},
                                        status=409)
                else:
                    conflict = OrganizationUnit.objects.select_for_update().filter(
                        name__iexact=prefix[-1], kind=OrganizationUnit.Kind.DEPARTMENT,
                        parent=parent,
                    ).first()
                    if conflict is not None:
                        return Response({
                            'detail': 'المستوى التنظيمي موجود برمز مختلف؛ راجع السجل بدل إنشاء نسخة مكررة.'
                        }, status=409)
                    existing = OrganizationUnit.objects.create(
                        code=expected_code, name=prefix[-1],
                        kind=OrganizationUnit.Kind.DEPARTMENT, parent=parent,
                        health_center=None, is_active=True, is_approved=False,
                        source_sheet='V4 manual hierarchical foundation',
                        source_path=' / '.join(prefix),
                        source_rows='',
                    )
                    created.append(existing)
                    OrganizationUnitApprovalLog.objects.create(
                        unit=existing, action='create-draft', user=request.user,
                    )
                parent = existing
                final = existing
            if not created:
                return Response({
                    'detail': 'المسار التنظيمي موجود بالفعل؛ يمكن مراجعته أو تفعيله.'
                }, status=409)
            AuditLog.objects.create(
                user=str(request.user),
                action='v4_manual_hierarchical_department_created',
                model_name='OrganizationUnit', record_id=str(final.pk),
            )
            final.employee_count = 0
            return Response({
                'department': department_payload(final),
                'created_count': len(created),
                'reused_count': len(path) - len(created),
                'notice': 'حُفظ التسلسل التنظيمي كمسودة. يلزم تفعيله قبل ربط الموظفين به.',
            }, status=status.HTTP_201_CREATED)
    except IntegrityError:
        return Response({'detail': 'تعارض متزامن في التسلسل؛ أعد تحديث السجل.'}, status=409)



class DepartmentDirectoryView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        rows = list(OrganizationUnit.objects.filter(
            kind=OrganizationUnit.Kind.DEPARTMENT,
        ).annotate(employee_count=Count('employees', distinct=True))
                    .order_by('name', 'pk')[:3000])
        return Response({
            'results': [department_payload(unit) for unit in rows],
            'summary': {
                'total': len(rows),
                'active': sum(unit.is_active for unit in rows),
                'approved': sum(unit.is_approved and unit.is_active for unit in rows),
                'pending': sum(not unit.is_approved for unit in rows),
                'inactive': sum(not unit.is_active for unit in rows),
                'employees': sum(unit.employee_count for unit in rows),
            },
        }, headers={'Cache-Control': 'private, no-store'})

    def post(self, request):
        if not is_department_admin(request):
            return Response({'detail': 'تأسيس الأقسام متاح للمسؤول الأعلى فقط.'}, status=403)
        if 'hierarchy' in request.data:
            return create_v4_department_hierarchy(request)
        allowed = {'name', 'code'}
        if any(key not in allowed for key in request.data):
            return Response({'detail': 'الحقول المرسلة غير معروفة.'}, status=400)
        name = clean(request.data.get('name'))
        code = clean(request.data.get('code')).upper()
        if not 3 <= len(name) <= 220:
            return Response({'name': 'أدخل اسم القسم (3 إلى 220 حرفًا).'}, status=400)
        if code and (not re.fullmatch(r'[A-Z][A-Z0-9_-]{2,39}', code) or code.startswith('TMP')):
            return Response({'code': 'الرمز الرسمي يجب أن يبدأ بحرف إنجليزي ويضم 3–40 رمزًا، وليس رمزًا مؤقتًا TMP.'}, status=400)
        if duplicate_name(name):
            return Response({'name': 'القسم موجود مسبقًا، ويمكن مراجعة سجله أو إعادة تفعيله بدل تكراره.'}, status=409)
        if code and OrganizationUnit.objects.filter(code__iexact=code).exists():
            return Response({'code': 'هذا الرمز مستخدم مسبقًا.'}, status=409)
        if not code:
            code = 'DEP-' + uuid.uuid4().hex[:12].upper()
        try:
            with transaction.atomic():
                unit = OrganizationUnit.objects.create(
                    name=name, code=code, kind=OrganizationUnit.Kind.DEPARTMENT,
                    is_approved=False, is_active=True, parent=None,
                    health_center=None, source_sheet='Manual department directory',
                    source_path='تأسيس يدوي — بانتظار الاعتماد',
                )
                OrganizationUnitApprovalLog.objects.create(
                    unit=unit, action='create-draft', user=request.user,
                )
                AuditLog.objects.create(
                    user=str(request.user), action='department_draft_created',
                    model_name='OrganizationUnit', record_id=str(unit.pk),
                )
        except IntegrityError:
            return Response({'detail': 'تعارض في اسم القسم أو الرمز، يرجى تحديث القائمة وإعادة المحاولة.'}, status=409)
        unit.employee_count = 0
        return Response({
            'department': department_payload(unit),
            'notice': 'تم تأسيس القسم كمسودة، ولن يظهر في خيارات الموظفين إلا بعد الاعتماد.',
        }, status=status.HTTP_201_CREATED)


class DepartmentStatusView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, pk):
        if not is_department_admin(request):
            return Response({'detail': 'إدارة حالة الأقسام متاحة للمسؤول الأعلى فقط.'}, status=403)
        enabled = request.data.get('is_active')
        reason = clean(request.data.get('reason'))
        if type(enabled) is not bool:
            return Response({'is_active': 'يلزم تحديد حالة التفعيل صراحة.'}, status=400)
        if not 10 <= len(reason) <= 255:
            return Response({'reason': 'اكتب سببًا توثيقيًا من 10 إلى 255 حرفًا.'}, status=400)
        with transaction.atomic():
            unit = OrganizationUnit.objects.select_for_update().filter(
                pk=pk, kind=OrganizationUnit.Kind.DEPARTMENT,
            ).first()
            if unit is None:
                return Response({'detail': 'القسم غير موجود.'}, status=404)
            if unit.is_active == enabled:
                return Response({'detail': 'القسم في هذه الحالة بالفعل.'}, status=409)
            if not enabled and (
                unit.employees.exists() or unit.children.exists()
            ):
                return Response({
                    'detail': 'لا يمكن إيقاف قسم مرتبط بموظفين أو وحدات تنظيمية؛ يجب معالجة الارتباطات بقرار معتمد أولًا.'
                }, status=409)
            if enabled and duplicate_name(unit.name, exclude_pk=unit.pk):
                return Response({'detail': 'يوجد قسم آخر يحمل الاسم نفسه؛ يلزم حل التعارض أولًا.'}, status=409)
            unit.is_active = enabled
            unit.save(update_fields=['is_active', 'updated_at'])
            action = 'reactivate' if enabled else 'deactivate'
            OrganizationUnitApprovalLog.objects.create(
                unit=unit, action=action, approval_reference=reason, user=request.user,
            )
            AuditLog.objects.create(
                user=str(request.user), action='department_' + action,
                model_name='OrganizationUnit', record_id=str(unit.pk),
            )
        return Response({'id': unit.pk, 'is_active': enabled, 'notice': 'تم حفظ الحالة مع سجل تدقيق.'})
