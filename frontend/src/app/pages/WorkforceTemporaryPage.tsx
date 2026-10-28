import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Paper, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField,
  Typography, Chip,
} from '@mui/material';
import {
  CloudUploadOutlined as UploadIcon,
  RefreshOutlined as RefreshIcon,
  DeleteOutline as DeleteIcon,
  LockOutlined as LockIcon,
} from '@mui/icons-material';
import { authFetch, useAuth } from '../context/AuthContext';

const API_BASE = (
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:8000/api'
    : 'https://occupational-health-platform-production.up.railway.app/api')
).replace(/\/$/, '');
const TARGET = API_BASE + '/workforce-roster/temporary/';

type RosterRow = { excel_row: number; values: string[] };
type RosterSummary = {
  rows: number; columns: number; groups: number;
  source_statuses: Record<string, number>;
  missing_organization_rows: number[];
  invalid_identity_rows: number[];
  repeated_identity_rows: number[];
  requires_review: boolean;
};
type RosterReply = {
  exists: boolean; id?: number; columns?: string[]; rows?: RosterRow[];
  summary?: RosterSummary; count?: number; page?: number;
  expires_at?: string; upload_enabled?: boolean;
  detail?: string;
};

async function readJson(response: Response): Promise<RosterReply> {
  const content = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(
    String(content.detail || 'تعذر الاتصال بقائمة الموظفين المؤقتة.')
  );
  return content;
}

