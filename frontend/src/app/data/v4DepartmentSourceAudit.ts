/**
 * Source-verified, aggregated ORGANIZATIONAL reference from the previously
 * uploaded workbook:
 * الأقسام_الهيكلة_جميع_الحقول_معبأة_للاستيراد(1).xlsx
 * Sheet: المسميات الموحدة, rows 2..33.
 *
 * No employee names, identity numbers, contacts, or health data are bundled.
 * The count is source-row weight for review, never an employee import command.
 * The source hierarchy is proposed and must NOT be mistaken for official
 * administrative approval or a current database state.
 */
export type DepartmentSourceRow = {
  sourceEmployees: number;
  levels: readonly [string|null,string|null,string|null,string|null];
  sector?: string|null;
  service?: string|null;
  scope?: string|null;
  category?: string|null;
  specialization?: string|null;
};

const S = (n: number, m: string|null, s: string|null=null,
  d: string|null=null, u: string|null=null, sector: string|null=null,
  service: string|null=null, scope: string|null=null,
  category: string|null=null, specialization: string|null=null): DepartmentSourceRow =>
  ({sourceEmployees:n,levels:[m,s,d,u],sector,service,scope,category,specialization});

export const V4_DEPARTMENT_SOURCE_ROWS: readonly DepartmentSourceRow[] = [
  S(111,'الخدمات الطبية والإكلينيكية','خدمات طب الأسنان','الخدمات المساندة لطب الأسنان',null,null,null,'PHC',null,'مساعدو الأسنان'),
  S(98,'الخدمات الطبية والإكلينيكية','خدمات طب الأسنان','الخدمات السريرية لطب الأسنان','طب الأسنان',null,null,'PHC'),
  S(41,'التشغيل','تشغيل الرعاية الصحية الأولية',null,null,null,null,'PHC'),
  S(41,'الخدمات الطبية والإكلينيكية','الخدمات الصحية المساندة','خدمات إعادة التأهيل','العلاج الطبيعي',null,null,'DMC / PHC','نساء'),
  S(35,'الرعاية الأولية والمجتمعية','تمريض الرعاية الصحية الأولية'),
  S(30,'الخدمات الطبية والإكلينيكية','الخدمات الصحية المساندة','خدمات التصوير الطبي',null,null,null,'PHC'),
  S(26,'الرعاية الأولية والمجتمعية','الصحة العامة','برامج الصحة المدرسية'),
  S(25,'الخدمات الطبية والإكلينيكية','الخدمات الصحية المساندة','خدمات المختبرات','خدمات ما قبل التحاليل',null,null,null,'DMC / PHC'),
  S(24,'الخدمات الطبية والإكلينيكية','خدمات طب الأسنان','خدمات صحة الفم والأسنان',null,null,null,'PHC',null,'أخصائي صحة الفم والأسنان'),
  S(20,'الرعاية الأولية والمجتمعية','تمريض الرعاية الصحية الأولية','التثقيف والتدريب الصحي',null,null,null,null,null,'المدرب الصحي'),
  S(19,'الرعاية الأولية والمجتمعية'),
  S(19,'الرعاية الأولية والمجتمعية','الصحة العامة','مكافحة الأمراض المعدية'),
  S(14,'التشغيل','العقود والمشتريات','سلاسل الإمداد',null,null,null,'PHC'),
  S(13,'الخدمات الطبية والإكلينيكية','الخدمات الصحية المساندة','خدمات إعادة التأهيل','العلاج الطبيعي',null,null,'DMC / PHC','رجال'),
  S(13,'الرعاية الأولية والمجتمعية',null,null,null,'القطاع الشرقي الاستشاري 1'),
  S(12,'الرعاية الأولية والمجتمعية','الصحة العامة','مكافحة الأمراض المعدية','المراقبة الوبائية'),
  S(10,'الخدمات الطبية والإكلينيكية','خدمات طب الأسنان',null,null,null,null,'PHC'),
  S(9,'الجودة والأداء','تجربة المستفيدين','عمليات تجربة المستفيدين',null,null,null,'PHC'),
  S(8,'الرعاية الأولية والمجتمعية',null,null,'الوحدة الإدارية للفحص الشامل','القطاع الشرقي الاستشاري 1','الفحص الشامل'),
  S(8,'الرعاية الأولية والمجتمعية','الصحة العامة'),
  S(7,'الرعاية الأولية والمجتمعية',null,null,null,'القطاع الشرقي الاستشاري 2'),
  S(7,'الرعاية الأولية والمجتمعية',null,null,null,'القطاع الغربي الاستشاري 1'),
  S(6,'الخدمات الطبية والإكلينيكية','خدمات طب الأسنان','خدمات الأعمال لطب الأسنان',null,null,null,'PHC'),
  S(6,'الرعاية الأولية والمجتمعية',null,null,null,'القطاع الشرقي الاستشاري 1','الفحص الشامل'),
  S(6,'الرعاية الأولية والمجتمعية',null,null,null,'القطاع الغربي الاستشاري 2'),
  S(6,'الرعاية الأولية والمجتمعية','تمريض الرعاية الصحية الأولية','تنسيق الرعاية'),
  S(4,'التمريض','التطوير المهني','التطوير المهني للتمريض',null,null,null,'PHC'),
  S(4,'الخدمات الطبية والإكلينيكية','الخدمات الصحية المساندة','خدمات التعقيم',null,null,null,'PHC'),
  S(4,'الرعاية الأولية والمجتمعية','خدمات الأعمال'),
  S(3,'الرعاية الأولية والمجتمعية','الصحة العامة','الصحة المهنية'),
  S(1,'التشغيل','الخدمات المساندة','الخدمات البيئية',null,null,null,'PHC'),
  S(1,'الخدمات الطبية والإكلينيكية','الخدمات الصحية المساندة','خدمات الصحة النفسية',null,null,null,'PHC',null,'المساعدة (مسمى غير واضح)'),
];

