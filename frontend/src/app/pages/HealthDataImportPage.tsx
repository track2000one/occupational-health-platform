import { useState } from 'react';
import { healthFieldLabel, healthFieldGroups, healthIssueLabel } from '../utils/healthImportLabels';
import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, Paper, Stack, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { authFetch, useAuth } from '../context/AuthContext';
import { HealthDataDraftCommit } from '../components/HealthDataDraftCommit';

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const fieldLabels: Record<string, string> = { empty: 'فارغ', proposed: 'قيمة مقترحة للفحص',
  same_card_value: 'مطابق للبطاقة', card_conflict: 'تعارض مع البطاقة',
  review: 'يحتاج تفسيرًا أو تصحيحًا', identity_blocked: 'موقوف بسبب المطابقة' };
const identityLabels: Record<string, string> = { matched: 'مطابق مبدئيًا', identity_review: 'هوية أو مركز يحتاج مراجعة',
  unmatched: 'غير مطابق ضمن نطاق الاختبار', inactive: 'غير نشط أو غير موثق', duplicate: 'هوية مكررة في الملف' };
type Counts = Record<string, number>;
type Preview = { total_rows: number; health_fields: number; identity_counts: Counts; field_totals: Counts;
  fields: {field: string; target: string; counts: Counts}[];
  rows: {row: number; identity_status: string; existing_card: boolean; approved_card: boolean;
    counts: Counts; issues: {field: string; reason: string}[]}[]; notice: string; read_only: boolean };
