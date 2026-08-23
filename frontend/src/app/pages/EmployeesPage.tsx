import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  Chip,
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
  Alert,
  CircularProgress,
} from '@mui/material';
import { Grid } from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  People as PeopleIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import { toast } from 'sonner';
import { getAccessToken } from '../context/AuthContext';
import { PERMISSIONS } from '../data/roles';
import { useAuth } from '../context/AuthContext';

const PRODUCTION_API_BASE_URL = 'https://occupational-health-platform-production.up.railway.app/api';
const LOCAL_API_BASE_URL = 'http://localhost:8000/api';
const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? LOCAL_API_BASE_URL
    : PRODUCTION_API_BASE_URL)
).replace(/\/$/, '');

type Gender = 'male' | 'female';
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
  national_id: string;
  mobile?: string;
  gender: Gender;
  health_center: number | string;
  health_center_name?: string;
  job_title?: string;
  age?: number;
  periodic_exam_status?: ExamStatus;
  vaccination_status?: VaccineStatus;
  risk_level?: RiskLevel;
  created_at?: string;
  updated_at?: string;
};

type EmployeeForm = {
  name: string;
  national_id: string;
  mobile: string;
  gender: Gender;
  health_center: string;
  job_title: string;
  age: string;
  periodic_exam_status: ExamStatus;
  vaccination_status: VaccineStatus;
  risk_level: RiskLevel;
};

const EMPTY_FORM: EmployeeForm = {
  name: '',
  national_id: '',
  mobile: '',
  gender: 'male',
  health_center: '',
  job_title: '',
  age: '0',
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

function asForm(employee: ApiEmployee): EmployeeForm {
  return {
    name: employee.name || '',
    national_id: employee.national_id || '',
    mobile: employee.mobile || '',
    gender: employee.gender || 'male',
    health_center: String(employee.health_center || ''),
    job_title: employee.job_title || '',
    age: String(employee.age ?? 0),
    periodic_exam_status: employee.periodic_exam_status || 'incomplete',
    vaccination_status: employee.vaccination_status || 'due',
    risk_level: employee.risk_level || 'low',
  };
}

function buildPayload(form: EmployeeForm) {
  return {
    name: form.name.trim(),
    national_id: form.national_id.replace(/\D/g, ''),
    mobile: form.mobile.trim(),
    gender: form.gender,
    health_center: Number(form.health_center),
    job_title: form.job_title.trim(),
    age: Number(form.age || 0),
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
    const message = body?.detail || body?.national_id || body?.health_center || body?.name || body?.mobile || body?.non_field_errors || 'Request failed';
    throw new Error(Array.isArray(message) ? message.join('، ') : String(message));
  }
  return body as T;
}

export function EmployeesPage() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
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

  async function handleSave() {
    if (!form.name.trim() || !form.national_id.trim() || !form.health_center) {
      toast.error(isRtl ? 'يرجى تعبئة الاسم ورقم الهوية والمركز الصحي' : 'Name, National ID, and health center are required');
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
          {can(PERMISSIONS.CREATE_EMPLOYEE) && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
              {t('addEmployee')}
            </Button>
          )}
        </Stack>
      </Box>

      {connectionError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {connectionError}
        </Alert>
      )}

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
              placeholder={(isRtl ? 'بحث بالاسم أو الهوية أو الجوال أو المسمى' : 'Search name, ID, mobile, or job title') + '...'}
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <TextField fullWidth select label={t('healthCenter')} value={centerFilter}
              onChange={event => setCenterFilter(event.target.value)}>
              <MenuItem value="all">{isRtl ? 'جميع المراكز' : 'All Centers'}</MenuItem>
              {healthCenters.map(center => (
                <MenuItem key={center.id} value={String(center.id)}>{center.name}</MenuItem>
              ))}
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
                <TableCell>{isRtl ? 'رقم السجل' : 'Record ID'}</TableCell>
                <TableCell>{t('fullName')}</TableCell>
                <TableCell>{t('nationalId')}</TableCell>
                <TableCell>{t('jobTitle')}</TableCell>
                <TableCell>{t('healthCenter')}</TableCell>
                <TableCell>{t('gender')}</TableCell>
                <TableCell>{isRtl ? 'حالة الفحص' : 'Exam Status'}</TableCell>
                <TableCell align="center">{t('actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredEmployees.map(employee => (
                <TableRow key={employee.id} hover>
                  <TableCell>{employee.id}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">{employee.name}</Typography>
                  </TableCell>
                  <TableCell>{maskNationalId(employee.national_id)}</TableCell>
                  <TableCell>{employee.job_title || '-'}</TableCell>
                  <TableCell>{getHealthCenterName(employee)}</TableCell>
                  <TableCell>
                    <Chip label={employee.gender === 'female' ? (isRtl ? 'أنثى' : 'Female') : (isRtl ? 'ذكر' : 'Male')} size="small" color={employee.gender === 'female' ? 'secondary' : 'primary'} />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={employee.periodic_exam_status || 'incomplete'}
                      size="small"
                      color={employee.periodic_exam_status === 'completed' ? 'success' : employee.periodic_exam_status === 'overdue' ? 'error' : 'warning'}
                    />
                  </TableCell>
                  <TableCell align="center">
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
              <TextField fullWidth required label={t('fullName')} value={form.name}
                onChange={event => updateForm('name', event.target.value)} disabled={isReadOnly} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth required label={t('nationalId')} value={form.national_id}
                onChange={event => updateForm('national_id', event.target.value.replace(/\D/g, ''))} disabled={isReadOnly} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label={t('mobile')} value={form.mobile}
                onChange={event => updateForm('mobile', event.target.value)} disabled={isReadOnly} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth select label={t('gender')} value={form.gender}
                onChange={event => updateForm('gender', event.target.value as Gender)} disabled={isReadOnly}>
                <MenuItem value="male">{isRtl ? 'ذكر' : 'Male'}</MenuItem>
                <MenuItem value="female">{isRtl ? 'أنثى' : 'Female'}</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth required select label={t('healthCenter')} value={form.health_center}
                onChange={event => updateForm('health_center', event.target.value)} disabled={isReadOnly}>
                {healthCenters.map(center => (
                  <MenuItem key={center.id} value={String(center.id)}>{center.name}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label={t('jobTitle')} value={form.job_title}
                onChange={event => updateForm('job_title', event.target.value)} disabled={isReadOnly} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label={isRtl ? 'العمر' : 'Age'} type="number" value={form.age}
                onChange={event => updateForm('age', event.target.value)} disabled={isReadOnly} />
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
