/**
 * Employee form V4 source hierarchy. These labels are NOT approved affiliations.
 * Verified center/department selections are held separately by backend IDs.
 */
export const UNVERIFIED = 'غير محدد في المصدر';
export const NOT_APPLICABLE = 'لا ينطبق';

export const ORG_LEVELS = [
  { key: 'holding_company', label: 'الشركة القابضة' },
  { key: 'health_cluster', label: 'التجمع الصحي' },
  { key: 'health_network', label: 'الشبكة الصحية' },
  { key: 'main_administration', label: 'الإدارة الرئيسية' },
  { key: 'sub_administration', label: 'الإدارة الفرعية' },
  { key: 'department', label: 'القسم' },
  { key: 'sub_unit', label: 'الوحدة الفرعية' },
  { key: 'consultative_sector', label: 'القطاع الاستشاري' },
  { key: 'health_center', label: 'المركز الصحي' },
  { key: 'service_program', label: 'الخدمة / البرنامج' },
  { key: 'service_scope', label: 'نطاق تقديم الخدمة' },
  { key: 'service_category', label: 'الفئة الخدمية' },
  { key: 'specialization', label: 'التخصص داخل المسار' },
] as const;

export type OrgLevel = typeof ORG_LEVELS[number]['key'];
export type EmployeeOrgHierarchy = Record<OrgLevel, string>;

export const TOP_LEVELS: Pick<EmployeeOrgHierarchy,
  'holding_company' | 'health_cluster' | 'health_network'> = {
  holding_company: 'شركة الصحة القابضة',
  health_cluster: 'تجمع الشرقية الصحي',
  health_network: 'شبكة الدمام الصحية',
};

export const ORGANIZATIONAL_SUGGESTIONS: Partial<Record<OrgLevel, string[]>> = {
  main_administration: [
    'الرعاية الأولية والمجتمعية', 'الطبية والإكلينيكية',
    'التمريض', 'التشغيل', 'الجودة والأداء',
  ],
  sub_administration: [
    'الصحة العامة', 'الصحية المساندة', 'التطوير المهني',
    'تجربة المستفيدين', 'الخدمات المساندة',
  ],
  department: [
    'الصحة المهنية', 'الطب الوقائي', 'مكافحة الأمراض المعدية',
    'برامج الصحة المدرسية', 'تمريض الرعاية الصحية الأولية',
    'الفحص الشامل', 'خدمات الأسنان',
  ],
  consultative_sector: [
    'القطاع الشرقي الاستشاري 1', 'القطاع الشرقي الاستشاري 2',
    'القطاع الغربي الاستشاري 1', 'القطاع الغربي الاستشاري 2',
  ],
  service_scope: ['PHC', 'DMC', 'DMC/PHC'],
  service_category: ['رجال', 'نساء'],
};

export function emptyOrganizationalHierarchy(
  kind: 'center' | 'department' = 'center',
): EmployeeOrgHierarchy {
  const values = Object.fromEntries(
    ORG_LEVELS.map(({ key }) => [key, UNVERIFIED]),
  ) as EmployeeOrgHierarchy;
  Object.assign(values, TOP_LEVELS);
  if (kind === 'department') {
    values.health_center = NOT_APPLICABLE;
    values.consultative_sector = NOT_APPLICABLE;
  }
  return values;
}

export function fromSourceHierarchy(
  source: Partial<Record<OrgLevel, string>> | undefined | null,
  kind: 'center' | 'department',
): EmployeeOrgHierarchy {
  const result = emptyOrganizationalHierarchy(kind);
  for (const { key } of ORG_LEVELS) {
    const value = String(source?.[key] ?? '').trim();
    if (value) result[key] = value;
  }
  Object.assign(result, TOP_LEVELS);
  return result;
}

export function updateHierarchyAffiliation(
  hierarchy: EmployeeOrgHierarchy, kind: 'center' | 'department',
  approvedName: string,
): EmployeeOrgHierarchy {
  const next = { ...hierarchy };
  if (kind === 'center') {
    const switchingFromCentralDepartment = hierarchy.health_center === NOT_APPLICABLE;
    next.health_center = approvedName.trim() || UNVERIFIED;
    if (next.consultative_sector === NOT_APPLICABLE) {
      next.consultative_sector = UNVERIFIED;
    }
    // Only clear a prior *central* department affiliation during a switch.
    // Selecting the same center must preserve its own sourced department.
    if (switchingFromCentralDepartment) next.department = UNVERIFIED;
  } else {
    next.health_center = NOT_APPLICABLE;
    next.consultative_sector = NOT_APPLICABLE;
    next.department = approvedName.trim() || UNVERIFIED;
  }
  return next;
}

export function missingHierarchyLevels(values: EmployeeOrgHierarchy): string[] {
  return ORG_LEVELS.filter(({ key }) => !String(values[key] || '').trim())
    .map(({ label }) => label);
}
