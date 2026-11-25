"""Resolve organizational labels from approved parent IDs, not imported source paths."""
from .models import OrganizationUnit

CLUSTER = 'تجمع الشرقية الصحي'
NETWORK = 'شبكة الدمام الصحية'
NA = 'لا ينطبق'


def assignment_hierarchy(selected, units_by_id):
    """Return labels only when every ancestor is active, approved and consistent."""
    if selected is None:
        return None
    chain, seen = [], set()
    current = selected
    while current is not None:
        if current.pk in seen or not current.is_active or not current.is_approved:
            return None
        seen.add(current.pk)
        chain.append(current)
        if current.parent_id is None:
            break
        current = units_by_id.get(current.parent_id)
        if current is None:
            return None
    chain.reverse()
    if len(chain) < 3 or [row.name for row in chain[:2]] != [CLUSTER, NETWORK]:
        return None
    if any(row.kind != 'department' for row in chain[:2]):
        return None
    tail = chain[2:]
    leaf = tail[-1]
    values = {
        'health_cluster': CLUSTER, 'health_network': NETWORK,
        'main_administration': NA, 'sub_administration': NA,
        'department': NA, 'sub_unit': NA, 'consultative_sector': NA,
        'health_center': NA,
    }
    sectors = [row for row in tail if row.kind == 'sector']
    if len(sectors) > 1:
        return None
    if sectors:
        values['consultative_sector'] = sectors[0].name
    if leaf.kind in ('center', 'unit'):
        if [row.kind for row in tail] != (
            ['sector', 'center', 'unit'] if leaf.kind == 'unit'
            else ['sector', 'center']
        ):
            return None
        center = tail[1].health_center
        if not center or not center.is_active or center.is_archived:
            return None
        if leaf.health_center_id != center.pk:
            return None
        values['health_center'] = center.name_ar or center.name
        if leaf.kind == 'unit':
            values['sub_unit'] = leaf.name
    elif leaf.kind == 'department':
        if any(row.kind not in ('department', 'sector') or row.health_center_id
               for row in tail):
            return None
        if sectors and tail[0].kind != 'sector':
            return None
        parents = [row.name for row in tail[:-1] if row.kind == 'department']
        values['department'] = leaf.name
        if parents:
            values['main_administration'] = parents[0]
            if len(parents) > 1:
                values['sub_administration'] = ' / '.join(parents[1:])
    else:
        return None
    if any(len(value) > 220 for value in values.values()):
        return None
    return values


def employee_assignment_hierarchy(center, unit):
    """Return (directory_configured, verified_labels). Keep legacy deployments compatible."""
    rows = list(OrganizationUnit.objects.select_related('health_center').filter(is_active=True))
    configured = any(row.name == NETWORK and row.kind == 'department' for row in rows)
    if not configured:
        return False, None
    by_id = {row.pk: row for row in rows}
    if center:
        candidates = [row for row in rows if row.kind == 'center'
                      and row.health_center_id == center.pk]
        if len(candidates) != 1:
            return True, None
        selected = by_id.get(unit.pk) if unit else candidates[0]
        if not selected or selected.health_center_id != center.pk:
            return True, None
    elif unit:
        selected = by_id.get(unit.pk)
    else:
        return True, None
    return True, assignment_hierarchy(selected, by_id)