export const V4_DEPARTMENT_LABELS = [
  'الإدارة الرئيسية','الإدارة الفرعية','القسم','الوحدة الفرعية'
] as const;

export type DepartmentMatchStatus = 'matchable'|'source_review'|'excluded_historical';
export type SourcePathReview = {
  path: string[];
  key: string;
  sourceEmployees: number;
  rowCount: number;
  status: DepartmentMatchStatus;
  note: string;
};

const normalize = (value: string) => value.trim().replace(/\\s+/g,' ');
export const departmentPathKey = (path: readonly string[]) =>
  path.map(normalize).join(' / ');

export function classifySource(row: DepartmentSourceRow): {status:DepartmentMatchStatus,note:string} {
  const [main,sub,department,unit] = row.levels;
  if (main === 'التشغيل')
    return {status:'excluded_historical',note:'مسار سابق مستبعد من التأسيس الجديد؛ يحفظ للمراجعة دون حذف'};
  if ((unit && !department) || (department && !sub) || (sub && !main))
    return {status:'source_review',note:'يوجد مستوى أدنى دون مستوى أعلى مثبت في المصدر'};
  if (row.sector && !sub)
    return {status:'source_review',note:'تبعية قطاع استشاري دون قسم محدد؛ ليست قسمًا جديدًا'};
  if (!sub)
    return {status:'source_review',note:'إدارة رئيسية فقط؛ لا يوجد قسم أو إدارة فرعية مثبتة'};
  return {status:'matchable',note:'مسار قابل للمطابقة مع سجل الجهات (لا يعني اعتمادًا رسميًا)'};
}

export function sourceOrganizationPaths(): SourcePathReview[] {
  const grouped=new Map<string,SourcePathReview>();
  for(const row of V4_DEPARTMENT_SOURCE_ROWS){
    const path=row.levels.filter((x):x is string=>Boolean(x));
    const key=departmentPathKey(path);
    const check=classifySource(row);
    const prev=grouped.get(key+'#'+check.status);
    if(prev){prev.sourceEmployees+=row.sourceEmployees;prev.rowCount++;continue;}
    grouped.set(key+'#'+check.status,{
      path,key,sourceEmployees:row.sourceEmployees,rowCount:1,
      status:check.status,note:check.note
    });
  }
  return [...grouped.values()];
}

export type DepartmentNode = {id:number;parent_id:number|null;name:string;code:string;is_active:boolean;is_approved:boolean};
export function knownDepartmentPaths(units:readonly DepartmentNode[]) {
  const byId=new Map(units.map(x=>[x.id,x]));
  const paths=new Map<number,{path:string[],status:'valid'|'orphan'|'cycle'}>();
  for(const row of units) {
    const names:string[]=[];
    let id:number|null=row.id;
    const visited=new Set<number>();
    let status:'valid'|'orphan'|'cycle'='valid';
    while(id!==null){
      if(visited.has(id)){status='cycle';break;}
      visited.add(id);
      const cur=byId.get(id);
      if(!cur){status='orphan';break;}
      names.unshift(normalize(cur.name));
      id=cur.parent_id;
    }
    paths.set(row.id,{path:names,status});
  }
  return paths;
}

export function auditDepartmentPaths(units:readonly DepartmentNode[]) {
  const actual=knownDepartmentPaths(units);
  const known=new Set([...actual.values()]
    .filter(x=>x.status==='valid').map(x=>departmentPathKey(x.path)));
  const source=sourceOrganizationPaths();
  const matchable=source.filter(row=>row.status==='matchable');
  return {
    source, actual, matchableCount:matchable.length,
    matched:matchable.filter(row=>known.has(row.key)),
    missing:matchable.filter(row=>!known.has(row.key)),
    review:source.filter(row=>row.status!=='matchable'),
    broken:units.filter(node=>actual.get(node.id)?.status!=='valid'),
  };
}
