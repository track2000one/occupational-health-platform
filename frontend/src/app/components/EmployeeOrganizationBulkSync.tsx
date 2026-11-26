import { useState } from 'react';
import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, MenuItem, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { toast } from 'sonner';

type Status = 'ready' | 'matched' | 'conflict' | 'review';
type Row = { id: number; affiliation: string; status: Status; reason: string; fields: string[] };
type Preview = { total: number; counts: Record<Status, number>; rows: Row[]; preview_token: string };
type Props = { request: <T>(path: string, options?: RequestInit) => Promise<T>; onApplied: () => void };
const endpoint = '/employees/organization-bulk-sync/';
const labels: Record<Status, string> = { ready: 'مؤهل للاستكمال', matched: 'مطابق', conflict: 'تعارض يحتاج مراجعة', review: 'تبعية أو حالة تحتاج مراجعة' };
const fields: Record<string, string> = { health_cluster: 'التجمع الصحي', health_network: 'الشبكة الصحية', main_administration: 'الإدارة الرئيسية', sub_administration: 'الإدارة الفرعية', department: 'القسم', sub_unit: 'الوحدة', consultative_sector: 'القطاع الاستشاري', health_center: 'المركز الصحي' };
export function EmployeeOrganizationBulkSync({ request, onApplied }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [filter, setFilter] = useState<Status | 'all'>('ready');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  async function inspect() {
    setBusy(true); setOpen(true); setPreview(null); setSelected([]); setConfirmed(false); setReason('');
    try {
      const result = await request<Preview>(endpoint, { method: 'POST', body: JSON.stringify({ action: 'preview' }) });
      setPreview(result);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'تعذر فحص الهيكلة'); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!preview || busy || !selected.length || !confirmed || reason.trim().length < 10) return;
    setBusy(true);
    try {
      const result = await request<{ updated_count: number }>(endpoint, { method: 'POST', body: JSON.stringify({
        action: 'apply', preview_token: preview.preview_token, employee_ids: selected, reason: reason.trim(), confirmed: true
      }) });
      toast.success('تم استكمال الهيكلة لـ ' + result.updated_count + ' سجل وتوثيقها.');
      setPreview(null); setSelected([]); setOpen(false); onApplied();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذر التنفيذ');
      setPreview(null); setSelected([]); setConfirmed(false);
    } finally { setBusy(false); }
  }
  const visible = (preview?.rows || []).filter(row => filter === 'all' || row.status === filter);
  const eligible = (preview?.rows || []).filter(row => row.status === 'ready');
  return <>
    <Button variant="outlined" onClick={() => void inspect()} disabled={busy}>مطابقة الهيكلة التنظيمية جماعيًا</Button>
    <Dialog open={open} onClose={() => !busy && setOpen(false)} maxWidth="lg" fullWidth>
      <DialogTitle fontWeight={900}>مطابقة الهيكلة التنظيمية — معاينة قبل التنفيذ</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="info">يفحص السجل الرئيسي غير المؤرشف بالكامل، وليس الصفحة الحالية فقط. يُستكمل الناقص من التبعية المعتمدة فقط للموظفين النشطين الموثقين. لا تُنقل أي تبعية ولا تُستبدل المسميات المتعارضة.</Alert>
          {busy && <Typography>جارٍ المعالجة…</Typography>}
          {preview && <>
            <Typography fontWeight={800}>إجمالي المفحوص: {preview.total}</Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {(Object.keys(labels) as Status[]).map(status => <Chip key={status} label={labels[status] + ': ' + preview.counts[status]} color={status === 'ready' || status === 'matched' ? 'success' : 'warning'} variant="outlined" />)}
            </Stack>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
              <TextField select size="small" label="عرض الحالات" value={filter} onChange={e => setFilter(e.target.value as Status | 'all')}>
                <MenuItem value="all">جميع الحالات</MenuItem>
                {(Object.keys(labels) as Status[]).map(status => <MenuItem key={status} value={status}>{labels[status]}</MenuItem>)}
              </TextField>
              <Button onClick={() => { setSelected(eligible.map(row => row.id)); setConfirmed(false); }} disabled={busy || !eligible.length}>تحديد جميع المؤهلين</Button>
              <Button onClick={() => { setSelected([]); setConfirmed(false); }} disabled={busy}>إلغاء التحديد</Button>
              <Typography>المحدد: {selected.length}</Typography>
            </Stack>
            <TableContainer sx={{ maxHeight: 420 }}>
              <Table size="small" stickyHeader>
                <TableHead><TableRow><TableCell>تحديد</TableCell><TableCell>معرف السجل الداخلي</TableCell><TableCell>التبعية الحالية</TableCell><TableCell>الحالة</TableCell><TableCell>المستويات المعنية</TableCell></TableRow></TableHead>
                <TableBody>{visible.map(row => <TableRow key={row.id}>
                  <TableCell><Checkbox checked={selected.includes(row.id)} disabled={busy || row.status !== 'ready'} onChange={(_, checked) => {
                    setSelected(old => checked ? [...old, row.id] : old.filter(id => id !== row.id)); setConfirmed(false);
                  }} inputProps={{ 'aria-label': 'تحديد السجل ' + row.id }} /></TableCell>
                  <TableCell>{row.id}</TableCell><TableCell>{row.affiliation || 'غير محددة'}</TableCell>
                  <TableCell>{labels[row.status]}{row.reason === 'employment_or_registration' ? ' — غير نشط أو غير موثق' : ''}</TableCell>
                  <TableCell>{row.fields.map(key => fields[key] || key).join('، ') || '—'}</TableCell>
                </TableRow>)}</TableBody>
              </Table>
            </TableContainer>
            <TextField fullWidth multiline label="سبب الاستكمال الجماعي" value={reason} disabled={busy} onChange={e => { setReason(e.target.value); setConfirmed(false); }} helperText="من 10 إلى 500 حرف" slotProps={{ htmlInput: { maxLength: 500 } }} />
            <FormControlLabel control={<Checkbox checked={confirmed} disabled={busy || !selected.length} onChange={(_, checked) => setConfirmed(checked)} />} label="راجعت النتائج وأوافق على استكمال المسميات الناقصة للسجلات المحددة فقط." />
          </>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setOpen(false)} disabled={busy}>إغلاق</Button>
        <Button onClick={() => void inspect()} disabled={busy}>إعادة الفحص</Button>
        <Button variant="contained" onClick={() => void apply()} disabled={busy || !preview || !selected.length || !confirmed || reason.trim().length < 10 || reason.trim().length > 500}>تأكيد استكمال {selected.length} سجل</Button>
      </DialogActions>
    </Dialog>
  </>;
}
