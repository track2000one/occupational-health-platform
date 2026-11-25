"""Organization matching-file intake and approval. No employee writes or implicit approvals."""
from collections import Counter
from hashlib import sha256
from io import BytesIO
import re
import os
import zipfile

from django.db import connections, transaction
from django.utils import timezone
from openpyxl import load_workbook
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AuditLog, HealthCenter, OrganizationUnit, OrganizationUnitApprovalLog
from .v4_department_paths import v4_department_path

MAX_FILE_SIZE = 5 * 1024 * 1024
MAX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024
MAX_ROWS_PER_SHEET = 250
IMPORT_MARKER = 'IMPORT_ORGANIZATION_DRAFTS_ONLY'
EXPECTED_SHEETS = ('المراكز المقترحة', 'وحدات المراكز', 'جهات مركزية')
STAGING_PROJECT = 'cf4b2162-5236-4f92-b010-165f505fe2c2'
V4_PROJECT = 'b03e2139-48b5-4f93-ad71-0344dc1fd56d'
V4_ENVIRONMENT = '38c01e11-bf2d-4279-b7a7-d3194412d10b'
V4_SERVICE = '3efc83d4-9a5a-4f17-bacb-3ed45b6fde32'
V4_DB_HOST = 'postgres-9ev.railway.internal'


def draft_import_scope():
    """Allow existing isolated Staging or explicitly enabled, isolated V4 backend only."""
    if (os.getenv('STAGING_MODE', '').lower() == 'true'
            and os.getenv('RAILWAY_PROJECT_ID') == STAGING_PROJECT):
        return 'staging'
    if (os.getenv('OHP_V4_CENTER_DRAFT_IMPORT_ENABLED', '').lower() == 'true'
            and os.getenv('RAILWAY_PROJECT_ID') == V4_PROJECT
            and os.getenv('RAILWAY_ENVIRONMENT_ID') == V4_ENVIRONMENT
            and os.getenv('RAILWAY_SERVICE_ID') == V4_SERVICE
            and str(connections['default'].settings_dict.get('HOST', '')).lower() == V4_DB_HOST):
        return 'v4'
    return ''


def clean(value):
    return re.sub(r'\s+', ' ', str(value or '').strip())


def unique_sector_code(name):
    return 'TMP-S-' + sha256(clean(name).encode('utf-8')).hexdigest()[:12].upper()


def read_matching_workbook(upload):
    """Read only mapped reference sheets. Source workbook bytes are never retained."""
    if not upload or not upload.name.lower().endswith('.xlsx') or upload.size > MAX_FILE_SIZE:
        raise ValueError('Select the organizational matching XLSX file (maximum 5 MB).')
    content = upload.read(MAX_FILE_SIZE + 1)
    if len(content) > MAX_FILE_SIZE:
        raise ValueError('The matching file is too large.')
    try:
        with zipfile.ZipFile(BytesIO(content)) as archive:
            if sum(part.file_size for part in archive.infolist()) > MAX_UNCOMPRESSED_BYTES:
                raise ValueError('Uncompressed workbook is too large.')
        book = load_workbook(BytesIO(content), read_only=True, data_only=True)
    except (zipfile.BadZipFile, OSError, ValueError) as exc:
        raise ValueError('Invalid or unsafe XLSX workbook.') from exc
    try:
        if any(name not in book.sheetnames for name in EXPECTED_SHEETS):
            raise ValueError('The three matching sheets are required. Use the approved review template.')
        rows = {}
        for sheet_name in EXPECTED_SHEETS:
            sheet = book[sheet_name]
            if sheet.max_row > MAX_ROWS_PER_SHEET:
                raise ValueError(f'Too many rows in {sheet_name}.')
            values = list(sheet.iter_rows(min_row=4, max_col=14, values_only=True))
            if not values:
                raise ValueError(f'Missing headers in {sheet_name}.')
            rows[sheet_name] = [list(row) for row in values[1:] if clean(row[0])]
        plans = {}
        center_codes = set()
        sector_codes = {}
        for row in rows['المراكز المقترحة']:
            code, sector, name = [clean(row[idx]) for idx in (0, 1, 2)]
            if not re.fullmatch(r'TMP-C\d{3}', code) or not sector or not name:
                raise ValueError('Invalid center reference or incomplete sector/center name.')
            sector_code = sector_codes.setdefault(sector, unique_sector_code(sector))
            plans[sector_code] = {
                'code': sector_code, 'name': sector, 'kind': 'sector',
                'parent_code': None, 'source_path': sector,
                'source_sheet': 'المراكز المقترحة', 'source_rows': '',
            }
            if code in center_codes:
                raise ValueError('Duplicate center reference in the template.')
            center_codes.add(code)
            plans[code] = {
                'code': code, 'name': name, 'kind': 'center',
                'parent_code': sector_code, 'source_path': clean(row[8]),
                'source_sheet': 'المراكز المقترحة', 'source_rows': clean(row[4]),
            }
        for row in rows['وحدات المراكز']:
            code, name, center_ref = clean(row[0]), clean(row[3]), clean(row[10])
            if not re.fullmatch(r'TMP-U\d{3}', code) or not name or center_ref not in center_codes:
                raise ValueError('A unit has no valid center or reference.')
            if code in plans:
                raise ValueError('Duplicate organizational reference in the template.')
            plans[code] = {
                'code': code, 'name': name, 'kind': 'unit',
                'parent_code': center_ref, 'source_path': clean(row[7]),
                'source_sheet': 'وحدات المراكز', 'source_rows': clean(row[6]),
            }
        for row in rows['جهات مركزية']:
            code, name = clean(row[0]), clean(row[2])
            if not re.fullmatch(r'TMP-O\d{3}', code) or not name:
                raise ValueError('Invalid central organization reference.')
            if code in plans:
                raise ValueError('Duplicate central reference in the template.')
            plans[code] = {
                'code': code, 'name': name, 'kind': 'department',
                # The proposed parent is NOT a verified organizational relationship.
                'parent_code': None, 'source_path': clean(row[3]),
                'source_sheet': 'جهات مركزية', 'source_rows': clean(row[6]),
            }
        return list(plans.values())
    finally:
        book.close()


