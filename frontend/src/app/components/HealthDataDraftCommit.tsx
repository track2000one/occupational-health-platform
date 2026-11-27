import { useState } from 'react';
import { healthFieldLabel } from '../utils/healthImportLabels';
import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, Paper, Stack, TextField, Typography } from '@mui/material';
import { authFetch } from '../context/AuthContext';

type Row = { row: number; status: 'ready'|'review'|'unchanged'; reason: string;
  blockers?: string[]; eligible_fields: string[]; conflict_fields: string[]; review_fields: string[]; matched_fields: string[] };
type Plan = { rows: Row[]; counts: Record<string, number>; eligible_values: number; preview_token: string };
const labels: Record<string,string> = { ready:'مؤهل', review:'موقوف للمراجعة', unchanged:'دون تعديل',
  not_verified_synthetic:'ليس موظف اختبار موثقًا', approved_card:'بطاقة معتمدة',
  specialized_records:'سجلات صحية متخصصة قائمة', invalid_existing_card:'بنية بطاقة غير صالحة',
  card_conflict:'تعارض مع البطاقة', ambiguous_or_invalid:'قيم تحتاج مراجعة',
  same_card_values:'القيم مطابقة', no_values:'لا توجد قيم', duplicate:'هوية مكررة',
  identity_review:'مطابقة غير مؤكدة', unmatched:'غير مطابق ضمن نطاق الاختبار', inactive:'غير نشط أو غير موثق' };
const blockerLabels:Record<string,string> = {
  EmployeeHealthProfile:'ملف صحي متخصص', EmployeeHealthObservation:'تقييم صحي مؤرخ',
  LabTest:'تحليل مخبري', LabScreening:'فحص مخبري', Vaccination:'تطعيم', VaccinationRecord:'سجل تطعيم',
  ClinicVisit:'زيارة عيادة', EmployeeClinicVisit:'زيارة موظف', OccupationalClinicVisit:'زيارة صحة مهنية',
  OccupationalHealthAssessment:'تقييم لياقة العمل', CommitteeReferral:'إحالة للهيئة الطبية',
  MedicalCommitteeCase:'حالة هيئة طبية', InjuryCase:'إصابة عمل', NeedleStickExposure:'تعرض مهني',
  ScreeningProgramRecord:'برنامج فحص وقائي', latest_virtual_visit:'تاريخ زيارة افتراضية في سجل الموظف',
  latest_field_visit:'تاريخ زيارة ميدانية في سجل الموظف', lab_request:'طلب تحليل في سجل الموظف',
  lab_request_date:'تاريخ طلب تحليل في سجل الموظف'
};
const confirmationPhrase = 'استكمال مسودات الاختبار';

