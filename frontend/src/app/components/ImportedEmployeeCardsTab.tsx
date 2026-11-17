import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, FormControlLabel, Grid,
  MenuItem, Pagination, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import {
  EditOutlined as EditIcon, FactCheckOutlined as ReviewIcon,
  Search as SearchIcon, VisibilityOutlined as ViewIcon,
} from '@mui/icons-material';
import { authFetch, useAuth } from '../context/AuthContext';

// Never fall back from the staging hostname to Production employee data.
const API = (import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:8000/api'
    : typeof window !== 'undefined' && /staging/i.test(window.location.hostname)
      ? ''
      : 'https://occupational-health-platform-production.up.railway.app/api')).replace(/\/$/, '');

type Classification = 'name_match' | 'name_review' | 'identifier_review' | 'not_in_registry';
type ImportedRow = {
  id: number;
  source_row: number;
  name: string;
  masked_id: string;
  center: string;
  organization_unit?: string;
  job_title: string;
  classification: Classification;
  missing_optional: string[];
  temporary_only: true;
};
type Batch = {
  batch_id: number; total: number; temporary_only: true;
  clinical_activated: number; counts: Partial<Record<Classification, number>>;
};
type RosterResponse = {
  batch: Batch | null; total: number; page: number; page_size: number; items: ImportedRow[];
};
const CLASSIFICATION: Record<Classification, { ar: string; color: 'info' | 'warning' | 'error' | 'default' }> = {
  name_match: { ar: 'مطابقة اسم أولية — غير معتمد', color: 'info' },
  name_review: { ar: 'اختلاف اسم يحتاج مراجعة', color: 'warning' },
  identifier_review: { ar: 'تعارض معرّفات', color: 'error' },
  not_in_registry: { ar: 'غير موجود بالسجل الأصلي', color: 'default' },
};
const FIELDS: Record<string, string> = {
  employee_number: 'الرقم الوظيفي',
  email: 'البريد الإلكتروني',
  mobile: 'رقم الجوال',
  national_address: 'العنوان الوطني',
  date_of_birth: 'تاريخ الميلاد',
  birth_place: 'مكان الميلاد',
  gender: 'الجنس',
  marital_status: 'الحالة الاجتماعية',
  nationality: 'الجنسية',
  job_title: 'المسمى الوظيفي',
  job_title_en: 'المسمى بالإنجليزية',
  current_job: 'الوظيفة الحالية',
  appointment_date: 'تاريخ التعيين',
  health_center: 'المركز الصحي (غير معتمد)',
  organization_unit: 'الوحدة التنظيمية (غير معتمدة)',
};

async function responseError(response: Response) {
  const data = await response.json().catch(() => ({}));
  return data?.detail || data?.message || 'تعذّر تحميل البيانات.';
}

type Props = {
  onCountChange?: (count: number | null) => void;
};

