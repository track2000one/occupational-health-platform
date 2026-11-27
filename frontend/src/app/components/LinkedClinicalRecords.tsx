import { useDatePreference } from '../context/DatePreferenceContext';
type Source<T> = { items: T[]; has_more: boolean };
type Lab = { id: number; test_type: string; status: string; result: string; record_date: string|null; request_date?:string|null; result_date?:string|null };
type Screening = { id:number; request_status:string; request_date:string|null; result_status:string;
  result_checked_date:string|null; results:{test:string;result:string}[]; follow_up_required:boolean };
type Vaccine = { id:number; vaccine_type:string; dose:string; status:string; next_due_date: string|null; dose_date?:string|null };
type Dose = { label:string;date:string|null };
type Series = {id:number;vaccine_type:string;status:string;campaign_name:string;recorded_dates:Dose[];
  doses:(Dose&{id:number})[];more_doses:boolean;post_vaccine_result:string};
export type LinkedClinicalData = {lab_tests:Source<Lab>;lab_screenings:Source<Screening>;
  vaccinations:Source<Vaccine>;vaccination_records:Source<Series>;read_only:boolean;limit_per_source:number};
const statusLabels:Record<string,string> = {pending:'قيد الانتظار',completed:'مكتمل (حالة السجل)',
  missing:'مفقود',requested:'مطلوب',not_required:'غير مطلوب',given:'معطى (حالة السجل)',
  due:'مستحق',refused:'رفض',contraindicated:'مانع تطعيم',incomplete:'غير مكتمل'};
const val=(s?:string|null)=>s?.trim()||'—';
const state=(s:string)=>statusLabels[s]||val(s);
const doseLabel=(s:string)=>s==='booster'?'منشطة':s;
export function LinkedClinicalRecords({ data }: {data:LinkedClinicalData}) {
  const {formatDate}=useDatePreference();
  const fmt=(s:string|null)=>s?formatDate(s):'—';
  const empty='لا توجد سجلات محفوظة من هذا المصدر.';
  const more=(v:boolean)=>v?<p className="ohc-linked-more">توجد سجلات إضافية في الوحدة المصدر؛ هذا العرض مختصر.</p>:null;
  return <section className="ohc-linked">
    <h3>السجلات المرتبطة مباشرة — التحاليل والمناعة والتطعيمات</h3>
    <p>عرض حي للقراءة فقط من PostgreSQL، منفصل عن قيم البطاقة المحفوظة والاعتماد الطبي. عدم وجود سجل لا يعني نتيجة سلبية أو عدم تلقي اللقاح. يعرض حتى {data.limit_per_source} سجلات من كل مصدر.</p>
    <div className="ohc-linked-grid">
      <section><h4>التحاليل الفردية (LabTest)</h4>
        {!data.lab_tests.items.length&&<p>{empty}</p>}
        {data.lab_tests.items.map(r=><div key={r.id} className="ohc-linked-row">
          <strong>{val(r.test_type)}</strong><span>الحالة: {state(r.status)} • تاريخ السجل: {fmt(r.record_date)}</span>
          <span>تاريخ الطلب: {fmt(r.request_date ?? null)} • تاريخ النتيجة: {fmt(r.result_date ?? null)}</span>
          <span>النتيجة المدونة: {val(r.result)}</span></div>)}{more(data.lab_tests.has_more)}
      </section>
      <section><h4>طلبات الفحوصات والمناعة (LabScreening)</h4>
        {!data.lab_screenings.items.length&&<p>{empty}</p>}
        {data.lab_screenings.items.map(r=><div key={r.id} className="ohc-linked-row">
          <strong>طلب: {state(r.request_status)} — {fmt(r.request_date)}</strong>
          <span>حالة النتيجة المدونة: {val(r.result_status)} • تاريخ المراجعة: {fmt(r.result_checked_date)}</span>
          {r.results.map(x=><span key={x.test}>{x.test}: {val(x.result)}</span>)}
          {r.follow_up_required&&<span>المتابعة مطلوبة حسب السجل</span>}</div>)}{more(data.lab_screenings.has_more)}
      </section>
      <section><h4>سجل التطعيم (Vaccination)</h4>
        {!data.vaccinations.items.length&&<p>{empty}</p>}
        {data.vaccinations.items.map(r=><div key={r.id} className="ohc-linked-row">
          <strong>{val(r.vaccine_type)}</strong><span>الجرعة المدونة: {val(r.dose)} • {state(r.status)}</span>
          <span>تاريخ الجرعة: {fmt(r.dose_date ?? null)}</span>
          <span>موعد الاستحقاق القادم: {fmt(r.next_due_date)}</span></div>)}{more(data.vaccinations.has_more)}
      </section>
      <section><h4>سلاسل التطعيم والجرعات (VaccinationRecord)</h4>
        {!data.vaccination_records.items.length&&<p>{empty}</p>}
        {data.vaccination_records.items.map(r=><div key={r.id} className="ohc-linked-row">
          <strong>{val(r.vaccine_type)} — {state(r.status)}</strong>
          {r.campaign_name&&<span>الحملة: {r.campaign_name}</span>}
          {r.recorded_dates.map(d=><span key={d.label}>تاريخ الجرعة {doseLabel(d.label)} (السلسلة): {fmt(d.date)}</span>)}
          {r.doses.map(d=><span key={d.id}>الجرعة {doseLabel(d.label)} (سجل الجرعات): {fmt(d.date)}</span>)}
          {more(r.more_doses)}
          {r.post_vaccine_result&&<span>نتيجة ما بعد التطعيم المدونة: {r.post_vaccine_result}</span>}
        </div>)}{more(data.vaccination_records.has_more)}
      </section>
    </div>
  </section>;
}
