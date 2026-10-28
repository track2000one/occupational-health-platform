import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  Typography,
} from '@mui/material';
import { Grid } from '@mui/material';
import {
  Add as AddIcon,
  WorkHistoryOutlined as WorkHistoryIcon,
  Edit as EditIcon,
  People as PeopleIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  UploadFile as UploadFileIcon,
  Visibility as VisibilityIcon,
  BadgeOutlined as HealthCardIcon,
} from '@mui/icons-material';
import { toast } from 'sonner';
import { authFetch, getAccessToken, useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../data/roles';
import { CalendarDateField } from '../components/CalendarDateField';
import { HealthCenterAutocomplete } from '../components/HealthCenterAutocomplete';
import { EmployeeRegistryCard } from '../components/EmployeeRegistryCard';

const PRODUCTION_API_BASE_URL = 'https://occupational-health-platform-production.up.railway.app/api';
const LOCAL_API_BASE_URL = 'http://localhost:8000/api';
const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? LOCAL_API_BASE_URL
    : PRODUCTION_API_BASE_URL)
).replace(/\/$/, '');

type Gender = 'male' | 'female';
type MaritalStatus = '' | 'single' | 'married' | 'divorced' | 'widowed';
type ExamStatus = 'completed' | 'incomplete' | 'overdue';
type VaccineStatus = 'completed' | 'due' | 'refused';
type RiskLevel = 'low' | 'medium' | 'high';

type ApiHealthCenter = {
  id: number | string;
  name: string;
  name_ar?: string;
  name_en?: string;
  code?: string | null;
  region?: string;
  city?: string;
  district?: string;
  building_type?: string;
  is_active?: boolean;
};

type ApiEmployee = {
  id: number | string;
  name: string;
  email?: string | null;
  national_id: string;
  employee_number?: string | null;
  national_address?: string;
  mobile?: string;
  date_of_birth?: string | null;
  birth_place?: string;
  age?: number;
  gender: Gender;
  marital_status?: MaritalStatus;
  health_center: number | string;
  health_center_name?: string;
  job_title?: string;
  appointment_date?: string | null;
  years_of_experience?: string | number | null;
  periodic_exam_status?: ExamStatus;
  vaccination_status?: VaccineStatus;
  risk_level?: RiskLevel;
  employment_status?: 'active' | 'transferred' | 'retired' | 'separated' | 'under_review';
  roster_source_status?: string;
  created_at?: string;
  updated_at?: string;
};

type EmployeeForm = {
  name: string;
  email: string;
  national_id: string;
  employee_number: string;
  national_address: string;
  mobile: string;
  date_of_birth: string;
  birth_place: string;
  gender: Gender;
  marital_status: MaritalStatus;
  health_center: string;
  job_title: string;
  appointment_date: string;
  periodic_exam_status: ExamStatus;
  vaccination_status: VaccineStatus;
  risk_level: RiskLevel;
};

const EMPTY_FORM: EmployeeForm = {
  name: '',
  email: '',
  national_id: '',
  employee_number: '',
  national_address: '',
  mobile: '',
  date_of_birth: '',
  birth_place: '',
  gender: 'male',
  marital_status: '',
  health_center: '',
  job_title: '',
  appointment_date: '',
  periodic_exam_status: 'incomplete',
  vaccination_status: 'due',
  risk_level: 'low',
};

function getList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object' && Array.isArray((payload as { results?: unknown }).results)) {
    return (payload as { results: T[] }).results;
  }
  return [];
}

function maskNationalId(value: string) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length <= 4) return digits || '-';
  if (digits.length <= 8) return `${digits.slice(0, 2)}****${digits.slice(-2)}`;
  return `${digits.slice(0, 2)}****${digits.slice(-4)}`;
}

