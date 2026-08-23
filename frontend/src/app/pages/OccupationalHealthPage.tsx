import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  Alert, Avatar, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Paper, Stack, TextField, Typography,
} from '@mui/material';
import {
  Add as AddIcon, Delete as DeleteIcon, Edit as EditIcon,
  HealthAndSafety as HealthIcon, Refresh as RefreshIcon, Search as SearchIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import { toast } from 'sonner';
import { getAccessToken, useAuth } from '../context/AuthContext';
import { useDatePreference } from '../context/DatePreferenceContext';

const PRODUCTION_API_BASE_URL = 'https://occupational-health-platform-production.up.railway.app/api';
const LOCAL_API_BASE_URL = 'http://localhost:8000/api';
const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? LOCAL_API_BASE_URL : PRODUCTION_API_BASE_URL)
).replace(/\/$/, '');

const EDITABLE_ROLES = new Set(['systemAdmin', 'ohManager', 'ohDoctor', 'clinicDoctor', 'dataEntry']);

type EmployeeHealthCardSummary = {
  id: string | number;
  name: string;
  email?: string | null;
  national_id?: string | null;
  employee_number?: string | null;
  mobile?: string | null;
  job_title?: string | null;
  health_center_name?: string | null;
  health_card_exists?: boolean;
  health_card_number?: string | null;
  health_card_updated_at?: string | null;
};

type PaginatedEmployees = {
  results?: EmployeeHealthCardSummary[];
  next?: string | null;
};

async function apiError(response: Response) {
  try {
    const payload = await response.json() as Record<string, unknown>;
    if (typeof payload.detail === 'string') return payload.detail;
    const first = Object.values(payload)[0];
    if (Array.isArray(first) && first.length) return String(first[0]);
    if (typeof first === 'string') return first;
  } catch {
    // Deployment failures may return an empty response body.
  }
  return `Request failed (${response.status})`;
}

