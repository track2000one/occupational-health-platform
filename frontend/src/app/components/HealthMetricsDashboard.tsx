import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Grid, LinearProgress, MenuItem, Paper, Stack,
 Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useNavigate } from 'react-router';
import { authFetch, useAuth } from '../context/AuthContext';
import { CalendarDateField } from './CalendarDateField';
type Choice={id:number;label:string};
type Filters={sector:string;center:string;department:string;start:string;end:string};
type Count={key:string;label:string;count:number};
type Metrics={scope:string;generated_at:string;filters:Partial<Filters>;filter_labels:Record<string,string>;
 options:Record<'sector'|'center'|'department',Choice[]>;summary:{key:string;label:string;value:number|null;unit:string}[];
 coverage:(Count&{denominator:number;percent:number|null})[];events:Count[];conditions:Count[];mental:Count[];
 field_presence:{recorded:number;possible:number;fields_per_card:number};notes:string[]};
const empty:Filters={sector:'',center:'',department:'',start:'',end:''};
const API=(import.meta.env.VITE_API_URL||'').replace(/\/$/,'');
const params=(f:Filters)=>new URLSearchParams(Object.entries(f).filter(([,v])=>v!==''));
const endpoint=(q:URLSearchParams)=>{
 if(!API||!/staging/i.test(new URL(API).hostname))throw new Error('اتصال Staging غير مضبوط.');
 return API+'/staging-clinical/metrics/?'+q.toString();
};
const number=(v:number|null)=>v===null?'—':v.toLocaleString('ar-SA',{maximumFractionDigits:1});
const display=(v:number|null,unit:string)=>v===null?'غير متاح':number(v)+(unit==='%'?'%':'');
function printReport(data:Metrics){
 const win=window.open('','_blank','popup,width=1000,height=780');
 if(!win)throw new Error('اسمح بالنوافذ المنبثقة للطباعة.');
 win.opener=null;const doc=win.document;doc.title='تقرير مؤشرات الصحة المهنية — اختبار';
 doc.documentElement.lang='ar';doc.documentElement.dir='rtl';
 const style=doc.createElement('style');style.textContent='@page{size:A4;margin:14mm}body{font:12px Tahoma,Arial,sans-serif;color:#17263a;margin:0}h1{font-size:23px;color:#164d73}h2{font-size:16px;color:#164d73;margin-top:20px}table{border-collapse:collapse;width:100%;margin-bottom:12px}th,td{border:1px solid #b9c6d0;padding:7px;text-align:right}th{background:#e7eff5}tr{break-inside:avoid}thead{display:table-header-group}p{line-height:1.6}';doc.head.append(style);
 const add=(tag:string,t:string)=>{const el=doc.createElement(tag);el.textContent=t;doc.body.append(el);};
 const table=(title:string,headers:string[],rows:(string|number)[][])=>{
  add('h2',title);const el=doc.createElement('table');const head=el.createTHead().insertRow();for(const h of headers){const th=doc.createElement('th');th.textContent=h;head.append(th);}
  const body=el.createTBody();for(const row of rows){const tr=body.insertRow();for(const v of row)tr.insertCell().textContent=String(v);}
  doc.body.append(el);
 };
 add('h1','منصة الصحة المهنية | تقرير المؤشرات');
 add('p','Staging — بيانات اصطناعية فقط | '+new Date(data.generated_at).toLocaleString('ar-SA'));
 add('p','القطاع: '+data.filter_labels.sector+' | المركز: '+data.filter_labels.center+' | القسم: '+data.filter_labels.department);
 add('p','الفترة: '+(data.filters.start||'جميع التواريخ')+' — '+(data.filters.end||'جميع التواريخ'));
 table('المؤشرات الأساسية',['المؤشر','القيمة','الوحدة'],data.summary.map(r=>[r.label,display(r.value,r.unit),r.unit]));
 table('وجود السجلات — لا يمثل تغطية سريرية',['المؤشر','الموظفون','المجتمع','النسبة'],data.coverage.map(r=>[r.label,r.count,r.denominator,display(r.percent,'%')]));
 table('الأحداث المؤرخة',['المصدر','عدد السجلات'],data.events.map(r=>[r.label,r.count]));
 table('الأمراض المدونة',['المؤشر','عدد الموظفين'],data.conditions.map(r=>[r.label,r.count]));
 table('وجود نتائج أدوات الصحة النفسية',['الأداة','عدد الموظفين'],data.mental.map(r=>[r.label,r.count]));
 add('h2','منهجية التقرير');for(const note of data.notes)add('p',note);
 add('p','الحقول المدونة: '+data.field_presence.recorded+' من '+data.field_presence.possible);
 win.focus();win.print();
}
export function HealthMetricsDashboard({mode='dashboard'}:{mode?:'dashboard'|'reports'|'admin'}){
 const {user}=useAuth();const nav=useNavigate();
 const allowed=user?.isSuperuser===true&&/staging/i.test(window.location.hostname);
 const [draft,setDraft]=useState<Filters>(empty),[applied,setApplied]=useState<Filters>(empty),[revision,setRevision]=useState(0);
 const [data,setData]=useState<Metrics|null>(null),[loading,setLoading]=useState(false),[exporting,setExporting]=useState(false),[error,setError]=useState('');
 const [chart,setChart]=useState<'events'|'coverage'|'conditions'|'mental'>('events');
 useEffect(()=>{
  if(!allowed){setData(null);return;}let live=true;setLoading(true);setError('');setData(null);
  (async()=>{try{const res=await authFetch(endpoint(params(applied)));const body=await res.json();if(!res.ok)throw new Error(body.detail||'تعذر تحميل المؤشرات.');
   if(body.scope!=='verified_synthetic_active_only')throw new Error('نطاق التقرير غير معتمد.');if(live)setData(body as Metrics);
  }catch(e){if(live)setError(e instanceof Error?e.message:'تعذر تحميل المؤشرات.');}finally{if(live)setLoading(false);}})();
  return()=>{live=false;};
 },[allowed,applied,revision]);
 const change=(k:keyof Filters,v:string)=>setDraft(p=>({...p,[k]:v}));
 const dirty=JSON.stringify(draft)!==JSON.stringify(applied);
 function apply(){setApplied({...draft});}
 async function excel(){
  if(!data||dirty||loading||exporting)return;setExporting(true);setError('');
  try{const q=params(applied);q.set('download','xlsx');const r=await authFetch(endpoint(q));
   if(!r.ok)throw new Error('تعذر تصدير التقرير.');
   const blob=await r.blob();if(!blob.type.includes('spreadsheetml'))throw new Error('لم يستلم النظام ملف Excel صالحًا.');
   const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='OHP_Staging_Health_KPI.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){setError(e instanceof Error?e.message:'تعذر التصدير.');}finally{setExporting(false);}
 }
 const dateValid=(!draft.start&&!draft.end)||!!draft.start&&!!draft.end&&draft.start<=draft.end;
 const actions=mode==='admin'?[['إدارة المستخدمين','/admin/users'],['الأدوار والصلاحيات','/roles'],['سجل التدقيق','/audit-log'],['الإعدادات','/settings']]:[['الموظفون','/employees'],['استيراد البيانات','/data-import'],['البطاقة الصحية','/employee-health-card'],['التقارير','/reports'],['الإحصائيات الدورية','/periodic-statistics']];
 const title=mode==='reports'?'التقارير والمؤشرات الصحية':mode==='admin'?'لوحة الإدارة — مؤشرات الصحة المهنية':'لوحة المؤشرات الصحية';
 return <Box dir="rtl"><Stack gap={2.5}>
  <Paper sx={{p:3,borderRadius:3,color:'white',background:'linear-gradient(120deg,#164d73,#137e83)'}}>
   <Typography variant="h4" fontWeight={900}>{title}</Typography><Typography sx={{opacity:.9,mt:1}}>Staging — مؤشرات حية من PostgreSQL · بيانات اختبار فقط</Typography>
  </Paper>
  {mode!=='reports'&&<Stack direction="row" gap={1} flexWrap="wrap">{actions.map(([label,path])=><Button key={path} variant="outlined" onClick={()=>nav(path)}>{label}</Button>)}</Stack>}
  {!allowed?<Alert severity="info">المؤشرات الصحية التجريبية متاحة للمسؤول الأعلى فقط. لا توجد بيانات صحية فردية معروضة.</Alert>:<>
   <Alert severity="warning">الأرقام تخص موظفي الاختبار الموثقين فقط. لا تمثل إحصاءات الموظفين الحقيقيين أو تغطية التطعيم أو اللياقة السريرية.</Alert>
   <Paper sx={{p:2,borderRadius:3}}><Stack gap={2}>
    <Typography variant="h6" fontWeight={800}>نطاق التقرير والتصفية</Typography>
    <Grid container spacing={2}>{([['sector','القطاع'],['center','المركز الصحي'],['department','القسم / الوحدة']] as const).map(([key,label])=>
      <Grid key={key} size={{xs:12,md:4}}><TextField fullWidth select label={label} value={draft[key]} onChange={e=>change(key,e.target.value)} disabled={loading}>
       <MenuItem value="">الكل</MenuItem>{(data?.options[key]||[]).map(o=><MenuItem key={o.id} value={String(o.id)}>{o.label}</MenuItem>)}
      </TextField></Grid>)}
      <Grid size={{xs:12,md:6}}><CalendarDateField label="بداية فترة الأحداث (اختياري)" value={draft.start} onChange={v=>change('start',v)}/></Grid>
      <Grid size={{xs:12,md:6}}><CalendarDateField label="نهاية فترة الأحداث (اختياري)" value={draft.end} onChange={v=>change('end',v)}/></Grid>
    </Grid>
    <Stack direction="row" gap={1} flexWrap="wrap">
     <Button variant="contained" disabled={!dateValid||loading} onClick={apply}>تطبيق المرشحات</Button>
     <Button variant="outlined" disabled={loading} onClick={()=>{setDraft({...empty});setApplied({...empty});}}>إعادة ضبط</Button>
     <Button variant="outlined" disabled={loading||dirty} onClick={()=>setRevision(v=>v+1)}>تحديث المؤشرات</Button>
     <Button variant="outlined" disabled={!data||loading||dirty||exporting} onClick={()=>void excel()}>{exporting?'جارٍ التصدير…':'تصدير Excel'}</Button>
     <Button variant="outlined" disabled={!data||loading||dirty} onClick={()=>{try{if(data)printReport(data);}catch(e){setError(e instanceof Error?e.message:'تعذر الطباعة.');}}}>طباعة / حفظ PDF</Button>
    </Stack>
    {dirty&&<Alert severity="info">طبّق المرشحات قبل تصدير التقرير.</Alert>}
    {!dateValid&&<Alert severity="error">حدد تاريخ البداية والنهاية معًا وبترتيب صحيح.</Alert>}
    <Typography variant="caption" color="text.secondary">الفترة تخص الأحداث المؤرخة فقط؛ الموظفون والبطاقات ووجود السجلات لجميع التواريخ. ملف Excel يعيد احتساب المؤشرات عند التصدير.</Typography>
   </Stack></Paper>
   {error&&<Alert severity="error">{error}</Alert>}
   {loading&&<Paper sx={{p:4,textAlign:'center'}}><CircularProgress/><Typography sx={{mt:1}}>جارٍ احتساب المؤشرات…</Typography></Paper>}
   {data&&!loading&&<>
    <Typography color="text.secondary" variant="body2">وقت الاحتساب: {new Date(data.generated_at).toLocaleString('ar-SA')} — {data.filter_labels.sector} / {data.filter_labels.center} / {data.filter_labels.department}</Typography>
    {data.summary[0]?.value===0&&<Alert severity="info">لا يوجد موظفون مؤهلون في نطاق الاختبار المحدد. النسب ذات المقام صفر غير متاحة.</Alert>}
    <Grid container spacing={2}>{data.summary.map((r,i)=><Grid key={r.key} size={{xs:12,sm:6,lg:4}}><Card sx={{height:'100%',borderRadius:3,borderInlineStart:'5px solid '+(r.key==='incomplete_cards'?'#d4a72c':r.key==='complete_cards'?'#287a50':['#137e83','#164d73','#287a50','#b7791f','#5173a8','#725d99'][i%6])}}>
     <CardContent><Typography variant="body2" color="text.secondary">{r.label}</Typography><Typography variant="h4" fontWeight={900} sx={{my:1}}>{display(r.value,r.unit)}</Typography>
      <Typography variant="caption" color="text.secondary">{r.unit==='%'?'نسبة وجود بيانات لا اكتمال طبي':r.unit}</Typography>
      {r.unit==='%'&&r.value!==null&&<LinearProgress variant="determinate" value={r.value} sx={{mt:1,height:7,borderRadius:4}}/>}
     </CardContent></Card></Grid>)}</Grid>
    <Paper sx={{p:2,borderRadius:3}}><Stack gap={2}>
     <Typography variant="h6" fontWeight={800}>مقارنة المؤشرات</Typography>
     <TextField select label="نوع الرسم" value={chart} onChange={e=>setChart(e.target.value as typeof chart)}>
      <MenuItem value="events">الأحداث المؤرخة — سجلات</MenuItem><MenuItem value="coverage">وجود السجلات — موظفون</MenuItem><MenuItem value="conditions">الأمراض المدونة — موظفون</MenuItem><MenuItem value="mental">أدوات الصحة النفسية — موظفون</MenuItem>
     </TextField>
     <Box sx={{width:'100%',height:Math.max(220,data[chart].length*42)}} dir="ltr">
      <ResponsiveContainer width="100%" height="100%"><BarChart data={data[chart]} layout="vertical" margin={{top:10,right:25,left:15,bottom:10}}>
       <CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="label" width={240} tick={{fontSize:11}}/><Tooltip/><Bar dataKey="count" name="العدد" fill="#137e83" radius={[0,5,5,0]}/>
      </BarChart></ResponsiveContainer>
     </Box>
    </Stack></Paper>
    <Paper sx={{p:2,borderRadius:3}}><Typography variant="h6" fontWeight={800}>وجود السجلات حسب الوحدة (جميع التواريخ)</Typography>
     <TableContainer><Table size="small"><TableHead><TableRow>{['المؤشر','عدد الموظفين','المجتمع','نسبة وجود السجل'].map(h=><TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead>
      <TableBody>{data.coverage.map(r=><TableRow key={r.key}><TableCell>{r.label}</TableCell><TableCell>{number(r.count)}</TableCell><TableCell>{number(r.denominator)}</TableCell><TableCell>{display(r.percent,'%')}{r.percent!==null&&<LinearProgress variant="determinate" value={r.percent} sx={{mt:1}}/>}</TableCell></TableRow>)}</TableBody>
     </Table></TableContainer></Paper>
    {([['events','الأحداث المؤرخة حسب المصدر — عدد السجلات'],['conditions','الأمراض المدونة — عدد الموظفين'],['mental','وجود نتائج أدوات الصحة النفسية — عدد الموظفين']] as const).map(([key,label])=>
      <Paper key={key} sx={{p:2,borderRadius:3}}><Typography variant="h6" fontWeight={800}>{label}</Typography><TableContainer><Table size="small"><TableHead><TableRow><TableCell>المؤشر</TableCell><TableCell>العدد</TableCell></TableRow></TableHead><TableBody>
       {data[key].map(r=><TableRow key={r.key}><TableCell>{r.label}</TableCell><TableCell>{number(r.count)}</TableCell></TableRow>)}
      </TableBody></Table></TableContainer></Paper>)}
    <Paper sx={{p:2,borderRadius:3}}><Typography variant="h6" fontWeight={800}>منهجية المؤشرات</Typography>
     <Typography>الحقول المدونة: {number(data.field_presence.recorded)} من {number(data.field_presence.possible)} ({data.field_presence.fields_per_card} حقلًا مرجعيًا لكل بطاقة محفوظة).</Typography>
     {data.notes.map(note=><Typography key={note} variant="body2" color="text.secondary" sx={{mt:1}}>{note}</Typography>)}
    </Paper>
   </>}
  </>}
 </Stack></Box>;
}
