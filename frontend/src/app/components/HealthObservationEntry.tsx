import { useState } from 'react';
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
 MenuItem, Stack, TextField, Typography } from '@mui/material';
import { authFetch } from '../context/AuthContext';
import { CalendarDateField } from './CalendarDateField';
import { measures,conditions,texts,instruments } from './HealthObservationRecords';
const API=(import.meta.env.VITE_API_URL||'').replace(/\/$/,'');
export function HealthObservationEntry({employeeId,employeeName,onSaved}:{employeeId:string;employeeName:string;onSaved:()=>void}){
 const [open,setOpen]=useState(false),[date,setDate]=useState(''),[values,setValues]=useState<Record<string,string>>({});
 const [ack,setAck]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [success,setSuccess]=useState('');
 function set(key:string,value:string){setValues(prev=>({...prev,[key]:value}));setAck(false);}
 function reset(){setDate('');setValues({});setAck(false);setError('');}
 async function save(){
  if(busy||!date||!ack)return;
  const body=Object.fromEntries(Object.entries(values).filter(([,v])=>v.trim()!=='').map(([k,v])=>[k,v.trim()]));
  if(!Object.keys(body).length){setError('أدخل قيمة واحدة على الأقل.');return;}
  setBusy(true);setError('');setSuccess('');
  try{
   if(!API||!/staging/i.test(new URL(API).hostname))throw new Error('اتصال Staging غير مضبوط.');
   const res=await authFetch(API+'/staging-clinical/employees/'+employeeId+'/observations/',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...body,observation_date:date,synthetic_confirmed:true})});
   const result=await res.json();if(!res.ok)throw new Error(result.detail||'تعذر الحفظ.');
   reset();setOpen(false);setSuccess('تم حفظ التقييم الاصطناعي.');onSaved();
  }catch(e){setError(e instanceof Error?e.message:'تعذر الحفظ؛ حدّث البطاقة للتحقق.');}finally{setBusy(false);}
 }
 return <div className="no-print">
  <Button variant="outlined" onClick={()=>{reset();setSuccess('');setOpen(true);}}>إضافة تقييم صحي مؤرخ (اختبار)</Button>
  {success&&<Alert severity="success" sx={{mt:1}}>{success}</Alert>}
  <Dialog open={open} onClose={()=>{if(!busy)setOpen(false);}} fullWidth maxWidth="md" dir="rtl">
   <DialogTitle>تقييم صحي مؤرخ — {employeeName}</DialogTitle>
   <DialogContent dividers><Stack gap={2}>
    <Alert severity="warning">بيانات اصطناعية فقط. أدخل النتائج المسجلة كما هي دون تفسير سريري أو استنتاج تشخيص؛ اترك الحقول غير المتوفرة فارغة. لا تُنسخ القيم إلى البطاقة المعتمدة.</Alert>
    {error&&<Alert severity="error">{error}</Alert>}
    <CalendarDateField required label="تاريخ التقييم الفعلي" value={date} onChange={v=>{setDate(v);setAck(false);}}/>
    <Typography fontWeight={800}>القياسات البدنية</Typography>
    {measures.map(([key,label])=><TextField key={key} label={label} type="number" disabled={busy} value={values[key]||''} onChange={e=>set(key,e.target.value)}/>)}
    <Typography fontWeight={800}>الحالات الصحية المسجلة</Typography>
    {conditions.map(([key,label])=><TextField key={key} select label={label} disabled={busy} value={values[key]||''} onChange={e=>set(key,e.target.value)}>
      <MenuItem value="">غير مدون</MenuItem><MenuItem value="yes">نعم (مدون)</MenuItem><MenuItem value="no">لا (مدون)</MenuItem><MenuItem value="unknown">غير معروف (مدون)</MenuItem>
    </TextField>)}
    <Typography fontWeight={800}>أدوات الصحة النفسية</Typography>
    {instruments.map(([key,label])=><Stack key={key} direction={{xs:'column',sm:'row'}} gap={1}>
      <TextField fullWidth label={label+' — النسخة / النوع'} disabled={busy} value={values[key+'_version']||''} onChange={e=>set(key+'_version',e.target.value)}/>
      <TextField fullWidth label={label+' — النتيجة المدونة'} disabled={busy} value={values[key+'_result']||''} onChange={e=>set(key+'_result',e.target.value)}/>
    </Stack>)}
    <Typography fontWeight={800}>التاريخ المرضي والقيود والتوصيات</Typography>
    {texts.map(([key,label])=><TextField key={key} label={label} multiline disabled={busy} value={values[key]||''} onChange={e=>set(key,e.target.value)}/>)}
    <FormControlLabel control={<Checkbox checked={ack} disabled={busy} onChange={(_,v)=>setAck(v)}/>} label="أؤكد أن كل القيم اصطناعية ومسجلة كما هي."/>
   </Stack></DialogContent>
   <DialogActions><Button disabled={busy} onClick={()=>setOpen(false)}>إلغاء</Button><Button variant="contained" disabled={busy||!date||!ack} onClick={()=>void save()}>{busy?'جارٍ الحفظ…':'حفظ سجل التقييم'}</Button></DialogActions>
  </Dialog>
 </div>;
}
