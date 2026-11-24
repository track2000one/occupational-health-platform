"""V4-only read-only preflight for confirmed sector-direct administrative units.

The user confirmed that the full-checkup administrative unit reports directly
to Eastern Consultative Sector 1. This endpoint only checks current DB state;
it never creates organizational units, changes their parents, approves units,
or modifies employee records. A separate audited write workflow is required.
"""
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import OrganizationUnit
from .organization_structure import draft_import_scope


SECTOR_NAME = 'القطاع الشرقي الاستشاري 1'
UNIT_NAME = 'الوحدة الإدارية للفحص الشامل'


def inspect_full_checkup_unit():
    sectors = list(OrganizationUnit.objects.filter(
        kind=OrganizationUnit.Kind.SECTOR, name=SECTOR_NAME,
    ).only('pk', 'name', 'code', 'is_active', 'is_approved', 'parent_id', 'health_center_id'))
    units = list(OrganizationUnit.objects.filter(
        kind=OrganizationUnit.Kind.UNIT, name=UNIT_NAME,
    ).only('pk', 'name', 'code', 'is_active', 'is_approved', 'parent_id', 'health_center_id'))

    result = {
        'sector_name': SECTOR_NAME,
        'unit_name': UNIT_NAME,
        'source_record_count': 8,
        'sector_matches': len(sectors),
        'unit_matches': len(units),
        'sector_id': None,
        'unit_id': None,
        'sector_active': False,
        'sector_activated': False,
        'unit_activated': False,
        'linked': False,
        'can_create_link': False,
        'employees_modified': 0,
        'read_only': True,
    }
    if not sectors:
        result.update(status='sector_missing',
                      detail='لم يُعثر على القطاع الشرقي الاستشاري 1 في سجل الجهات؛ يلزم تأسيسه أو مطابقة اسمه أولًا.')
        return result
    if len(sectors) > 1:
        result.update(status='sector_ambiguous',
                      detail='يوجد أكثر من سجل بهذا الاسم للقطاع؛ يلزم حل التكرار قبل الربط.')
        return result

    sector = sectors[0]
    result.update(sector_id=sector.pk, sector_active=sector.is_active,
                  sector_activated=sector.is_approved)
    if not sector.is_active or sector.parent_id or sector.health_center_id:
        result.update(status='sector_invalid',
                      detail='القطاع غير نشط أو يتبع جهة غير متوقعة؛ يلزم مراجعة سجل الجهات.')
        return result
    if not units:
        result.update(status='unit_missing', can_create_link=True,
                      detail='القطاع موجود، لكن الوحدة غير مسجلة؛ إنشاء وحدة مرتبطة بالقطاع يحتاج إجراء منفصلًا بصلاحية المسؤول.')
        return result
    if len(units) > 1:
        result.update(status='unit_ambiguous',
                      detail='توجد أكثر من وحدة بالاسم نفسه؛ يلزم مراجعتها قبل إنشاء ارتباط جديد.')
        return result

    unit = units[0]
    result.update(unit_id=unit.pk, unit_activated=unit.is_approved)
    if unit.parent_id == sector.pk and unit.health_center_id is None and unit.is_active:
        result.update(status='already_linked', linked=True,
                      detail='الوحدة موجودة وتتبع القطاع مباشرة. الفحص لا يعني أن الربط مسموح لاستخدام الموظفين بعد.')
    else:
        result.update(status='unit_conflict',
                      detail='الوحدة موجودة بتبعية أخرى أو غير نشطة؛ لا يجوز إعادة ربطها تلقائيًا.')
    return result


class V4SectorDirectUnitPreflightView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        if not request.user.is_superuser or draft_import_scope() != 'v4':
            return Response({'detail': 'الفحص متاح لمسؤول نسخة V4 المعزولة فقط.'}, status=403)
        return Response(inspect_full_checkup_unit())
