import { useDatePreference } from '../context/DatePreferenceContext';

export const measures=[['weight_kg','الوزن (كجم)'],['height_cm','الطول (سم)'],['bmi','BMI المدون']] as const;
export const conditions=[['diabetes','السكري'],['hypertension','ارتفاع ضغط الدم'],['thyroid_disease','أمراض الغدة الدرقية'],
 ['asthma','الربو'],['blood_disease','أمراض الدم'],['chronic_disease','مرض مزمن'],['depression','الاكتئاب المدون'],
 ['anxiety','القلق المدون'],['burnout','الاحتراق الوظيفي المدون']] as const;
export const texts=[['physical_activity','النشاط البدني'],['smoking_status','التدخين'],['surgical_history','التاريخ الجراحي'],
 ['family_history','التاريخ العائلي'],['medical_restrictions','القيود الطبية المدونة'],
 ['medical_recommendations','التوصيات الطبية المدونة']] as const;
export const instruments=[['phq','PHQ'],['gad','GAD'],['mbi','MBI']] as const;
type Value=string|boolean|null;
type Observation={id:number;observation_date:string;data:Record<string,Value>};
export type LinkedObservationData={health_profile?:{observation_date:null;data:Record<string,Value>}|null;
 health_observations?:{items:Observation[];has_more:boolean}};
const fmtValue=(v:Value|undefined)=>v===true||v==='yes'?'نعم (مدون)':v===false||v==='no'?'لا (مدون)':v==='unknown'?'غير معروف (مدون)':v==null||v===''?'غير مدون':String(v);

export function HealthObservationRecords({data}:{data:LinkedObservationData}){
 const {formatDate}=useDatePreference();
 if(data.health_observations===undefined&&data.health_profile===undefined)return null;
 const render=(values:Record<string,Value>)=><>
  {[...measures,...conditions,...texts,['obesity_status','تصنيف الوزن المدون'] as const].map(([key,label])=>
   Object.prototype.hasOwnProperty.call(values,key)&&<span key={key}>{label}: {fmtValue(values[key])}</span>)}
  {instruments.map(([key,label])=>values[key+'_result']!=null&&<span key={key}>{label} — النسخة: {fmtValue(values[key+'_version'])} — النتيجة المدونة: {fmtValue(values[key+'_result'])}</span>)}
 </>;
 return <div><h3 style={{marginTop:16}}>التقييمات النفسية والبدنية والتاريخ المرضي</h3>
 <p>القيم والنتائج كما وردت في سجلاتها، دون تصنيف أو استنتاج تشخيص أو درجة خطر. السجل غير المؤرخ ليس تقييمًا حديثًا. بيانات البطاقة المحفوظة مستقلة عن السجلات المرتبطة.</p>
 <div className="ohc-linked-grid">
 <section><h4>الملف الصحي السابق (EmployeeHealthProfile)</h4>
 {data.health_profile?<div className="ohc-linked-row"><strong>تاريخ التقييم: غير مدون</strong>{render(data.health_profile.data)}</div>:<p>لا يوجد ملف صحي مرتبط.</p>}</section>
 <section><h4>التقييمات المؤرخة (EmployeeHealthObservation)</h4>
 {!data.health_observations?.items.length&&<p>لا توجد تقييمات مؤرخة محفوظة.</p>}
 {data.health_observations?.items.map(r=><div key={r.id} className="ohc-linked-row"><strong>تاريخ التقييم: {formatDate(r.observation_date)}</strong>{render(r.data)}</div>)}
 {data.health_observations?.has_more&&<p className="ohc-linked-more">توجد تقييمات إضافية في سجل التقييمات.</p>}</section>
 </div></div>;
}