export function HealthDataDraftCommit({ file, api }: { file: File; api: string }) {
  const [plan, setPlan] = useState<Plan|null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [reason, setReason] = useState('');
  const [phrase, setPhrase] = useState('');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  async function send<T>(action: string, more: Record<string,string> = {}): Promise<T> {
    if (!api || !/staging/i.test(new URL(api).hostname)) throw new Error('اتصال Staging غير مضبوط.');
    const data = new FormData();
    data.append('file', file); data.append('action', action); data.append('synthetic_confirmed','true');
    Object.entries(more).forEach(([k,v]) => data.append(k,v));
    const response = await authFetch(api + '/health-data-import/draft-commit/', { method:'POST', body:data });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || 'تعذر تنفيذ الإجراء.');
    return result as T;
  }
  async function inspect() {
    setBusy(true); setError(''); setSuccess(''); setPlan(null); setSelected([]); setAck(false); setPhrase(''); setReason('');
    try { setPlan(await send<Plan>('preview')); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر الفحص'); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (busy || !plan || !selected.length || !ack || phrase !== confirmationPhrase || reason.trim().length < 10) return;
    setBusy(true); setError('');
    try {
      const result = await send<{updated_cards:number;updated_values:number;batch_id:number}>('apply', {
        preview_token:plan.preview_token, selected_rows:JSON.stringify(selected), reason:reason.trim(), confirmation:phrase
      });
      setSuccess('تم استكمال ' + result.updated_values + ' قيمة في ' + result.updated_cards + ' مسودة بطاقة اختبار. رقم الدفعة: ' + result.batch_id);
    } catch(e) { setError(e instanceof Error ? e.message : 'تعذر الحفظ'); }
    finally { setBusy(false); setPlan(null); setSelected([]); setAck(false); setPhrase(''); }
  }
  return <Paper sx={{p:2,borderRadius:3}}><Stack gap={2}>
    <Typography variant="h6" fontWeight={800}>اعتماد الاستكمال التجريبي للبطاقة الصحية</Typography>
    <Alert severity="warning">يسمح بحفظ مسودات موظفي الاختبار الموثقين فقط. لا يحفظ أي قيمة متعارضة أو ملتبسة، ولا يعدّل بطاقة معتمدة أو سجلًا صحيًا متخصصًا. استخدم بيانات اصطناعية فقط.</Alert>
    <Button variant="outlined" disabled={busy} onClick={() => void inspect()}>معاينة السجلات المؤهلة للحفظ</Button>
    {error && <Alert severity="error">{error}</Alert>}
    {success && <Alert severity="success">{success}</Alert>}
    {plan && <>
      <Stack direction="row" gap={1} flexWrap="wrap">
        <Chip color="success" label={'مؤهل: '+plan.counts.ready}/>
        <Chip color="warning" label={'مراجعة: '+plan.counts.review}/>
        <Chip label={'دون تعديل: '+plan.counts.unchanged}/>
        <Chip label={'قيم قابلة للاستكمال: '+plan.eligible_values}/>
      </Stack>
      <Stack direction="row" gap={1} flexWrap="wrap">
        <Button disabled={busy||!plan.counts.ready} onClick={() => {setSelected(plan.rows.filter(r=>r.status==='ready').map(r=>r.row));setAck(false);}}>تحديد جميع المؤهلين</Button>
        <Button disabled={busy} onClick={() => {setSelected([]);setAck(false);}}>إلغاء التحديد</Button>
        <Typography>المحدد: {selected.length}</Typography>
      </Stack>
      <Box sx={{maxHeight:520,overflowY:'auto',display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,minmax(0,1fr))',xl:'repeat(3,minmax(0,1fr))'},gap:1.5}}>
        {plan.rows.map(r=><Paper key={r.row} variant="outlined" sx={{p:2,borderRadius:2,minWidth:0}}>
          <Stack gap={1}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap">
              <Typography fontWeight={800}>صف Excel: {r.row}</Typography>
              <Chip size="small" color={r.status==='ready'?'success':r.status==='review'?'warning':'default'} label={labels[r.status]}/>
            </Stack>
            {r.reason && <Typography fontWeight={700} sx={{overflowWrap:'anywhere'}}>{labels[r.reason]||'يحتاج مراجعة'}</Typography>}
            {!!r.blockers?.length && <Alert severity="warning">سبب الإيقاف: {r.blockers.map(k=>blockerLabels[k]||'سجل متخصص').join('، ')}. تُحفظ السجلات السابقة دون تغيير.</Alert>}
            {([{label:'الحقول المؤهلة للاستكمال',values:r.eligible_fields},{label:'الحقول المطابقة',values:r.matched_fields},
               {label:'الحقول المتعارضة',values:r.conflict_fields},{label:'حقول تحتاج مراجعة',values:r.review_fields}]).map(item=>
               <Box key={item.label} sx={{borderTop:'1px solid',borderColor:'divider',pt:1}}>
                <Typography variant="caption" color="text.secondary">{item.label} ({item.values.length})</Typography>
                <Typography variant="body2" sx={{overflowWrap:'anywhere'}}>{item.values.map(healthFieldLabel).join('، ')||'—'}</Typography>
               </Box>)}
            <FormControlLabel control={<Checkbox checked={selected.includes(r.row)} disabled={busy||r.status!=='ready'} onChange={(_,checked)=>{setSelected(old=>checked?[...old,r.row]:old.filter(i=>i!==r.row));setAck(false);}}/>} label={r.status==='ready'?'تحديد للاستكمال':'غير قابل للتحديد للحفظ'}/>
          </Stack>
        </Paper>)}
      </Box>
      {plan.counts.ready === 0 && <Alert severity="info">لا توجد صفوف مؤهلة للحفظ. راجع أسباب الإيقاف أو أسّس سجلات الاختبار المخصصة ثم نزّل عينة جديدة.</Alert>}
      {plan.counts.ready > 0 && <>
      <TextField label="سبب الاستكمال ومرجع الاختبار (دون بيانات شخصية أو صحية)" value={reason} disabled={busy} onChange={e=>{setReason(e.target.value);setAck(false);}} helperText="10 إلى 350 حرفًا" slotProps={{htmlInput:{maxLength:350}}}/>
      <TextField label={'اكتب: '+confirmationPhrase} value={phrase} disabled={busy} onChange={e=>setPhrase(e.target.value)}/>
      <FormControlLabel control={<Checkbox checked={ack} disabled={busy||!selected.length} onChange={(_,v)=>setAck(v)}/>} label="راجعت الملف الاصطناعي وأوافق على استكمال الحقول الناقصة فقط دون اعتماد طبي."/>
      <Button variant="contained" disabled={busy||!selected.length||!ack||phrase!==confirmationPhrase||reason.trim().length<10||reason.trim().length>350} onClick={()=>void apply()}>تأكيد استكمال {selected.length} مسودة اختبار</Button>
      </>}
    </>}
  </Stack></Paper>;
}
