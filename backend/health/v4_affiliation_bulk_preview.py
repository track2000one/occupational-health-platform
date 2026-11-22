"""V4-only, read-only batch matching of provisional employees to organizational drafts.

Review-only: never creates employees, clinical records, HealthCenters, approvals,
or foreign-key assignments. Does not return individual names or identities.
"""
from collections import Counter, defaultdict
from hashlib import sha256
import json

from django.db.models import Q
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .employee_org_template_v4 import clean_org_value, needs_source_org_review
from .models import OrganizationUnit, ProvisionalEmployeeImportBatch
from .organization_structure import draft_import_scope
from .provisional_employee_roster import _unseal, NO_CACHE


MAX_SEGMENT = 100
MAX_UNITS = 1000
DEPARTMENT_LEVELS = ('main_administration', 'sub_administration', 'department', 'sub_unit')
STATES = ('matched_approved', 'matched_pending_reference', 'missing_in_directory',
          'ambiguous_directory', 'missing_source', 'invalid_hierarchy')


def normalized(value):
    """Whitespace normalization only: never guess similar Arabic organization names."""
    return ' '.join(str(value or '').strip().split()).casefold()


def department_chain(unit, by_id):
    """Resolve a verifiable 1-4 level hierarchy by IDs, not a free-form name."""
    path, seen = [], set()
    current = unit
    while current is not None:
        if (current.pk in seen or len(path) >= 4
                or current.kind != 'department'
                or not current.code.startswith('V4-D-')
                or not current.is_active or current.health_center_id is not None):
            return ()
        seen.add(current.pk)
        path.insert(0, current)
        if current.parent_id is None:
            return tuple(path)
        current = by_id.get(current.parent_id)
    return ()


def snapshot(units):
    """Detect a directory change while the browser reads successive segments."""
    entries = [
        (u.pk, u.code, u.name, u.kind, u.parent_id, u.health_center_id,
         u.is_active, u.is_approved, u.approval_reference,
         (u.health_center.approval_status if u.health_center_id else None))
        for u in units
    ]
    return sha256(json.dumps(entries, ensure_ascii=False,
                             separators=(',', ':')).encode('utf-8')).hexdigest()


def directory_index(units):
    by_id = {u.pk: u for u in units}
    centers = defaultdict(list)
    departments = defaultdict(list)
    for unit in units:
        if not unit.is_active:
            continue
        if unit.kind == 'center' and unit.parent_id:
            parent = by_id.get(unit.parent_id)
            if parent and parent.kind == 'sector' and parent.is_active and not parent.parent_id:
                centers[(normalized(parent.name), normalized(unit.name))].append((unit, parent))
        elif unit.kind == 'department':
            chain = department_chain(unit, by_id)
            if chain:
                label_path = ' / '.join(node.name for node in chain)
                # Reject a changed or stale imported source path, never infer.
                if normalized(unit.source_path) == normalized(label_path):
                    departments[tuple(normalized(node.name) for node in chain)].append(chain)
    return centers, departments


def evaluate(source, center_index, department_index):
    levels = source.get('source_organizational_hierarchy')
    if not isinstance(levels, dict):
        return 'unknown', 'missing_source', '', None
    center = clean_org_value(levels.get('health_center'))
    if center:
        sector = clean_org_value(levels.get('consultative_sector'))
        path = ' / '.join(part for part in (sector, center) if part)
        if not sector:
            return 'center', 'missing_source', path, None
        candidates = center_index.get((normalized(sector), normalized(center)), ())
        if not candidates:
            return 'center', 'missing_in_directory', path, None
        if len(candidates) != 1:
            return 'center', 'ambiguous_directory', path, None
        unit, parent = candidates[0]
        officially_mapped = (
            unit.is_approved and parent.is_approved
            and unit.health_center_id is not None and unit.health_center.is_active
            and not unit.health_center.is_archived
            and unit.health_center.approval_status == 'approved'
        )
        return ('center', 'matched_approved' if officially_mapped
                else 'matched_pending_reference', path, unit.code)
    labels = tuple(clean_org_value(levels.get(key)) for key in DEPARTMENT_LEVELS)
    if not any(labels):
        return 'unknown', 'missing_source', '', None
    nonempty = tuple(label for label in labels if label)
    path = ' / '.join(nonempty)
    if nonempty != labels[:len(nonempty)]:
        return 'department', 'invalid_hierarchy', path, None
    candidates = department_index.get(tuple(normalized(label) for label in nonempty), ())
    if not candidates:
        return 'department', 'missing_in_directory', path, None
    if len(candidates) != 1:
        return 'department', 'ambiguous_directory', path, None
    chain = candidates[0]
    approved = all(unit.is_approved and unit.approval_reference for unit in chain)
    return ('department', 'matched_approved' if approved
            else 'matched_pending_reference', path, chain[-1].code)


