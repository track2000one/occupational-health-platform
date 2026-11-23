/** Source-derived, employee-free V4 foundation suggestions (23 November 2026).
 *
 * Extracted only from the F:R organizational columns of the two user-approved
 * XLSX workbooks. No identity, contact or medical details are included.
 * Source names are suggestions; never silently turn them into real approved
 * assignments or insert them into the database on screen load.
 *
 * Prior decision: do not introduce "شركة الصحة القابضة" as a creation level.
 * The "التشغيل" paths still exist in the uploaded XLSX (56 employee rows);
 * preserve them as review-only source data instead of silently discarding them
 * or reinstating the excluded category for new foundation.
 */
export const V4_FOUNDATION_CONTEXT = {
  health_cluster: 'تجمع الشرقية الصحي',
  health_network: 'شبكة الدمام الصحية',
  center_main_administration: 'الرعاية الأولية والمجتمعية',
  center_sub_administration: 'القطاعات التشغيلية للرعاية الأولية',
} as const;

export const V4_CENTER_SECTORS: Record<string, readonly string[]> =
{
  "القطاع الشرقي الاستشاري 1": [
    "اسكان الدمام",
    "الاثير",
    "الجامعيين",
    "الشفاء",
    "العدامة",
    "غرناطة"
  ],
  "القطاع الشرقي الاستشاري 2": [
    "الجلوية",
    "الخليج",
    "العزيزية",
    "المباركية",
    "المحمدية",
    "المزروعية"
  ],
  "القطاع الغربي الاستشاري 1": [
    "الروضة",
    "الفيصلية",
    "القادسية",
    "المنار",
    "الندى",
    "طيبة"
  ],
  "القطاع الغربي الاستشاري 2": [
    "أحد الغربي",
    "الضاحية",
    "النور",
    "بدر",
    "بدر الغربي"
  ]
};

export const V4_DEPARTMENT_SOURCE_PATHS: readonly (readonly string[])[] =
[
  [
    "التشغيل",
    "الخدمات المساندة",
    "الخدمات البيئية"
  ],
  [
    "التشغيل",
    "العقود والمشتريات",
    "سلاسل الإمداد"
  ],
  [
    "التشغيل",
    "تشغيل الرعاية الصحية الأولية"
  ],
  [
    "التمريض",
    "التطوير المهني",
    "التطوير المهني للتمريض"
  ],
  [
    "الجودة والأداء",
    "تجربة المستفيدين",
    "عمليات تجربة المستفيدين"
  ],
  [
    "الخدمات الطبية والإكلينيكية",
    "الخدمات الصحية المساندة",
    "خدمات إعادة التأهيل",
    "العلاج الطبيعي"
  ],
  [
    "الخدمات الطبية والإكلينيكية",
    "الخدمات الصحية المساندة",
    "خدمات التصوير الطبي"
  ],
  [
    "الخدمات الطبية والإكلينيكية",
    "الخدمات الصحية المساندة",
    "خدمات التعقيم"
  ],
  [
    "الخدمات الطبية والإكلينيكية",
    "الخدمات الصحية المساندة",
    "خدمات الصحة النفسية"
  ],
  [
    "الخدمات الطبية والإكلينيكية",
    "الخدمات الصحية المساندة",
    "خدمات المختبرات",
    "خدمات ما قبل التحاليل"
  ],
  [
    "الخدمات الطبية والإكلينيكية",
    "خدمات طب الأسنان",
    "الخدمات السريرية لطب الأسنان",
    "طب الأسنان"
  ],
  [
    "الخدمات الطبية والإكلينيكية",
    "خدمات طب الأسنان",
    "الخدمات المساندة لطب الأسنان"
  ],
  [
    "الخدمات الطبية والإكلينيكية",
    "خدمات طب الأسنان",
    "خدمات الأعمال لطب الأسنان"
  ],
  [
    "الخدمات الطبية والإكلينيكية",
    "خدمات طب الأسنان",
    "خدمات صحة الفم والأسنان"
  ],
  [
    "الخدمات الطبية والإكلينيكية",
    "خدمات طب الأسنان"
  ],
  [
    "الرعاية الأولية والمجتمعية",
    "الصحة العامة",
    "الصحة المهنية"
  ],
  [
    "الرعاية الأولية والمجتمعية",
    "الصحة العامة",
    "برامج الصحة المدرسية"
  ],
  [
    "الرعاية الأولية والمجتمعية",
    "الصحة العامة"
  ],
  [
    "الرعاية الأولية والمجتمعية",
    "الصحة العامة",
    "مكافحة الأمراض المعدية"
  ],
  [
    "الرعاية الأولية والمجتمعية",
    "الصحة العامة",
    "مكافحة الأمراض المعدية",
    "المراقبة الوبائية"
  ],
  [
    "الرعاية الأولية والمجتمعية",
    "القطاعات التشغيلية للرعاية الأولية"
  ],
  [
    "الرعاية الأولية والمجتمعية",
    "القطاعات التشغيلية للرعاية الأولية",
    "الوحدة الإدارية للفحص الشامل"
  ],
  [
    "الرعاية الأولية والمجتمعية",
    "تمريض الرعاية الصحية الأولية",
    "التثقيف والتدريب الصحي"
  ],
  [
    "الرعاية الأولية والمجتمعية",
    "تمريض الرعاية الصحية الأولية",
    "تنسيق الرعاية"
  ],
  [
    "الرعاية الأولية والمجتمعية",
    "تمريض الرعاية الصحية الأولية"
  ],
  [
    "الرعاية الأولية والمجتمعية",
    "خدمات الأعمال"
  ],
  [
    "الرعاية الأولية والمجتمعية"
  ]
];

export const V4_REVIEW_ONLY_MAIN = 'التشغيل';
export const V4_LEVEL_KEYS = [
  'main_administration', 'sub_administration', 'department', 'sub_unit',
] as const;
export const V4_LEVEL_LABELS = [
  'الإدارة الرئيسية', 'الإدارة الفرعية', 'القسم', 'الوحدة الفرعية',
] as const;

export function v4MainDepartmentChoices(): string[] {
  return Array.from(new Set(V4_DEPARTMENT_SOURCE_PATHS
    .map(path=>path[0]).filter(name=>name && name!==V4_REVIEW_ONLY_MAIN))).sort('ar');
}
export function v4DepartmentChoices(prefix: readonly string[], depth: number): string[] {
  return Array.from(new Set(V4_DEPARTMENT_SOURCE_PATHS
    .filter(path => prefix.every((name,index)=>path[index]===name))
    .map(path=>path[depth]).filter((value): value is string => Boolean(value)))).sort('ar');
}
export function v4CenterNamesForSector(sector: string): readonly string[] {
  return V4_CENTER_SECTORS[sector] || [];
}
export function v4CenterSourceSector(name: string): string | null {
  const matches = Object.entries(V4_CENTER_SECTORS)
    .filter(([, centers]) => centers.includes(name)).map(([sector]) => sector);
  return matches.length===1 ? matches[0] : null;
}