def readiness(item):
    """Review status is informative only; backend remains final approval authority."""
    if item.is_approved:
        return 'approved'
    if item.parent_id and not item.parent.is_approved:
        return 'await_parent'
    if item.kind == 'center' and (
        not item.health_center_id or not item.health_center.is_active
    ):
        return 'needs_center_mapping'
    if item.kind == 'unit' and (
        not item.parent_id or item.parent.kind != 'center'
        or not item.parent.health_center_id
    ):
        return 'await_parent'
    return 'ready'


def payload(item):
    return {
        'id': item.pk, 'code': item.code, 'name': item.name, 'kind': item.kind,
        'parent_id': item.parent_id, 'parent_code': item.parent.code if item.parent_id else '',
        'parent_name': item.parent.name if item.parent_id else '',
        'health_center_id': item.health_center_id,
        'health_center_name': item.health_center.name if item.health_center_id else '',
        'source_path': item.source_path, 'source_rows': item.source_rows,
        'is_approved': item.is_approved, 'is_active': item.is_active,
        'approval_reference': item.approval_reference,
        'review_status': readiness(item),
    }


class OrganizationDirectoryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        # Non-admin users never see pending organizational proposals.
        units = OrganizationUnit.objects.select_related('parent', 'health_center').filter(is_active=True)
        if not request.user.is_staff:
            units = units.filter(is_approved=True)
        if request.query_params.get('approved') == '1':
            units = units.filter(is_approved=True)
        items = list(units.order_by('kind', 'name', 'pk')[:1000])
        return Response({
            'results': [payload(u) for u in items],
            'summary': {
                'total': len(items),
                'approved': sum(u.is_approved for u in items),
                'pending': sum(not u.is_approved for u in items),
                'by_kind': dict(Counter(u.kind for u in items)),
                'by_review_status': dict(Counter(readiness(u) for u in items)),
                'mapped_centers': sum(
                    u.kind == 'center' and bool(u.health_center_id) for u in items
                ),
            },
        })


V4_DEPARTMENT_MARKER = 'IMPORT_V4_DEPARTMENT_DRAFTS_ONLY'
V4_DEPARTMENT_SHEET = 'V4_Departments'
V4_DEPARTMENT_HEADERS = ('main_department', 'sub_department', 'section', 'sub_unit')
V4_MISSING_LABELS = {'غير محدد في المصدر', 'لا ينطبق', 'غير محدد', 'N/A', 'n/a'}


