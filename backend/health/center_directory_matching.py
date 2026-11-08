"""Safe, user-reviewed center-and-unit matching from the ten-sheet cleaned directory.

Only two declared Excel tabs are read; employee rows and any other tabs are
ignored. Preview never writes. Commit only supplements DRAFT organization
metadata and creates DRAFT organization units for already existing centers.
It never creates centers, alters official center names, approves sectors or
reassigns employees. Each commit uses a short-lived, identity-bound snapshot.
"""
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from hashlib import sha256
from io import BytesIO
import json
import re
import unicodedata
import zipfile

from django.core import signing
from django.db import IntegrityError, transaction
from django.db.models import Q
from rest_framework import permissions
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    AuditLog, HealthCenter, HealthCenterAlias,
    HealthCenterProfileAuditEvent, OrganizationUnit, CenterDirectoryMatchingBatch,
)

CENTER_TAB = 'المراكز_الصحية'
UNIT_TAB = 'وحدات_المراكز'
CENTER_HEADERS = ('م', 'معرف داخلي مؤقت', 'اسم المركز الصحي', 'القطاع المقترح',
                  'المظلة التنظيمية المقترحة')
UNIT_HEADERS = ('م', 'معرف وحدة مؤقت', 'اسم الوحدة الموحد', 'نوع المصدر',
                'معرف المركز', 'المركز الصحي', 'القطاع المقترح')
MAX_SIZE = 6 * 1024 * 1024
MAX_UNZIP = 28 * 1024 * 1024
MAX_ROWS = 250
TOKEN_SALT = 'ohp-directory-excel-match-v1'
TOKEN_AGE = 600


def clean(value):
    if value is None:
        return ''
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', str(value)).replace('ـ', '')).strip()


def key(value):
    return clean(value).casefold()


def safe_cell(value, max_length=255):
    item = clean(value)
    if len(item) > max_length or item.startswith(('=', '+', '@')):
        raise ValueError('ملف Excel يتضمن نصًا غير صالح أو يتجاوز الحد المسموح.')
    return item