function maskedNationalId(value?: string | null) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '—';
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 2)}****${digits.slice(-4)}`;
}

export function OccupationalHealthPage() {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const { formatDate } = useDatePreference();
  const isRtl = i18n.language === 'ar';
  const canEdit = Boolean(user?.role && EDITABLE_ROLES.has(user.role));

  const [employees, setEmployees] = useState<EmployeeHealthCardSummary[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadVersion, setLoadVersion] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<EmployeeHealthCardSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }

    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    setLoading(true);

    async function loadEmployees() {
      try {
        const items: EmployeeHealthCardSummary[] = [];
        const visited = new Set<string>();
        let nextUrl: string | null = `${API_BASE_URL}/employees/`;

        while (nextUrl && !visited.has(nextUrl) && visited.size < 200) {
          visited.add(nextUrl);
          const response = await fetch(nextUrl, {
            headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
          });
          if (!response.ok) throw new Error(await apiError(response));
          const payload = await response.json() as PaginatedEmployees | EmployeeHealthCardSummary[];
          if (Array.isArray(payload)) {
            items.push(...payload);
            nextUrl = null;
          } else {
            items.push(...(payload.results || []));
            nextUrl = payload.next || null;
          }
        }
        if (active) setEmployees(items);
      } catch (error) {
        if (!active) return;
        const message = controller.signal.aborted
          ? (isRtl ? 'انتهت مهلة تحميل بطاقات الموظفين' : 'Loading employee cards timed out')
          : error instanceof Error ? error.message : (isRtl ? 'تعذر تحميل الموظفين' : 'Could not load employees');
        toast.error(message);
      } finally {
        window.clearTimeout(timeout);
        if (active) setLoading(false);
      }
    }

    void loadEmployees();
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [isRtl, loadVersion]);

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    const digits = query.replace(/\D/g, '');
    if (!query) return employees;
    return employees.filter(employee => {
      const text = [employee.name, employee.email, employee.employee_number, employee.national_id,
        employee.mobile, employee.job_title, employee.health_center_name]
        .map(value => String(value || '').toLowerCase()).join(' ');
      return text.includes(query) || (digits.length >= 3 &&
        [employee.employee_number, employee.national_id, employee.mobile]
          .some(value => String(value || '').replace(/\D/g, '').includes(digits)));
    });
  }, [employees, search]);

  async function deleteHealthCard() {
    if (!deleteTarget || deleting) return;
    const token = getAccessToken();
    if (!token) {
      toast.error(isRtl ? 'انتهت جلسة الدخول. سجل الدخول مرة أخرى.' : 'Your session has expired.');
      return;
    }

    setDeleting(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`${API_BASE_URL}/employees/${deleteTarget.id}/health_card/`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
      });
      if (!response.ok && response.status !== 404) throw new Error(await apiError(response));
      setEmployees(previous => previous.map(employee => employee.id === deleteTarget.id ? {
        ...employee, health_card_exists: false, health_card_number: '', health_card_updated_at: null,
      } : employee));
      toast.success(isRtl
        ? 'تم حذف بيانات البطاقة الصحية فقط، وبقي سجل الموظف محفوظًا'
        : 'Health card data deleted; the employee record was kept');
      setDeleteTarget(null);
    } catch (error) {
      const message = controller.signal.aborted
        ? (isRtl ? 'انتهت مهلة الحذف. أعد المحاولة.' : 'Delete timed out. Please try again.')
        : error instanceof Error ? error.message : (isRtl ? 'تعذر حذف البطاقة' : 'Could not delete the card');
      toast.error(message);
    } finally {
      window.clearTimeout(timeout);
      setDeleting(false);
    }
  }

  return (
    <Box dir={isRtl ? 'rtl' : 'ltr'}>
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'center' }} sx={{ mb: 3 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Avatar sx={{ width: 50, height: 50, bgcolor: '#0C5B86' }}><HealthIcon /></Avatar>
          <Box>
            <Typography variant="h4" fontWeight={950}>{isRtl ? 'الصحة المهنية' : 'Occupational Health'}</Typography>
            <Typography variant="body2" color="text.secondary">
              {isRtl ? 'بطاقة صحة مهنية شاملة ومستقلة لكل موظف' : 'A comprehensive occupational health card for every employee'}
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => setLoadVersion(version => version + 1)} disabled={loading}>
            {isRtl ? 'تحديث' : 'Refresh'}
          </Button>
          {canEdit && <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/employee-health-card?mode=edit')}>
            {isRtl ? 'إنشاء بطاقة' : 'Create Card'}
          </Button>}
        </Stack>
      </Stack>

      <Alert severity="info" sx={{ mb: 2.5 }}>
        {isRtl
          ? 'زر عرض يفتح البطاقة الشاملة، وتعديل يفتح جميع أقسامها، وحذف يزيل بيانات البطاقة فقط دون حذف الموظف.'
          : 'View opens the full card, Edit opens all sections, and Delete removes only card data—not the employee.'}
      </Alert>

      <Paper sx={{ p: 2, mb: 3 }}>
        <TextField fullWidth value={search} onChange={event => setSearch(event.target.value)}
          placeholder={isRtl ? 'بحث بالاسم، الهوية، الرقم الوظيفي، الجوال أو البريد...' : 'Search by name, ID, employee number, mobile or email...'}
          slotProps={{ input: { startAdornment: <SearchIcon sx={{ mx: 1, color: 'text.secondary' }} /> } }} />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {isRtl ? `عدد الموظفين: ${filteredEmployees.length}` : `Employees: ${filteredEmployees.length}`}
        </Typography>
      </Paper>

      {loading ? (
        <Paper sx={{ p: 6, textAlign: 'center' }}><CircularProgress />
          <Typography sx={{ mt: 2 }}>{isRtl ? 'جاري تحميل بطاقات الموظفين...' : 'Loading employee cards...'}</Typography>
        </Paper>
      ) : filteredEmployees.length === 0 ? (
        <Alert severity="warning">{isRtl ? 'لا توجد نتائج مطابقة' : 'No matching employees found'}</Alert>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 360px), 420px))',
          gap: 2.5, justifyContent: { xs: 'center', md: 'start' }, alignItems: 'start' }}>
          {filteredEmployees.map(employee => (
            <Paper key={employee.id} sx={{ width: '100%', maxWidth: 420, overflow: 'hidden',
              border: '1px solid rgba(12,91,134,.22)', borderTop: '5px solid #0C5B86',
              background: 'linear-gradient(160deg,#fbfdff 0%,#eef7fa 100%)' }}>
              <Box sx={{ p: 2.2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5}>
                  <Stack direction="row" spacing={1.2} alignItems="center" sx={{ minWidth: 0 }}>
                    <Avatar sx={{ bgcolor: '#0B8F8A', width: 46, height: 46, fontWeight: 900 }}>
                      {String(employee.name || '?').charAt(0)}
                    </Avatar>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography fontWeight={950} noWrap title={employee.name}>{employee.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {employee.employee_number || '—'} · {employee.job_title || (isRtl ? 'بدون مسمى وظيفي' : 'No job title')}
                      </Typography>
                    </Box>
                  </Stack>
                  <Chip size="small" color={employee.health_card_exists ? 'success' : 'default'}
                    label={employee.health_card_exists ? (isRtl ? 'محفوظة' : 'Saved') : (isRtl ? 'غير منشأة' : 'Not created')} />
                </Stack>

                <Box sx={{ mt: 2, p: 1.5, borderRadius: 2.5, bgcolor: 'rgba(255,255,255,.72)', border: '1px solid rgba(12,91,134,.12)' }}>
                  {[
                    [isRtl ? 'رقم البطاقة' : 'Card No.', employee.health_card_number || '—'],
                    [isRtl ? 'الهوية' : 'National ID', maskedNationalId(employee.national_id)],
                    [isRtl ? 'المركز الصحي' : 'Health Center', employee.health_center_name || '—'],
                    [isRtl ? 'الجوال' : 'Mobile', employee.mobile || '—'],
                    [isRtl ? 'آخر تحديث' : 'Last Update', formatDate(employee.health_card_updated_at)],
                  ].map(([label, fieldValue]) => (
                    <Stack key={label} direction="row" justifyContent="space-between" spacing={2}
                      sx={{ py: .48, borderBottom: '1px dashed rgba(100,116,139,.16)', '&:last-child': { borderBottom: 0 } }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={700}>{label}</Typography>
                      <Typography variant="caption" fontWeight={850} textAlign="end">{fieldValue}</Typography>
                    </Stack>
                  ))}
                </Box>
              </Box>

              <Stack direction="row" spacing={1} sx={{ p: 1.5, pt: 0 }}>
                <Button fullWidth variant="outlined" color="primary" startIcon={<ViewIcon />}
                  onClick={() => navigate(`/employees/${employee.id}/health-card`)}>{isRtl ? 'عرض' : 'View'}</Button>
                {canEdit && <Button fullWidth variant="outlined" color="secondary" startIcon={<EditIcon />}
                  onClick={() => navigate(`/employees/${employee.id}/health-card?mode=edit`)}>{isRtl ? 'تعديل' : 'Edit'}</Button>}
                {canEdit && <Button fullWidth variant="outlined" color="error" startIcon={<DeleteIcon />}
                  disabled={!employee.health_card_exists} onClick={() => setDeleteTarget(employee)}>{isRtl ? 'حذف' : 'Delete'}</Button>}
              </Stack>
            </Paper>
          ))}
        </Box>
      )}

      <Dialog open={Boolean(deleteTarget)} onClose={() => { if (!deleting) setDeleteTarget(null); }} maxWidth="xs" fullWidth>
        <DialogTitle>{isRtl ? 'حذف البطاقة الصحية' : 'Delete Health Card'}</DialogTitle>
        <DialogContent dividers><Typography>
          {isRtl ? `سيتم حذف بيانات بطاقة ${deleteTarget?.name || ''} فقط. لن يتم حذف الموظف أو بياناته الأساسية.`
            : `Only ${deleteTarget?.name || ''}'s health card data will be deleted. The employee record will remain.`}
        </Typography></DialogContent>
        <DialogActions>
          <Button disabled={deleting} onClick={() => setDeleteTarget(null)}>{isRtl ? 'إلغاء' : 'Cancel'}</Button>
          <Button color="error" variant="contained" disabled={deleting}
            startIcon={deleting ? <CircularProgress size={17} color="inherit" /> : <DeleteIcon />}
            onClick={() => { void deleteHealthCard(); }}>
            {deleting ? (isRtl ? 'جارٍ الحذف...' : 'Deleting...') : (isRtl ? 'تأكيد الحذف' : 'Confirm Delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
