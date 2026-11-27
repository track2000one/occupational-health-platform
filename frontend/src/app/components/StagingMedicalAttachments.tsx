import { useEffect,useRef,useState } from 'react';
import { Alert,Box,Button,Checkbox,FormControlLabel,MenuItem,Paper,Stack,TextField,Typography } from '@mui/material';
import { authFetch } from '../context/AuthContext';

const API='https://occupational-staging-backend-staging.up.railway.app/api';
type Row={id:string;file_name:string;content_type:string;byte_size:number;created_at:string};
async function checked(response:Response){
  if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(String(data.detail||data.file||'تعذر إكمال العملية.'));}
  return response;
}
export function StagingMedicalAttachments({employeeId,onUploaded}:{employeeId:string;onUploaded:()=>void}){
  const [rows,setRows]=useState<Row[]>([]),[file,setFile]=useState<File|null>(null),[confirmed,setConfirmed]=useState(false);
  const [output,setOutput]=useState('image'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const input=useRef<HTMLInputElement>(null);
  const path=API+'/staging-clinical/employees/'+encodeURIComponent(employeeId)+'/attachments/';
  const generation=useRef(0);
  async function load(g:number){
    const r=await checked(await authFetch(path));const body=await r.json();
    if(g===generation.current)setRows(Array.isArray(body.attachments)?body.attachments:[]);
  }
  useEffect(()=>{const g=++generation.current;setRows([]);setFile(null);setConfirmed(false);setError('');setNotice('');setBusy(true);
    void load(g).catch(e=>{if(g===generation.current)setError(String(e.message));}).finally(()=>{if(g===generation.current)setBusy(false);});
    return()=>{generation.current++;};
  },[employeeId]);
  async function upload(){
    if(!file||!confirmed||busy)return;
    const g=generation.current;setBusy(true);setError('');setNotice('');
    try{
      const form=new FormData();form.append('file',file);form.append('synthetic_confirmed','true');form.append('output',output);
      await checked(await authFetch(path,{method:'POST',body:form}));
      if(g!==generation.current)return;
      setFile(null);setConfirmed(false);if(input.current)input.current.value='';
      setNotice('حُفظ المرفق المعاد ترميزه وسُجلت عملية الرفع.');onUploaded();
      await load(g);
    }catch(e){if(g===generation.current)setError(String((e as Error).message));}
    finally{if(g===generation.current)setBusy(false);}
  }
  async function download(row:Row){
    const g=generation.current;setError('');
    try{const r=await checked(await authFetch(path+encodeURIComponent(row.id)+'/content/'));const blob=await r.blob();
      if(g!==generation.current)return;
      const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=row.file_name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){if(g===generation.current)setError(String((e as Error).message));}
  }
  return <Paper variant="outlined" className="no-print" sx={{p:2,mt:2}} dir="rtl"><Stack gap={2}>
    <Typography variant="h6" fontWeight={900}>المرفقات الطبية المحمية — اختبار اصطناعي</Typography>
    <Alert severity="warning">لا ترفع أي ملف طبي حقيقي أو بيانات شخصية. يقبل النظام صورة PNG أو JPEG أو WebP ثابتة حتى 5 ميجابايت، ويعيد ترميزها إلى PNG أو PDF مصور من الخادم. لا تقبل ملفات PDF الخارجية أو Word. التنزيل للمسؤول الأعلى فقط، ولا حذف أو اعتماد طبي.</Alert>
    {error&&<Alert severity="error">{error}</Alert>}{notice&&<Alert severity="success">{notice}</Alert>}
    <Box><input ref={input} type="file" accept=".png,.jpg,.jpeg,.webp" disabled={busy} onChange={e=>{setFile(e.target.files?.[0]||null);setConfirmed(false);}}/></Box>
    <TextField select fullWidth label="حفظ المخرج بصيغة" value={output} onChange={e=>setOutput(e.target.value)} disabled={busy}><MenuItem value="image">صورة PNG معاد ترميزها</MenuItem><MenuItem value="pdf">PDF مصور يُنشأ على الخادم</MenuItem></TextField>
    <FormControlLabel control={<Checkbox checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} disabled={busy||!file}/>} label="أؤكد أن هذا الملف اصطناعي ولا يتضمن بيانات فعلية"/>
    <Button variant="contained" disabled={busy||!confirmed||!file||file.size>5*1024*1024} onClick={()=>void upload()}>رفع المرفق التجريبي</Button>
    <Typography color="text.secondary">المرفقات: {rows.length} / 10 — الحد الإجمالي 20 ميجابايت</Typography>
    {rows.map(row=><Stack key={row.id} direction="row" alignItems="center" justifyContent="space-between" gap={1}><Box sx={{minWidth:0,overflowWrap:'anywhere'}}><Typography fontWeight={700}>{row.file_name}</Typography><Typography variant="caption">{row.content_type} • {Math.ceil(row.byte_size/1024)} KB</Typography></Box><Button variant="outlined" onClick={()=>void download(row)}>تنزيل</Button></Stack>)}
  </Stack></Paper>;
}
