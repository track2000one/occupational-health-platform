/** V4: derive each selection from verified parent IDs, never from display paths. */
export type V4OrgNode = {
  id: number;
  code: string;
  name: string;
  kind: 'department' | 'sector' | 'center' | 'unit';
  parent_id?: number | null;
  health_center_id: number | null;
  is_active: boolean;
  is_approved: boolean;
};

export const V4_PRIVATE_UI = import.meta.env.VITE_API_URL === 'http://127.0.0.1:18081/api';
export const DEPARTMENT_LEVELS = ['main_administration', 'sub_administration', 'department', 'sub_unit'] as const;

export function departmentPath(nodes: V4OrgNode[], id: number): V4OrgNode[] {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const path: V4OrgNode[] = [];
  const seen = new Set<number>();
  let current = byId.get(id);
  while (current) {
    if (seen.has(current.id) || current.kind !== 'department' ||
        !current.code.startsWith('V4-D-') || !current.is_active ||
        !current.is_approved || current.health_center_id !== null ||
        path.length >= DEPARTMENT_LEVELS.length) return [];
    seen.add(current.id);
    path.unshift(current);
    if (current.parent_id === null) return path;
    if (!current.parent_id) return [];
    current = byId.get(current.parent_id);
  }
  return [];
}

export function departmentChildren(nodes: V4OrgNode[], parent: number | null) {
  return nodes.filter(node => node.parent_id === parent &&
    departmentPath(nodes, node.id).length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}

export function approvedSectorCenters(nodes: V4OrgNode[], sectorId: number) {
  const sector = nodes.find(node => node.id === sectorId && node.kind === 'sector' &&
    node.is_active && node.is_approved && node.parent_id === null);
  if (!sector) return [];
  return nodes.filter(node => node.parent_id === sector.id &&
    node.kind === 'center' && node.is_active && node.is_approved &&
    node.health_center_id !== null);
}
