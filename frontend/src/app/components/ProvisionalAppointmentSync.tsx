import { useState } from 'react';
import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, MenuItem, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { authFetch } from '../context/AuthContext';

type Status = 'ready' | 'matched' | 'conflict' | 'unmatched' | 'missing' | 'review';
type Row = { row_id: number; source_row: number; status: Status; reason: string;
  source_date: string; proposed_date: string; current_date: string };
type Preview = { batch_id: number; total: number; counts: Record<Status, number>; rows: Row[]; preview_token: string };
const labels: Record<Status, string> = { ready: 'مؤهل للاستكمال', matched: 'مطابق', conflict: 'تعارض التاريخ',
  unmatched: 'موظف غير مطابق', missing: 'غير متوفر في المصدر', review: 'يحتاج مراجعة' };
const reasons: Record<string, string> = { source_missing: 'تاريخ غير موجود', no_identity_match: 'لا يوجد سجل مطابق',
  invalid_date: 'تاريخ غير صالح أو خارج النطاق', identity_review: 'الاسم أو المعرّفات تحتاج تحققًا',
  inactive_or_unverified: 'سجل غير نشط أو غير موثق', existing_date_conflict: 'اختلاف عن التاريخ المحفوظ' };
const api = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const endpoint = '/provisional-employees/appointment-sync/';
export function ProvisionalAppointmentSync({ batchId }: { batchId: number }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function request<T>(payload: object): Promise<T> {
    if (!api || !/staging/i.test(new URL(api).hostname)) throw new Error('اتصال Staging غير مضبوط؛ تم منع العملية.');
    const response = await authFetch(api + endpoint, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batch_id: batchId, ...payload }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'تعذر تنفيذ العملية');
    return data as T;
  }
  async function inspect() {
    setOpen(true); setBusy(true); setPreview(null); setSelected([]); setConfirmed(false); setReason(''); setError(''); setMessage('');
    try { setPreview(await request<Preview>({ action: 'preview' })); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر الفحص'); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!preview || busy || !confirmed || !selected.length || reason.trim().length < 10) return;
    setBusy(true); setError('');
    try {
      const result = await request<{updated_count: number}>({ action: 'apply', row_ids: selected,
        preview_token: preview.preview_token, confirmed: true, reason: reason.trim() });
      setMessage('تم استكمال تاريخ التعيين في ' + result.updated_count + ' سجل.');
      setPreview(null); setSelected([]); setConfirmed(false); setOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر التنفيذ'); setPreview(null); setSelected([]); setConfirmed(false); }
    finally { setBusy(false); }
  }
  const visible = (preview?.rows || []).filter(row => filter === 'all' || row.status === filter);
  const ready = (preview?.rows || []).filter(row => row.status === 'ready');
  return <Paper sx={{ p: 2, mb: 2, borderRadius: 3 }}>
    <Stack gap={1.5}>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={1} alignItems={{ md: 'center' }} justifyContent="space-between">
        <Box>
          <Typography variant="h6" fontWeight={800}>مطابقة واستكمال تواريخ التعيين</Typography>
          <Typography variant="body2" color="text.secondary">فحص تاريخ التعيين من الدفعة المؤقتة المحفوظة دون إعادة رفع Excel، واستكمال الناقص فقط بعد المراجعة.</Typography>
        </Box>
        <Button variant="contained" onClick={() => void inspect()} disabled={busy}>فحص ومطابقة تواريخ التعيين</Button>
      </Stack>
      {message && <Alert severity="success">{message}</Alert>}
    </Stack>
    <Dialog open={open} maxWidth="lg" fullWidth onClose={() => !busy && setOpen(false)}>
      <DialogTitle fontWeight={900}>معاينة تواريخ التعيين — الدفعة {batchId}</DialogTitle>
      <DialogContent dividers>
        <Stack gap={2}>
          <Alert severity="info">المصدر هو البيانات المؤقتة المحفوظة وليس نسخة Excel الأصلية. يتحقق النظام من الهوية والاسم والمعرّفات والحالة الوظيفية. يحول التاريخ الهجري بتقويم أم القرى ويحفظ الأصل عند الاستكمال. لا يعدل تاريخًا ميلاديًا مسجلًا ولا ينشئ أو يستعيد موظفًا.</Alert>
          {error && <Alert severity="error">{error}</Alert>}
          {busy && <Typography>جارٍ المعالجة…</Typography>}
          {preview && <>
            <Typography fontWeight={800}>إجمالي المفحوص: {preview.total}</Typography>
            <Stack direction="row" gap={1} flexWrap="wrap">
              {(Object.keys(labels) as Status[]).map(s => <Chip key={s} label={labels[s] + ': ' + preview.counts[s]} variant="outlined" color={s === 'ready' || s === 'matched' ? 'success' : 'warning'} />)}
            </Stack>
            <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
              <TextField select size="small" label="عرض الحالات" value={filter} onChange={e => setFilter(e.target.value as Status | 'all')}>
                <MenuItem value="all">الكل</MenuItem>
                {(Object.keys(labels) as Status[]).map(s => <MenuItem value={s} key={s}>{labels[s]}</MenuItem>)}
              </TextField>
              <Button disabled={busy || !ready.length} onClick={() => { setSelected(ready.map(r => r.row_id)); setConfirmed(false); }}>تحديد جميع المؤهلين</Button>
              <Button disabled={busy} onClick={() => { setSelected([]); setConfirmed(false); }}>إلغاء التحديد</Button>
              <Typography>المحدد: {selected.length}</Typography>
            </Stack>
            <TableContainer sx={{ maxHeight: 430 }}>
              <Table size="small" stickyHeader>
                <TableHead><TableRow>{['تحديد','صف المصدر','تاريخ المصدر','الميلادي المقترح','الميلادي الحالي','الحالة'].map(h => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead>
                <TableBody>{visible.map(row => <TableRow key={row.row_id}>
                  <TableCell><Checkbox checked={selected.includes(row.row_id)} disabled={busy || row.status !== 'ready'} onChange={(_, checked) => {
                    setSelected(old => checked ? [...old, row.row_id] : old.filter(id => id !== row.row_id)); setConfirmed(false);
                  }} /></TableCell>
                  <TableCell>{row.source_row}</TableCell>
                  <TableCell><span dir="ltr">{row.source_date || '—'}</span></TableCell>
                  <TableCell><span dir="ltr">{row.proposed_date || '—'}</span></TableCell>
                  <TableCell><span dir="ltr">{row.current_date || '—'}</span></TableCell>
                  <TableCell>{labels[row.status]}{row.reason && ' — ' + (reasons[row.reason] || row.reason)}</TableCell>
                </TableRow>)}</TableBody>
              </Table>
            </TableContainer>
            <TextField multiline fullWidth label="سبب الاستكمال ومرجع التحقق" value={reason} disabled={busy} onChange={e => { setReason(e.target.value); setConfirmed(false); }} helperText="من 10 إلى 350 حرفًا" slotProps={{ htmlInput: { maxLength: 350 } }} />
            <FormControlLabel control={<Checkbox checked={confirmed} disabled={busy || !selected.length} onChange={(_, checked) => setConfirmed(checked)} />} label="راجعت الهوية والحالة الوظيفية والتواريخ مقابل المصدر الموثوق وأوافق على استكمال المحدد فقط." />
          </>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={() => setOpen(false)}>إغلاق</Button>
        <Button disabled={busy} onClick={() => void inspect()}>إعادة الفحص</Button>
        <Button variant="contained" disabled={busy || !preview || !confirmed || !selected.length || reason.trim().length < 10 || reason.trim().length > 350} onClick={() => void apply()}>تأكيد استكمال {selected.length} سجل</Button>
      </DialogActions>
    </Dialog>
  </Paper>;
}
