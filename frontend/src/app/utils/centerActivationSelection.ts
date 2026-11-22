/** Selection rules for operational activation in isolated V4.
 * Only active, nonarchived, not-yet-activated center IDs can be submitted.
 * Selection never crosses a changed filter or the archived view.
 */
export type ActivatableCenter = {
  id: number;
  is_active: boolean;
  is_archived?: boolean;
  approval_status?: string;
};

export function canActivateCenter(center: ActivatableCenter) {
  return Number.isInteger(center.id) && center.id > 0 &&
    center.is_active === true && center.is_archived !== true &&
    center.approval_status !== 'approved';
}

export function selectableCenterIds(visible: ActivatableCenter[]): number[] {
  return Array.from(new Set(visible.filter(canActivateCenter).map(center => center.id)));
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
