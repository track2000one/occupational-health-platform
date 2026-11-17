import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem,
  Pagination, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { authFetch, useAuth } from '../context/AuthContext';

const API = (import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:8000/api'
    : 'https://occupational-health-platform-production.up.railway.app/api')).replace(/\/$/, '');

type Classification = 'name_match' | 'name_review' | 'identifier_review' | 'not_in_registry';
type EmployeeCard = {
  id: number;
  source_row: number;
  name: string;
  masked_id: string;
  center: string;
  job_title: string;
  classification: Classification;
  missing_optional: string[];
  temporary_only: true;
};
type BatchInfo = {
  batch_id: number;
  total: number;
  created_at: string;
  counts: Partial<Record<Classification, number>>;
  temporary_only: true;
  clinical_activated: number;
};
type ListResponse = {
  batch: BatchInfo | null;
  total: number;
  page: number;
  page_size: number;
  items: EmployeeCard[];
};
type LookupResponse = {
  masked_id: string;
  original_record: 'archived' | 'active' | 'none';
  temporary_match: boolean;
  verification_required: boolean;
};
const STATUS: Record<Classification, { label: string; color: 'warning' | 'error' | 'info' | 'default' }> = {
  name_match: { label: 'مطابقة أولية — ليست اعتمادًا', color: 'info' },
  name_review: { label: 'اسم مختلف — يحتاج مراجعة', color: 'warning' },
  identifier_review: { label: 'تعارض معرّفات', color: 'error' },
  not_in_registry: { label: 'غير موجود بالسجل الأصلي', color: 'default' },
};
const FIELD_LABELS: Record<string, string> = {
  employee_number: 'الرقم الوظيفي', email: 'البريد الإلكتروني', mobile: 'الجوال',
  national_address: 'العنوان الوطني', date_of_birth: 'تاريخ الميلاد',
  birth_place: 'مكان الميلاد', gender: 'الجنس', marital_status: 'الحالة الاجتماعية',
  nationality: 'الجنسية', job_title: 'المسمى الوظيفي', current_job: 'الوظيفة الحالية',
  appointment_date: 'تاريخ التعيين', job_title_en: 'المسمى الوظيفي بالإنجليزية',
  health_center: 'المركز الصحي (مؤقت)', organization_unit: 'الوحدة التنظيمية (مؤقت)',
};
const errorMessage = async (response: Response) => {
  const payload = await response.json().catch(() => ({}));
  return payload?.detail || payload?.message || 'تعذر تنفيذ العملية.';
};

