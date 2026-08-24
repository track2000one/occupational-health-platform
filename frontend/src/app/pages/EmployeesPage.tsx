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
  IconButton,
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
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Grid } from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  People as PeopleIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  UploadFile as UploadFileIcon,
  Visibility as VisibilityIcon,
  BadgeOutlined as HealthCardIcon,
} from '@mui/icons-material';
import { toast } from 'sonner';
import { getAccessToken, useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../data/roles';
import { CalendarDateField } from '../components/CalendarDateField';

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
  city?: string;
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

  const response = await fetch(`${API_BASE_URL}${path}`, {
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
  const [healthCenters, setHealthCenters] = useState<ApiHealthCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [centerFilter, setCenterFilter] = useState('all');
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
      const [employeesPayload, centersPayload] = await Promise.all([
        apiRequest<unknown>('/employees/'),
        apiRequest<unknown>('/health-centers/'),
      ]);
      const centers = getList<ApiHealthCenter>(centersPayload);
      setEmployees(getList<ApiEmployee>(employeesPayload));
      setHealthCenters(centers);
      if (!form.health_center && centers[0]) {
        setForm(prev => ({ ...prev, health_center: String(centers[0].id) }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load employees';
      setConnectionError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const centerNameById = useMemo(() => {
    const map = new Map<string, string>();
    healthCenters.forEach(center => map.set(String(center.id), center.name));
    return map;
  }, [healthCenters]);

  const filteredEmployees = employees.filter(emp => {
    const query = searchTerm.trim().toLowerCase();
    const matchSearch = !query ||
      emp.name.toLowerCase().includes(query) ||
      String(emp.email || '').toLowerCase().includes(query) ||
      String(emp.employee_number || '').toLowerCase().includes(query) ||
      String(emp.national_id || '').includes(query) ||
      String(emp.mobile || '').includes(query) ||
      String(emp.job_title || '').toLowerCase().includes(query);
    const matchCenter = centerFilter === 'all' || String(emp.health_center) === centerFilter;
    return matchSearch && matchCenter;
  });

  function getHealthCenterName(employee: ApiEmployee) {
    return employee.health_center_name || centerNameById.get(String(employee.health_center)) || '-';
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

  async function handleDelete(employee: ApiEmployee) {
    const confirmed = window.confirm(isRtl
      ? `هل تريد حذف سجل الموظف: ${employee.name}؟`
      : `Delete employee record: ${employee.name}?`);
    if (!confirmed) return;

    try {
      await apiRequest(`/employees/${employee.id}/`, { method: 'DELETE' });
      setEmployees(prev => prev.filter(emp => String(emp.id) !== String(employee.id)));
      toast.success(isRtl ? 'تم حذف الموظف من Django/PostgreSQL' : 'Employee deleted from Django/PostgreSQL');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delete failed';
      toast.error(message);
    }
  }

  const completedExams = employees.filter(emp => emp.periodic_exam_status === 'completed').length;
  const highRisk = employees.filter(emp => emp.risk_level === 'high').length;
  const dueVaccines = employees.filter(emp => emp.vaccination_status === 'due').length;
  const isReadOnly = dialogMode === 'view';

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <PeopleIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">{t('employees')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {filteredEmployees.length} {isRtl ? 'موظف — مرتبط بـ Django/PostgreSQL' : 'employees — Django/PostgreSQL connected'}
            </Typography>
          </Box>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => void loadData()} disabled={loading}>
            {isRtl ? 'تحديث' : 'Refresh'}
          </Button>
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
          { label: isRtl ? 'إجمالي الموظفين' : 'Total Employees', value: employees.length, color: 'primary.main' },
          { label: isRtl ? 'الفحص مكتمل' : 'Completed Exams', value: completedExams, color: 'success.main' },
          { label: isRtl ? 'تطعيم مستحق' : 'Vaccines Due', value: dueVaccines, color: 'warning.main' },
          { label: isRtl ? 'خطورة عالية' : 'High Risk', value: highRisk, color: 'error.main' },
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
              onChange={event => setSearchTerm(event.target.value)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <TextField fullWidth select label={isRtl ? 'المركز الصحي' : 'Health Center'} value={centerFilter}
              onChange={event => setCenterFilter(event.target.value)}>
              <MenuItem value="all">{isRtl ? 'جميع المراكز' : 'All Centers'}</MenuItem>
              {healthCenters.map(center => <MenuItem key={center.id} value={String(center.id)}>{center.name}</MenuItem>)}
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      {loading ? (
        <Paper sx={{ p: 5, textAlign: 'center' }}>
          <CircularProgress />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            {isRtl ? 'جاري تحميل الموظفين من PostgreSQL...' : 'Loading employees from PostgreSQL...'}
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{isRtl ? 'الرقم الوظيفي' : 'Employee No.'}</TableCell>
                <TableCell>{isRtl ? 'الاسم الكامل' : 'Full Name'}</TableCell>
                <TableCell>{isRtl ? 'الهوية الوطنية' : 'National ID'}</TableCell>
                <TableCell>{isRtl ? 'البريد الإلكتروني' : 'Email'}</TableCell>
                <TableCell>{isRtl ? 'المركز / المسمى' : 'Center / Job'}</TableCell>
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
                    <Typography variant="body2">{isRtl ? 'العمر: ' : 'Age: '}{employee.age ?? '-'}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {isRtl ? 'الخبرة: ' : 'Experience: '}{employee.years_of_experience ?? '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>{employee.mobile || '-'}</TableCell>
                  <TableCell align="center">
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
                    {can(PERMISSIONS.DELETE_EMPLOYEE) && (
                      <Tooltip title={isRtl ? 'حذف من قاعدة البيانات' : 'Delete from database'}>
                        <IconButton size="small" color="error" onClick={() => void handleDelete(employee)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
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
              <TextField fullWidth required select label={isRtl ? 'المركز الصحي' : 'Health Center'} value={form.health_center}
                onChange={event => updateForm('health_center', event.target.value)} disabled={isReadOnly}>
                {healthCenters.map(center => <MenuItem key={center.id} value={String(center.id)}>{center.name}</MenuItem>)}
              </TextField>
            </Grid>
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
