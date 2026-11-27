import { useEffect, useState } from 'react';
import { Alert, Autocomplete, Box, Button, Checkbox, FormControlLabel, MenuItem, Paper, Stack,
 Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { authFetch, useAuth } from '../context/AuthContext';
import { CalendarDateField } from './CalendarDateField';
import { DateText } from '../context/DatePreferenceContext';
import { useNavigate } from 'react-router-dom';
type Employee = {id:number;name:string;number:string};
type Row = {id:number;status:string;test_type?:string;result?:string;record_date?:string|null;request_date?:string|null;result_date?:string|null;vaccine_type?:string;dose?:string;dose_date?:string|null;next_due_date?:string|null};
type Page = {items:Row[];page:number;total:number;has_more:boolean;employee_id:number};
const API=(import.meta.env.VITE_API_URL||'').replace(/\/$/,'');
const LABS=['Anti-HBs','HBsAg','HCV','HIV','PPD','Rubella IgG','Measles IgG','Varicella IgG','CBC','Urine Analysis'];
const VACCINES=['HBV','Influenza','MMR','MCV4','COVID-19','Varicella','HPV','Tetanus'];
const labels:Record<string,string>={pending:'قيد الانتظار',completed:'مكتمل',missing:'مفقود',given:'جرعة معطاة',due:'مستحق',refused:'رفض',contraindicated:'مانع تطعيم'};
const initial={type:'',date:'',due:'',dose:'1',result:'',notes:''};
async function api<T>(path:string,options:RequestInit={}):Promise<T>{
 if(!API||!/staging/i.test(new URL(API).hostname))throw new Error('اتصال Staging غير مضبوط.');
 const response=await authFetch(API+'/staging-clinical/'+path,{...options,headers:{'Content-Type':'application/json',...options.headers}});
 const data=await response.json();
 if(!response.ok)throw new Error(data.detail||'تعذر تنفيذ الإجراء.');
 return data as T;
}
export function PersistentClinicalPage({kind}:{kind:'labs'|'vaccines'}){
 const {user}=useAuth();const nav=useNavigate();const labs=kind==='labs';
 const allowed=user?.isSuperuser===true&&/staging/i.test(window.location.hostname);
 const [employees,setEmployees]=useState<Employee[]>([]),[employee,setEmployee]=useState<Employee|null>(null);
 const [page,setPage]=useState(1),[revision,setRevision]=useState(0),[records,setRecords]=useState<Page|null>(null);
 const [form,setForm]=useState(initial),[edit,setEdit]=useState<Row|null>(null),[confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 useEffect(()=>{if(!allowed)return;let live=true;
 api<{employees:Employee[]}>('employees/').then(r=>{if(live)setEmployees(r.employees);}).catch(e=>{if(live)setError(e.message);});
 return()=>{live=false;};},[allowed]);
 useEffect(()=>{setRecords(null);if(!allowed||!employee){setLoading(false);return;}let live=true;setLoading(true);
 api<Page>('employees/'+employee.id+'/?kind='+kind+'&page='+page).then(r=>{if(live&&r.employee_id===employee.id)setRecords(r);})
 .catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[allowed,employee,kind,page,revision]);
 function reset(){setForm(initial);setEdit(null);setConfirmed(false);}
 async function save(){
 if(!employee||!confirmed||busy||!form.date||(!edit&&!form.type)||(edit&&!form.result.trim()))return;
 setBusy(true);setError('');setSuccess('');
 const body=edit?{action:'lab_result',record_id:edit.id,result:form.result.trim(),result_date:form.date,notes:form.notes}
 :labs?{action:'lab_request',test_type:form.type,request_date:form.date,notes:form.notes}
 :{action:'vaccine_given',vaccine_type:form.type,dose:form.dose,dose_date:form.date,next_due_date:form.due||null,notes:form.notes};
 try{await api<Row>('employees/'+employee.id+'/',{method:'POST',body:JSON.stringify({...body,synthetic_confirmed:true})});
 setSuccess('تم الحفظ في PostgreSQL. حدّث البطاقة الصحية للاطلاع على السجل.');reset();setPage(1);setRevision(v=>v+1);}
 catch(e){setError(e instanceof Error?e.message:'تعذر الحفظ. حدّث السجلات قبل المحاولة.');}finally{setBusy(false);}
 }
 if(!allowed)return <Alert severity="warning">الإدخال الفعلي محصور بالمسؤول الأعلى في Staging.</Alert>;
 return <Box dir="rtl"><Stack gap={2}>
 <Typography variant="h4" fontWeight={900}>{labs?'التحاليل المخبرية':'التطعيمات والجرعات'}</Typography>
 <Alert severity="warning">بيئة الاختبار — بيانات اصطناعية فقط. لا يُستنتج تحصين أو تشخيص من رقم الجرعة أو حالة الطلب.</Alert>
 <Paper sx={{p:2}}><Stack gap={2}>
 <Autocomplete options={employees} value={employee} disabled={busy} getOptionLabel={e=>e.name+' — '+e.number}
 isOptionEqualToValue={(a,b)=>a.id===b.id} onChange={(_,e)=>{setEmployee(e);setPage(1);reset();setError('');setSuccess('');setRecords(null);}}
 renderInput={p=><TextField {...p} label="اختر موظف اختبار موثقًا"/>}/>
 {employee&&<Stack direction="row" gap={1}><Button variant="outlined" onClick={()=>nav('/employees/'+employee.id+'/health-card')}>البطاقة الصحية</Button><Button disabled={busy||loading} onClick={()=>setRevision(v=>v+1)}>تحديث السجلات</Button></Stack>}
 {!employees.length&&<Typography color="text.secondary">لا توجد بطاقات اختبار متاحة أو لم يكتمل التحميل.</Typography>}
 </Stack></Paper>
 {error&&<Alert severity="error">{error}</Alert>}{success&&<Alert severity="success">{success}</Alert>}
 {employee&&<Paper sx={{p:2}}><Stack gap={2}>
 <Typography variant="h6" fontWeight={800}>{edit?'إدخال نتيجة طلب #'+edit.id:labs?'طلب تحليل جديد':'تسجيل جرعة معطاة'}</Typography>
 {edit?<Typography>{edit.test_type} — تاريخ الطلب: {edit.request_date}</Typography>:<TextField select label={labs?'نوع التحليل':'نوع اللقاح'} value={form.type} disabled={busy} onChange={e=>setForm(p=>({...p,type:e.target.value}))}>{(labs?LABS:VACCINES).map(t=><MenuItem key={t} value={t}>{t}</MenuItem>)}</TextField>}
 {edit&&<TextField label="النتيجة المدونة" value={form.result} disabled={busy} onChange={e=>setForm(p=>({...p,result:e.target.value}))}/>}
 {!labs&&<TextField select label="رقم الجرعة" value={form.dose} disabled={busy} onChange={e=>setForm(p=>({...p,dose:e.target.value}))}>{['1','2','3','booster'].map(d=><MenuItem key={d} value={d}>{d==='booster'?'منشطة':d}</MenuItem>)}</TextField>}
 <CalendarDateField required label={edit?'تاريخ النتيجة':labs?'تاريخ الطلب':'تاريخ إعطاء الجرعة'} value={form.date} onChange={v=>setForm(p=>({...p,date:v}))}/>
 {!labs&&<CalendarDateField label="تاريخ الاستحقاق القادم (اختياري)" value={form.due} onChange={v=>setForm(p=>({...p,due:v}))}/>}
 <TextField multiline minRows={2} label="ملاحظات الاختبار فقط" value={form.notes} disabled={busy} onChange={e=>setForm(p=>({...p,notes:e.target.value}))}/>
 <FormControlLabel control={<Checkbox checked={confirmed} disabled={busy} onChange={(_,v)=>setConfirmed(v)}/>} label="أؤكد أن البيانات اصطناعية والقيم والتواريخ مدخلة كما هي."/>
 <Stack direction="row" gap={1}><Button variant="contained" disabled={busy||!confirmed||!form.date||(!edit&&!form.type)||(!!edit&&!form.result.trim())} onClick={()=>void save()}>{busy?'جارٍ الحفظ…':edit?'حفظ النتيجة':labs?'حفظ الطلب':'حفظ الجرعة'}</Button><Button disabled={busy} onClick={reset}>إلغاء / تفريغ</Button></Stack>
 </Stack></Paper>}
 {employee&&<Paper sx={{p:2}}>
 <Typography variant="h6" fontWeight={800}>السجلات المحفوظة {records?'— '+records.total:''}</Typography>
 {loading&&<Typography>جارٍ التحميل…</Typography>}
 {records&&<><TableContainer><Table size="small"><TableHead><TableRow>{(labs?['رقم','التحليل','الحالة','تاريخ الطلب','تاريخ النتيجة','النتيجة','إجراء']:['رقم','اللقاح','الجرعة','الحالة','تاريخ الجرعة','الاستحقاق']).map(h=><TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead>
 <TableBody>{records.items.map(r=><TableRow key={r.id}><TableCell>{r.id}</TableCell><TableCell>{labs?r.test_type:r.vaccine_type}</TableCell>
 {!labs&&<TableCell>{r.dose==='booster'?'منشطة':r.dose}</TableCell>}<TableCell>{labels[r.status]||r.status}</TableCell>
 {labs?<><TableCell><DateText value={r.request_date||undefined}/></TableCell><TableCell><DateText value={r.result_date||undefined}/></TableCell><TableCell>{r.result||'—'}</TableCell>
 <TableCell>{r.status==='pending'&&r.request_date&&!r.result&&!r.result_date?<Button disabled={busy} onClick={()=>{reset();setEdit(r);}}>إدخال النتيجة</Button>:'—'}</TableCell></>
 :<><TableCell><DateText value={r.dose_date||undefined}/></TableCell><TableCell><DateText value={r.next_due_date||undefined}/></TableCell></>}</TableRow>)}</TableBody></Table></TableContainer>
 {!records.items.length&&<Typography sx={{p:2}}>لا توجد سجلات من هذا النوع.</Typography>}
 <Stack direction="row" alignItems="center" gap={1}><Button disabled={busy||loading||page<=1} onClick={()=>setPage(v=>v-1)}>السابق</Button><Typography>صفحة {page}</Typography><Button disabled={busy||loading||!records.has_more} onClick={()=>setPage(v=>v+1)}>التالي</Button></Stack></>}
 </Paper>}
 </Stack></Box>;
}
