import { useEffect, useState } from 'react';
import { Alert, Autocomplete, Box, Button, Checkbox, FormControlLabel, MenuItem, Paper, Stack,
 Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { authFetch, useAuth } from '../context/AuthContext';
import { CalendarDateField } from './CalendarDateField';
import { DateText } from '../context/DatePreferenceContext';
import { useNavigate } from 'react-router-dom';
import { fitnessTypes, fitnessDecisions, committeeStatuses, type FitnessRow, type CommitteeRow } from './LinkedFitnessCommitteeRecords';
type Employee={id:number;name:string;number:string};
type Page={items:(FitnessRow|CommitteeRow)[];total:number;page:number;has_more:boolean;employee_id:number};
const API=(import.meta.env.VITE_API_URL||'').replace(/\/$/,'');
const empty={date:'',type:'',decision:'',restrictions:'',next:'',diagnosis:'',recommendations:''};
async function api<T>(path:string,options:RequestInit={}):Promise<T>{
 if(!API||!/staging/i.test(new URL(API).hostname))throw new Error('اتصال Staging غير مضبوط.');
 const res=await authFetch(API+'/staging-clinical/'+path,{...options,headers:{'Content-Type':'application/json',...options.headers}});
 const data=await res.json();if(!res.ok)throw new Error(data.detail||'تعذر تنفيذ العملية.');return data as T;
}
export function FitnessCommitteePage({kind}:{kind:'fitness'|'committee'}){
 const {user}=useAuth();const nav=useNavigate();const fitness=kind==='fitness';
 const allowed=user?.isSuperuser===true&&/staging/i.test(window.location.hostname);
 const [employees,setEmployees]=useState<Employee[]>([]),[employee,setEmployee]=useState<Employee|null>(null);
 const [page,setPage]=useState(1),[revision,setRevision]=useState(0),[records,setRecords]=useState<Page|null>(null);
 const [form,setForm]=useState(empty),[edit,setEdit]=useState<CommitteeRow|null>(null),[ack,setAck]=useState(false);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 const set=(key:keyof typeof empty,v:string)=>{setForm(p=>({...p,[key]:v}));setAck(false);};
 function reset(){setForm(empty);setEdit(null);setAck(false);}
 useEffect(()=>{if(!allowed)return;let live=true;api<{employees:Employee[]}>('employees/').then(r=>{if(live)setEmployees(r.employees);})
 .catch(e=>{if(live)setError(e instanceof Error?e.message:'تعذر تحميل الموظفين.');});return()=>{live=false;};},[allowed]);
 useEffect(()=>{setRecords(null);if(!allowed||!employee){setLoading(false);return;}let live=true;setLoading(true);
 api<Page>('employees/'+employee.id+'/fitness-committee/?kind='+kind+'&page='+page).then(r=>{if(live&&r.employee_id===employee.id)setRecords(r);})
 .catch(e=>{if(live)setError(e instanceof Error?e.message:'تعذر تحميل السجلات.');}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[allowed,employee,kind,page,revision]);
 const valid=!!form.date&&(fitness?!!form.type&&!!form.decision&&(form.decision!=='fitWithRestrictions'||!!form.restrictions.trim()):edit?!!form.decision.trim():!!form.diagnosis.trim());
 async function save(){
 if(!employee||!valid||!ack||busy)return;
 setBusy(true);setError('');setSuccess('');
 const body=fitness?{action:'fitness',assessment_date:form.date,assessment_type:form.type,fitness_decision:form.decision,restrictions:form.restrictions,next_assessment_date:form.next||null}
 :edit?{action:'decision',record_id:edit.id,decision_date:form.date,decision:form.decision,recommendations:form.recommendations}
 :{action:'referral',referral_date:form.date,diagnosis:form.diagnosis};
 try{await api('employees/'+employee.id+'/fitness-committee/',{method:'POST',body:JSON.stringify({...body,synthetic_confirmed:true})});
 setSuccess('تم حفظ سجل الاختبار. حدّث البطاقة الصحية لعرضه دون تعديل اعتمادها.');reset();setPage(1);setRevision(v=>v+1);}
 catch(e){setError(e instanceof Error?e.message:'تعذر الحفظ؛ حدّث السجلات للتحقق.');}finally{setBusy(false);}
 }
 if(!allowed)return <Alert severity="warning">هذه المرحلة للاختبار الاصطناعي بواسطة المسؤول الأعلى في Staging فقط.</Alert>;
 return <Box dir="rtl"><Stack gap={2}>
 <Typography variant="h4" fontWeight={900}>{fitness?'تقييمات اللياقة الطبية':'اللجان الطبية والإحالات'}</Typography>
 <Alert severity="warning">بيانات اصطناعية فقط. التسجيل ليس قرارًا طبيًا حقيقيًا أو اعتمادًا للبطاقة أو إحالة فعلية. لا تُدخل أي بيانات صحية حقيقية.</Alert>
 <Paper sx={{p:2}}><Stack gap={2}>
 <Autocomplete options={employees} value={employee} disabled={busy} getOptionLabel={e=>e.name+' — '+e.number}
 isOptionEqualToValue={(a,b)=>a.id===b.id} onChange={(_,e)=>{setEmployee(e);setPage(1);setRecords(null);reset();setError('');setSuccess('');}}
 renderInput={p=><TextField {...p} label="اختر موظف اختبار موثقًا"/>}/>
 {!employees.length&&<Typography color="text.secondary">لا توجد بطاقات اختبار متاحة أو لم يكتمل التحميل.</Typography>}
 {employee&&<Stack direction="row" gap={1}><Button variant="outlined" onClick={()=>nav('/employees/'+employee.id+'/health-card')}>البطاقة الصحية</Button><Button disabled={busy||loading} onClick={()=>setRevision(v=>v+1)}>تحديث السجلات</Button></Stack>}
 </Stack></Paper>
 {error&&<Alert severity="error">{error}</Alert>}{success&&<Alert severity="success">{success}</Alert>}
 {employee&&<Paper sx={{p:2}}><Stack gap={2}>
 <Typography variant="h6" fontWeight={800}>{fitness?'تقييم لياقة اصطناعي':edit?'تسجيل قرار اختبار للإحالة #'+edit.id:'إحالة اختبار جديدة'}</Typography>
 <CalendarDateField required label={fitness?'تاريخ التقييم':edit?'تاريخ القرار':'تاريخ الإحالة'} value={form.date} onChange={v=>set('date',v)}/>
 {fitness?<><TextField select label="نوع التقييم" value={form.type} disabled={busy} onChange={e=>set('type',e.target.value)}>{Object.entries(fitnessTypes).map(([k,v])=><MenuItem key={k} value={k}>{v}</MenuItem>)}</TextField>
 <TextField select label="قرار اللياقة المدون" value={form.decision} disabled={busy} onChange={e=>set('decision',e.target.value)}>{Object.entries(fitnessDecisions).map(([k,v])=><MenuItem key={k} value={k}>{v}</MenuItem>)}</TextField>
 <TextField multiline label="القيود المدونة" value={form.restrictions} disabled={busy} onChange={e=>set('restrictions',e.target.value)}/>
 <CalendarDateField label="موعد إعادة التقييم (اختياري)" value={form.next} onChange={v=>set('next',v)}/></>:edit?<><Typography>سبب الإحالة المدون: {edit.diagnosis}</Typography>
 <TextField multiline label="القرار الاصطناعي المدون" value={form.decision} disabled={busy} onChange={e=>set('decision',e.target.value)}/>
 <TextField multiline label="التوصيات المدونة (اختياري)" value={form.recommendations} disabled={busy} onChange={e=>set('recommendations',e.target.value)}/></>:
 <TextField multiline label="التشخيص / سبب الإحالة الاصطناعي" value={form.diagnosis} disabled={busy} onChange={e=>set('diagnosis',e.target.value)}/>}
 <FormControlLabel control={<Checkbox checked={ack} disabled={busy} onChange={(_,v)=>setAck(v)}/>} label="أؤكد أن السجل والقرار للاختبار فقط."/>
 <Stack direction="row" gap={1}><Button variant="contained" disabled={busy||!valid||!ack} onClick={()=>void save()}>{busy?'جارٍ الحفظ…':'حفظ سجل الاختبار'}</Button><Button disabled={busy} onClick={reset}>إلغاء / تفريغ</Button></Stack>
 </Stack></Paper>}
 {employee&&<Paper sx={{p:2}}><Typography variant="h6" fontWeight={800}>السجلات المحفوظة {records?'— '+records.total:''}</Typography>
 {loading&&<Typography>جارٍ التحميل…</Typography>}
 {records&&<><TableContainer><Table size="small"><TableHead><TableRow>{(fitness?['رقم','تاريخ التقييم','نوع التقييم','القرار المدون','القيود','إعادة التقييم']:['رقم','تاريخ الإحالة','التشخيص','الحالة','القرار','تاريخ القرار','التوصيات','إجراء']).map(h=><TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead>
 <TableBody>{records.items.map(r=>'assessment_type' in r?<TableRow key={r.id}><TableCell>{r.id}</TableCell><TableCell><DateText value={r.assessment_date}/></TableCell><TableCell>{fitnessTypes[r.assessment_type]||r.assessment_type}</TableCell><TableCell>{fitnessDecisions[r.fitness_decision]||r.fitness_decision}</TableCell><TableCell>{r.restrictions||'—'}</TableCell><TableCell><DateText value={r.next_assessment_date||undefined}/></TableCell></TableRow>:
 <TableRow key={r.id}><TableCell>{r.id}</TableCell><TableCell><DateText value={r.referral_date||undefined}/></TableCell><TableCell>{r.diagnosis||'—'}</TableCell><TableCell>{committeeStatuses[r.status]||r.status}</TableCell><TableCell>{r.decision||'—'}</TableCell><TableCell><DateText value={r.decision_date||undefined}/></TableCell><TableCell>{r.recommendations||'—'}</TableCell>
 <TableCell>{r.qa_workflow&&r.status==='under_review'&&r.referral_date&&!r.decision&&!r.decision_date?<Button disabled={busy} onClick={()=>{reset();setEdit(r);}}>تسجيل القرار</Button>:'—'}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
 {!records.items.length&&<Typography sx={{p:2}}>لا توجد سجلات محفوظة.</Typography>}
 <Stack direction="row" alignItems="center" gap={1}><Button disabled={busy||loading||page<=1} onClick={()=>setPage(v=>v-1)}>السابق</Button><Typography>صفحة {page}</Typography><Button disabled={busy||loading||!records.has_more} onClick={()=>setPage(v=>v+1)}>التالي</Button></Stack></>}
 </Paper>}
 </Stack></Box>;
}