function base() {
  if (!API || !/staging/i.test(new URL(API).hostname)) throw new Error('اتصال Staging غير مضبوط؛ تم منع العملية.');
  return API;
}
export function HealthDataImportPage() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [showRows, setShowRows] = useState(false);
  const [prepareAck, setPrepareAck] = useState(false);
  const [prepared, setPrepared] = useState('');
  const isAllowed = user?.isSuperuser === true && /staging/i.test(window.location.hostname);
  async function prepareFixtures() {
    if (busy || !prepareAck) return;
    setBusy(true); setError(''); setPrepared(''); setPreview(null);
    try {
      const res = await authFetch(base() + '/health-data-import/template/', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'prepare_import_fixtures',synthetic_confirmed:true})
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'تعذر تأسيس سجلات الاختبار.');
      setPrepared('تم إنشاء '+data.created+' سجل اختبار جديد؛ '+data.existing+' سجل موجود دون تعديل. نزّل عينة اختبار مطابقة ثم افحصها.');
      setPrepareAck(false);
    } catch(e) { setError(e instanceof Error ? e.message : 'تعذر تأسيس سجلات الاختبار.'); }
    finally { setBusy(false); }
  }
  async function download(sample = false) {
    setBusy(true); setError('');
    try {
      const res = await authFetch(base() + '/health-data-import/template/' + (sample ? '?sample=1' : ''));
      if (!res.ok) { const error = await res.json().catch(() => null); throw new Error(error?.detail || 'تعذر تنزيل القالب.'); }
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement('a'); link.href = url; link.download = sample ? 'OHP_HealthData_V1_SYNTHETIC.xlsx' : 'OHP_HealthData_V1.xlsx';
      link.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر التنزيل.'); }
    finally { setBusy(false); }
  }
  async function inspect() {
    if (!file || !confirmed || busy) return;
    setBusy(true); setError(''); setPreview(null);
    try {
      const body = new FormData(); body.append('file', file); body.append('synthetic_confirmed', 'true');
      const res = await authFetch(base() + '/health-data-import/preview/', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'تعذر الفحص.');
      setPreview(data as Preview);
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر الفحص.'); }
    finally { setBusy(false); }
  }
  if (!isAllowed) return <Alert severity="warning">هذه الصفحة للمسؤول الأعلى في البيئة التجريبية المعزولة فقط.</Alert>;
  return <Box dir="rtl"><Stack gap={2}>
    <Typography variant="h4" fontWeight={900}>استيراد البيانات الصحية للموظفين</Typography>
    <Alert severity="warning">المعاينة والاستكمال التجريبي محصوران بموظفي الاختبار الموثقين. يمنع رفع البيانات الصحية الحقيقية في Staging.</Alert>
    <Paper sx={{ p: 3, borderRadius: 3 }}><Stack gap={2}>
      <Typography variant="h6" fontWeight={800}>قالب HealthData V1</Typography>
      <Typography color="text.secondary">61 حقلًا صحيًا و4 حقول للربط. لا يُعاد تسجيل الموظف، ولا تُنشأ بطاقة أو زيارة أثناء الفحص.</Typography>
      <Paper variant="outlined" sx={{p:2,borderRadius:2}}>
        <Stack gap={1}>
          <Typography fontWeight={800}>تأسيس سجلات اختبار الاستيراد (UAT-002)</Typography>
          <Typography variant="body2">ثلاث هويات اصطناعية ثابتة مخصصة للاختبار فقط، دون بيانات صحية مسبقة. لا يُعدّل أو يُحذف أي سجل قائم؛ إعادة التنفيذ لا تكرر السجلات.</Typography>
          <FormControlLabel control={<Checkbox checked={prepareAck} disabled={busy} onChange={(_,v)=>setPrepareAck(v)}/>} label="أوافق على إنشاء سجلات الاختبار الاصطناعية فقط في Staging."/>
          <Button variant="outlined" color="success" disabled={busy||!prepareAck} onClick={()=>void prepareFixtures()}>تأسيس سجلات اختبار الاستيراد</Button>
          {prepared && <Alert severity="success">{prepared}</Alert>}
        </Stack>
      </Paper>
      <Stack direction="row" gap={1} flexWrap="wrap">
        <Button variant="outlined" disabled={busy} onClick={() => void download()}>تنزيل القالب الصحي المعتمد</Button>
        <Button variant="outlined" color="success" disabled={busy} onClick={() => void download(true)}>تنزيل عينة اختبار مطابقة</Button>
        <Button component="label" variant="outlined" disabled={busy}>{file?.name || 'اختيار ملف Excel'}
          <input type="file" hidden accept=".xlsx" onChange={e => { setFile(e.target.files?.[0] || null); setPreview(null); setConfirmed(false); setError(''); }} />
        </Button>
        <Button variant="contained" disabled={busy || !file || !confirmed} onClick={() => void inspect()}>{busy ? 'جارٍ الفحص…' : 'فحص ومطابقة البيانات الصحية'}</Button>
      </Stack>
      <Alert severity="info">عينة الاختبار تعطي الأولوية لسجلات الاستيراد المخصصة، وتحتوي على ما يصل إلى 3 موظفين مؤهلين وقت التنزيل، و3 قيم اصطناعية لكل موظف. لا تنشئ أو تعدّل سجلات بمجرد تنزيلها.</Alert>
      <FormControlLabel control={<Checkbox checked={confirmed} disabled={busy} onChange={(_, c) => setConfirmed(c)} />} label="أقر بأن الملف يحتوي على بيانات اصطناعية للاختبار فقط." />
    </Stack></Paper>
    {error && <Alert severity="error">{error}</Alert>}
    {preview && <>
      <Paper sx={{p: 2, borderRadius: 3}}><Stack gap={2}>
        <Typography variant="h6" fontWeight={800}>نتائج المعاينة — {preview.total_rows} سجلًا</Typography>
        <Stack direction="row" gap={1} flexWrap="wrap">{Object.entries(preview.identity_counts).map(([key, value]) =>
          <Chip key={key} label={(identityLabels[key] || key) + ': ' + value} variant="outlined" />)}</Stack>
        <Stack direction="row" gap={1} flexWrap="wrap">{Object.entries(preview.field_totals).map(([key, value]) =>
          <Chip key={key} label={(fieldLabels[key] || key) + ': ' + value} color={key === 'review' || key === 'card_conflict' ? 'warning' : 'default'} />)}</Stack>
        <Alert severity="info">{preview.notice} الحفظ التجريبي يتطلب معاينة مستقلة أدناه.</Alert>
        {preview.identity_counts.matched === 0 && <Alert severity="warning">لا يوجد تطابق ضمن موظفي الاختبار الموثقين. لا تعني هذه النتيجة عدم وجود الموظف في الدليل العام. نزّل عينة الاختبار المطابقة ولا ترفع ملفًا حقيقيًا.</Alert>}
      </Stack></Paper>
      <Paper sx={{p: 2, borderRadius: 3}}>
        <Typography variant="h6" fontWeight={800}>مطابقة الحقول بالبطاقة الصحية</Typography>
        <Typography variant="body2" color="text.secondary" sx={{mb:2}}>الأعداد لكل حقل؛ القيم الفارغة لا تمنع المطابقة، والقيم الموقوفة لا تعد نتائج طبية أو قيمًا قابلة للحفظ.</Typography>
        {Array.from(new Set(preview.fields.map(field => healthFieldGroups[field.field] || 'أخرى'))).map(group => <Box key={group} sx={{mb:3}}>
          <Typography variant="subtitle1" fontWeight={800} sx={{mb:1}}>{group}</Typography>
          <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,minmax(0,1fr))',xl:'repeat(3,minmax(0,1fr))'},gap:1.5}}>
            {preview.fields.filter(field => (healthFieldGroups[field.field] || 'أخرى') === group).map(field => <Paper key={field.field} variant="outlined" sx={{p:2,borderRadius:2}}>
              <Typography fontWeight={800}>{healthFieldLabel(field.field)}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{display:'block',direction:'ltr',textAlign:'right',overflowWrap:'anywhere'}}>{field.field}</Typography>
              {!field.target && <Typography variant="caption" color="warning.main">دلالة المصدر تحتاج مراجعة</Typography>}
              <Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:1,mt:1}}>
                {Object.entries(fieldLabels).map(([k,label]) => <Box key={k} sx={{borderBottom:'1px solid',borderColor:'divider',pb:0.5}}>
                  <Typography variant="caption" color="text.secondary">{label}</Typography>
                  <Typography fontWeight={800} color={['identity_blocked','card_conflict','review'].includes(k) && field.counts[k] ? 'warning.main' : 'text.primary'}>{field.counts[k] || 0}</Typography>
                </Box>)}
              </Box>
            </Paper>)}
          </Box>
        </Box>)}
      </Paper>
      <Paper sx={{p: 2, borderRadius: 3}}>
        <Button onClick={() => setShowRows(v => !v)}>{showRows ? 'إخفاء تفاصيل الصفوف' : 'عرض تفاصيل الصفوف دون هويات أو نتائج طبية'}</Button>
        {showRows && <TableContainer sx={{maxHeight: 500}}><Table size="small" stickyHeader>
          <TableHead><TableRow>{['صف القالب','المطابقة','البطاقة','القيم المقترحة','تعارضات','حقول تحتاج مراجعة'].map(h => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead>
          <TableBody>{preview.rows.map(row => <TableRow key={row.row}>
            <TableCell>{row.row}</TableCell><TableCell>{identityLabels[row.identity_status]}</TableCell>
            <TableCell>{row.approved_card ? 'معتمدة' : row.existing_card ? 'موجودة' : 'غير مثبتة'}</TableCell>
            <TableCell>{row.counts.proposed}</TableCell><TableCell>{row.counts.card_conflict}</TableCell>
            <TableCell>{row.issues.map(i => healthFieldLabel(i.field) + ' (' + healthIssueLabel(i.reason) + ')').join('، ') || '—'}</TableCell>
          </TableRow>)}</TableBody>
        </Table></TableContainer>}
      </Paper>
    </>}
    {preview && file && confirmed && <HealthDataDraftCommit file={file} api={API} />}
  </Stack></Box>;
}