def read_v4_department_workbook(upload):
    """Read a dedicated, organizational-only workbook; no roster fields."""
    if not upload or not upload.name.lower().endswith('.xlsx') or upload.size > MAX_FILE_SIZE:
        raise ValueError('Select the V4 department-only XLSX (maximum 5 MB).')
    content = upload.read(MAX_FILE_SIZE + 1)
    if len(content) > MAX_FILE_SIZE:
        raise ValueError('Workbook is too large.')
    with zipfile.ZipFile(BytesIO(content)) as archive:
        if sum(part.file_size for part in archive.infolist()) > MAX_UNCOMPRESSED_BYTES:
            raise ValueError('Uncompressed workbook is too large.')
    book = load_workbook(BytesIO(content), read_only=True, data_only=False)
    try:
        if book.sheetnames != [V4_DEPARTMENT_SHEET]:
            raise ValueError('Use only the dedicated V4_Departments sheet.')
        sheet = book[V4_DEPARTMENT_SHEET]
        # Missing or incorrect worksheet dimension metadata must not crash or
        # silently truncate the workbook. Bound iteration independently.
        sheet.reset_dimensions()
        plans = {}
        paths = set()
        for index, row in enumerate(sheet.iter_rows(min_row=1, max_col=5, values_only=False), 1):
            if index > MAX_ROWS_PER_SHEET:
                raise ValueError('Too many department rows.')
            if any(cell.data_type == 'f' for cell in row):
                raise ValueError('Formulas are not allowed in organizational labels.')
            values = [clean(cell.value) for cell in row]
            if index == 1:
                if tuple(values[:4]) != V4_DEPARTMENT_HEADERS or values[4]:
                    raise ValueError('Invalid V4 department headers.')
                continue
            if not any(values):
                continue
            if values[4]:
                raise ValueError('Unexpected fifth column.')
            labels = values[:4]
            if not labels[0] or any(v in V4_MISSING_LABELS for v in labels):
                raise ValueError('Use blank cells for unspecified trailing levels.')
            path = tuple(v for v in labels if v)
            if list(path) != labels[:len(path)]:
                raise ValueError('Missing intermediate department level.')
            if any(len(v) > 220 or '/' in v or v.startswith('القطاع ') for v in path):
                raise ValueError('Invalid department label or sector in department path.')
            if path in paths:
                raise ValueError('Duplicate department path.')
            paths.add(path)
            for depth in range(1, len(path) + 1):
                prefix = path[:depth]
                code = 'V4-D-' + sha256('\x1f'.join(prefix).encode('utf-8')).hexdigest()[:24].upper()
                parent = ('V4-D-' + sha256('\x1f'.join(prefix[:-1]).encode('utf-8')).hexdigest()[:24].upper()
                          if depth > 1 else None)
                plans[code] = dict(code=code, name=prefix[-1], kind='department',
                                   parent_code=parent, source_path=' / '.join(prefix),
                                   source_sheet=V4_DEPARTMENT_SHEET, source_rows='')
        if not plans:
            raise ValueError('No department paths supplied.')
        return list(plans.values())
    finally:
        book.close()


def import_v4_department_drafts(request):
    """Separate V4-only review path; never changes existing records or assignments."""
    if (draft_import_scope() != 'v4'
            or os.getenv('OHP_V4_DEPARTMENT_DRAFT_IMPORT_ENABLED', '').lower() != 'true'
            or not request.user.is_superuser):
        return Response({'detail': 'V4 department intake is disabled or outside the isolated V4 scope.'}, status=403)
    try:
        plans = read_v4_department_workbook(request.FILES.get('file'))
    except (ValueError, TypeError, OSError, zipfile.BadZipFile) as exc:
        return Response({'detail': str(exc)}, status=400)
    result = {'total': len(plans), 'kinds': {'department': len(plans)},
              'preview': plans, 'created': 0, 'mode': 'preview',
              'notice': 'No approvals or employee assignments were changed.'}
    if clean(request.data.get('confirm')) != V4_DEPARTMENT_MARKER:
        return Response(result)
    with transaction.atomic():
        existing = {u.code: u for u in OrganizationUnit.objects.select_for_update().order_by('pk')}
        for plan in plans:
            previous = existing.get(plan['code'])
            if previous and (previous.name != plan['name'] or previous.kind != 'department'
                    or (previous.parent.code if previous.parent_id else None) != plan['parent_code']
                    or previous.health_center_id or not previous.is_active):
                return Response({'detail': 'Existing department reference conflicts; no writes.'}, status=409)
            parent = existing.get(plan['parent_code'])
            if (plan['parent_code'] is None or parent is not None) and any(
                    u.kind == 'department' and u.parent_id == (parent.pk if parent else None)
                    and clean(u.name).casefold() == plan['name'].casefold()
                    and u.code != plan['code'] for u in existing.values()):
                return Response({'detail': 'Existing department name and parent conflict; no writes.'}, status=409)
        for plan in plans:
            parent = existing.get(plan['parent_code'])
            if plan['parent_code'] and parent is None:
                raise ValueError('Unexpected missing department parent.')
            unit = existing.get(plan['code'])
            if unit is None:
                unit = OrganizationUnit.objects.create(
                    code=plan['code'], name=plan['name'], kind='department', parent=parent,
                    source_path=plan['source_path'], source_sheet=V4_DEPARTMENT_SHEET,
                    is_approved=False)
                existing[unit.code] = unit
                result['created'] += 1
                OrganizationUnitApprovalLog.objects.create(unit=unit, action='create-draft', user=request.user)
        AuditLog.objects.create(user=str(request.user), action='v4_department_draft_import',
                                model_name='OrganizationUnit', record_id='v4')
    result['mode'] = 'draft'
    return Response(result, status=201)


