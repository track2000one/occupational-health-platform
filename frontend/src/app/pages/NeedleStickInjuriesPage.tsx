import { useEffect, useState } from 'react';
import { Alert, Autocomplete, Box, Button, Checkbox, FormControlLabel, MenuItem, Paper, Stack,
 Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { authFetch, useAuth } from '../context/AuthContext';
import { CalendarDateField } from '../components/CalendarDateField';
import { DateText } from '../context/DatePreferenceContext';
import { useNavigate } from 'react-router-dom';

type Employee={id:number;name:string;number:string};
type Exposure={id:number;exposure_date:string|null;workplace:string;injury_method:string;status:string};
type Page={items:Exposure[];total:number;page:number;has_more:boolean;employee_id:number};
const API=(import.meta.env.VITE_API_URL||'').replace(/\/$/,'');
const methods:Record<string,string>={needle_stick:'وخز إبرة',sharp_object:'أداة حادة',other_exposure:'تعرض آخر'};
const states:Record<string,string>={new:'جديد',under_review:'قيد المراجعة',referred:'محال',closed:'مغلق'};
async function request<T>(path:string,options:RequestInit={}):Promise<T>{
 if(!API||!/staging/i.test(new URL(API).hostname))throw new Error('اتصال Staging غير مضبوط.');
 const res=await authFetch(API+'/staging-clinical/'+path,{...options,headers:{'Content-Type':'application/json',...options.headers}});
 const body=await res.json();if(!res.ok)throw new Error(body.detail||'تعذر تنفيذ الإجراء.');return body as T;
}
export function NeedleStickInjuriesPage(){
 const {user}=useAuth();const nav=useNavigate();
 const allowed=user?.isSuperuser===true&&/staging/i.test(window.location.hostname);
 const [employees,setEmployees]=useState<Employee[]>([]),[employee,setEmployee]=useState<Employee|null>(null);
 const [date,setDate]=useState(''),[method,setMethod]=useState(''),[ack,setAck]=useState(false);
 const [page,setPage]=useState(1),[revision,setRevision]=useState(0),[records,setRecords]=useState<Page|null>(null);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 useEffect(()=>{if(!allowed)return;let live=true;request<{employees:Employee[]}>('employees/').then(r=>{if(live)setEmployees(r.employees);})
 .catch(e=>{if(live)setError(e instanceof Error?e.message:'تعذر تحميل موظفي الاختبار.');});return()=>{live=false;};},[allowed]);
 useEffect(()=>{setRecords(null);if(!allowed||!employee){setLoading(false);return;}let live=true;setLoading(true);
 request<Page>('employees/'+employee.id+'/exposures/?page='+page).then(r=>{if(live&&r.employee_id===employee.id)setRecords(r);})
 .catch(e=>{if(live)setError(e instanceof Error?e.message:'تعذر تحميل السجلات.');}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[allowed,employee,page,revision]);
 function clear(){setDate('');setMethod('');setAck(false);}
 async function save(){if(!employee||!date||!method||!ack||busy)return;
 setBusy(true);setError('');setSuccess('');
 try{await request<Exposure>('employees/'+employee.id+'/exposures/',{method:'POST',body:JSON.stringify({
 synthetic_confirmed:true,exposure_date:date,workplace:'QA-SYNTHETIC',injury_method:method})});
 clear();setPage(1);setRevision(v=>v+1);setSuccess('تم تسجيل حادثة اختبار وحفظها في PostgreSQL. حدّث البطاقة الصحية لعرضها.');}
 catch(e){setError(e instanceof Error?e.message:'تعذر الحفظ، حدّث السجلات قبل المحاولة.');}finally{setBusy(false);}
 }
 if(!allowed)return <Alert severity="warning">تسجيل التعرض في هذه المرحلة متاح للمسؤول الأعلى في Staging فقط.</Alert>;
 return <Box dir="rtl"><Stack gap={2}>
 <Typography variant="h4" fontWeight={900}>الإصابات المهنية ووخز الإبر</Typography>
 <Alert severity="warning">اختبار برمجي ببيانات اصطناعية فقط. لا تدخل حادثة حقيقية أو اسم أو هوية أو نتائج مصدر التعرض. التسجيل لا يمثل تقييمًا طبيًا أو إحالة علاجية.</Alert>
 <Paper sx={{p:2,borderRadius:3}}><Stack gap={2}>
 <Autocomplete options={employees} value={employee} disabled={busy} getOptionLabel={e=>e.name+' — '+e.number}
 isOptionEqualToValue={(a,b)=>a.id===b.id} onChange={(_,e)=>{setEmployee(e);setRecords(null);setPage(1);clear();setError('');setSuccess('');}}
 renderInput={params=><TextField {...params} label="اختر موظف اختبار موثقًا"/>}/>
 {!employees.length&&<Typography color="text.secondary">لا توجد بطاقات اختبار متاحة أو لم يكتمل التحميل.</Typography>}
 {employee&&<Stack direction="row" gap={1}><Button variant="outlined" onClick={()=>nav('/employees/'+employee.id+'/health-card')}>البطاقة الصحية</Button><Button disabled={busy||loading} onClick={()=>setRevision(v=>v+1)}>تحديث السجلات</Button></Stack>}
 </Stack></Paper>
 {error&&<Alert severity="error">{error}</Alert>}{success&&<Alert severity="success">{success}</Alert>}
 {employee&&<Paper sx={{p:2,borderRadius:3}}><Stack gap={2}>
 <Typography variant="h6" fontWeight={800}>تسجيل حادثة تعرض اصطناعية</Typography>
 <CalendarDateField required label="تاريخ التعرض" value={date} onChange={setDate}/>
 <TextField select label="نوع التعرض المدون" value={method} disabled={busy} onChange={e=>{setMethod(e.target.value);setAck(false);}}>
 {Object.entries(methods).map(([key,label])=><MenuItem key={key} value={key}>{label}</MenuItem>)}</TextField>
 <TextField label="مكان العمل الاصطناعي" value="QA-SYNTHETIC" disabled/>
 <FormControlLabel control={<Checkbox checked={ack} disabled={busy} onChange={(_,v)=>setAck(v)}/>} label="أؤكد أن هذه حادثة اختبار اصطناعية فقط."/>
 <Stack direction="row" gap={1}><Button variant="contained" disabled={busy||!date||!method||!ack} onClick={()=>void save()}>{busy?'جارٍ الحفظ…':'حفظ سجل الاختبار'}</Button><Button disabled={busy} onClick={clear}>تفريغ</Button></Stack>
 </Stack></Paper>}
 {employee&&<Paper sx={{p:2,borderRadius:3}}>
 <Typography variant="h6" fontWeight={800}>السجلات المحفوظة {records?'— '+records.total:''}</Typography>
 {loading&&<Typography>جارٍ التحميل…</Typography>}
 {records&&<><TableContainer><Table size="small"><TableHead><TableRow>{['رقم السجل','تاريخ التعرض','مكان العمل','طريقة الإصابة','الحالة'].map(h=><TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead>
 <TableBody>{records.items.map(r=><TableRow key={r.id}><TableCell>{r.id}</TableCell><TableCell><DateText value={r.exposure_date||undefined}/></TableCell><TableCell>{r.workplace||'—'}</TableCell><TableCell>{methods[r.injury_method]||r.injury_method||'—'}</TableCell><TableCell>{states[r.status]||r.status}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
 {!records.items.length&&<Typography sx={{p:2}}>لا توجد سجلات محفوظة.</Typography>}
 <Stack direction="row" alignItems="center" gap={1}><Button disabled={busy||loading||page<=1} onClick={()=>setPage(v=>v-1)}>السابق</Button><Typography>صفحة {page}</Typography><Button disabled={busy||loading||!records.has_more} onClick={()=>setPage(v=>v+1)}>التالي</Button></Stack></>}
 </Paper>}
 </Stack></Box>;
}