export function WorkforceTemporaryPage() {
  const { user } = useAuth();
  const [payload, setPayload] = useState<RosterReply | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load(search = query, sourceStatus = source, requestedPage = page) {
    if (!user?.isSuperuser) return;
    setBusy(true); setError('');
    try {
      const queryString = new URLSearchParams({ page: String(requestedPage + 1) });
      if (search.trim()) queryString.set('search', search.trim());
      if (sourceStatus) queryString.set('source_status', sourceStatus);
      const response = await authFetch(TARGET + '?' + queryString);
      setPayload(await readJson(response));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر استعراض البيانات.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const id = setTimeout(() => { void load(query, source, page); }, query ? 350 : 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, source, page, user?.isSuperuser]);

  async function upload() {
    if (!file || busy || !payload?.upload_enabled || payload.exists) return;
    if (!window.confirm('سيُحفظ ملف Excel كاملًا ومشفرًا داخل قاعدة الاختبار المؤقتة. هل تؤكد تفويضك لرفع بيانات الموظفين؟')) return;
    setBusy(true); setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await authFetch(TARGET, { method: 'POST', body: form });
      await readJson(response);
      setFile(null); setPage(0); setQuery(''); setSource('');
      const newResponse = await authFetch(TARGET + '?page=1');
      setPayload(await readJson(newResponse));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر رفع الملف.');
    } finally {
      setBusy(false);
    }
  }

  async function removeTemporaryCopy() {
    if (!payload?.exists || busy) return;
    if (!window.confirm('سيتم حذف النسخة المؤقتة كاملةً من قاعدة الاختبار. لا يمكن التراجع. هل تؤكد؟')) return;
    setBusy(true); setError('');
    try {
      const response = await authFetch(TARGET, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE_TEMP_ROSTER' }),
      });
      await readJson(response);
      setPayload({ exists: false, upload_enabled: payload.upload_enabled });
      setPage(0); setQuery(''); setSource('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حذف النسخة المؤقتة.');
    } finally {
      setBusy(false);
    }
  }

  if (!user?.isSuperuser) return (
    <Alert severity="error" dir="rtl">هذه الصفحة مخصصة لمدير النظام الأعلى فقط. لا ترفع بيانات الموظفين بحساب غير مخوّل.</Alert>
  );

  return (
    <Box dir="rtl" sx={{ p: { xs: 1, md: 2 }, pb: 5 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 850, color: '#123856' }}>
            قاعدة الموظفين الأصلية — مساحة عمل مؤقتة
          </Typography>
          <Typography color="text.secondary" sx={{ fontSize: 14.5, mt: 0.5 }}>
            الأعمدة A–S كما وردت في الملف، منفصلة عن سجلات الاختبار الوهمية والملفات الصحية
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => void load()} disabled={busy}>
          تحديث العرض
        </Button>
      </Stack>
      <Alert icon={<LockIcon />} severity="warning" sx={{ mb: 2 }}>
        بيانات تعريفية حقيقية ومقيدة. تُحفظ مشفّرة لمدة أقصاها 30 يومًا،
        وتُعرض فقط لمدير النظام الأعلى. لا تستخدم هذه المساحة لتسجيل معلومات طبية.
      </Alert>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {busy && <CircularProgress size={24} sx={{ mb: 2 }} />}
      {payload && !payload.exists && (
        <Paper sx={{ p: 3, borderRadius: 3, mb: 2 }}>
          <Typography fontWeight={800} sx={{ mb: 2 }}>رفع الملف الأصلي للعمل المؤقت</Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} gap={2} alignItems="center">
            <Button component="label" variant="outlined" disabled={!payload.upload_enabled || busy}>
              اختيار ملف Excel بصيغة XLSX
              <input hidden type="file" accept=".xlsx" onChange={event =>
                setFile(event.target.files?.[0] || null)} />
            </Button>
            <Typography sx={{ overflowWrap: 'anywhere' }}>{file?.name || 'لم يُحدد ملف'}</Typography>
            <Button variant="contained" startIcon={<UploadIcon />} onClick={() => void upload()}
              disabled={!file || busy || !payload.upload_enabled}>
              رفع نسخة العمل المؤقتة
            </Button>
          </Stack>
          {!payload.upload_enabled && <Alert severity="info" sx={{ mt: 2 }}>
            رفع بيانات الموظفين الأصلية مقفل حتى التحقق من كلمة المرور الآمنة والنسخ الاحتياطية وتفعيل صلاحية الاستيراد.
          </Alert>}
        </Paper>
      )}
      {payload?.exists && payload.summary && (
        <>
          <Stack direction="row" gap={1.5} flexWrap="wrap" sx={{ mb: 2 }} alignItems="center">
            <Chip label={`عدد السجلات: ${payload.summary.rows}`} color="primary"/>
            <Chip label={`الجهات التنظيمية: ${payload.summary.groups}`} variant="outlined"/>
            <Chip label={`الأعمدة: ${payload.summary.columns}`} variant="outlined"/>
            {payload.summary.requires_review &&
              <Chip label="توجد سجلات تحتاج مراجعة" color="warning"/>}
            <Box sx={{ flexGrow: 1 }}/>
            <Button color="error" variant="outlined" startIcon={<DeleteIcon />}
              onClick={() => void removeTemporaryCopy()} disabled={busy}>
              حذف البيانات المؤقتة
            </Button>
          </Stack>
          <Alert severity="info" sx={{ mb: 2 }}>
            تنتهي صلاحية نسخة العمل في {payload.expires_at ? new Date(payload.expires_at).toLocaleDateString('ar-SA') : '30 يومًا'}.
            الصفوف غير المكتملة محفوظة للمراجعة، دون تغيير قيم Excel الأصلية.
          </Alert>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
              <TextField label="بحث في الاسم أو الهوية أو الرقم الوظيفي أو الجهة أو المدير" size="small"
                value={query} fullWidth onChange={event => { setQuery(event.target.value); setPage(0); }}/>
              <TextField select label="حالة الموظف في Excel" size="small"
                value={source} onChange={event => { setSource(event.target.value); setPage(0); }}
                SelectProps={{ native: true }} sx={{ minWidth: 230 }}>
                <option value="">جميع الحالات</option>
                {Object.keys(payload.summary.source_statuses).map(item =>
                  <option value={item} key={item}>{item}</option>)}
              </TextField>
            </Stack>
          </Paper>
          <TableContainer component={Paper} sx={{ borderRadius: 3, maxHeight: '65vh', border: '1px solid #D2E0EA' }}>
            <Table stickyHeader size="small" sx={{ minWidth: 1900, '& .MuiTableCell-root': { fontSize: 13.5, p: 1.5, whiteSpace: 'nowrap' } }}>
              <TableHead><TableRow>
                <TableCell sx={{ fontWeight: 800 }}>صف Excel</TableCell>
                {(payload.columns || []).map((label, index) =>
                  <TableCell key={index} sx={{ fontWeight: 800 }}>{label}</TableCell>)}
              </TableRow></TableHead>
              <TableBody>
                {(payload.rows || []).map(row => (
                  <TableRow hover key={row.excel_row} sx={{ '&:nth-of-type(even)': { bgcolor: '#F4F8FC' } }}>
                    <TableCell>{row.excel_row}</TableCell>
                    {row.values.map((value, index) =>
                      <TableCell key={index} sx={{ overflowWrap: 'anywhere', maxWidth: 270 }}>
                        {value || '—'}
                      </TableCell>)}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination component="div" count={payload.count || 0} rowsPerPage={25}
            rowsPerPageOptions={[25]} page={page}
            onPageChange={(_, next) => setPage(next)}
            labelDisplayedRows={({from,to,count}) => `${from}–${to} من ${count}`}
            labelRowsPerPage="لكل صفحة:"/>
        </>
      )}
    </Box>
  );
}