def parse_directory(upload):
    if not upload or not upload.name.lower().endswith('.xlsx'):
        raise ValueError('اختر ملف الدليل التنظيمي المنقح بصيغة xlsx.')
    if upload.size > MAX_SIZE:
        raise ValueError('حجم الملف يتجاوز الحد المسموح (6MB).')
    raw = upload.read(MAX_SIZE + 1)
    if len(raw) > MAX_SIZE:
        raise ValueError('حجم الملف يتجاوز الحد المسموح.')
    try:
        with zipfile.ZipFile(BytesIO(raw)) as archive:
            if sum(part.file_size for part in archive.infolist()) > MAX_UNZIP:
                raise ValueError('حجم Excel غير المضغوط كبير جدًا.')
        from openpyxl import load_workbook
        book = load_workbook(BytesIO(raw), read_only=True, data_only=True)
    except (zipfile.BadZipFile, OSError, ValueError, KeyError) as exc:
        raise ValueError('لا يمكن قراءة ملف Excel أو أنه غير آمن.') from exc

    try:
        if CENTER_TAB not in book.sheetnames or UNIT_TAB not in book.sheetnames:
            raise ValueError('الملف يحتاج ورقتي «المراكز_الصحية» و«وحدات_المراكز».')
        centers_sheet, units_sheet = book[CENTER_TAB], book[UNIT_TAB]
        for sheet in (centers_sheet, units_sheet):
            if sheet.max_row and sheet.max_row > MAX_ROWS:
                raise ValueError('عدد صفوف الدليل يتجاوز 250 صفًا.')
        center_rows = list(centers_sheet.iter_rows(min_row=4, max_col=14, values_only=True))
        unit_rows = list(units_sheet.iter_rows(min_row=4, max_col=13, values_only=True))
        if not center_rows or tuple(clean(x) for x in center_rows[0][:5]) != CENTER_HEADERS:
            raise ValueError('عناوين ورقة «المراكز_الصحية» لا تطابق الدليل المنقح.')
        if not unit_rows or tuple(clean(x) for x in unit_rows[0][:7]) != UNIT_HEADERS:
            raise ValueError('عناوين ورقة «وحدات_المراكز» لا تطابق الدليل المنقح.')

        centers = []
        used_ids, used_names = set(), set()
        for rowno, values in enumerate(center_rows[1:], start=5):
            if not any(clean(v) for v in values):
                continue
            ref, name = safe_cell(values[1], 40), safe_cell(values[2], 150)
            sector, parent = safe_cell(values[3], 180), safe_cell(values[4], 180)
            source_rows = safe_cell(values[7], 200)
            if not re.fullmatch(r'HC-\d{3}', ref) or not name or not sector:
                raise ValueError(f'صف المركز {rowno} لا يتضمن معرّفًا أو اسمًا أو قطاعًا صالحًا.')
            if ref in used_ids or key(name) in used_names:
                raise ValueError(f'يوجد مركز مكرر في الدليل، الصف {rowno}.')
            used_ids.add(ref); used_names.add(key(name))
            centers.append({
                'ref': ref, 'name': name, 'sector': sector,
                'parent': parent, 'source_rows': source_rows, 'sheet_row': rowno,
            })
        if not 1 <= len(centers) <= 100:
            raise ValueError('عدد المراكز في ملف المصدر غير متوقع.')
        by_ref = {item['ref']: item for item in centers}
        units = []
        seen_units = set()
        for rowno, values in enumerate(unit_rows[1:], start=5):
            if not any(clean(v) for v in values):
                continue
            ref, name, center_ref = (
                safe_cell(values[1], 40), safe_cell(values[2], 180),
                safe_cell(values[4], 40),
            )
            center_name, sector = safe_cell(values[5], 150), safe_cell(values[6], 180)
            source_rows = safe_cell(values[9], 200)
            if not re.fullmatch(r'UNIT-\d{3}', ref) or not name or center_ref not in by_ref:
                raise ValueError(f'وحدة غير صحيحة أو بلا مركز مرجعي في الصف {rowno}.')
            if key(center_name) != key(by_ref[center_ref]['name']) or sector != by_ref[center_ref]['sector']:
                raise ValueError(f'تبعية الوحدة في الصف {rowno} لا تطابق مرجع المركز.')
            if (center_ref, key(name)) in seen_units:
                raise ValueError(f'الوحدة مكررة داخل المركز في الصف {rowno}.')
            seen_units.add((center_ref, key(name)))
            units.append({
                'ref': ref, 'name': name, 'center_ref': center_ref,
                'source_rows': source_rows, 'sheet_row': rowno,
            })
        if len(units) > 200:
            raise ValueError('عدد الوحدات كبير ويتطلب مراجعة مستقلة.')
        canonical = json.dumps(
            {'centers': centers, 'units': units},
            ensure_ascii=False, sort_keys=True, separators=(',', ':'),
        )
        return {
            'centers': centers, 'units': units, 'digest': sha256(canonical.encode()).hexdigest(),
            'filename': clean(upload.name)[:180],
        }
    finally:
        book.close()


def current_directory(*, lock=False):
    center_query = HealthCenter.objects.all().order_by('pk')
    if lock:
        center_query = center_query.select_for_update()
    centers = list(center_query)
    active = [c for c in centers if not c.is_archived]
    aliases = list(HealthCenterAlias.objects.all().order_by('pk').values(
        'center_id', 'name', 'normalized_name',
    ))
    org_query = OrganizationUnit.objects.all().order_by('pk')
    if lock:
        org_query = org_query.select_for_update()
    units = list(org_query.values(
        'id', 'name', 'code', 'kind', 'parent_id', 'health_center_id',
        'is_approved', 'is_active',
    ))
    # The digest includes only center/organization metadata. No employee data.
    snapshot = {
        'centers': [
            [c.pk, c.name, c.name_ar, c.name_en, c.code, c.is_archived,
             c.proposed_sector_name, c.proposed_parent_name,
             c.organizational_source_reference,
             c.updated_at.isoformat() if c.updated_at else None]
            for c in centers
        ],
        'aliases': [
            [a['center_id'], a['name'], a['normalized_name']] for a in aliases
        ],
        'org_units': [
            [x['id'], x['name'], x['code'], x['kind'],
             x['parent_id'], x['health_center_id'],
             x['is_approved'], x['is_active']]
            for x in units
        ],
    }
    snapshot_hash = sha256(json.dumps(
        snapshot, ensure_ascii=False, sort_keys=True, separators=(',', ':'),
    ).encode()).hexdigest()
    return active, aliases, units, snapshot_hash