function calculateAge(dateValue: string) {
  if (!dateValue) return '';
  const dob = new Date(dateValue);
  if (Number.isNaN(dob.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDelta = today.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) age -= 1;
  return age >= 0 ? String(age) : '';
}

function calculateExperience(dateValue: string) {
  if (!dateValue) return '';
  const start = new Date(dateValue);
  if (Number.isNaN(start.getTime())) return '';
  const today = new Date();
  const days = Math.max(0, Math.floor((today.getTime() - start.getTime()) / 86400000));
  return (days / 365.25).toFixed(2);
}

function normalizeDate(value?: string | null) {
  return value ? String(value).slice(0, 10) : '';
}

function centerDisplayName(center: ApiHealthCenter, isRtl: boolean) {
  return (isRtl ? center.name_ar : center.name_en) || center.name || center.name_en || center.name_ar || '-';
}

function asForm(employee: ApiEmployee): EmployeeForm {
  return {
    name: employee.name || '',
    email: employee.email || '',
    national_id: employee.national_id || '',
    employee_number: employee.employee_number || '',
    national_address: employee.national_address || '',
    mobile: employee.mobile || '',
    date_of_birth: normalizeDate(employee.date_of_birth),
    birth_place: employee.birth_place || '',
    gender: employee.gender || 'male',
    marital_status: employee.marital_status || '',
    health_center: String(employee.health_center || ''),
    job_title: employee.job_title || '',
    appointment_date: normalizeDate(employee.appointment_date),
    periodic_exam_status: employee.periodic_exam_status || 'incomplete',
    vaccination_status: employee.vaccination_status || 'due',
    risk_level: employee.risk_level || 'low',
  };
}

function buildPayload(form: EmployeeForm) {
  return {
    name: form.name.trim(),
    email: form.email.trim().toLowerCase(),
    national_id: form.national_id.replace(/\D/g, ''),
    employee_number: form.employee_number.trim(),
    national_address: form.national_address.trim(),
    mobile: form.mobile.trim(),
    date_of_birth: form.date_of_birth || null,
    birth_place: form.birth_place.trim(),
    gender: form.gender,
    marital_status: form.marital_status,
    health_center: Number(form.health_center),
    job_title: form.job_title.trim(),
    appointment_date: form.appointment_date || null,
    periodic_exam_status: form.periodic_exam_status,
    vaccination_status: form.vaccination_status,
    risk_level: form.risk_level,
  };
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('لا يوجد رمز دخول من Django. أعد تسجيل الدخول بحساب Backend وليس الحساب التجريبي.');
  }

  const response = await authFetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body?.detail || body?.email || body?.national_id || body?.employee_number || body?.health_center ||
      body?.date_of_birth || body?.appointment_date || body?.name || body?.mobile || body?.non_field_errors ||
      'Request failed';
    throw new Error(Array.isArray(message) ? message.join('، ') : String(message));
  }
  return body as T;
}

