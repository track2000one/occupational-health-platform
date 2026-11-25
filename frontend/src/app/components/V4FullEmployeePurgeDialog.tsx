import { useState } from 'react';
import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent,
  DialogTitle, Paper, Stack, TextField, Typography } from '@mui/material';
import { authFetch, getAccessToken } from '../context/AuthContext';

const API = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/$/, '');
const ENDPOINT = API + '/admin/v4-full-employee-data-purge/';

type Preview = {
  mode: 'preview';
  scope: 'isolated_v4_database_only';
  counts: Record<string,number>;
  impact: {
    employees:number; staged_reviews:number; provisional_rows:number;
    provisional_batches:number; temporary_snapshots:number;
    clinical_records:number; workforce_import_plans:number;
    employee_audit_entries:number;
  };
  protected_counts:Record<string,number>;
  includes_clinical_records:boolean;
  irreversible:boolean;
  preview_token:string;
  confirm_phrase:string;
};
type PurgeResult = {
  status:'deleted'; purge_reference:string; impact: Preview['impact'];
  remaining_employee_records:number; note:string;
};

export function V4FullEmployeePurgeDialog({onComplete}:{
  onComplete:()=>void;
}) {
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [preview,setPreview]=useState<Preview|null>(null);
  const [result,setResult]=useState<PurgeResult|null>(null);
  const [error,setError]=useState('');
  const [reason,setReason]=useState('');
  const [phrase,setPhrase]=useState('');
  const [acknowledged,setAcknowledged]=useState(false);
  async function request<T>(body:Record<string,unknown>):Promise<T> {
    const token=getAccessToken();
    if(!token)throw new Error('يلزم الدخول بصلاحية المسؤول.');
    const response=await authFetch(ENDPOINT,{
      method:'POST',
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify(body),
    });
    const json=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(json.detail||'تعذر تنفيذ الطلب.');
    return json as T;
  }
  async function inspect() {
    if(busy)return;
    setBusy(true);setError('');setPreview(null);setResult(null);
    setReason('');setPhrase('');setAcknowledged(false);
    try {
      setPreview(await request<Preview>({action:'preview'}));
    }catch(e) {
      setError(e instanceof Error?e.message:'تعذرت المعاينة');
    }finally{setBusy(false);}
  }
  async function execute() {
    if(!preview || busy || !acknowledged ||
      phrase!==preview.confirm_phrase ||
      reason.trim().length<20 || reason.trim().length>500)return;
    setBusy(true);setError('');
    try {
      const output=await request<PurgeResult>({
        action:'execute',preview_token:preview.preview_token,
        confirmed:true,confirm_phrase:phrase,reason:reason.trim(),
      });
      setResult(output);setPreview(null);
      setPhrase('');setReason('');setAcknowledged(false);
      onComplete();
    }catch(e) {
      setError(e instanceof Error?e.message:'تعذر الحذف');
      // A stale or failed token always requires another dry-run.
      setPreview(null);setAcknowledged(false);setPhrase('');
    }finally{setBusy(false);}
  }
  const hasData=Boolean(preview && Object.values(preview.counts).some(n=>n>0));
  const close=()=>{
    if(busy)return;
    setOpen(false);setPreview(null);setResult(null);
    setError('');setPhrase('');setReason('');setAcknowledged(false);
  };

  return <>
    <Button color="error" variant="outlined"
      onClick={()=>{setOpen(true);void inspect();}}>
      فحص حذف بيانات الموظفين نهائيًا — V4 فقط
    </Button>
    <Dialog open={open} onClose={close} fullWidth maxWidth="md"
      PaperProps={{sx:{borderRadius:3}}}>
      <DialogTitle fontWeight={900}>فحص حذف جميع بيانات الموظفين — قاعدة V4 فقط</DialogTitle>
      <DialogContent dividers>
        <Stack gap={2}>
          <Alert severity="error">
            هذا ليس إخفاءً أو أرشفةً: الحذف نهائي من قاعدة V4، ويشمل
            بيانات الموظفين والبطاقات المؤقتة والمراجعات وسجلاتهم الصحية المرتبطة.
            قد تخضع الملفات الصحية لمتطلبات الاحتفاظ النظامية؛ تأكد من تفويضك
            قبل التنفيذ. النسخ الاحتياطية وقواعد Railway الأخرى ليست ضمن هذه العملية.
          </Alert>
          <Alert severity="info">
            يُستثنى من الحذف: المراكز الصحية، الهيكل التنظيمي والأقسام،
            الوحدات الإدارية، أسماء المستخدمين وحساباتهم، وسجلات اعتماد الجهات.
          </Alert>
          {error && <Alert severity="error">{error}</Alert>}
          {busy && <Typography>جارٍ التحقق من بيانات قاعدة V4…</Typography>}
          {preview && <>
            <Typography fontWeight={900}>نتيجة المعاينة المباشرة من قاعدة البيانات</Typography>
            <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr 1fr',md:'repeat(4,1fr)'},gap:1.2}}>
              {[
                ['سجلات الموظفين',preview.impact.employees],
                ['بطاقات مراجعة الاستيراد',preview.impact.staged_reviews],
                ['سجلات الاستيراد المؤقت',preview.impact.provisional_rows],
                ['دفعات الاستيراد المؤقت',preview.impact.provisional_batches],
                ['السجلات الصحية المرتبطة',preview.impact.clinical_records],
                ['لقطات Excel المؤقتة',preview.impact.temporary_snapshots],
                ['خطط استيراد الموظفين',preview.impact.workforce_import_plans],
                ['أحداث تدقيق خاصة بالموظفين',preview.impact.employee_audit_entries],
              ].map(([label,count])=>
                <Paper key={String(label)} variant="outlined" sx={{p:1.5,textAlign:'center',borderRadius:2}}>
                  <Typography fontSize={23} fontWeight={900}>{count}</Typography>
                  <Typography variant="caption">{label}</Typography>
                </Paper>
              )}
            </Box>
            <Typography variant="caption">
              إجمالي أنواع الجداول المتأثرة: {Object.entries(preview.counts)
                .filter(([,count])=>count>0).length}. سيُتحقق تلقائيًا من بقاء
              المراكز والأقسام وحسابات المستخدمين كما هي بعد الإجراء.
            </Typography>
            {!hasData
              ? <Alert severity="success">لا توجد بيانات موظفين ضمن الجداول المشمولة بالحذف في قاعدة V4.</Alert>
              : <>
                <TextField fullWidth multiline minRows={2} disabled={busy}
                  label="سبب الحذف النهائي (20 حرفًا على الأقل)"
                  value={reason} onChange={e=>setReason(e.target.value)}
                  inputProps={{maxLength:500}} />
                <TextField fullWidth disabled={busy}
                  label="اكتب عبارة الحذف النهائي حرفيًا"
                  value={phrase} onChange={e=>setPhrase(e.target.value)}
                  helperText={preview.confirm_phrase}/>
                <Stack direction="row" alignItems="center" gap={1}>
                  <Checkbox checked={acknowledged} disabled={busy}
                    onChange={(_,value)=>setAcknowledged(value)}
                    inputProps={{'aria-label':'أقر بأن الحذف نهائي ويشمل سجلات الموظفين الصحية في V4'}}/>
                  <Typography variant="body2">
                    أؤكد أن الحذف نهائي ويشمل البيانات الصحية المرتبطة،
                    ولا يمس المراكز والهيكل التنظيمي.
                  </Typography>
                </Stack>
              </>}
          </>}
          {result && <Alert severity="success">
            انتهى حذف بيانات الموظفين من قاعدة V4.
            الرقم المرجعي: {result.purge_reference}.
            الموظفون المتبقون: {result.remaining_employee_records}.
            {result.note}
          </Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={busy}>إغلاق</Button>
        <Button variant="outlined" onClick={()=>void inspect()} disabled={busy}>
          إعادة معاينة الأعداد
        </Button>
        {hasData && <Button color="error" variant="contained"
          disabled={busy || !acknowledged || phrase!==preview?.confirm_phrase ||
            reason.trim().length<20 || reason.trim().length>500}
          onClick={()=>void execute()}>
          تأكيد الحذف النهائي من V4
        </Button>}
      </DialogActions>
    </Dialog>
  </>;
}
