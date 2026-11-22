import { useRef, useState } from 'react';
import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { CloudUpload as UploadIcon } from '@mui/icons-material';
import { authFetch, useAuth } from '../context/AuthContext';
import { V4_PRIVATE_UI } from '../data/v4AffiliationHierarchy';

type Draft = { code: string; name: string; parent_code: string | null; source_path: string; kind: string };
type Result = { total: number; kinds: Record<string, number>; mode: string; created: number; preview: Draft[] };
const API = 'http://127.0.0.1:18081/api';

export function V4DepartmentImport({ onImported }: { onImported: () => Promise<void> }) {
  const { user } = useAuth();
  const allowed = V4_PRIVATE_UI && window.location.origin === 'http://127.0.0.1:18081' && user?.isSuperuser === true;
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  function reset() { setFile(null); setResult(null); setConsent(false); setError(''); }
  async function submit(commit: boolean) {
    if (!allowed || !file || inFlight.current || (commit && (!consent || result?.mode !== 'preview'))) return;
    inFlight.current = true; setBusy(true); setError('');
    if (!commit) { setResult(null); setConsent(false); }
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('phase', 'departments');
      if (commit) form.append('confirm', 'IMPORT_V4_DEPARTMENT_DRAFTS_ONLY');
      const response = await authFetch(API + '/organization-units/import/', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(String(data.detail || 'تعذر الاستيراد.'));
      if (data.mode !== (commit ? 'draft' : 'preview') || !Array.isArray(data.preview) ||
          data.total !== data.preview.length || data.kinds?.department !== data.total ||
          (!commit && data.created !== 0)) throw new Error('استجابة غير متوقعة؛ تحقق من الدليل قبل إعادة المحاولة.');
      setResult(data); setConsent(false);
      if (commit) await onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الاتصال بالخادم.');
      setResult(null); setConsent(false);
    } finally { inFlight.current = false; setBusy(false); }
  }
  if (!allowed) return null;
  return <>
    <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => { reset(); setOpen(true); }}>
      استيراد Excel لتأسيس الأقسام
    </Button>
    <Dialog open={open} fullWidth maxWidth="md" onClose={() => { if (!busy) setOpen(false); }} dir="rtl">
      <DialogTitle>استيراد الهيكل التنظيمي للأقسام — V4</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="info">اختر ملف مسودات الأقسام المخصص (V4_Departments). لا ترفع ملف بيانات الموظفين. تُحفظ الجهات كمسودات فقط، ولا تُعتمد تلقائيًا.</Alert>
          <Button component="label" variant="outlined" disabled={busy} startIcon={<UploadIcon />}>
            {file ? file.name : 'اختيار ملف Excel'}
            <input hidden type="file" accept=".xlsx" disabled={busy} onChange={e => {
              const selected = e.target.files?.[0] || null;
              setResult(null); setConsent(false); setError('');
              if (selected && (!selected.name.toLowerCase().endsWith('.xlsx') || selected.size > 5 * 1024 * 1024)) {
                setFile(null); setError('اختر ملف XLSX بحجم لا يتجاوز 5 MB.');
              } else setFile(selected);
              e.target.value = '';
            }} />
          </Button>
          {error && <Alert severity="error">{error}</Alert>}
          {result && <>
            <Alert severity={result.mode === 'draft' ? 'success' : 'info'}>
              {result.mode === 'draft' ? 'تم حفظ المسودات.' : 'تمت المعاينة دون حفظ.'} إجمالي الجهات: {result.total} | المسودات الجديدة: {result.created}
            </Alert>
            <Stack direction="row" gap={1} flexWrap="wrap">
              {['إدارة رئيسية','إدارة فرعية','قسم','وحدة فرعية'].map((label, i) => <Chip key={label}
                label={label + ': ' + result.preview.filter(row => row.source_path.split(' / ').length === i + 1).length} />)}
            </Stack>
            <TableContainer component={Paper} sx={{ maxHeight: 360 }}>
              <Table size="small" stickyHeader>
                <TableHead><TableRow><TableCell>الجهة</TableCell><TableCell>المسار التنظيمي</TableCell></TableRow></TableHead>
                <TableBody>{result.preview.map(row => <TableRow key={row.code}>
                  <TableCell>{row.name}</TableCell><TableCell>{row.source_path}</TableCell>
                </TableRow>)}</TableBody>
              </Table>
            </TableContainer>
            {result.mode === 'preview' && <FormControlLabel control={<Checkbox checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} />}
              label="راجعت المسارات وأوافق على حفظ الجهات كمسودات فقط في V4" />}
          </>}
          {busy && <Typography color="text.secondary">جارٍ تنفيذ الطلب...</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={() => setOpen(false)}>إغلاق</Button>
        <Button disabled={!file || busy || result?.mode === 'draft'} onClick={() => void submit(false)}>معاينة الملف</Button>
        <Button variant="contained" disabled={busy || !consent || result?.mode !== 'preview'} onClick={() => void submit(true)}>حفظ المسودات</Button>
      </DialogActions>
    </Dialog>
  </>;
}