def suggest_matches(source, active, aliases):
    names = defaultdict(set)
    for c in active:
        for name in (c.name, c.name_ar, c.name_en):
            if key(name):
                names[key(name)].add(c.pk)
    for a in aliases:
        if key(a['name']):
            names[key(a['name'])].add(a['center_id'])
    valid_ids = {c.pk for c in active}
    found = names.get(key(source['name']), set()) & valid_ids
    matched = sorted(found)
    if len(matched) == 1:
        c = next(x for x in active if x.pk == matched[0])
        direct = any(key(n) == key(source['name']) for n in (c.name, c.name_ar, c.name_en))
        return ('exact' if direct else 'alias'), matched, []
    if len(matched) > 1:
        return 'ambiguous', [], matched
    scores = sorted(
        [
            (SequenceMatcher(None, key(source['name']), key(c.name_ar or c.name)).ratio(), c.pk)
            for c in active
        ], reverse=True,
    )
    return 'unmatched', [], [c_id for ratio, c_id in scores[:3] if ratio >= 0.65]


def normalize_selections(raw):
    if raw in (None, ''):
        return {}
    try:
        decoded = json.loads(raw) if isinstance(raw, str) else raw
    except (ValueError, TypeError):
        raise ValueError('اختيارات المطابقة ليست بصيغة صحيحة.')
    if not isinstance(decoded, dict) or len(decoded) > 100:
        raise ValueError('اختيارات المطابقة غير صالحة.')
    choices = {}
    for ref, val in decoded.items():
        if not re.fullmatch(r'HC-\d{3}', str(ref)):
            raise ValueError('رقم مرجع غير صالح في اختيارات المطابقة.')
        if val is None or val == '':
            choices[ref] = None
        elif isinstance(val, int) and not isinstance(val, bool) and val > 0:
            choices[ref] = val
        else:
            raise ValueError('رقم مركز غير صالح في اختيارات المطابقة.')
    return choices


def normalize_evidence(raw):
    if raw in (None, ''):
        return {}
    try:
        decoded = json.loads(raw) if isinstance(raw, str) else raw
    except (ValueError, TypeError):
        raise ValueError('مراجع المطابقة اليدوية ليست بصيغة صحيحة.')
    if not isinstance(decoded, dict) or len(decoded) > 100:
        raise ValueError('مراجع المطابقة اليدوية غير صحيحة.')
    values = {}
    for ref, value in decoded.items():
        if not re.fullmatch(r'HC-\d{3}', str(ref)):
            raise ValueError('معرف المركز غير صالح في المراجع اليدوية.')
        evidence = safe_cell(value, 250)
        if evidence:
            values[ref] = evidence
    return values


