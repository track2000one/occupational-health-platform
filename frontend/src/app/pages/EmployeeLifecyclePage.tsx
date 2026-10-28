import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, MenuItem, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import {
  ArchiveOutlined as ArchiveIcon,
  BusinessOutlined as BusinessIcon,
  FactCheckOutlined as ApprovalIcon,
  HistoryOutlined as HistoryIcon,
  MoveUpOutlined as TransferIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { toast } from 'sonner';
import { authFetch } from '../context/AuthContext';
import { CalendarDateField } from '../components/CalendarDateField';

const DEFAULT_API = 'https://occupational-health-platform-production.up.railway.app/api';
const API_BASE = (import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:8000/api' : DEFAULT_API)).replace(/\/$/, '');

type Status = 'active' | 'transferred' | 'retired' | 'separated' | 'under_review';
type Employee = {
  id: number;
  name: string;
  employee_number: string | null;
  national_id: string;
  health_center: number;
  health_center_name?: string;
  job_title?: string;
  employment_status?: Status;
};
type Center = { id: number; name: string; name_ar?: string; is_active: boolean };
type Page<T> = { count: number; next: string | null; results: T[] };
type Change = {
  id: number;
  from_status: Status;
  to_status: Status;
  effective_date: string;
  evidence_reference: string;
  previous_health_center: string | null;
  new_health_center: string | null;
  approved_by: number | null;
  created_at: string;
};
type History = { employment_status: Status; history: Change[] };
type Mode = 'status' | 'transfer' | 'history';

const STATUS_LABELS: Record<Status, string> = {
  active: 'على رأس العمل',
  transferred: 'منقول خارج الجهة',
  retired: 'متقاعد',
  separated: 'منتهية خدمته',
  under_review: 'تحتاج تحقق',
};
const STATUS_COLORS: Record<Status, 'success' | 'info' | 'warning' | 'default'> = {
  active: 'success', transferred: 'info', retired: 'default',
  separated: 'default', under_review: 'warning',
};
const TRANSITIONS: Status[] = ['active', 'retired', 'transferred', 'separated', 'under_review'];
const maskId = (value: string) => value?.length > 4 ? '******' + value.slice(-4) : '—';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await authFetch(API_BASE + path, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.detail || (body && typeof body === 'object'
      ? Object.values(body).flat().join('، ') : null);
    throw new Error(String(detail || 'تعذر إتمام الطلب؛ راجع صلاحيات المستخدم واتصال الخادم.'));
  }
  return body as T;
}

const localToday = () => {
  const now = new Date();
  const yr = now.getFullYear();
  return [yr, String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
};

export function EmployeeLifecyclePage() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const isRtl = i18n.language === 'ar';
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [count, setCount] = useState(0);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [centerFilter, setCenterFilter] = useState('all');
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Employee | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [history, setHistory] = useState<Change[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [targetStatus, setTargetStatus] = useState<Status>('retired');
  const [effectiveDate, setEffectiveDate] = useState(localToday());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [destination, setDestination] = useState('');

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const all: Center[] = [];
        for (let index = 1; index <= 20; index += 1) {
          const res = await request<Page<Center>>('/health-centers/?page=' + index);
          all.push(...res.results);
          if (!res.next) break;
        }
        if (active) setCenters(all);
        const reviews = await request<Page<unknown>>('/employee-import-reviews/?status=pending,conflict');
        if (active) setPendingCount(reviews.count);
      } catch {
        // Secondary dashboard counts should not prevent viewing approved employees.
      }
    })();
    return () => { active = false; };
  }, [revision]);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ page: String(page) });
    if (statusFilter !== 'all') params.set('employment_status', statusFilter);
    if (centerFilter !== 'all') params.set('health_center_id', centerFilter);
    if (debouncedSearch) params.set('search', debouncedSearch);
    setLoading(true);
    setError('');
    void request<Page<Employee>>('/employees/?' + params.toString())
      .then(result => {
        if (active) {
          setEmployees(result.results);
          setCount(result.count);
        }
      })
      .catch(reason => {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'تعذر تحميل الموظفين');
          setEmployees([]);
          setCount(0);
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, statusFilter, centerFilter, debouncedSearch, revision]);

  const centerName = (employee: Employee) =>
    centers.find(c => c.id === employee.health_center)?.name_ar ||
    employee.health_center_name || centers.find(c => c.id === employee.health_center)?.name || 'غير محدد';

  const openDialog = async (employee: Employee, nextMode: Mode) => {
    setSelected(employee);
    setMode(nextMode);
    setTargetStatus(employee.employment_status === 'retired' ? 'active' : 'retired');
    setEffectiveDate(localToday());
    setReference('');
    setNotes('');
    setDestination('');
    setHistory([]);
    setHistoryLoading(true);
    try {
      const result = await request<History>('/employees/' + employee.id + '/employment-status/');
      setHistory(result.history);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'تعذر تحميل سجل القرارات');
    } finally {
      setHistoryLoading(false);
    }
  };

  const submit = async () => {
    if (!selected || !mode || mode === 'history' || saving) return;
    if (!reference.trim() || reference.trim().length < 3 || !effectiveDate) {
      toast.error('تاريخ نفاذ القرار ومرجعه الرسمي مطلوبان');
      return;
    }
    if (mode === 'transfer' && !destination) {
      toast.error('اختر المركز الصحي المنقول إليه');
      return;
    }
    const actionLabel = mode === 'transfer' ? 'نقل الموظف إلى مركز آخر' : 'اعتماد الحالة الوظيفية';
    if (!window.confirm('هل تؤكد ' + actionLabel + ' للموظف «' + selected.name + '»؟\nسيُحفظ القرار في السجل التاريخي.')) return;

    setSaving(true);
    try {
      const path = mode === 'transfer' ? '/transfer-center/' : '/employment-status/';
      const body = {
        effective_date: effectiveDate,
        evidence_reference: reference.trim(),
        notes: notes.trim(),
        ...(mode === 'transfer'
          ? { new_health_center_id: Number(destination) }
          : { status: targetStatus }),
      };
      await request('/employees/' + selected.id + path, { method: 'POST', body: JSON.stringify(body) });
      toast.success('تم اعتماد الإجراء وحفظه في السجل الوظيفي');
      setMode(null);
      setSelected(null);
      setRevision(v => v + 1);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'تعذر اعتماد الإجراء');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box dir={isRtl ? 'rtl' : 'ltr'}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between"
        alignItems={{ xs: 'stretch', md: 'center' }} spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={850}>إدارة الحالات الوظيفية للموظفين</Typography>
          <Typography color="text.secondary">التقاعد والنقل والأرشفة مع سجل قرارات معتمد وحفظ السجلات الصحية</Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Button variant="outlined" startIcon={<BusinessIcon />} onClick={() => navigate('/admin/health-centers')}>
            المراكز الصحية
          </Button>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => setRevision(v => v + 1)}>تحديث</Button>
        </Stack>
      </Stack>

      <Alert severity="info" sx={{ mb: 2 }}>
        غياب الموظف عن ملف Excel الجديد لا يثبت تقاعده. لا يُعتمد أي تغيير إلا بمرجع قرار رسمي، دون حذف ملفه الصحي.
        ملفا Excel المقارنان لم يُستوردا إلى قاعدة الإنتاج ضمن هذه المرحلة.
      </Alert>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3,1fr)' }, gap: 2, mb: 2 }}>
        <Paper sx={{ p: 2.5 }}>
          <Typography color="text.secondary">نتائج التصفية الحالية</Typography>
          <Typography variant="h4" fontWeight={850}>{count.toLocaleString('ar-SA')}</Typography>
        </Paper>
        <Paper sx={{ p: 2.5 }}>
          <Typography color="text.secondary">حالات استيراد تتطلب مراجعة</Typography>
          <Typography variant="h4" fontWeight={850}>{pendingCount === null ? '—' : pendingCount.toLocaleString('ar-SA')}</Typography>
          <Button size="small" onClick={() => navigate('/employees/import')}>مراجعة الاستيراد</Button>
        </Paper>
        <Paper sx={{ p: 2.5 }}>
          <Typography color="text.secondary">المراكز الصحية المسجلة</Typography>
          <Typography variant="h4" fontWeight={850}>{centers.length.toLocaleString('ar-SA')}</Typography>
          <Button size="small" onClick={() => navigate('/admin/health-centers')}>إدارة دليل المراكز</Button>
        </Paper>
      </Box>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1.5fr' }, gap: 2 }}>
          <TextField label="بحث بالاسم أو رقم الهوية أو الرقم الوظيفي" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} size="small" />
          <TextField select label="الحالة الوظيفية" size="small" value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
            <MenuItem value="all">جميع الحالات</MenuItem>
            {TRANSITIONS.map(key => <MenuItem key={key} value={key}>{STATUS_LABELS[key]}</MenuItem>)}
          </TextField>
          <TextField select label="المركز الصحي" size="small" value={centerFilter}
            onChange={e => { setCenterFilter(e.target.value); setPage(1); }}>
            <MenuItem value="all">جميع المراكز</MenuItem>
            {centers.map(c => <MenuItem key={c.id} value={String(c.id)}>{c.name_ar || c.name}</MenuItem>)}
          </TextField>
        </Box>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>الموظف</TableCell>
              <TableCell>الرقم الوظيفي</TableCell>
              <TableCell>رقم الهوية</TableCell>
              <TableCell>المركز الصحي</TableCell>
              <TableCell>الحالة الوظيفية</TableCell>
              <TableCell align="center">الإجراءات</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={6} align="center"><CircularProgress size={24} /></TableCell></TableRow> :
              employees.length === 0 ? <TableRow><TableCell colSpan={6} align="center">لا توجد سجلات مطابقة</TableCell></TableRow> :
                employees.map(emp => {
                  const currentStatus = emp.employment_status || 'active';
                  return <TableRow key={emp.id} hover>
                    <TableCell>
                      <Typography fontWeight={750}>{emp.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{emp.job_title || ''}</Typography>
                    </TableCell>
                    <TableCell>{emp.employee_number || '—'}</TableCell>
                    <TableCell>{maskId(emp.national_id)}</TableCell>
                    <TableCell>{centerName(emp)}</TableCell>
                    <TableCell><Chip size="small" color={STATUS_COLORS[currentStatus]}
                      label={STATUS_LABELS[currentStatus]} /></TableCell>
                    <TableCell align="center">
                      <Stack direction="row" justifyContent="center" spacing={0.5} flexWrap="wrap">
                        <Button size="small" startIcon={<HistoryIcon />}
                          onClick={() => void openDialog(emp, 'history')}>السجل</Button>
                        <Button size="small" startIcon={<ApprovalIcon />}
                          onClick={() => void openDialog(emp, 'status')}>تحديث الحالة</Button>
                        {currentStatus === 'active' && <Button size="small" startIcon={<TransferIcon />}
                          onClick={() => void openDialog(emp, 'transfer')}>نقل داخلي</Button>}
                      </Stack>
                    </TableCell>
                  </TableRow>;
                })}
          </TableBody>
        </Table>
      </TableContainer>

      <Stack direction="row" spacing={2} alignItems="center" justifyContent="center" sx={{ my: 2 }}>
        <Button variant="outlined" disabled={page === 1 || loading} onClick={() => setPage(p => Math.max(1, p - 1))}>السابق</Button>
        <Typography>صفحة {page.toLocaleString('ar-SA')} من {Math.max(1, Math.ceil(count / 25)).toLocaleString('ar-SA')}</Typography>
        <Button variant="outlined" disabled={loading || page * 25 >= count}
          onClick={() => setPage(p => p + 1)}>التالي</Button>
      </Stack>

      <Dialog open={!!mode} onClose={() => { if (!saving) setMode(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>{mode === 'history' ? 'السجل الوظيفي التاريخي' :
          mode === 'transfer' ? 'اعتماد النقل بين المراكز' : 'اعتماد تغيير الحالة الوظيفية'}</DialogTitle>
        <DialogContent dividers>
          <Typography fontWeight={750} sx={{ mb: 2 }}>{selected?.name}</Typography>
          {mode === 'history' ? (
            historyLoading ? <CircularProgress /> :
              history.length === 0 ? <Alert severity="info">لا توجد قرارات سابقة مسجلة.</Alert> :
                <Stack spacing={1}>
                  {history.map(change => <Paper variant="outlined" key={change.id} sx={{ p: 2 }}>
                    <Typography fontWeight={750}>{STATUS_LABELS[change.from_status] || change.from_status} ← {STATUS_LABELS[change.to_status] || change.to_status}</Typography>
                    <Typography variant="body2">تاريخ النفاذ: {change.effective_date}</Typography>
                    <Typography variant="body2">مرجع القرار: {change.evidence_reference}</Typography>
                    <Typography variant="caption" color="text.secondary">المركز السابق: {change.previous_health_center || '—'}</Typography>
                    <Typography display="block" variant="caption" color="text.secondary">المركز بعد الإجراء: {change.new_health_center || '—'}</Typography>
                  </Paper>)}
                </Stack>
          ) : (
            <Stack spacing={2} sx={{ mt: 1 }}>
              {mode === 'status' && <TextField select fullWidth label="الحالة المطلوب اعتمادها"
                value={targetStatus} onChange={e => setTargetStatus(e.target.value as Status)}>
                {TRANSITIONS.map(s => <MenuItem value={s} key={s}>{STATUS_LABELS[s]}</MenuItem>)}
              </TextField>}
              {mode === 'transfer' && <TextField fullWidth select label="المركز المنقول إليه" value={destination}
                onChange={e => setDestination(e.target.value)} required>
                {centers.filter(c => c.is_active && c.id !== selected?.health_center).map(c =>
                  <MenuItem key={c.id} value={String(c.id)}>{c.name_ar || c.name}</MenuItem>)}
              </TextField>}
              <CalendarDateField label="تاريخ نفاذ القرار (ميلادي أو هجري)" value={effectiveDate}
                onChange={setEffectiveDate} required />
              <TextField label="رقم القرار أو مرجع المستند" fullWidth required value={reference}
                onChange={e => setReference(e.target.value)} inputProps={{ maxLength: 255 }} />
              <TextField label="ملاحظات إدارية (اختياري)" fullWidth multiline minRows={2} value={notes}
                onChange={e => setNotes(e.target.value)} />
              <Alert severity="warning">
                لا يُستخدم هذا الإجراء لاستنتاج التقاعد تلقائيًا، ولا يحذف أي فحص أو بطاقة صحية.
                تأكد من وجود قرار رسمي وتاريخ نفاذ صحيح.
              </Alert>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMode(null)} disabled={saving}>إغلاق</Button>
          {mode !== 'history' && <Button variant="contained" startIcon={<ArchiveIcon />}
            disabled={saving || !reference.trim() || !effectiveDate || (mode === 'transfer' && !destination)}
            onClick={() => void submit()}>{saving ? 'جارٍ الاعتماد...' : 'اعتماد وحفظ الإجراء'}</Button>}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
