import { useState } from 'react';
import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, Paper, Stack, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { authFetch, useAuth } from '../context/AuthContext';

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const fieldLabels: Record<string, string> = { empty: 'فارغ', proposed: 'قيمة مقترحة للفحص',
  same_card_value: 'مطابق للبطاقة', card_conflict: 'تعارض مع البطاقة',
  review: 'يحتاج تفسيرًا أو تصحيحًا', identity_blocked: 'موقوف بسبب المطابقة' };
const identityLabels: Record<string, string> = { matched: 'مطابق مبدئيًا', identity_review: 'هوية أو مركز يحتاج مراجعة',
  unmatched: 'غير موجود', inactive: 'غير نشط أو غير موثق', duplicate: 'هوية مكررة في الملف' };
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
  const isAllowed = user?.isSuperuser === true && /staging/i.test(window.location.hostname);
  async function download() {
    setBusy(true); setError('');
    try {
      const res = await authFetch(base() + '/health-data-import/template/');
      if (!res.ok) throw new Error('تعذر تنزيل القالب.');
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement('a'); link.href = url; link.download = 'OHP_HealthData_V1.xlsx';
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
    <Alert severity="warning">المرحلة الأولى — معاينة فقط. يمنع رفع البيانات الصحية الحقيقية في Staging. استخدم القالب الفارغ وبيانات اصطناعية.</Alert>
    <Paper sx={{ p: 3, borderRadius: 3 }}><Stack gap={2}>
      <Typography variant="h6" fontWeight={800}>قالب HealthData V1</Typography>
      <Typography color="text.secondary">61 حقلًا صحيًا و4 حقول للربط. لا يُعاد تسجيل الموظف، ولا تُنشأ بطاقة أو زيارة أثناء الفحص.</Typography>
      <Stack direction="row" gap={1} flexWrap="wrap">
        <Button variant="outlined" disabled={busy} onClick={() => void download()}>تنزيل القالب الصحي المعتمد</Button>
        <Button component="label" variant="outlined" disabled={busy}>{file?.name || 'اختيار ملف Excel'}
          <input type="file" hidden accept=".xlsx" onChange={e => { setFile(e.target.files?.[0] || null); setPreview(null); setConfirmed(false); setError(''); }} />
        </Button>
        <Button variant="contained" disabled={busy || !file || !confirmed} onClick={() => void inspect()}>{busy ? 'جارٍ الفحص…' : 'فحص ومطابقة البيانات الصحية'}</Button>
      </Stack>
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
        <Alert severity="info">{preview.notice} لا تتوفر عملية حفظ في هذا الإصدار.</Alert>
      </Stack></Paper>
      <Paper sx={{p: 2, borderRadius: 3}}>
        <Typography variant="h6" fontWeight={800}>مطابقة الحقول بالبطاقة الصحية</Typography>
        <TableContainer sx={{maxHeight: 520}}><Table size="small" stickyHeader>
          <TableHead><TableRow>{['الحقل', 'المسار المستهدف', ...Object.values(fieldLabels)].map(h => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead>
          <TableBody>{preview.fields.map(field => <TableRow key={field.field}>
            <TableCell>{field.field}</TableCell><TableCell>{field.target || 'مراجعة الدلالة'}</TableCell>
            {Object.keys(fieldLabels).map(k => <TableCell key={k}>{field.counts[k] || 0}</TableCell>)}
          </TableRow>)}</TableBody>
        </Table></TableContainer>
      </Paper>
      <Paper sx={{p: 2, borderRadius: 3}}>
        <Button onClick={() => setShowRows(v => !v)}>{showRows ? 'إخفاء تفاصيل الصفوف' : 'عرض تفاصيل الصفوف دون هويات أو نتائج طبية'}</Button>
        {showRows && <TableContainer sx={{maxHeight: 500}}><Table size="small" stickyHeader>
          <TableHead><TableRow>{['صف القالب','المطابقة','البطاقة','القيم المقترحة','تعارضات','حقول تحتاج مراجعة'].map(h => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead>
          <TableBody>{preview.rows.map(row => <TableRow key={row.row}>
            <TableCell>{row.row}</TableCell><TableCell>{identityLabels[row.identity_status]}</TableCell>
            <TableCell>{row.approved_card ? 'معتمدة' : row.existing_card ? 'موجودة' : 'غير مثبتة'}</TableCell>
            <TableCell>{row.counts.proposed}</TableCell><TableCell>{row.counts.card_conflict}</TableCell>
            <TableCell>{row.issues.map(i => i.field + ' (' + i.reason + ')').join('، ') || '—'}</TableCell>
          </TableRow>)}</TableBody>
        </Table></TableContainer>}
      </Paper>
    </>}
  </Stack></Box>;
}