def build_plan(source, active, aliases, org_units, selections, include_units, evidence):
    center_by_id = {c.pk: c for c in active}
    possible = []
    seen_destinations = defaultdict(list)
    all_ids = {src['ref'] for src in source['centers']}
    if any(ref not in all_ids for ref in selections):
        raise ValueError('اختيارات تحتوي رقمًا غير موجود في ملف Excel.')
    for src in source['centers']:
        status_name, exact_ids, suggested = suggest_matches(src, active, aliases)
        chosen = selections.get(src['ref'], exact_ids[0] if exact_ids else None)
        if chosen is not None and chosen not in center_by_id:
            raise ValueError('اختير مركز غير موجود أو مؤرشف في قاعدة البيانات.')
        if chosen:
            seen_destinations[chosen].append(src['ref'])
        evidence_value = evidence.get(src['ref'], '')
        is_auto = bool(chosen and chosen in exact_ids)
        item = {
            **src, 'match_status': status_name,
            'evidence_reference': evidence_value,
            'candidate_ids': suggested, 'chosen_center_id': chosen,
            'chosen_center_name': (
                center_by_id[chosen].name_ar or center_by_id[chosen].name
                if chosen else ''
            ),
            'selection_method': (
                'automatic' if is_auto else 'manual'
            ) if chosen else 'unmatched',
        }
        possible.append(item)

    duplicate_ids = {dest for dest, refs in seen_destinations.items() if len(refs) > 1}
    for item in possible:
        dest_id = item['chosen_center_id']
        if not dest_id:
            item['readiness'] = 'unmatched'
            item['reason'] = 'لا يوجد ربط موثق؛ ستظل الحالة للمراجعة.'
        elif dest_id in duplicate_ids:
            item['readiness'] = 'blocked'
            item['reason'] = 'أكثر من مركز في Excel مرتبط ببطاقة واحدة؛ أزل الربط المكرر.'
        else:
            dest = center_by_id[dest_id]
            mismatches = []
            if dest.proposed_sector_name and key(dest.proposed_sector_name) != key(item['sector']):
                mismatches.append('القطاع المقترح الموجود مختلف')
            if dest.proposed_parent_name and key(dest.proposed_parent_name) != key(item['parent']):
                mismatches.append('الجهة الأم المقترحة مختلفة')
            if item['selection_method'] == 'manual' and len(evidence_value) < 8:
                mismatches.append('الربط اليدوي يحتاج مرجعًا موثقًا (8 أحرف على الأقل)')
            item['readiness'] = 'blocked' if mismatches else 'ready'
            item['reason'] = '، '.join(mismatches) if mismatches else 'جاهز لحفظ معلومات التبعية المقترحة.'
    by_ref = {item['ref']: item for item in possible}
    units_by_center = defaultdict(list)
    for u in org_units:
        if u['kind'] != 'unit' or not u['is_active']:
            continue
        units_by_center[u['health_center_id']].append(u)
        # units attached to a center-organization parent are also counted.
    org_center_ids = {
        x['id']: x['health_center_id'] for x in org_units
        if x['kind'] == 'center' and x['health_center_id']
    }
    for u in org_units:
        if u['kind'] == 'unit' and u['is_active'] and u['parent_id'] in org_center_ids:
            units_by_center[org_center_ids[u['parent_id']]].append(u)
    units_plan = []
    for u in source['units']:
        match = by_ref[u['center_ref']]
        center_id = match['chosen_center_id'] if match['readiness'] == 'ready' else None
        existing = any(key(x['name']) == key(u['name']) for x in units_by_center[center_id]) if center_id else False
        state = ('skipped' if not include_units else
                 'unmapped' if not center_id else
                 'existing' if existing else 'draft_create')
        units_plan.append({
            **u, 'center_id': center_id, 'state': state,
        })
    summary = {
        'source_centers': len(source['centers']),
        'source_units': len(source['units']),
        'database_centers': len(active),
        'ready_centers': sum(x['readiness'] == 'ready' for x in possible),
        'blocked_centers': sum(x['readiness'] == 'blocked' for x in possible),
        'unmapped_centers': sum(x['readiness'] == 'unmatched' for x in possible),
        'units_to_create_as_drafts': sum(x['state'] == 'draft_create' for x in units_plan),
        'existing_units': sum(x['state'] == 'existing' for x in units_plan),
        'units_not_mapped': sum(x['state'] == 'unmapped' for x in units_plan),
    }
    return possible, units_plan, summary


def authorized(user, write):
    if not user or not user.is_authenticated:
        return False
    if write:
        return user.is_superuser
    if user.is_staff:
        return True
    try:
        return user.health_profile.role == 'ohManager'
    except Exception:
        return False


