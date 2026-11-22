/** Display-only review guidance for the V4 departmental hierarchy.
 * The backend still enforces official approval references and ancestor checks.
 */
export type DepartmentReviewItem = {
  id: number;
  code: string;
  name: string;
  parent_id: number | null;
  health_center_id: number | null;
  is_active: boolean;
  is_approved: boolean;
};
export type ReviewGuidance = {
  canApprove: boolean;
  label: string;
  kind: 'none' | 'info' | 'warning';
  parentName: string | null;
};

export function departmentReviewGuidance(
  unit: DepartmentReviewItem,
  units: DepartmentReviewItem[],
): ReviewGuidance {
  if (unit.health_center_id !== null) {
    return { canApprove: false, label: 'ارتباط بمركز صحي يستلزم مراجعة وتصحيحًا قبل الاعتماد.', kind: 'warning', parentName: null };
  }
  if (!unit.is_active) {
    return { canApprove: false, label: 'الجهة غير نشطة؛ لا يمكن اعتمادها.', kind: 'warning', parentName: null };
  }
  const v4 = unit.code.startsWith('V4-D-');
  if (unit.parent_id === null) {
    return { canApprove: !unit.is_approved, label: '', kind: 'none', parentName: null };
  }
  const parent = units.find(row => row.id === unit.parent_id);
  if (!v4) {
    return { canApprove: false, label: 'ارتباط تنظيمي قديم يستلزم مراجعة قبل الاعتماد.', kind: 'warning', parentName: parent?.name ?? null };
  }
  if (!parent || !parent.code.startsWith('V4-D-')) {
    return { canApprove: false, label: 'لم يتم العثور على إدارة أعلى معتمدة ضمن تسلسل V4.', kind: 'warning', parentName: parent?.name ?? null };
  }
  if (!parent.is_active || !parent.is_approved) {
    return { canApprove: false, label: `تتبع «${parent.name}»؛ يجب اعتماد الإدارة الأعلى أولًا.`, kind: 'info', parentName: parent.name };
  }
  return { canApprove: !unit.is_approved, label: `تتبع «${parent.name}» المعتمدة؛ جاهزة لمراجعة الاعتماد.`, kind: 'info', parentName: parent.name };
}
