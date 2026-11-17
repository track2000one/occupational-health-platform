// These are not selectable organizational health centers in new employee registrations.
// Preserve the original center records and any existing employee references for audit/history.
type EmployeeCenterNames = {
  name?: string | null;
  name_ar?: string | null;
  name_en?: string | null;
};

const EXCLUDED_EMPLOYEE_CENTER_NAMES = new Set([
  'حمد العمار الخالدي بالضاحية',
  'عيادة الموظفين',
  'مركز الصحة المهنية الرئيسي',
  'وحدة اللجنة الطبية',
].map(normalizeCenterName));

function normalizeCenterName(value: string): string {
  return value.normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('ar');
}

export function isExcludedEmployeeCenter(center: EmployeeCenterNames): boolean {
  return [center.name, center.name_ar, center.name_en].some(
    name => typeof name === 'string' && EXCLUDED_EMPLOYEE_CENTER_NAMES.has(normalizeCenterName(name)),
  );
}

export function selectableEmployeeCenters<T extends EmployeeCenterNames>(centers: T[]): T[] {
  return centers.filter(center => !isExcludedEmployeeCenter(center));
}