class CenterDirectoryMatchingView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        action = clean(request.data.get('action') or 'preview')
        if action not in ('preview', 'commit'):
            return Response({'detail': 'الإجراء غير معروف.'}, status=400)
        if not authorized(request.user, write=action == 'commit'):
            return Response({'detail': 'المطابقة تتطلب صلاحية إدارية، والحفظ بصلاحية مدير النظام الأعلى.'},
                            status=403)
        try:
            source = parse_directory(request.FILES.get('file'))
            selections = normalize_selections(request.data.get('selections'))
            evidence = normalize_evidence(request.data.get('manual_evidence'))
            include_units = clean(request.data.get('include_units')).lower() == 'true'
            active, aliases, org_units, stamp = current_directory()
            matched, units, summary = build_plan(
                source, active, aliases, org_units, selections, include_units, evidence,
            )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)

        selections_resolved = {
            x['ref']: x['chosen_center_id'] for x in matched
        }
        # Idempotent across database versions: same source and reviewed choices
        # cannot be applied twice after the first draft update.
        fingerprint = sha256(json.dumps({
            'source': source['digest'], 'selections': selections_resolved,
            'include_units': include_units, 'manual_evidence': evidence,
        }, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        phrase = (
            f"حفظ {summary['ready_centers']} مطابقة و"
            f"{summary['units_to_create_as_drafts']} وحدة كمسودات"
        )
        if action == 'preview':
            token = signing.dumps({
                'user': request.user.pk, 'source': source['digest'],
                'stamp': stamp, 'choices': selections_resolved,
                'include_units': include_units,
                'manual_evidence': evidence, 'fingerprint': fingerprint,
            }, salt=TOKEN_SALT)
            return Response({
                'mode': 'preview', 'filename': source['filename'],
                'summary': summary, 'matches': matched, 'units': units,
                'database_centers': [
                    {
                        'id': c.pk, 'name': c.name_ar or c.name,
                        'code': c.code, 'proposed_sector': c.proposed_sector_name,
                    } for c in active
                ],
                'include_units': include_units, 'confirmation_phrase': phrase,
                'preview_token': token,
                'notice': 'المعاينة لا تحفظ أو تغير أي سجل. الربط غير المؤكد لا ينفّذ آليًا.',
            }, headers={'Cache-Control': 'private, no-store'})

        if request.data.get('confirmed') != 'true':
            return Response({'detail': 'مطلوب تأكيد صريح بعد المعاينة.'}, status=400)
        if request.data.get('confirmation_phrase') != phrase:
            return Response({'detail': 'عبارة التأكيد غير مطابقة.'}, status=400)
        reason = clean(request.data.get('reason'))
        if not 15 <= len(reason) <= 500:
            return Response({'detail': 'اكتب مبررًا للمطابقة من 15 إلى 500 حرف.'}, status=400)
        if not summary['ready_centers']:
            return Response({'detail': 'لا توجد مراكز مؤهلة للحفظ؛ ابدأ بمعالجة المطابقات.'},
                            status=409)
        if summary['blocked_centers']:
            return Response({'detail': 'توجد مطابقة مزدوجة أو متعارضة؛ أزل الاختيارات المحظورة.'},
                            status=409)
        try:
            signed = signing.loads(
                request.data.get('preview_token'), salt=TOKEN_SALT, max_age=TOKEN_AGE,
            )
        except (TypeError, ValueError, signing.BadSignature, signing.SignatureExpired):
            return Response({'detail': 'انتهت صلاحية المعاينة؛ أعد الفحص.'}, status=409)
        if not isinstance(signed, dict) or any([
            signed.get('user') != request.user.pk,
            signed.get('source') != source['digest'],
            signed.get('stamp') != stamp,
            signed.get('choices') != selections_resolved,
            signed.get('include_units') != include_units,
            signed.get('manual_evidence') != evidence,
            signed.get('fingerprint') != fingerprint,
        ]):
            return Response({'detail': 'المصدر أو اختيارات الربط أو حالة قاعدة البيانات تغيّرت؛ أعد المعاينة.'},
                            status=409)

        with transaction.atomic():
            locked_active, locked_aliases, locked_units, locked_stamp = current_directory(lock=True)
            if locked_stamp != stamp:
                return Response({'detail': 'تغيّرت البيانات خلال المعاينة؛ أعد المطابقة.'}, status=409)
            if CenterDirectoryMatchingBatch.objects.filter(fingerprint=fingerprint).exists():
                return Response({'detail': 'سبق تنفيذ هذه المطابقة بالفعل. لا يمكن تكرارها.'},
                                status=409)
            # Revalidate under locks, not merely by trusting client selections.
            mapped, unit_plan, fresh = build_plan(
                source, locked_active, locked_aliases, locked_units,
                selections, include_units, evidence,
            )
            if fresh != summary or any(x['readiness'] == 'blocked' for x in mapped):
                return Response({'detail': 'تغيرت نتيجة المطابقة؛ أعد المعاينة.'}, status=409)
            batch = CenterDirectoryMatchingBatch.objects.create(
                source_sha256=source['digest'], fingerprint=fingerprint,
                source_filename=source['filename'],
                matching_decisions=[
                    {
                        'ref': x['ref'], 'source_name': x['name'],
                        'center_id': x['chosen_center_id'],
                        'selection_method': x['selection_method'],
                        'evidence_reference': x['evidence_reference'],
                        'readiness': x['readiness'],
                        'source_rows': x['source_rows'],
                    } for x in mapped
                ],
                summary={**fresh, 'reason': reason, 'official_approvals': 0,
                         'new_health_centers': 0, 'employees_changed': 0},
                performed_by=request.user,
            )
            center_lookup = {c.pk: c for c in locked_active}
            updated = 0
            for item in mapped:
                if item['readiness'] != 'ready':
                    continue
                center = center_lookup[item['chosen_center_id']]
                prior = {
                    'proposed_sector_name': center.proposed_sector_name,
                    'proposed_parent_name': center.proposed_parent_name,
                    'organizational_source_reference': center.organizational_source_reference,
                }
                center.proposed_sector_name = center.proposed_sector_name or item['sector']
                center.proposed_parent_name = center.proposed_parent_name or item['parent']
                if not center.organizational_source_reference:
                    center.organizational_source_reference = (
                        f"{CENTER_TAB}: {item['sheet_row']}; المصدر: {item['source_rows']}"
                    )[:250]
                after = {
                    'proposed_sector_name': center.proposed_sector_name,
                    'proposed_parent_name': center.proposed_parent_name,
                    'organizational_source_reference': center.organizational_source_reference,
                }
                if prior != after:
                    center.save(update_fields=[
                        'proposed_sector_name', 'proposed_parent_name',
                        'organizational_source_reference', 'updated_at',
                    ])
                    updated += 1
                HealthCenterProfileAuditEvent.objects.create(
                    center=center, action='directory_draft_match',
                    prior_state=prior, new_state={
                        **after, 'source_center_ref': item['ref'],
                        'matching_batch': batch.pk,
                        'selection_method': item['selection_method'],
                        'matching_evidence': item['evidence_reference'],
                    },
                    evidence_reference=item['evidence_reference'] or f"{CENTER_TAB}: {item['sheet_row']}",
                    performed_by=request.user,
                )
            created_units = 0
            for item in unit_plan:
                if item['state'] != 'draft_create':
                    continue
                center = center_lookup[item['center_id']]
                # Revalidate name among direct + inherited units under locks.
                parent_ids = [
                    o['id'] for o in locked_units
                    if o['kind'] == 'center' and o['health_center_id'] == center.pk
                ]
                duplicates = OrganizationUnit.objects.filter(
                    kind='unit', is_active=True,
                ).filter(
                    Q(health_center=center) | Q(parent_id__in=parent_ids),
                )
                if any(key(u.name) == key(item['name']) for u in duplicates):
                    continue
                parent = OrganizationUnit.objects.filter(
                    kind='center', health_center=center, is_active=True,
                ).order_by('-is_approved', 'pk').first()
                code = 'TMP-MU-' + sha256(
                    f"{source['digest']}:{item['ref']}:{center.pk}".encode()
                ).hexdigest()[:20].upper()
                unit = OrganizationUnit.objects.create(
                    code=code, name=item['name'], kind='unit', parent=parent,
                    health_center=center, is_active=True, is_approved=False,
                    source_sheet=UNIT_TAB, source_rows=(
                        f"صف {item['sheet_row']}; المصدر: {item['source_rows']}"
                    )[:255],
                    source_path=f"{center.name_ar or center.name} / {item['name']}",
                )
                created_units += 1
                HealthCenterProfileAuditEvent.objects.create(
                    center=center, action='directory_draft_unit',
                    prior_state={}, new_state={
                        'id': unit.pk, 'code': unit.code, 'name': unit.name,
                        'is_approved': False, 'matching_batch': batch.pk,
                    },
                    evidence_reference=f"{UNIT_TAB}: {item['sheet_row']}",
                    performed_by=request.user,
                )
            batch.summary.update({
                'draft_fields_updated': updated,
                'draft_units_created': created_units,
            })
            batch.save(update_fields=['summary'])
            AuditLog.objects.create(
                user=str(request.user), action='center_directory_draft_match',
                model_name='CenterDirectoryMatchingBatch', record_id=str(batch.pk),
            )
        return Response({
            'mode': 'draft_saved', 'batch_id': batch.pk, 'summary': batch.summary,
            'notice': 'حُفظت التبعيات والوحدات كمسودات فقط؛ لم تُعتمد مراكز أو تُنقل بيانات موظفين.',
        }, headers={'Cache-Control': 'private, no-store'})


class CenterDirectoryMatchingHistoryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not authorized(request.user, write=False):
            return Response({'detail': 'غير مصرح بعرض سجل المطابقات.'}, status=403)
        items = CenterDirectoryMatchingBatch.objects.select_related(
            'performed_by',
        ).order_by('-created_at')[:25]
        return Response({
            'results': [
                {
                    'id': item.pk, 'created_at': item.created_at.isoformat(),
                    'performed_by': item.performed_by.get_username() if item.performed_by else '',
                    'source_hash': item.source_sha256[:12],
                    'summary': item.summary,
                }
                for item in items
            ],
        }, headers={'Cache-Control': 'private, no-store'})