def calculate_affiliation_segment(batch, offset, limit):
    # Bound both directory and roster work, avoiding the prior slow full-batch request.
    units = list(OrganizationUnit.objects.select_related('parent', 'health_center')
                 .order_by('pk')[:MAX_UNITS + 1])
    if len(units) > MAX_UNITS:
        raise ValueError('الدليل التنظيمي أكبر من الحد الآمن للمراجعة.')
    fingerprint = snapshot(units)
    center_index, department_index = directory_index(units)
    rows = list(batch.rows.only('source_row', 'sealed_payload')
                .order_by('source_row')[offset:offset + limit])
    source_kinds, states = Counter(), Counter()
    flags = 0
    paths = Counter()
    for row in rows:
        src = _unseal(row.sealed_payload)
        kind, state, path, code = evaluate(src, center_index, department_index)
        source_kinds[kind] += 1
        states[state] += 1
        if needs_source_org_review(src.get('source_review_status')):
            flags += 1
        # Organizational paths only; never return employee identifiers or names.
        paths[(kind, state, path, code or '')] += 1
    return {
        'mode': 'v4_provisional_affiliation_preview_read_only',
        'batch_id': batch.pk,
        'rows_total': batch.total_rows,
        'rows_scanned': len(rows),
        'segment': {
            'offset': offset, 'limit': limit, 'next_offset': offset + len(rows),
            'has_more': offset + len(rows) < batch.total_rows,
        },
        'directory_snapshot': fingerprint,
        'source_kinds': {key: source_kinds[key] for key in ('center', 'department', 'unknown')},
        'statuses': {key: states[key] for key in STATES},
        'source_review_flags': flags,
        'paths': [
            {'kind': kind, 'state': state, 'path': path, 'code': code,
             'count': count}
            for (kind, state, path, code), count in sorted(paths.items())
        ],
        'organizations_created': 0,
        'employees_created': 0,
        'employees_modified': 0,
        'health_centers_modified': 0,
        'approvals_created': 0,
        'notice': 'معاينة مطابقة فقط. لا تنفذ ربطًا أو اعتمادًا أو إنشاء موظفين.',
    }


class V4ProvisionalAffiliationPreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not request.user.is_superuser or draft_import_scope() != 'v4':
            return Response({'detail': 'هذه المعاينة متاحة للمسؤول الأعلى داخل V4 المستقلة فقط.'},
                            status=403, headers=NO_CACHE)
        batch = ProvisionalEmployeeImportBatch.objects.order_by('-created_at', '-pk').first()
        if batch is None:
            return Response({'detail': 'لا توجد دفعة موظفين مؤقتة.'}, status=404, headers=NO_CACHE)
        try:
            if 'offset' not in request.query_params or 'limit' not in request.query_params:
                raise ValueError('offset and limit required')
            offset, limit = int(request.query_params['offset']), int(request.query_params['limit'])
            if offset < 0 or offset >= batch.total_rows or not 1 <= limit <= MAX_SEGMENT:
                raise ValueError('invalid bounds')
        except (ValueError, TypeError):
            return Response({'detail': 'حدد offset و limit بحد أقصى 100 بطاقة.'},
                            status=400, headers=NO_CACHE)
        try:
            result = calculate_affiliation_segment(batch, offset, limit)
        except ValueError:
            return Response({'detail': 'تعذر فحص البيانات أو تغيّر الدليل التنظيمي. لا يوجد حفظ.'},
                            status=409, headers=NO_CACHE)
        return Response(result, headers=NO_CACHE)