export function EmployeesPage() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const navigate = useNavigate();
  const isRtl = i18n.language === 'ar';

  const [employees, setEmployees] = useState<ApiEmployee[]>([]);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [healthCenters, setHealthCenters] = useState<ApiHealthCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [centerFilter, setCenterFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [sortMode, setSortMode] = useState('newest');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [dialogMode, setDialogMode] = useState<'view' | 'add' | 'edit'>('view');
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<ApiEmployee | null>(null);
  const [form, setForm] = useState<EmployeeForm>(EMPTY_FORM);
  const [connectionError, setConnectionError] = useState('');

  const canWrite = can(PERMISSIONS.UPDATE_EMPLOYEE) || can(PERMISSIONS.UPDATE_EMPLOYEE_BASIC);
  const computedAge = calculateAge(form.date_of_birth);
  const computedExperience = calculateExperience(form.appointment_date);

  async function loadData() {
    setLoading(true);
    setConnectionError('');
    try {
      const query = new URLSearchParams({ page: String(page + 1) });
      if (searchTerm.trim()) query.set('search', searchTerm.trim());
      if (centerFilter !== 'all') query.set('health_center_id', centerFilter);
      if (statusFilter !== 'all') query.set('employment_status', statusFilter);
      if (sourceFilter !== 'all') query.set('source_category', sourceFilter);
      query.set('sort', sortMode);
      const employeesPayload = await apiRequest<unknown>('/employees/?' + query.toString());
      const results = getList<ApiEmployee>(employeesPayload);
      const payload = employeesPayload && typeof employeesPayload === 'object'
        ? employeesPayload as { count?: number }
        : {};
      setEmployees(results);
      setTotalCount(typeof payload.count === 'number' ? payload.count : results.length);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load employees';
      setConnectionError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function loadCenters() {
    try {
      const centers: ApiHealthCenter[] = [];
      // DRF paginates centers too. Fetch all pages for the selector, not only 25.
      for (let centerPage = 1; centerPage <= 40; centerPage += 1) {
        const payload = await apiRequest<unknown>('/health-centers/?active=true&page=' + centerPage);
        centers.push(...getList<ApiHealthCenter>(payload));
        const next = payload && typeof payload === 'object'
          ? (payload as { next?: string | null }).next
          : null;
        if (!next) break;
      }
      setHealthCenters(centers);
      setForm(prev => prev.health_center || !centers[0]
        ? prev : { ...prev, health_center: String(centers[0].id) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load centers');
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void loadData(); }, searchTerm ? 350 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchTerm, centerFilter, statusFilter, sourceFilter, sortMode]);

  useEffect(() => { void loadCenters(); }, []);

  const centerNameById = useMemo(() => {
    const map = new Map<string, string>();
    healthCenters.forEach(center => map.set(String(center.id), centerDisplayName(center, isRtl)));
    return map;
  }, [healthCenters, isRtl]);

  // Search and center filtering are performed server-side across all employees.
  const filteredEmployees = employees;

  function getHealthCenterName(employee: ApiEmployee) {
    return centerNameById.get(String(employee.health_center)) || employee.health_center_name || '-';
  }

  function openAdd() {
    setSelectedEmployee(null);
    setForm({ ...EMPTY_FORM, health_center: healthCenters[0] ? String(healthCenters[0].id) : '' });
    setDialogMode('add');
    setOpenDialog(true);
  }

  function openEdit(employee: ApiEmployee) {
    setSelectedEmployee(employee);
    setForm(asForm(employee));
    setDialogMode('edit');
    setOpenDialog(true);
  }

  function openView(employee: ApiEmployee) {
    setSelectedEmployee(employee);
    setForm(asForm(employee));
    setDialogMode('view');
    setOpenDialog(true);
  }

  function updateForm<K extends keyof EmployeeForm>(key: K, value: EmployeeForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function findDuplicate(field: keyof Pick<ApiEmployee, 'email' | 'national_id' | 'employee_number'>, value: string) {
    if (!value) return undefined;
    return employees.find(emp =>
      String(emp[field] || '').toLowerCase() === value.toLowerCase() &&
      String(emp.id) !== String(selectedEmployee?.id || '')
    );
  }

  async function handleSave() {
    const required: Array<[keyof EmployeeForm, string]> = [
      ['name', isRtl ? 'الاسم الكامل' : 'Full name'],
      ['email', isRtl ? 'البريد الإلكتروني' : 'Email'],
      ['national_id', isRtl ? 'رقم الهوية الوطنية' : 'National ID'],
      ['employee_number', isRtl ? 'الرقم الوظيفي' : 'Employee number'],
      ['mobile', isRtl ? 'رقم الجوال' : 'Mobile'],
      ['date_of_birth', isRtl ? 'تاريخ الميلاد' : 'Date of birth'],
      ['birth_place', isRtl ? 'مكان الميلاد' : 'Birth place'],
      ['national_address', isRtl ? 'العنوان الوطني' : 'National address'],
      ['marital_status', isRtl ? 'الحالة الاجتماعية' : 'Marital status'],
      ['health_center', isRtl ? 'المركز الصحي' : 'Health center'],
      ['job_title', isRtl ? 'المسمى الوظيفي' : 'Job title'],
      ['appointment_date', isRtl ? 'تاريخ التعيين' : 'Appointment date'],
    ];

    const missing = required.find(([key]) => !String(form[key] || '').trim());
    if (missing) {
      toast.error(isRtl ? `يرجى تعبئة: ${missing[1]}` : `${missing[1]} is required`);
      return;
    }

    if (findDuplicate('email', form.email)) {
      toast.error(isRtl ? 'البريد الإلكتروني مسجل مسبقًا لموظف آخر' : 'Email already exists for another employee');
      return;
    }
    if (findDuplicate('national_id', form.national_id.replace(/\D/g, ''))) {
      toast.error(isRtl ? 'رقم الهوية الوطنية مسجل مسبقًا لموظف آخر' : 'National ID already exists for another employee');
      return;
    }
    if (findDuplicate('employee_number', form.employee_number)) {
      toast.error(isRtl ? 'الرقم الوظيفي مسجل مسبقًا لموظف آخر' : 'Employee number already exists for another employee');
      return;
    }

    setSaving(true);
    try {
      if (dialogMode === 'add') {
        const created = await apiRequest<ApiEmployee>('/employees/', {
          method: 'POST',
          body: JSON.stringify(buildPayload(form)),
        });
        setEmployees(prev => [created, ...prev]);
        toast.success(isRtl ? 'تم إضافة الموظف وحفظه في PostgreSQL' : 'Employee saved in PostgreSQL');
      } else if (dialogMode === 'edit' && selectedEmployee) {
        const updated = await apiRequest<ApiEmployee>(`/employees/${selectedEmployee.id}/`, {
          method: 'PATCH',
          body: JSON.stringify(buildPayload(form)),
        });
        setEmployees(prev => prev.map(emp => String(emp.id) === String(updated.id) ? updated : emp));
        toast.success(isRtl ? 'تم تعديل بيانات الموظف وحفظها في Django/PostgreSQL' : 'Employee updated in Django/PostgreSQL');
      }
      setOpenDialog(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Save failed';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  const activeOnPage = employees.filter(emp => emp.employment_status === 'active').length;
  const sourceOtherOnPage = employees.filter(emp =>
    Boolean(emp.roster_source_status) && emp.roster_source_status !== 'تعيين نشط'
  ).length;
  const isReadOnly = dialogMode === 'view';

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <PeopleIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">{t('employees')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {totalCount} {isRtl ? 'موظف — مرتبطة بياناتهم بقاعدة PostgreSQL' : 'employees in PostgreSQL'}
            </Typography>
          </Box>
        </Box>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" justifyContent="flex-end">
          <Button variant="outlined" startIcon={<RefreshIcon /> onClick={() => void loadData()} disabled={loading}>
            {isRtl ? 'تحديث' : 'Refresh'}
          </Button>
          {can(PERMISSIONS.MANAGE_USERS) && (
            <Button variant="outlined" startIcon={<WorkHistoryIcon />} onClick={() => navigate('/admin/employee-lifecycle')}>
              {isRtl ? 'الحالات الوظيفية والمتقاعدون' : 'Employment Lifecycle'}
            </Button>
          )}
          {can(PERMISSIONS.MANAGE_USERS) && (
            <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => navigate('/admin/workforce-roster-preview')}>
              {isRtl ? 'فحص الملف الجديد' : 'Preview Current Roster'}
            </Button>
          )}
          {can(PERMISSIONS.MANAGE_USERS) && (
            <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => navigate('/employees/import')}>
              {isRtl ? 'استيراد Excel' : 'Import Excel'}
            </Button>
          )}
          {can(PERMISSIONS.CREATE_EMPLOYEE) && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
              {t('addEmployee')}
            </Button>
          )}
        </Stack>
      </Box>

      {connectionError && <Alert severity="warning" sx={{ mb: 2 }}>{connectionError}</Alert>}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: isRtl ? 'إجمالي نتائج البحث والتصفية' : 'Total matched employees', value: totalCount, color: 'primary.main' },
          { label: isRtl ? 'المعروض في الصفحة' : 'Shown on this page', value: employees.length, color: 'info.main' },
          { label: isRtl ? 'على رأس العمل — هذه الصفحة' : 'Active — current page', value: activeOnPage, color: 'success.main' },
          { label: isRtl ? 'حالة مصدر مختلفة — هذه الصفحة' : 'Other source conditions — page', value: sourceOtherOnPage, color: 'warning.main' },
        ].map(item => (
          <Grid key={item.label} size={{ xs: 6, sm: 3 }}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4" fontWeight="bold" color={item.color}>{item.value}</Typography>
              <Typography variant="body2" color="text.secondary">{item.label}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 7 }}>
            <TextField
              fullWidth
              placeholder={(isRtl ? 'بحث بالاسم أو البريد أو الهوية أو الرقم الوظيفي أو الجوال' : 'Search name, email, ID, employee number, or mobile') + '...'}
              value={searchTerm}
              onChange={event => { setSearchTerm(event.target.value); setPage(0); }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <TextField fullWidth select label={isRtl ? 'المركز الصحي' : 'Health Center'} value={centerFilter}
              onChange={event => { setCenterFilter(event.target.value); setPage(0); }}>
              <MenuItem value="all">{isRtl ? 'جميع المراكز' : 'All Centers'}</MenuItem>
              {healthCenters.map(center => <MenuItem key={center.id} value={String(center.id)}>{centerDisplayName(center, isRtl)}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField fullWidth select label={isRtl ? 'الحالة الوظيفية' : 'Employment status'} value={statusFilter}
              onChange={event => { setStatusFilter(event.target.value); setPage(0); }}>
              <MenuItem value="all">{isRtl ? 'جميع الحالات' : 'All statuses'}</MenuItem>
              <MenuItem value="active">{isRtl ? 'على رأس العمل' : 'Active'}</MenuItem>
              <MenuItem value="retired">{isRtl ? 'متقاعد' : 'Retired'}</MenuItem>
              <MenuItem value="transferred">{isRtl ? 'منقول خارج الجهة' : 'Transferred out'}</MenuItem>
              <MenuItem value="separated">{isRtl ? 'منتهية خدمته' : 'Separated'}</MenuItem>
              <MenuItem value="under_review">{isRtl ? 'تحتاج مراجعة' : 'Under review'}</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField fullWidth select label={isRtl ? 'حالة ملف المصدر' : 'Source condition'} value={sourceFilter}
              onChange={event => { setSourceFilter(event.target.value); setPage(0); }}>
              <MenuItem value="all">{isRtl ? 'جميع حالات المصدر' : 'All source conditions'}</MenuItem>
              <MenuItem value="active">{isRtl ? 'تعيين نشط' : 'Source: active'}</MenuItem>
              <MenuItem value="other">{isRtl ? 'حالات إدارية أخرى' : 'Other administrative conditions'}</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField fullWidth select label={isRtl ? 'الترتيب' : 'Sort by'} value={sortMode}
              onChange={event => { setSortMode(event.target.value); setPage(0); }}>
              <MenuItem value="newest">{isRtl ? 'الأحدث إضافة' : 'Newest first'}</MenuItem>
              <MenuItem value="oldest">{isRtl ? 'الأقدم إضافة' : 'Oldest first'}</MenuItem>
              <MenuItem value="name">{isRtl ? 'الاسم' : 'Name'}</MenuItem>
              <MenuItem value="employee_number">{isRtl ? 'الرقم الوظيفي' : 'Employee number'}</MenuItem>
            </TextField>
          </Grid>
        </Grid>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2 }}
          justifyContent="space-between" alignItems="center">
          <Typography sx={{ fontSize: 14, color: '#4C6177', fontWeight: 700 }}>
            {isRtl ? 'طريقة العرض' : 'Display mode'}
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button size="small" variant={viewMode === 'cards' ? 'contained' : 'outlined'}
              aria-pressed={viewMode === 'cards'} onClick={() => setViewMode('cards')}>
              {isRtl ? 'بطاقات' : 'Cards'}
            </Button>
            <Button size="small" variant={viewMode === 'table' ? 'contained' : 'outlined'}
              aria-pressed={viewMode === 'table'} onClick={() => setViewMode('table')}>
              {isRtl ? 'جدول' : 'Table'}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {loading ? (
        <Paper sx={{ p: 5, textAlign: 'center' }}>
          <CircularProgress />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            {isRtl ? 'جاري تحميل الموظفين من PostgreSQL...' : 'Loading employees from PostgreSQL...'}
          </Typography>
        </Paper>
      ) : (
        <>
          {viewMode === 'cards' ? (
            <Grid container spacing={2.5} sx={{ mb: 2 }}>
              {filteredEmployees.map(employee => (
                <Grid key={employee.id} size={{ xs: 12, md: 6, xl: 4 }}>
                  <EmployeeRegistryCard
                    employee={employee}
                    centerName={getHealthCenterName(employee)}
                    isRtl={isRtl}
                    canWrite={canWrite}
                    canManage={can(PERMISSIONS.MANAGE_USERS)}
                    onView={() => openView(employee)}
                    onEdit={() => openEdit(employee)}
                    onHealthCard={() => navigate(`/employees/${employee.id}/health-card`)}
                    onEmploymentHistory={() => navigate('/admin/employee-lifecycle')}
                  />
                </Grid>
              ))}
            </Grid>
          ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 3, border: '1px solid #D2E0EA' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{isRtl ? 'الرقم الوظيفي' : 'Employee No.'}</TableCell>
                <TableCell>{isRtl ? 'الاسم الكامل' : 'Full Name'}</TableCell>
                <TableCell>{isRtl ? 'الهوية الوطنية' : 'National ID'}</TableCell>
                <TableCell>{isRtl ? 'البريد الإلكتروني' : 'Email'}</TableCell>
                <TableCell>{isRtl ? 'المركز / المسمى' : 'Center / Job'}</TableCell>
                <TableCell>{isRtl ? 'الحالة الوظيفية' : 'Employment Status'}</TableCell>
                <TableCell>{isRtl ? 'العمر / الخبرة' : 'Age / Experience'}</TableCell>
                <TableCell>{isRtl ? 'الجوال' : 'Mobile'}</TableCell>
                <TableCell align="center">{isRtl ? 'الإجراءات' : 'Actions'}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredEmployees.map(employee => (
                <TableRow key={employee.id} hover>
                  <TableCell>{employee.employee_number || '-'}</TableCell>
                  <TableCell><Typography variant="body2" fontWeight="bold">{employee.name}</Typography></TableCell>
                  <TableCell>{maskNationalId(employee.national_id)}</TableCell>
                  <TableCell>{employee.email || '-'}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">{getHealthCenterName(employee)}</Typography>
                    <Typography variant="caption" color="text.secondary">{employee.job_title || '-'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip size="small"
                      color={employee.employment_status === 'under_review' ? 'warning' : employee.employment_status === 'active' || !employee.employment_status ? 'success' : 'default'}
                      label={({
                        active: isRtl ? 'على رأس العمل' : 'Active',
                        retired: isRtl ? 'متقاعد' : 'Retired',
                        separated: isRtl ? 'منتهية خدمته' : 'Separated',
                        transferred: isRtl ? 'منقول خارج الجهة' : 'Transferred Out',
                        under_review: isRtl ? 'تحتاج تحقق' : 'Under Review',
                      } as Record<string, string>)[employee.employment_status || 'active']}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{isRtl ? 'العمر: ' : 'Age: '}{employee.age ?? '-'}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {isRtl ? 'الخبرة: ' : 'Experience: '}{employee.years_of_experience ?? '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>{employee.mobile || '-'}</TableCell>
                  <TableCell align="center" className="employee-registry-actions">
                    <Button size="small" variant="outlined" color="primary" startIcon={<HealthCardIcon />} onClick={() => navigate(`/employees/${employee.id}/health-card`)}>
                      {isRtl ? 'البطاقة الصحية' : 'Health Card'}
                    </Button>
                    <Button size="small" variant="outlined" startIcon={<VisibilityIcon />} onClick={() => openView(employee)}>
                      {isRtl ? 'عرض' : 'View'}
                    </Button>
                    {canWrite && (
                      <Button size="small" variant="outlined" startIcon={<EditIcon />} onClick={() => openEdit(employee)}>
                        {isRtl ? 'تعديل' : 'Edit'}
                      </Button>
                    )}
                    {can(PERMISSIONS.MANAGE_USERS) && (
                      <Button size="small" variant="outlined" startIcon={<WorkHistoryIcon />}
                        onClick={() => navigate('/admin/employee-lifecycle')}>
                        {isRtl ? 'السجل الوظيفي' : 'Employment History'}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
          )}
          {filteredEmployees.length === 0 && (
            <Alert severity="info" sx={{ my: 2 }}>
              {isRtl ? 'لا توجد سجلات مطابقة. غيّر البحث أو التصفية لعرض نتائج أخرى.' :
                'No matching records. Adjust the search or filters.'}
            </Alert>
          )}
          <Paper elevation={0} sx={{ mt: 2, border: '1px solid #D2E0EA', borderRadius: 3 }}>
          <TablePagination
            component="div"
            count={totalCount}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={25}
            rowsPerPageOptions={[25]}
            labelDisplayedRows={({ from, to, count }) =>
              isRtl ? `${from}–${to} من ${count}` : `${from}–${to} of ${count}`}
            labelRowsPerPage={isRtl ? 'لكل صفحة:' : 'Rows per page:'}
          />
          </Paper>
        </>
      )}

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle component="div">
          <Typography variant="h6" component="span" fontWeight="bold">
            {dialogMode === 'add'
              ? (isRtl ? 'إضافة موظف جديد' : 'Add Employee')
              : dialogMode === 'edit'
                ? (isRtl ? 'تعديل بيانات الموظف' : 'Edit Employee')
                : (isRtl ? 'بيانات الموظف' : 'Employee Details')}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth required label={isRtl ? 'الاسم الكامل' : 'Full Name'} value={form.name}
                onChange={event => updateForm('name', event.target.value)} disabled={isReadOnly} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth required label={isRtl ? 'البريد الإلكتروني' : 'Email'} type="email" value={form.email}
                onChange={event => updateForm('email', event.target.value)} disabled={isReadOnly} helperText={isRtl ? 'فريد ولا يقبل التكرار' : 'Unique value'} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth required label={isRtl ? 'رقم الهوية الوطنية' : 'National ID'} value={form.national_id}
                onChange={event => updateForm('national_id', event.target.value.replace(/\D/g, ''))} disabled={isReadOnly} helperText={isRtl ? 'فريد ولا يقبل التكرار' : 'Unique value'} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth required label={isRtl ? 'الرقم الوظيفي' : 'Employee Number'} value={form.employee_number}
                onChange={event => updateForm('employee_number', event.target.value)} disabled={isReadOnly} helperText={isRtl ? 'فريد ولا يقبل التكرار' : 'Unique value'} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth required label={isRtl ? 'رقم الجوال' : 'Mobile'} value={form.mobile}
                onChange={event => updateForm('mobile', event.target.value)} disabled={isReadOnly} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth required label={isRtl ? 'العنوان الوطني' : 'National Address'} value={form.national_address}
                onChange={event => updateForm('national_address', event.target.value)} disabled={isReadOnly} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <CalendarDateField required label={isRtl ? 'تاريخ الميلاد' : 'Date of Birth'} value={form.date_of_birth}
                onChange={value => updateForm('date_of_birth', value)} disabled={isReadOnly} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label={isRtl ? 'العمر محسوب تلقائيًا' : 'Calculated Age'} value={computedAge || selectedEmployee?.age || ''} disabled />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth required label={isRtl ? 'مكان الميلاد' : 'Birth Place'} value={form.birth_place}
                onChange={event => updateForm('birth_place', event.target.value)} disabled={isReadOnly} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth required select label={isRtl ? 'الحالة الاجتماعية' : 'Marital Status'} value={form.marital_status}
                onChange={event => updateForm('marital_status', event.target.value as MaritalStatus)} disabled={isReadOnly}>
                <MenuItem value="single">{isRtl ? 'أعزب' : 'Single'}</MenuItem>
                <MenuItem value="married">{isRtl ? 'متزوج' : 'Married'}</MenuItem>
                <MenuItem value="divorced">{isRtl ? 'مطلق' : 'Divorced'}</MenuItem>
                <MenuItem value="widowed">{isRtl ? 'أرمل' : 'Widowed'}</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <HealthCenterAutocomplete
                options={healthCenters}
                value={form.health_center}
                onChange={value => updateForm('health_center', value)}
                label={isRtl ? 'المركز الصحي' : 'Health Center'}
                placeholder={isRtl ? 'اختر أو ابحث باسم المركز' : 'Select or search by center name'}
                required
                disabled={isReadOnly || dialogMode === 'edit'}
              />
            </Grid>
            {dialogMode === 'edit' && (
              <Grid size={{ xs: 12 }}>
                <Alert severity="info">
                  {isRtl ? 'تغيير المركز الصحي يتم من شاشة «الحالات الوظيفية والمتقاعدون» بإجراء نقل داخلي موثق.' : 'Change health center using the audited employment lifecycle transfer workflow.'}
                </Alert>
              </Grid>
            )}
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth required label={isRtl ? 'المسمى الوظيفي' : 'Job Title'} value={form.job_title}
                onChange={event => updateForm('job_title', event.target.value)} disabled={isReadOnly} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <CalendarDateField required label={isRtl ? 'تاريخ التعيين' : 'Appointment Date'} value={form.appointment_date}
                onChange={value => updateForm('appointment_date', value)} disabled={isReadOnly} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label={isRtl ? 'سنوات الخبرة محسوبة تلقائيًا' : 'Calculated Years of Experience'} value={computedExperience || selectedEmployee?.years_of_experience || ''} disabled />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth select label={isRtl ? 'الجنس' : 'Gender'} value={form.gender}
                onChange={event => updateForm('gender', event.target.value as Gender)} disabled={isReadOnly}>
                <MenuItem value="male">{isRtl ? 'ذكر' : 'Male'}</MenuItem>
                <MenuItem value="female">{isRtl ? 'أنثى' : 'Female'}</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth select label={isRtl ? 'حالة الفحص الدوري' : 'Periodic Exam Status'} value={form.periodic_exam_status}
                onChange={event => updateForm('periodic_exam_status', event.target.value as ExamStatus)} disabled={isReadOnly}>
                <MenuItem value="completed">{isRtl ? 'مكتمل' : 'Completed'}</MenuItem>
                <MenuItem value="incomplete">{isRtl ? 'غير مكتمل' : 'Incomplete'}</MenuItem>
                <MenuItem value="overdue">{isRtl ? 'متأخر' : 'Overdue'}</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth select label={isRtl ? 'حالة التطعيم' : 'Vaccination Status'} value={form.vaccination_status}
                onChange={event => updateForm('vaccination_status', event.target.value as VaccineStatus)} disabled={isReadOnly}>
                <MenuItem value="completed">{isRtl ? 'مكتمل' : 'Completed'}</MenuItem>
                <MenuItem value="due">{isRtl ? 'مستحق' : 'Due'}</MenuItem>
                <MenuItem value="refused">{isRtl ? 'رفض' : 'Refused'}</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth select label={isRtl ? 'مستوى الخطورة' : 'Risk Level'} value={form.risk_level}
                onChange={event => updateForm('risk_level', event.target.value as RiskLevel)} disabled={isReadOnly}>
                <MenuItem value="low">{isRtl ? 'منخفض' : 'Low'}</MenuItem>
                <MenuItem value="medium">{isRtl ? 'متوسط' : 'Medium'}</MenuItem>
                <MenuItem value="high">{isRtl ? 'مرتفع' : 'High'}</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>{isRtl ? 'إغلاق' : 'Close'}</Button>
          {dialogMode !== 'view' && (
            <Button variant="contained" onClick={() => void handleSave()} disabled={saving}>
              {saving ? (isRtl ? 'جاري الحفظ...' : 'Saving...') : (isRtl ? 'حفظ في PostgreSQL' : 'Save to PostgreSQL')}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
