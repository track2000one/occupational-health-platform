"""Canonical hierarchical path for V4 departments; no inferred affiliations."""
DEPARTMENT_LEVELS = ('main_administration', 'sub_administration', 'department', 'sub_unit')


def v4_department_path(unit, *, require_leaf_approved=True):
    """Return a verified root-to-leaf path, or empty for an invalid/unsafe tree."""
    path = []
    seen = set()
    current = unit
    while current is not None:
        if (current.pk in seen or current.kind != 'department'
                or not current.code.startswith('V4-D-')
                or not current.is_active or current.health_center_id
                or (not current.is_approved and (path or require_leaf_approved))
                or len(path) >= len(DEPARTMENT_LEVELS)):
            return []
        seen.add(current.pk)
        path.insert(0, current)
        if not current.parent_id:
            return path
        current = current.parent
    return []


def v4_department_labels(path):
    """Missing trailing levels stay empty, never duplicate the leaf into column K."""
    return {key: path[i].name if i < len(path) else ''
            for i, key in enumerate(DEPARTMENT_LEVELS)}