export function ProvisionalEmployeesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canUse = Boolean(user?.isSuperuser || user?.role === 'dataEntry');
  const isAdmin = Boolean(user?.isSuperuser);
  const [file, setFile] = useState<File | null>(null);
  const [batch, setBatch] = useState<BatchInfo | null>(null);
  const [items, setItems] = useState<EmployeeCard[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editRow, setEditRow] = useState<EmployeeCard | null>(null);
  const [field, setField] = useState('');
  const [fieldValue, setFieldValue] = useState('');
  const [reason, setReason] = useState('');
  const [identityChecked, setIdentityChecked] = useState(false);
  const [lookupId, setLookupId] = useState('');
  const [lookupResult, setLookupResult] = useState<LookupResponse | null>(null);

  const load = async (current = page, query = search, status = category) => {
    if (!canUse) return;
    try {
      setBusy(true);
      const params = new URLSearchParams({ page: String(current) });
      if (query.trim()) params.set('search', query.trim());
      if (status) params.set('classification', status);
      const response = await authFetch(API + '/provisional-employees/?' + params.toString());
      if (!response.ok) throw new Error(await errorMessage(response));
      const data: ListResponse = await response.json();
      setItems(data.items);
      setTotal(data.total);
      setBatch(data.batch);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل القائمة.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { void load(1, '', ''); }, [canUse]);

  const importFile = async () => {
    if (!file || !isAdmin || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await authFetch(API + '/provisional-employees/import/', { method: 'POST', body });
      if (!response.ok) throw new Error(await errorMessage(response));
      const result = await response.json();
      setMessage(result.message || 'تم استيراد القائمة الإدارية المؤقتة.');
      setFile(null);
      setPage(1);
      setSearch('');
      setCategory('');
      await load(1, '', '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'فشل استيراد الملف.');
    } finally {
      setBusy(false);
    }
  };

  const applySearch = async () => {
    if (/\d/.test(search) || /[٠-٩]/.test(search)) {
      setError('ابحث بالاسم فقط؛ استخدم الاستعلام الآمن أدناه للهوية.');
      return;
    }
    setPage(1);
    await load(1, search, category);
  };

  const lookup = async () => {
    const value = lookupId.trim();
    if (!/^[0-9٠-٩]{10}$/.test(value)) {
      setError('أدخل رقم هوية من 10 أرقام.');
      return;
    }
    setBusy(true);
    try {
      const response = await authFetch(API + '/provisional-employees/lookup/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ national_id: value }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      setLookupResult(await response.json());
      setLookupId('');
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر الاستعلام.');
    } finally {
      setBusy(false);
    }
  };

  const openCompletion = (row: EmployeeCard) => {
    setEditRow(row);
    setField(row.missing_optional[0] || '');
    setFieldValue('');
    setReason('');
    setIdentityChecked(false);
  };
  const complete = async () => {
    if (!editRow || !field || !fieldValue.trim() || reason.trim().length < 10 ||
        !identityChecked || busy) return;
    setBusy(true);
    try {
      const response = await authFetch(API + '/provisional-employees/' + editRow.id + '/complete/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identity_checked: true, reason: reason.trim(), fields: { [field]: fieldValue.trim() },
        }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      setEditRow(null);
      setMessage('تم استكمال الحقل في البطاقة الإدارية المؤقتة فقط.');
      setError('');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر استكمال البطاقة.');
    } finally {
      setBusy(false);
    }
  };

  const pages = useMemo(() => Math.max(1, Math.ceil(total / 24)), [total]);
  if (!canUse) {
    return <Alert severity="warning">هذه القائمة الإدارية المؤقتة متاحة للمسؤول الأعلى ومدخل البيانات فقط.</Alert>;
  }
  return <Box dir="rtl" sx={{ maxWidth: 1280, mx: 'auto', pb: 7 }}>
    <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }}
      justifyContent="space-between" gap={2} sx={{ mb: 2 }}>
      <Box>
        <Typography variant="h4" fontWeight={900}>استيراد مبسّط للموظفين</Typography>
        <Typography color="text.secondary" variant="body2">قائمة إدارية مؤقتة مستقلة عن ملفات المرضى والسجل الأصلي</Typography>
      </Box>
      <Button variant="outlined" onClick={() => navigate('/employees/import')}>العودة إلى الاستيراد الرئيسي</Button>
    </Stack>

    <Alert severity="warning" sx={{ mb: 2 }}>
      هذه بطاقات إدارية مؤقتة بانتظار المطابقة، وليست موظفين مفعلين أو ملفات صحية معتمدة.
      لا تُستخدم نتائجها لفتح سجل طبي أو نقل موظف أو فك الأرشفة.
    </Alert>

    {isAdmin && <Paper sx={{ p: 3, mb: 2, borderRadius: 3 }}>
      <Typography variant="h6" fontWeight={800} sx={{ mb: 1 }}>رفع ملف الموظفين مرة واحدة</Typography>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={2} alignItems={{ md: 'center' }}>
        <Button component="label" variant="outlined">
          {file ? file.name : 'اختيار ملف Excel'}
          <input type="file" hidden accept=".xlsx" onChange={event => setFile(event.target.files?.[0] || null)} />
        </Button>
        <Button variant="contained" disabled={!file || busy} onClick={importFile}>
          استيراد بيانات الموظفين مؤقتًا
        </Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        لا يتطلب نسخة احتياطية لاستعراض البيانات مؤقتًا؛ ملف الموظفين الأصلي لا يُستبدل ولا تُنسخ السجلات الطبية.
      </Typography>
    </Paper>}

    {message && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage('')}>{message}</Alert>}
    {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
    {batch && <Paper sx={{ p: 2, mb: 2, borderRadius: 3 }}>
      <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
        <Chip color="primary" label={'إجمالي الملف: ' + batch.total} />
        <Chip color="info" label={'مطابقة أولية: ' + (batch.counts.name_match || 0)} />
        <Chip color="warning" label={'اختلاف أسماء: ' + (batch.counts.name_review || 0)} />
        <Chip color="error" label={'تعارض معرّفات: ' + (batch.counts.identifier_review || 0)} />
        <Chip label={'غير موجود: ' + (batch.counts.not_in_registry || 0)} />
        <Chip variant="outlined" label="مؤقت — بانتظار المطابقة" />
      </Stack>
    </Paper>}

    <Paper sx={{ p: 2, mb: 2, borderRadius: 3 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
        <TextField label="البحث باسم الموظف" value={search}
          onChange={event => setSearch(event.target.value)} size="small" sx={{ flex: 1 }}
          onKeyDown={event => { if (event.key === 'Enter') void applySearch(); }} />
        <TextField select label="حالة المطابقة" value={category} size="small" sx={{ minWidth: 245 }}
          onChange={event => {
            setCategory(event.target.value);
            setPage(1);
            void load(1, search, event.target.value);
          }}>
          <MenuItem value="">جميع الحالات</MenuItem>
          {Object.entries(STATUS).map(([key, config]) =>
            <MenuItem key={key} value={key}>{config.label}</MenuItem>)}
        </TextField>
        <Button variant="outlined" onClick={applySearch} disabled={busy}>بحث</Button>
      </Stack>
    </Paper>

    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(275px,1fr))', gap: 2 }}>
      {items.map(row => <Paper key={row.id} elevation={1} sx={{
        p: 2, borderRadius: 3, border: '1px solid',
        borderColor: row.classification === 'identifier_review' ? 'error.main'
          : row.classification === 'name_review' ? 'warning.main'
          : row.missing_optional.length ? 'warning.light' : 'divider',
        bgcolor: row.missing_optional.length ? 'rgba(255,193,7,0.06)' : 'background.paper',
      }}>
        <Stack gap={1.5}>
          <Typography variant="subtitle1" fontWeight={800}>{row.name}</Typography>
          <Chip size="small" color={STATUS[row.classification].color}
            label={STATUS[row.classification].label} sx={{ alignSelf: 'flex-start' }} />
          <Typography variant="body2">الهوية: <b dir="ltr">{row.masked_id}</b></Typography>
          <Typography variant="body2">المركز: {row.center || 'غير متوفر'}</Typography>
          <Typography variant="body2">المسمى: {row.job_title || 'غير متوفر'}</Typography>
          <Typography variant="caption" color="text.secondary">صف Excel: {row.source_row}</Typography>
          {row.missing_optional.length > 0
            ? <Chip size="small" color="warning" label={'بيانات ناقصة: ' + row.missing_optional.length} />
            : <Chip size="small" color="success" variant="outlined" label="الحقول الاختيارية المستوردة مكتملة" />}
          {row.missing_optional.length > 0 &&
            <Button size="small" variant="outlined" onClick={() => openCompletion(row)}>استكمال البيانات</Button>}
        </Stack>
      </Paper>)}
    </Box>
    {!busy && total === 0 && <Alert severity="info" sx={{ my: 2 }}>لا توجد بطاقات في القائمة المؤقتة الحالية.</Alert>}
    {busy && <Box sx={{ textAlign: 'center', my: 2 }}><CircularProgress size={28} /></Box>}
    {total > 24 && <Stack alignItems="center" sx={{ mt: 3 }}>
      <Pagination count={pages} page={page} onChange={(_, next) => {
        setPage(next); void load(next);
      }} color="primary" />
    </Stack>}

    <Paper sx={{ p: 2, mt: 3, borderRadius: 3 }}>
      <Typography fontWeight={800} sx={{ mb: 1 }}>الاستعلام الآمن برقم الهوية</Typography>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
        <TextField label="رقم الهوية / الإقامة" type="password" value={lookupId}
          onChange={event => setLookupId(event.target.value)} size="small" inputProps={{ maxLength: 10 }} />
        <Button variant="outlined" disabled={busy || !lookupId} onClick={lookup}>استعلام</Button>
      </Stack>
      {lookupResult && <Alert severity="info" sx={{ mt: 2 }}>
        الرقم: {lookupResult.masked_id} — السجل الأصلي: {lookupResult.original_record === 'active'
          ? 'نشط' : lookupResult.original_record === 'archived' ? 'مؤرشف' : 'غير موجود'}
        ، البطاقة المؤقتة: {lookupResult.temporary_match ? 'موجودة' : 'غير موجودة'}.
        يلزم التحقق من الهوية قبل أي ربط سريري.
      </Alert>}
    </Paper>

    <Dialog open={Boolean(editRow)} onClose={() => setEditRow(null)} fullWidth maxWidth="sm">
      <DialogTitle>استكمال بيانات بطاقة مؤقتة</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ pt: 1 }}>
          <Alert severity="warning">التعديل على البطاقة الإدارية المؤقتة فقط؛ لن يعدّل السجل الصحي.</Alert>
          <Typography fontWeight={700}>{editRow?.name}</Typography>
          <TextField select label="الحقل الناقص" value={field}
            onChange={event => setField(event.target.value)}>
            {(editRow?.missing_optional || []).map(key =>
              <MenuItem key={key} value={key}>{FIELD_LABELS[key] || key}</MenuItem>)}
          </TextField>
          <TextField label="القيمة الجديدة" value={fieldValue}
            onChange={event => setFieldValue(event.target.value)} />
          <TextField label="سبب الاستكمال (10 أحرف على الأقل)" value={reason} multiline
            onChange={event => setReason(event.target.value)} />
          <FormControlLabel control={<Checkbox checked={identityChecked}
            onChange={event => setIdentityChecked(event.target.checked)} />}
            label="تحققت من هوية صاحب البيانات من مصدر موثوق" />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setEditRow(null)}>إلغاء</Button>
        <Button variant="contained" disabled={busy || !field || !fieldValue.trim() ||
          reason.trim().length < 10 || !identityChecked} onClick={complete}>حفظ الاستكمال المؤقت</Button>
      </DialogActions>
    </Dialog>
  </Box>;
}