export function ImportedEmployeeCardsTab({ onCountChange }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const permitted = Boolean(user?.isSuperuser || user?.role === 'dataEntry');
  const [items, setItems] = useState<ImportedRow[]>([]);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [classification, setClassification] = useState('');
  const [completeness, setCompleteness] = useState('');
  const [selected, setSelected] = useState<ImportedRow | null>(null);
  const [completing, setCompleting] = useState<ImportedRow | null>(null);
  const [field, setField] = useState('');
  const [newValue, setNewValue] = useState('');
  const [reason, setReason] = useState('');
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [templateBusy, setTemplateBusy] = useState(false);

  const fetchRoster = async (
    nextPage = page, nextSearch = search,
    nextClassification = classification, nextCompleteness = completeness,
  ) => {
    if (!permitted) return;
    if (!API) {
      setError('إعداد اتصال API لبيئة Staging غير متوفر. لن تُستخدم قاعدة Production كبديل.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(nextPage) });
      if (nextSearch.trim()) params.set('search', nextSearch.trim());
      if (nextClassification) params.set('classification', nextClassification);
      if (nextCompleteness) params.set('completeness', nextCompleteness);
      const response = await authFetch(API + '/provisional-employees/?' + params.toString());
      if (!response.ok) throw new Error(await responseError(response));
      const data: RosterResponse = await response.json();
      setItems(data.items);
      setBatch(data.batch);
      setTotal(data.total);
      setPage(data.page);
      setPageSize(data.page_size);
      setSearch(nextSearch);
      setClassification(nextClassification);
      setCompleteness(nextCompleteness);
      onCountChange?.(data.batch?.total ?? 0);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل بطاقات الموظفين المستوردين.');
    } finally {
      setLoading(false);
    }
  };

  // On first open, load the *existing* provisional batch. No upload or auto-approval.
  useEffect(() => { if (permitted) void fetchRoster(1, '', '', ''); }, [permitted]);

  const downloadApprovedTemplate = async () => {
    if (!user?.isSuperuser || templateBusy || !API) return;
    setTemplateBusy(true);
    setError('');
    try {
      const response = await authFetch(API + '/employee-roster-template/');
      if (!response.ok) throw new Error(await responseError(response));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = 'OHP_Employee_Approved_Template_V3.xlsx';
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تنزيل القالب المعتمد.');
    } finally {
      setTemplateBusy(false);
    }
  };

  const runSearch = () => {
    if (/\p{Nd}/u.test(searchDraft)) {
      setError('البحث هنا بالاسم فقط؛ لا تضع رقم الهوية في عنوان البحث.');
      return;
    }
    void fetchRoster(1, searchDraft, classification, completeness);
  };

  const openCompletion = (item: ImportedRow) => {
    setCompleting(item);
    setField(item.missing_optional[0] || '');
    setNewValue('');
    setReason('');
    setIdentityConfirmed(false);
  };

  const complete = async () => {
    if (!completing || !field || !newValue.trim() || reason.trim().length < 10 ||
        !identityConfirmed || saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await authFetch(
        API + '/provisional-employees/' + completing.id + '/complete/',
        {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identity_checked: true, reason: reason.trim(),
            fields: { [field]: newValue.trim() },
          }),
        },
      );
      if (!response.ok) throw new Error(await responseError(response));
      setCompleting(null);
      setMessage('تم استكمال الحقل في البطاقة المؤقتة فقط. لم تتغير البيانات الطبية أو الأرشيف.');
      await fetchRoster();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر استكمال البيانات.');
    } finally {
      setSaving(false);
    }
  };

  if (!permitted) {
    return <Alert severity="warning">الاطلاع على البطاقات الإدارية المؤقتة للمسؤول ومدخل البيانات المخوّل فقط.</Alert>;
  }

  const headerBorder = '#173F5F';
  const cardStyle = (row: ImportedRow) => ({
    height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0,
    p: { xs: 2, sm: 2.5 }, borderRadius: 3,
    border: row.missing_optional.length ? '2px solid #E4B74D' : '1px solid #D4E0EA',
    borderTop: row.missing_optional.length ? '5px solid #D99B00' : '4px solid ' + headerBorder,
    background: row.missing_optional.length
      ? 'linear-gradient(155deg, #FFFDF0 0%, #FFF2BF 100%)'
      : 'linear-gradient(155deg, #FFFFFF 0%, #F4F8FC 100%)',
    boxShadow: '0 8px 22px rgba(15, 46, 74, 0.07)',
    transition: 'box-shadow .2s ease, transform .2s ease',
    '&:hover': { boxShadow: '0 12px 26px rgba(15, 46, 74, 0.13)', transform: 'translateY(-2px)' },
  });

  return <Box dir="rtl">
    <Alert severity="warning" sx={{ mb: 2 }}>
      <b>سجلات إدارية مستوردة وغير معتمدة صحيًا.</b> هذه البطاقات ليست ملفات مرضى، ولا تتيح
      الوصول إلى البطاقة الصحية أو فتح سجل طبي أو استعادة الموظفين المؤرشفين. المطابقة الأولية
      ليست تحققًا نهائيًا من الهوية أو الحالة الوظيفية.
    </Alert>
    <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}
      alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ mb: 2 }}>
      <Box>
        <Typography fontWeight={850} variant="h6">بطاقات الموظفين المستوردين</Typography>
        <Typography variant="body2" color="text.secondary">
          نفس أسلوب عرض البطاقات في Staging، مع الفصل الكامل عن سجل الموظفين الطبي.
        </Typography>
      </Box>
      <Stack direction="row" gap={1} flexWrap="wrap">
        {user?.isSuperuser && <Button color="success" variant="outlined"
          disabled={templateBusy} onClick={() => void downloadApprovedTemplate()}>
          {templateBusy ? 'جارٍ تنزيل القالب...' : 'تنزيل القالب المعتمد V3'}
        </Button>}
        <Button variant="outlined" onClick={() => void fetchRoster()} disabled={loading}>تحديث البطاقات</Button>
        <Button variant="contained" onClick={() => navigate('/employees/provisional')}
          startIcon={<ReviewIcon />}>المراجعة والتصحيح المتقدم</Button>
      </Stack>
    </Stack>

    <Grid container spacing={2} sx={{ mb: 2 }}>
      {[
        { label: 'إجمالي البطاقات المستوردة', value: batch?.total ?? 0 },
        { label: 'المطابقة الأولية', value: batch?.counts.name_match ?? 0 },
        { label: 'اختلاف الأسماء', value: batch?.counts.name_review ?? 0 },
        { label: 'تعارض المعرّفات', value: batch?.counts.identifier_review ?? 0 },
      ].map(stat => <Grid key={stat.label} size={{ xs: 6, sm: 3 }}>
        <Paper sx={{ p: 2, textAlign: 'center', borderRadius: 3, borderTop: '3px solid #1B557C' }}>
          <Typography variant="h4" fontWeight={900}>{stat.value}</Typography>
          <Typography variant="body2" color="text.secondary">{stat.label}</Typography>
        </Paper>
      </Grid>)}
    </Grid>

    {message && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage('')}>{message}</Alert>}
    {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

    <Paper sx={{ p: 2, mb: 2, borderRadius: 3 }}>
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, md: 5 }}>
          <TextField label="البحث باسم الموظف" fullWidth size="small" value={searchDraft}
            onChange={event => setSearchDraft(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') runSearch(); }}
            inputProps={{ maxLength: 100 }} />
        </Grid>
        <Grid size={{ xs: 12, sm: 5, md: 3 }}>
          <TextField select size="small" fullWidth label="حالة المطابقة" value={classification}
            onChange={event => void fetchRoster(1, searchDraft, event.target.value, completeness)}>
            <MenuItem value="">جميع الحالات</MenuItem>
            {Object.entries(CLASSIFICATION).map(([key, value]) =>
              <MenuItem key={key} value={key}>{value.ar}</MenuItem>)}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 4, md: 2 }}>
          <TextField select size="small" fullWidth label="اكتمال البيانات" value={completeness}
            onChange={event => void fetchRoster(1, searchDraft, classification, event.target.value)}>
            <MenuItem value="">الكل</MenuItem>
            <MenuItem value="missing">بيانات ناقصة — أصفر</MenuItem>
            <MenuItem value="complete">حقول اختيارية مكتملة</MenuItem>
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 3, md: 2 }}>
          <Button variant="outlined" fullWidth onClick={runSearch} disabled={loading}
            startIcon={<SearchIcon />} sx={{ minHeight: 40 }}>بحث</Button>
        </Grid>
      </Grid>
      <Stack direction="row" justifyContent="space-between" alignItems="center"
        sx={{ mt: 2 }}>
        <Typography variant="body2" color="text.secondary">
          نتائج القائمة المؤقتة: {total}
        </Typography>
        <Stack direction="row" gap={1}>
          <Button size="small" variant={viewMode === 'cards' ? 'contained' : 'outlined'}
            aria-pressed={viewMode === 'cards'} onClick={() => setViewMode('cards')}>بطاقات</Button>
          <Button size="small" variant={viewMode === 'table' ? 'contained' : 'outlined'}
            aria-pressed={viewMode === 'table'} onClick={() => setViewMode('table')}>جدول</Button>
        </Stack>
      </Stack>
    </Paper>

    {loading && <Box sx={{ textAlign: 'center', my: 4 }}><CircularProgress /></Box>}
    {!loading && viewMode === 'cards' &&
      <Grid container spacing={2.5}>
        {items.map(item => <Grid key={item.id} size={{ xs: 12, sm: 6, xl: 4 }}>
          <Paper component="article" elevation={0} sx={cardStyle(item)}>
            <Stack gap={0.8} sx={{ mb: 1.5 }}>
              <Typography sx={{ fontSize: 17, fontWeight: 850, color: '#143452', overflowWrap: 'anywhere' }}>
                {item.name}
              </Typography>
              <Chip size="small" color={CLASSIFICATION[item.classification].color}
                variant="outlined" sx={{ alignSelf: 'flex-start', height: 'auto',
                  '& .MuiChip-label': { whiteSpace: 'normal', py: 0.4 } }}
                label={CLASSIFICATION[item.classification].ar} />
              <Typography sx={{ fontSize: 12, fontWeight: 750, color: '#5D6776' }}>
                مستورد من Excel — الصف {item.source_row}
              </Typography>
            </Stack>
            <Box component="dl" sx={{
              display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
              columnGap: 2, rowGap: 1.5, m: 0, mb: 2,
            }}>
              {[
                ['المركز الصحي / القسم (بيانات مصدر غير معتمدة)', item.center || item.organization_unit || 'غير متوفر — يحتاج مطابقة'],
                ['المسمى الوظيفي', item.job_title || 'غير متوفر'],
                ['الهوية (مخفية)', item.masked_id],
                ['حالة السجل', 'مؤقت — بانتظار المطابقة'],
              ].map(([label, value]) => <Box key={label}>
                <Typography component="dt" sx={{ color: '#51667C', fontSize: 12, fontWeight: 700 }}>
                  {label}
                </Typography>
                <Typography component="dd" sx={{ m: 0, color: '#143452',
                  fontSize: 13.5, fontWeight: 700, overflowWrap: 'anywhere' }}>
                  {value}
                </Typography>
              </Box>)}
            </Box>
            {item.missing_optional.length > 0 && <Box sx={{ border: '1px solid #E3B64E',
              bgcolor: '#FFF1B5', borderRadius: 2, p: 1, mb: 1.5 }}>
              <Chip color="warning" size="small" label={'بيانات ناقصة: ' + item.missing_optional.length} />
              <Typography sx={{ mt: 0.5, fontSize: 12, color: '#73500D', overflowWrap: 'anywhere' }}>
                {item.missing_optional.map(key => FIELDS[key] || key).join('، ')}
              </Typography>
            </Box>}
            <Box sx={{ flex: 1 }} />
            <Stack direction="row" gap={1} flexWrap="wrap" sx={{ borderTop: '1px solid #D4E0EA', pt: 1.5 }}>
              <Button size="small" variant="outlined" startIcon={<ViewIcon />}
                onClick={() => setSelected(item)}>عرض</Button>
              {item.missing_optional.length > 0 &&
                <Button size="small" variant="outlined" startIcon={<EditIcon />}
                  onClick={() => openCompletion(item)}>استكمال البيانات</Button>}
              <Button size="small" variant="text" startIcon={<ReviewIcon />}
                onClick={() => navigate('/employees/provisional')}>مراجعة</Button>
            </Stack>
          </Paper>
        </Grid>)}
      </Grid>}

    {!loading && viewMode === 'table' && <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
      <Table size="small">
        <TableHead><TableRow>
          <TableCell>الموظف</TableCell><TableCell>الهوية (مخفية)</TableCell>
          <TableCell>المركز الصحي / القسم (غير معتمد)</TableCell><TableCell>المسمى الوظيفي</TableCell>
          <TableCell>حالة المطابقة</TableCell><TableCell>البيانات الناقصة</TableCell>
          <TableCell>إجراء إداري</TableCell>
        </TableRow></TableHead>
        <TableBody>{items.map(item => <TableRow key={item.id} hover
          sx={{ bgcolor: item.missing_optional.length ? '#FFF9E4' : 'inherit' }}>
          <TableCell>{item.name}</TableCell>
          <TableCell dir="ltr">{item.masked_id}</TableCell>
          <TableCell>{item.center || item.organization_unit || '—'}</TableCell>
          <TableCell>{item.job_title || '—'}</TableCell>
          <TableCell><Chip size="small" label={CLASSIFICATION[item.classification].ar}
            color={CLASSIFICATION[item.classification].color} /></TableCell>
          <TableCell>{item.missing_optional.length}</TableCell>
          <TableCell>
            <Button size="small" onClick={() => setSelected(item)}>عرض</Button>
            {item.missing_optional.length > 0 &&
              <Button size="small" onClick={() => openCompletion(item)}>استكمال</Button>}
          </TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </TableContainer>}
    {!loading && total === 0 && <Alert severity="info" sx={{ my: 2 }}>
      لا توجد بطاقات مطابقة للتصفية المختارة. غيّر الفلاتر أو أعد البحث.
    </Alert>}
    {total > pageSize && <Stack alignItems="center" sx={{ mt: 3 }}>
      <Pagination count={Math.ceil(total / pageSize)} page={page}
        onChange={(_, selectedPage) => void fetchRoster(selectedPage)}
        disabled={loading} color="primary" />
    </Stack>}

    <Dialog open={Boolean(selected)} fullWidth maxWidth="sm" onClose={() => setSelected(null)}>
      <DialogTitle>عرض البطاقة الإدارية المستوردة</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          هذه البطاقة مؤقتة وغير معتمدة، ولا تمثل سجلًا طبيًا.
        </Alert>
        <Stack gap={1}>
          <Typography variant="h6">{selected?.name}</Typography>
          <Typography>رقم الهوية: {selected?.masked_id}</Typography>
          <Typography>الصف في Excel: {selected?.source_row}</Typography>
          <Typography>المركز الصحي / القسم (من ملف المصدر): {selected?.center || selected?.organization_unit || 'غير متوفر'}</Typography>
          <Typography>المسمى الوظيفي: {selected?.job_title || 'غير متوفر'}</Typography>
          <Typography>حالة المطابقة: {selected ? CLASSIFICATION[selected.classification].ar : ''}</Typography>
          <Typography>الحقول الناقصة: {selected?.missing_optional.map(key => FIELDS[key] || key).join('، ') || 'لا يوجد'}</Typography>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={() => setSelected(null)}>إغلاق</Button></DialogActions>
    </Dialog>

    <Dialog open={Boolean(completing)} fullWidth maxWidth="sm"
      onClose={() => { if (!saving) setCompleting(null); }}>
      <DialogTitle>استكمال بيانات إدارية مؤقتة</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ mt: 1 }}>
          <Alert severity="warning">
            لا تستبدل بيانات مثبتة ولا تدخل معلومات غير مؤكدة. هذه العملية لا تغيّر بيانات الموظف الأصلية.
          </Alert>
          <Typography fontWeight={800}>{completing?.name}</Typography>
          <TextField select label="الحقل الناقص" value={field}
            onChange={event => setField(event.target.value)} disabled={saving}>
            {(completing?.missing_optional || []).map(key =>
              <MenuItem key={key} value={key}>{FIELDS[key] || key}</MenuItem>)}
          </TextField>
          <TextField label="القيمة من المصدر الموثوق" value={newValue}
            onChange={event => setNewValue(event.target.value)}
            disabled={saving} inputProps={{ maxLength: 255 }} />
          <TextField multiline label="سبب الاستكمال (10 أحرف على الأقل)" value={reason}
            onChange={event => setReason(event.target.value)} disabled={saving} />
          <FormControlLabel control={<Checkbox checked={identityConfirmed} disabled={saving}
            onChange={event => setIdentityConfirmed(event.target.checked)} />}
            label="تحققت من هوية الموظف ومصدر البيانات" />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setCompleting(null)} disabled={saving}>إلغاء</Button>
        <Button variant="contained" disabled={saving || !field || !newValue.trim() ||
          reason.trim().length < 10 || !identityConfirmed}
          onClick={() => void complete()}>حفظ الاستكمال المؤقت</Button>
      </DialogActions>
    </Dialog>
  </Box>;
}
