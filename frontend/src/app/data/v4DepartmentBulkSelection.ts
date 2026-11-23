/** Read-only selection for internal V4 department activation.
 * An unapproved department is eligible to be PREVIEWED; server-side hierarchy
 * checks decide whether it may actually be activated. No guessed parent links.
 */
export type DepartmentActivationCandidate = {
  id: number;
  code: string;
  is_active: boolean;
  is_approved: boolean;
};
export function pendingV4DepartmentIds(rows: DepartmentActivationCandidate[]): number[] {
  return Array.from(new Set(rows.filter(item =>
    Number.isInteger(item.id) && item.id > 0 &&
    item.code.startsWith('V4-D-') && item.is_active && !item.is_approved
  ).map(item => item.id)));
}
