/** UI selection is independent of whether an active center was activated before.
 * Preview remains read-only: the server counts previously activated records as
 * already active and never activates them again.
 * Archived and administratively inactive centers are excluded for safety.
 */
export type ActivatableCenter = {
  id: number;
  is_active: boolean;
  is_archived?: boolean;
  approval_status?: string;
};

export function canSelectCenter(center: ActivatableCenter) {
  return Number.isInteger(center.id) && center.id > 0 &&
    center.is_active === true && center.is_archived !== true;
}

export function needsOperationalActivation(center: ActivatableCenter) {
  return canSelectCenter(center) && center.approval_status !== 'approved';
}

export function selectableCenterIds(visible: ActivatableCenter[]): number[] {
  return Array.from(new Set(visible.filter(canSelectCenter).map(center => center.id)));
}

export function retainVisibleSelection(selected: number[], visible: ActivatableCenter[]): number[] {
  const allowed = new Set(selectableCenterIds(visible));
  return Array.from(new Set(selected.filter(id => allowed.has(id))));
}

export function toggleVisibleCenter(
  selected: number[], id: number, visible: ActivatableCenter[],
): number[] {
  const retained = retainVisibleSelection(selected, visible);
  if (!selectableCenterIds(visible).includes(id)) return retained;
  return retained.includes(id) ? retained.filter(current => current !== id) : [...retained, id];
}