class OrganizationImportView(APIView):
    permission_classes = [permissions.IsAdminUser]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        if clean(request.data.get('phase')) == 'departments':
            return import_v4_department_drafts(request)
        try:
            plans = read_matching_workbook(request.FILES.get('file'))
        except (ValueError, TypeError) as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        counts = Counter(p['kind'] for p in plans)
        results = {'total': len(plans), 'kinds': dict(counts),
                   'preview': plans[:12], 'created': 0,
                   'mode': 'preview', 'notice': 'No approvals or employee assignments were changed.'}
        if clean(request.data.get('confirm')) != IMPORT_MARKER:
            return Response(results)
        # Never open the existing live backend to draft imports.
        scope = draft_import_scope()
        if not scope:
            return Response({'detail': 'Draft import is restricted to an authorized isolated environment.'},
                            status=status.HTTP_403_FORBIDDEN)
        if not request.user.is_superuser:
            return Response({'detail': 'A superuser must import draft organizational data.'},
                            status=status.HTTP_403_FORBIDDEN)
        # Phase 1 of V4: preserve only reviewed sector/center proposals.
        # Department hierarchy requires a dedicated reviewed intake design.
        if scope == 'v4' and (not plans or any(
                p['kind'] not in ('sector', 'center') for p in plans)):
            return Response({'detail': 'V4 currently accepts sector and center drafts only.'},
                            status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            for plan in plans:
                prev = OrganizationUnit.objects.filter(code=plan['code']).first()
                if prev:
                    if (prev.name, prev.kind, prev.parent.code if prev.parent_id else '') != (
                        plan['name'], plan['kind'], plan['parent_code'] or ''):
                        return Response({'detail': f'Existing reference {plan["code"]} conflicts; no records changed.'},
                                        status=status.HTTP_409_CONFLICT)
            for plan in plans:
                parent = (OrganizationUnit.objects.get(code=plan['parent_code'])
                          if plan['parent_code'] else None)
                unit, created = OrganizationUnit.objects.get_or_create(
                    code=plan['code'],
                    defaults={
                        'name': plan['name'], 'kind': plan['kind'], 'parent': parent,
                        'source_path': plan['source_path'], 'source_sheet': plan['source_sheet'],
                        'source_rows': plan['source_rows'], 'is_approved': False,
                    },
                )
                results['created'] += int(created)
            AuditLog.objects.create(user=str(request.user), action='organization_draft_import',
                                    model_name='OrganizationUnit', record_id=scope)
        results['mode'] = 'draft'
        return Response(results, status=status.HTTP_201_CREATED)


class OrganizationUnitReviewView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, pk):
        if not request.user.is_superuser:
            return Response({'detail': 'Organizational approval requires a superuser.'},
                            status=status.HTTP_403_FORBIDDEN)
        action = clean(request.data.get('action'))
        ref = clean(request.data.get('approval_reference'))
        # Explicit V4-only operational activation is distinct from formal approval.
        operational = action == 'activate'
        if operational:
            from .v4_operational_activation import operational_activation_enabled
            if not operational_activation_enabled():
                return Response({'detail': 'التفعيل التشغيلي غير متاح خارج V4 المعزولة.'},
                                status=403)
            if request.data.get('confirmed') is not True:
                return Response({'detail': 'يلزم تأكيد التفعيل التشغيلي.'}, status=400)
            ref = ''
        with transaction.atomic():
            unit = OrganizationUnit.objects.select_for_update().filter(pk=pk).first()
            if not unit:
                return Response({'detail': 'Organization not found.'}, status=404)
            if unit.is_approved:
                return Response({'detail': 'Already approved. Revisions require a separate review.'}, status=409)
            if action == 'edit-draft':
                # Adjust only a proposal's display name; its original source_path,
                # organization ID, approved parent, and employee links remain intact.
                name = clean(request.data.get('name'))
                if not name or len(name) > 220:
                    return Response({'detail': 'Provide a valid organization name (1–220 characters).'}, status=400)
                if name == unit.name:
                    return Response({'detail': 'No changes to save.'}, status=400)
                if OrganizationUnit.objects.filter(
                    kind=unit.kind, parent_id=unit.parent_id, name=name, is_active=True,
                ).exclude(pk=unit.pk).exists():
                    return Response({'detail': 'Another organizational unit with this name exists under the same parent.'}, status=409)
                unit.name = name
                unit.save(update_fields=['name', 'updated_at'])
            elif action == 'map-center':
                if unit.kind != 'center':
                    return Response({'detail': 'Only a center entry can be mapped to a health center.'}, status=400)
                center = HealthCenter.objects.filter(pk=request.data.get('center_id'), is_active=True).first()
                if not center:
                    return Response({'detail': 'Choose an active center.'}, status=400)
                # Never permit a registered center to be mapped to two
                # different proposed organizational centers.
                if OrganizationUnit.objects.filter(
                    kind='center', is_active=True, health_center=center,
                ).exclude(pk=unit.pk).exists():
                    return Response({
                        'detail': 'This health center is already mapped to another organizational center.'
                    }, status=409)
                unit.health_center = center
                unit.save(update_fields=['health_center', 'updated_at'])
            elif action in ('approve', 'activate'):
                if not unit.is_active:
                    return Response({'detail': 'لا يمكن اعتماد جهة غير نشطة.'}, status=409)
                if unit.kind == 'department' and unit.code.startswith('V4-D-'):
                    if (draft_import_scope() != 'v4'
                            or os.getenv('OHP_V4_DEPARTMENT_DRAFT_IMPORT_ENABLED', '').lower() != 'true'):
                        return Response({'detail': 'V4 department approval is restricted to isolated V4.'}, status=403)
                    if not v4_department_path(unit, require_leaf_approved=False):
                        return Response({'detail': 'اعتمد الجهات الأعلى أولاً، وتحقق من سلامة التسلسل وعدم ارتباطه بمركز صحي.'}, status=409)
                elif unit.kind == 'department' and (unit.health_center_id or unit.parent_id):
                    return Response({'detail': 'القسم المركزي يجب ألا يكون مرتبطًا بمركز صحي أو بجهة أعلى غير معتمدة لهذا التصنيف.'}, status=409)
                if not operational and (len(ref) < 3 or len(ref) > 255):
                    return Response({'detail': 'Enter an official approval reference (3–255 characters).'}, status=400)
                if unit.parent_id and not unit.parent.is_approved:
                    return Response({'detail': 'Approve the parent sector or center first.'}, status=409)
                if unit.kind == 'center' and (
                    not unit.health_center_id or not unit.health_center.is_active
                ):
                    return Response({'detail': 'Map the center to an active registered health center first.'}, status=409)
                if unit.kind == 'unit':
                    if (unit.parent.kind != 'center' or not unit.parent.health_center_id
                            or not unit.parent.health_center.is_active):
                        return Response({'detail': 'The parent center must have an approved health-center mapping.'}, status=409)
                    unit.health_center_id = unit.parent.health_center_id
                unit.is_approved = True
                unit.approved_by = request.user
                unit.approved_at = timezone.now()
                unit.approval_reference = '' if operational else ref
                unit.save()
            else:
                return Response({'detail': 'Action must be map-center or approve.'}, status=400)
            OrganizationUnitApprovalLog.objects.create(
                unit=unit, action='v4-activate' if operational else action,
                approval_reference=ref, user=request.user)
            AuditLog.objects.create(
                user=str(request.user),
                action='v4_operational_activate_organization' if operational else 'organization_' + action,
                model_name='OrganizationUnit', record_id=str(unit.pk),
            )
        unit.refresh_from_db()
        return Response(payload(OrganizationUnit.objects.select_related('parent', 'health_center').get(pk=unit.pk)))
