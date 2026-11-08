import { useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, Paper, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { UploadFile as UploadIcon, FactCheck as PreviewIcon } from '@mui/icons-material';
import { toast } from 'sonner';
import { authFetch, getAccessToken } from '../context/AuthContext';

const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const CONFIRM_TEXT = 'اعتماد المراكز الجديدة';
type CenterPreviewItem = {
  name: string; name_en: string; code: string; status: 'new' | 'existing' | 'conflict';
  source_count: number; reason: string; matched_center_id: number | null;
};
type CenterPreview = {
  mode: 'preview'; worksheet: string; source_rows: number; distinct_centers: number;
  counts: { new: number; existing: number; conflict: number };
  preview: CenterPreviewItem[]; preview_token: string;
};
type ImportResult = { mode: 'committed'; created_count: number; existing_count: number; conflict_count: number };

export function HealthCenterExcelImportDialog({
  open, onClose, onImported,
}: {
  open: boolean; onClose: () => void; onImported: () => void | Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CenterPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  function reset() {
    setFile(null); setPreview(null); setResult(null);
    setConfirmed(false); setPhrase('');
  }

  async function submit(action: 'preview' | 'commit') {
    if (!file || busy || !API_BASE_URL) {
      if (!API_BASE_URL) toast.error('لم يتم ضبط عنوان API لهذه البيئة.');
      return;
    }
    if (action === 'commit' && (!preview || !confirmed || phrase !== CONFIRM_TEXT ||
        preview.counts.new <= 0)) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('action', action);
      if (action === 'commit' && preview) {
        body.append('preview_token', preview.preview_token);
        body.append('confirmed', 'true');
        body.append('confirm_text', phrase);
      }
      const token = getAccessToken();
      if (!token) throw new Error('جلسة الدخول غير صالحة.');
      const response = await authFetch(`${API_BASE_URL}/health-centers/import-excel/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.detail || 'تعذر فحص ملف المراكز.');
      if (action === 'preview') {
        if (data.mode !== 'preview' || !Array.isArray(data.preview)) {
          throw new Error('لم تصل معاينة كاملة للمراكز.');
        }
        setPreview(data as CenterPreview);
        setResult(null);
        setConfirmed(false);
        setPhrase('');
      } else {
        setResult(data as ImportResult);
        setPreview(null);
        toast.success(`تم إدراج ${data.created_count} مركزًا جديدًا، مع الحفاظ على المراكز الموجودة.`);
        await onImported();
      }
    } catch (error) {
      if (action === 'commit') {
        // A changed directory or expired token always requires fresh preview.
        setPreview(null);
      }
      toast.error(error instanceof Error ? error.message : 'تعذرت العملية.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} fullWidth maxWidth="md" dir="rtl"
      onClose={() => { if (!busy) { reset(); onClose(); } }}
      PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle fontWeight={900}>استيراد المراكز الصحية من Excel</DialogTitle>
      <DialogContent dividers>
        <Stack gap={2}>
          <Alert severity="info">
            يمكنك رفع ملف المراكز، أو ملف الموظفين الذي يحتوي على عمود
            «المركز الصحي / Health center». سيستخرج النظام أسماء المراكز المختلفة فقط،
            دون استيراد الموظفين أو تغيير مراكزهم.
          </Alert>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
            <Button variant="outlined" component="label" startIcon={<UploadIcon />}
              disabled={busy} sx={{ flexShrink: 0 }}>
              اختيار ملف Excel
              <input hidden type="file" accept=".xlsx"
                onChange={event => {
                  setFile(event.target.files?.[0] || null);
                  setPreview(null); setResult(null);
                  setConfirmed(false); setPhrase('');
                  event.target.value = '';
                }} />
            </Button>
            <Box sx={{ flex: 1, alignSelf: 'center', overflowWrap: 'anywhere' }}>
              <Typography variant="body2">{file?.name || 'لم يتم اختيار ملف بعد'}</Typography>
            </Box>
            <Button variant="contained" startIcon={<PreviewIcon />}
              disabled={!file || busy} onClick={() => void submit('preview')}>
              {busy ? 'جارٍ الفحص...' : 'معاينة المراكز'}
            </Button>
          </Stack>
          {preview && <>
            <Alert severity="success">
              تمت قراءة ورقة «{preview.worksheet}» بنجاح. وجدنا {preview.distinct_centers} مركزًا
              مختلفًا في {preview.source_rows} صفًا. لم تتم إضافة أي مركز حتى الآن.
            </Alert>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3,1fr)' }, gap: 1 }}>
              {[
                ['جديدة قابلة للإضافة', preview.counts.new, 'success'],
                ['موجودة مسبقًا ولن تتكرر', preview.counts.existing, 'info'],
                ['تحتاج مراجعة ولن تُضاف', preview.counts.conflict, 'warning'],
              ].map(([label, number, color]) =>
                <Paper key={String(label)} variant="outlined" sx={{ p: 1.5, textAlign: 'center', borderRadius: 2 }}>
                  <Typography variant="h5" fontWeight={900} color={`${color}.main`}>{number}</Typography>
                  <Typography variant="caption">{label}</Typography>
                </Paper>
              )}
            </Box>
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 310 }}>
              <Table stickyHeader size="small">
                <TableHead><TableRow>
                  <TableCell>المركز الوارد في Excel</TableCell>
                  <TableCell>عدد مرات ظهوره</TableCell>
                  <TableCell>الحالة</TableCell>
                  <TableCell>السبب</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {preview.preview.map((row, index) => <TableRow key={`${row.name}-${index}`}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.source_count}</TableCell>
                    <TableCell><Chip size="small" color={row.status === 'new' ? 'success' : row.status === 'existing' ? 'info' : 'warning'}
                      label={row.status === 'new' ? 'جديد' : row.status === 'existing' ? 'موجود' : 'تعارض'} /></TableCell>
                    <TableCell>{row.reason || '—'}</TableCell>
                  </TableRow>)}
                </TableBody>
              </Table>
            </TableContainer>
            {preview.counts.conflict > 0 && <Alert severity="warning">
              توجد أسماء أو رموز متعارضة. لن تُدرج هذه المراكز تلقائيًا؛ راجعها في ملف Excel
              أو عالجها يدويًا بعد التحقق من الاسم الصحيح.
            </Alert>}
            {preview.counts.new > 0 && <>
              <Alert severity="warning">
                سيتم اعتماد {preview.counts.new} مركزًا جديدًا فقط. يُرجى التأكد أن
                الأسماء الجديدة مراكز حقيقية معتمدة، وليست أخطاءً إملائية في أسماء المراكز الموجودة.
              </Alert>
              <TextField fullWidth label="عبارة التأكيد" value={phrase} disabled={busy}
                onChange={event => setPhrase(event.target.value)}
                helperText={`اكتب: ${CONFIRM_TEXT}`} />
              <FormControlLabel
                control={<Checkbox checked={confirmed} disabled={busy}
                  onChange={(_, value) => setConfirmed(value)} />}
                label="تحققت من المراكز الجديدة وأوافق على إضافتها دون تعديل المراكز والموظفين الحاليين." />
            </>}
          </>}
          {result && <Alert severity="success">
            تمت إضافة {result.created_count} مركزًا صحيًا، وتجاهُل {result.existing_count} مركزًا موجودًا.
            المراكز المتعارضة التي لم تُضف: {result.conflict_count}.
          </Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button disabled={busy} onClick={() => { reset(); onClose(); }}>إغلاق</Button>
        <Button variant="contained" color="success"
          disabled={busy || !preview || preview.counts.new === 0 || !confirmed ||
            phrase !== CONFIRM_TEXT}
          onClick={() => void submit('commit')}>
          {busy ? 'جارٍ الحفظ...' : `اعتماد وإضافة ${preview?.counts.new || 0} مركزًا`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
