import { useDatePreference } from '../context/DatePreferenceContext';
type Source<T>={items:T[];has_more:boolean};
type Visit={id:number;visit_date:string|null;clinic_type?:string;visit_time?:string|null;
 diagnosis?:string;action_taken?:string;status?:string;sick_leave_days?:number|null;
 follow_up_date?:string|null;weight_kg?:string|null};
type Injury={id:number;exposure_date:string|null;workplace:string;status:string;
 injury_method?:string;referred_to_employee_clinic?:boolean};
export type LinkedVisitInjuryData={clinic_visits?:Source<Visit>;employee_clinic_visits?:Source<Visit>;
 occupational_clinic_visits?:Source<Visit>;injury_cases?:Source<Injury>;needle_stick_exposures?:Source<Injury>};
const statuses:Record<string,string>={open:'مفتوح',completed:'مكتمل (حالة السجل)',
 follow_up:'متابعة مطلوبة',new:'جديد',under_review:'قيد المراجعة',
 follow_up_required:'متابعة مطلوبة',closed:'مغلق',referred:'محال'};
const status=(v?:string)=>v?(statuses[v]||v):'—';

export function LinkedVisitInjuryRecords({data}:{data:LinkedVisitInjuryData}){
 const {formatDate}=useDatePreference();
 const fmt=(s?:string|null)=>s?formatDate(s):'—';
 const visits=[{title:'زيارات العيادات (ClinicVisit)',source:data.clinic_visits},
  {title:'زيارات عيادة الموظفين (EmployeeClinicVisit)',source:data.employee_clinic_visits},
  {title:'زيارات الصحة المهنية (OccupationalClinicVisit)',source:data.occupational_clinic_visits}];
 const injuries=[{title:'حالات الإصابات (InjuryCase)',source:data.injury_cases},
  {title:'سجل تعرض وخز الإبر (NeedleStickExposure)',source:data.needle_stick_exposures}];
 if(!visits.some(x=>x.source)&&!injuries.some(x=>x.source))return null;
 const more=(v:boolean)=>v?<p className="ohc-linked-more">توجد سجلات إضافية في الوحدة المصدر.</p>:null;
 return <div>
  <h3 style={{marginTop:16}}>الزيارات الصحية والإصابات المهنية والمتابعات</h3>
  <p>تاريخ الزيارة أو التعرض كما هو مدون في المصدر؛ موعد المتابعة مستقل عن الزيارة الفعلية. عدم وجود سجل لا يثبت عدم وقوع إصابة. لا تُعرض هوية مصدر التعرض أو نتائجه.</p>
  <div className="ohc-linked-grid">
   {visits.map(({title,source})=>source&&<section key={title}><h4>{title}</h4>
    {!source.items.length&&<p>لا توجد سجلات محفوظة من هذا المصدر.</p>}
    {source.items.map(r=><div key={r.id} className="ohc-linked-row">
     <strong>تاريخ الزيارة: {fmt(r.visit_date)} {r.visit_time?' — '+r.visit_time.slice(0,5):''}</strong>
     {r.clinic_type&&<span>نوع العيادة: {r.clinic_type}</span>}
     {r.status&&<span>حالة السجل: {status(r.status)}</span>}
     {r.diagnosis&&<span>التشخيص المدون: {r.diagnosis}</span>}
     {r.action_taken&&<span>الإجراء المدون: {r.action_taken}</span>}
     {r.weight_kg!=null&&<span>الوزن المسجل: {r.weight_kg} كجم</span>}
     {r.sick_leave_days!=null&&<span>أيام الإجازة المدونة: {r.sick_leave_days}</span>}
     {'follow_up_date' in r&&<span>موعد المتابعة المدون: {fmt(r.follow_up_date)}</span>}
    </div>)}{more(source.has_more)}
   </section>)}
   {injuries.map(({title,source})=>source&&<section key={title}><h4>{title}</h4>
    {!source.items.length&&<p>لا توجد سجلات محفوظة من هذا المصدر.</p>}
    {source.items.map(r=><div key={r.id} className="ohc-linked-row">
     <strong>تاريخ التعرض: {fmt(r.exposure_date)}</strong>
     <span>حالة السجل: {status(r.status)}</span>
     {r.workplace&&<span>مكان العمل: {r.workplace}</span>}
     {r.injury_method&&<span>طريقة الإصابة المدونة: {r.injury_method}</span>}
     {r.referred_to_employee_clinic===true&&<span>محال إلى عيادة الموظفين حسب السجل</span>}
    </div>)}{more(source.has_more)}
   </section>)}
  </div>
 </div>;
}
