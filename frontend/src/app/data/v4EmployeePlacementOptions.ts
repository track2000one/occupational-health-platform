/** The V4 employee form must show the real registries, even if a proposed
 * hierarchy mapping has not yet been reviewed. These functions only expose
 * dropdown entries; they do NOT authorize linking an unactivated department.
 */
export function v4RegisteredCenters<T extends { is_active?: boolean }>(centers: T[]): T[] {
  return centers.filter(center => center.is_active !== false);
}

export function v4VisibleDepartments<T extends {
  kind: string; code: string; is_active: boolean;
}>(units: T[]): T[] {
  return units.filter(unit =>
    unit.kind === 'department' && unit.code.startsWith('V4-D-') && unit.is_active);
}
