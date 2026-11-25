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

export type ApprovedOrgNode = {
  id: number; name: string; kind: 'department' | 'sector' | 'center' | 'unit';
  parent_id: number | null; health_center_id: number | null;
  is_active: boolean; is_approved: boolean;
};

/** Derive affiliation only from approved parent IDs, never from draft source labels. */
export function hierarchyFromApprovedPath(
  nodes: ApprovedOrgNode[], selected: ApprovedOrgNode | undefined,
  centerName?: string,
): EmployeeOrgHierarchy | null {
  if (!selected) return null;
  const byId = new Map(nodes.map(node => [node.id, node]));
  const chain: ApprovedOrgNode[] = [];
  const visited = new Set<number>();
  let node: ApprovedOrgNode | undefined = selected;
  while (node) {
    if (!node.is_active || !node.is_approved || visited.has(node.id)) return null;
    visited.add(node.id);
    chain.unshift(node);
    if (node.parent_id == null) break;
    node = byId.get(node.parent_id);
    if (!node) return null;
  }
  if (chain.length < 3 || chain[0].name !== TOP_LEVELS.health_cluster ||
      chain[1].name !== TOP_LEVELS.health_network ||
      chain[0].kind !== 'department' || chain[1].kind !== 'department') return null;
  const tail = chain.slice(2);
  const kind = selected.kind === 'department' ? 'department' : 'center';
  const result = emptyOrganizationalHierarchy(kind);
  for (const key of ['main_administration', 'sub_administration', 'department',
    'sub_unit', 'consultative_sector', 'health_center'] as const) result[key] = NOT_APPLICABLE;
  const sectors = tail.filter(n => n.kind === 'sector');
  if (sectors.length > 1) return null;
  if (sectors.length) result.consultative_sector = sectors[0].name;
  if (kind === 'center') {
    const expected = selected.kind === 'unit' ? 'sector/center/unit' : 'sector/center';
    if (tail.map(n => n.kind).join('/') !== expected || !centerName ||
        !tail[1].health_center_id || tail[1].health_center_id !== selected.health_center_id) return null;
    result.health_center = centerName;
    if (selected.kind === 'unit') result.sub_unit = selected.name;
  } else {
    if (tail.some(n => n.health_center_id || !['department','sector'].includes(n.kind)) ||
        (sectors.length && tail[0].kind !== 'sector')) return null;
    const parents = tail.slice(0,-1).filter(n => n.kind === 'department');
    result.department = selected.name;
    if (parents.length) result.main_administration = parents[0].name;
    if (parents.length > 1) result.sub_administration = parents.slice(1).map(n => n.name).join(' / ');
  }
  return Object.values(result).every(v => v.length <= 220) ? result : null;
}
