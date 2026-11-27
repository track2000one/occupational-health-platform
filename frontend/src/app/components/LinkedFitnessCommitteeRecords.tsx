import { useDatePreference } from '../context/DatePreferenceContext';
export const fitnessTypes:Record<string,string>={'Pre-employment':'قبل التوظيف',Periodic:'دوري','Return to Work':'العودة إلى العمل',Special:'خاص',Exit:'إنهاء الخدمة'};
export const fitnessDecisions:Record<string,string>={fit:'لائق',fitWithRestrictions:'لائق بقيود',temporarilyUnfit:'غير لائق مؤقتًا',permanentlyUnfit:'غير لائق دائمًا'};
export const committeeStatuses:Record<string,string>={draft:'مسودة',under_review:'قيد المراجعة',decision_issued:'قرار مسجل',closed:'مغلق'};
export type FitnessRow={id:number;assessment_date:string;assessment_type:string;fitness_decision:string;restrictions:string;next_assessment_date:string|null;assessor_name:string};
export type CommitteeRow={id:number;record_date?:string|null;referral_date?:string|null;decision_date:string|null;diagnosis:string;decision:string;recommendations:string;status:string;qa_workflow?:boolean;transaction_number?:string};
type Source<T>={items:T[];has_more:boolean};
export type LinkedFitnessCommitteeData={fitness_assessments?:Source<FitnessRow>;committee_referrals?:Source<CommitteeRow>;medical_committee_cases?:Source<CommitteeRow>};

export function LinkedFitnessCommitteeRecords({data}:{data:LinkedFitnessCommitteeData}){
 const {formatDate}=useDatePreference();
 const fmt=(s?:string|null)=>s?formatDate(s):'غير مدون';
 if(!data.fitness_assessments&&!data.committee_referrals&&!data.medical_committee_cases)return null;
 const more=(v?:boolean)=>v?<p className="ohc-linked-more">توجد سجلات إضافية في الوحدة المصدر.</p>:null;
 const committees=[{title:'الإحالات (CommitteeReferral)',source:data.committee_referrals},{title:'قرارات اللجان التاريخية (MedicalCommitteeCase)',source:data.medical_committee_cases}];
 return <div><h3 style={{marginTop:16}}>اللياقة الطبية واللجان الطبية</h3>
 <p>القرارات كما وردت في السجل، ولا تمثل اعتمادًا جديدًا أو حكمًا على لياقة الموظف الحالية. لا يُستنتج تاريخ القرار من تاريخ الإحالة أو حالة السجل. هذه النسخة للاختبار الاصطناعي فقط.</p>
 <div className="ohc-linked-grid">
 <section><h4>تقييمات اللياقة الطبية</h4>
 {!data.fitness_assessments?.items.length&&<p>لا توجد تقييمات محفوظة.</p>}
 {data.fitness_assessments?.items.map(r=><div key={r.id} className="ohc-linked-row">
 <strong>{fitnessTypes[r.assessment_type]||r.assessment_type} — {fmt(r.assessment_date)}</strong>
 <span>القرار المدون: {fitnessDecisions[r.fitness_decision]||r.fitness_decision||'غير مدون'}</span>
 <span>القيود المدونة: {r.restrictions||'غير مدونة'}</span>
 <span>موعد إعادة التقييم: {fmt(r.next_assessment_date)}</span>
 {r.assessor_name&&<span>المقيّم المدون: {r.assessor_name}</span>}
 </div>)}{more(data.fitness_assessments?.has_more)}
 </section>
 {committees.map(({title,source})=>source&&<section key={title}><h4>{title}</h4>
 {!source.items.length&&<p>لا توجد سجلات محفوظة.</p>}
 {source.items.map(r=><div key={r.id} className="ohc-linked-row">
 <strong>حالة السجل: {committeeStatuses[r.status]||r.status}</strong>
 {r.transaction_number&&<span>رقم المعاملة المدون: {r.transaction_number}</span>}
 {'referral_date' in r&&<span>تاريخ الإحالة: {fmt(r.referral_date)}</span>}
 {r.record_date&&!r.referral_date&&<span>تاريخ السجل القديم (غير محدد الدلالة): {fmt(r.record_date)}</span>}
 <span>تاريخ القرار: {fmt(r.decision_date)}</span>
 {r.diagnosis&&<span>التشخيص المدون: {r.diagnosis}</span>}
 <span>القرار المدون: {r.decision||'غير مدون'}</span>
 {r.recommendations&&<span>التوصيات المدونة: {r.recommendations}</span>}
 </div>)}{more(source.has_more)}</section>)}
 </div></div>;
}
