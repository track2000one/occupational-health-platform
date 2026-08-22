import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  Badge as BadgeIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Fingerprint as FingerprintIcon,
  LockReset as LockResetIcon,
  Mail as MailIcon,
  MedicalInformation as MedicalInformationIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Shield as ShieldIcon,
  Visibility as VisibilityIcon,
  Work as WorkIcon,
} from '@mui/icons-material';
import { getAccessToken, type User, useAuth } from '../context/AuthContext';
import { PERMISSIONS, ROLE_DEFINITIONS, type Permission, type UserRole } from '../data/roles';
import { mockHealthCenters } from '../data/mockData';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/$/, '');

type PersonType = 'admin' | 'healthStaff' | 'employee' | 'patient' | 'external';
type UserForm = Partial<User & { password: string }>;

interface HealthCenterOption {
  id: string;
  name: string;
  nameAr?: string;
}

const personTypes: { id: PersonType; ar: string; en: string }[] = [
  { id: 'admin', ar: 'إداري', en: 'Administrator' },
  { id: 'healthStaff', ar: 'كادر صحي', en: 'Health Staff' },
  { id: 'employee', ar: 'موظف', en: 'Employee' },
  { id: 'patient', ar: 'مريض', en: 'Patient' },
  { id: 'external', ar: 'خارجي', en: 'External' },
];

const permissionGroups: { titleAr: string; titleEn: string; permissions: Permission[] }[] = [
  { titleAr: 'إدارة الموظفين', titleEn: 'Employees', permissions: [PERMISSIONS.VIEW_EMPLOYEES, PERMISSIONS.CREATE_EMPLOYEE, PERMISSIONS.UPDATE_EMPLOYEE, PERMISSIONS.DELETE_EMPLOYEE] },
  { titleAr: 'البيانات الطبية الحساسة', titleEn: 'Sensitive Health Data', permissions: [PERMISSIONS.VIEW_SENSITIVE_DATA, PERMISSIONS.VIEW_LAB_TESTS, PERMISSIONS.UPDATE_LAB_RESULT, PERMISSIONS.APPROVE_LAB_RESULT] },
  { titleAr: 'التطعيمات والعيادات', titleEn: 'Vaccinations & Clinics', permissions: [PERMISSIONS.VIEW_VACCINATIONS, PERMISSIONS.CREATE_VACCINATION, PERMISSIONS.VIEW_CLINIC_VISITS, PERMISSIONS.CREATE_CLINIC_VISIT] },
  { titleAr: 'إدارة النظام', titleEn: 'System Administration', permissions: [PERMISSIONS.MANAGE_USERS, PERMISSIONS.MANAGE_ROLES, PERMISSIONS.MANAGE_SETTINGS, PERMISSIONS.VIEW_AUDIT_LOGS, PERMISSIONS.RESET_PASSWORDS] },
];

function normalizeList<T>(payload: any): T[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function backendMessage(body: any): string {
  if (!body) return 'تعذر تنفيذ العملية على قاعدة البيانات';
  if (typeof body === 'string') return body;
  if (body.detail) return String(body.detail);
  const firstKey = Object.keys(body)[0];
  const value = firstKey ? body[firstKey] : null;
  if (Array.isArray(value)) return `${firstKey}: ${value.join(', ')}`;
  if (value) return `${firstKey}: ${String(value)}`;
  return 'تعذر تنفيذ العملية على قاعدة البيانات';
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  if (!token) throw new Error('لا يوجد رمز دخول من Django. سجّل الدخول من جديد.');

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (response.status === 204) return null as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(backendMessage(body));
  return body as T;
}

function normalizeUser(user: any): User {
  return {
    id: String(user.id),
    name: user.name || user.username || user.email,
    email: user.email,
    role: user.role || 'employee',
    personType: user.personType || 'employee',
    healthCenterId: user.healthCenterId || '',
    healthCenterName: user.healthCenterName || '',
    nationalId: user.nationalId || '',
    employeeNumber: user.employeeNumber || '',
    medicalRecordNumber: user.medicalRecordNumber || '',
    phone: user.phone || '',
    department: user.department || '',
    jobTitle: user.jobTitle || '',
    specialty: user.specialty || '',
    licenseNumber: user.licenseNumber || '',
    isActive: user.isActive ?? true,
    isStaff: user.isStaff,
    isSuperuser: user.isSuperuser,
    lastLogin: user.lastLogin,
    permissions: user.permissions || [],
  };
}

function normalizeHealthCenter(center: any): HealthCenterOption {
  return { id: String(center.id), name: center.name || center.nameAr || '-', nameAr: center.nameAr || center.name };
}

function roleLabel(role: UserRole, isRtl: boolean) {
  const def = ROLE_DEFINITIONS[role] || ROLE_DEFINITIONS.employee;
  return isRtl ? def.nameAr : def.nameEn;
}

function roleColor(role: UserRole) {
  return ROLE_DEFINITIONS[role]?.bgColor || '#607D8B';
}

function personTypeLabel(type: string | undefined, isRtl: boolean) {
  const found = personTypes.find(item => item.id === type);
  return found ? (isRtl ? found.ar : found.en) : '-';
}

function maskIdentifier(value?: string) {
  if (!value) return '-';
  const clean = String(value);
  if (clean.length <= 4) return '••••';
  return `••••••${clean.slice(-4)}`;
}

function fullIdentifier(user: User) {
  return user.nationalId || user.employeeNumber || user.medicalRecordNumber || '-';
}

function getIdentityLabel(user: User, isRtl: boolean) {
  if (user.nationalId) return isRtl ? 'رقم الهوية / السجل' : 'National / Registry ID';
  if (user.employeeNumber) return isRtl ? 'الرقم الوظيفي' : 'Employee No.';
  if (user.medicalRecordNumber) return isRtl ? 'رقم الملف الطبي' : 'MRN';
  return isRtl ? 'معرّف غير مكتمل' : 'Missing identity';
}

function RoleChip({ role, isRtl }: { role: UserRole; isRtl: boolean }) {
  return <Chip size="small" label={roleLabel(role, isRtl)} sx={{ bgcolor: roleColor(role), color: '#fff', fontWeight: 800 }} />;
}

export function AdminUsersPage() {
  const { i18n } = useTranslation();
  const { user: currentUser } = useAuth();
  const isRtl = i18n.language === 'ar';
  const fallbackCenters = useMemo(() => mockHealthCenters.map((center: any) => ({ id: String(center.id), name: center.name || center.nameAr, nameAr: center.nameAr || center.name })), []);

  const [users, setUsers] = useState<User[]>([]);
  const [healthCenters, setHealthCenters] = useState<HealthCenterOption[]>(fallbackCenters);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [personTypeFilter, setPersonTypeFilter] = useState<PersonType | 'all'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>({ name: '', email: '', role: 'employee', personType: 'employee', healthCenterId: '', isActive: true, password: '' });
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' as 'success' | 'info' | 'warning' | 'error' });

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const [usersPayload, centersPayload] = await Promise.all([apiRequest<any>('/users/'), apiRequest<any>('/health-centers/')]);
      setUsers(normalizeList<any>(usersPayload).map(normalizeUser));
      const apiCenters = normalizeList<any>(centersPayload).map(normalizeHealthCenter);
      if (apiCenters.length) setHealthCenters(apiCenters);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الاتصال بقاعدة البيانات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const filteredUsers = useMemo(() => users.filter(user => {
    const q = search.trim().toLowerCase();
    const searchable = [user.name, user.email, user.nationalId, user.employeeNumber, user.medicalRecordNumber, user.healthCenterName, user.department, user.jobTitle, roleLabel(user.role, isRtl)].filter(Boolean).join(' ').toLowerCase();
    const matchesSearch = !q || searchable.includes(q);
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    const matchesType = personTypeFilter === 'all' || user.personType === personTypeFilter;
    return matchesSearch && matchesRole && matchesType;
  }), [users, search, roleFilter, personTypeFilter, isRtl]);

  const activeUsers = users.filter(u => u.isActive).length;
  const healthStaff = users.filter(u => u.personType === 'healthStaff').length;
  const patients = users.filter(u => u.personType === 'patient').length;
  const incompleteIdentity = users.filter(u => !u.nationalId && !u.employeeNumber && !u.medicalRecordNumber).length;

  const openAdd = () => {
    setSelectedUser(null);
    setForm({ name: '', email: '', role: 'employee', personType: 'employee', healthCenterId: '', nationalId: '', employeeNumber: '', medicalRecordNumber: '', phone: '', department: '', jobTitle: '', specialty: '', licenseNumber: '', isActive: true, password: '' });
    setDialogOpen(true);
  };

  const openEdit = (target: User) => {
    setSelectedUser(target);
    setForm({ ...target, password: '' });
    setDialogOpen(true);
  };

  const openDetails = (target: User) => {
    setSelectedUser(target);
    setDetailsOpen(true);
  };

  const saveUser = async () => {
    if (!form.name || !form.email || !form.role) {
      setToast({ open: true, severity: 'error', message: isRtl ? 'الاسم والبريد والدور حقول إلزامية' : 'Name, email, and role are required' });
      return;
    }
    if (!form.nationalId && !form.employeeNumber && !form.medicalRecordNumber) {
      setToast({ open: true, severity: 'warning', message: isRtl ? 'يفضل إدخال رقم هوية/سجل أو رقم وظيفي أو رقم ملف طبي لمنع التكرار.' : 'Add National ID, Employee No., or MRN to prevent duplicates.' });
    }

    try {
      const payload: any = {
        name: form.name,
        email: form.email,
        role: form.role,
        personType: form.personType || 'employee',
        healthCenterId: form.healthCenterId || '',
        nationalId: form.nationalId || '',
        employeeNumber: form.employeeNumber || '',
        medicalRecordNumber: form.medicalRecordNumber || '',
        phone: form.phone || '',
        department: form.department || '',
        jobTitle: form.jobTitle || '',
        specialty: form.specialty || '',
        licenseNumber: form.licenseNumber || '',
        isActive: form.isActive ?? true,
      };
      if (form.password) payload.password = form.password;

      if (selectedUser) {
        await apiRequest(`/users/${selectedUser.id}/`, { method: 'PATCH', body: JSON.stringify(payload) });
        setToast({ open: true, severity: 'success', message: isRtl ? 'تم تحديث المستخدم في قاعدة البيانات' : 'User updated in database' });
      } else {
        await apiRequest('/users/', { method: 'POST', body: JSON.stringify(payload) });
        setToast({ open: true, severity: 'success', message: isRtl ? 'تمت إضافة المستخدم في قاعدة البيانات' : 'User created in database' });
      }
      setDialogOpen(false);
      await fetchUsers();
    } catch (err) {
      setToast({ open: true, severity: 'error', message: err instanceof Error ? err.message : 'تعذر حفظ المستخدم' });
    }
  };

  const toggleStatus = async (target: User) => {
    if (target.id === currentUser?.id) return;
    try {
      await apiRequest(`/users/${target.id}/`, { method: 'PATCH', body: JSON.stringify({ isActive: !target.isActive }) });
      setToast({ open: true, severity: target.isActive ? 'warning' : 'success', message: target.isActive ? (isRtl ? 'تم تعطيل الحساب' : 'Account disabled') : (isRtl ? 'تم تفعيل الحساب' : 'Account enabled') });
      await fetchUsers();
    } catch (err) {
      setToast({ open: true, severity: 'error', message: err instanceof Error ? err.message : 'تعذر تغيير حالة الحساب' });
    }
  };

  const resetPassword = async (target: User) => {
    const newPassword = window.prompt(isRtl ? `أدخل كلمة المرور الجديدة للمستخدم ${target.name}` : `Enter a new password for ${target.name}`);
    if (!newPassword) return;
    try {
      await apiRequest(`/users/${target.id}/reset_password/`, { method: 'POST', body: JSON.stringify({ password: newPassword }) });
      setToast({ open: true, severity: 'info', message: isRtl ? 'تم تحديث كلمة المرور' : 'Password updated' });
    } catch (err) {
      setToast({ open: true, severity: 'error', message: err instanceof Error ? err.message : 'تعذر تحديث كلمة المرور' });
    }
  };

  const deleteUser = async (target: User) => {
    if (target.id === currentUser?.id) return;
    const confirmed = window.confirm(isRtl ? `هل تريد حذف المستخدم ${target.name} نهائيًا؟ يفضل التعطيل بدل الحذف في الأنظمة الصحية.` : `Delete ${target.name}? Deactivation is preferred for health systems.`);
    if (!confirmed) return;
    try {
      await apiRequest(`/users/${target.id}/`, { method: 'DELETE' });
      setToast({ open: true, severity: 'success', message: isRtl ? 'تم حذف المستخدم من قاعدة البيانات' : 'User deleted from database' });
      await fetchUsers();
    } catch (err) {
      setToast({ open: true, severity: 'error', message: err instanceof Error ? err.message : 'تعذر حذف المستخدم' });
    }
  };

  const selectedRole = form.role ? ROLE_DEFINITIONS[form.role as UserRole] || ROLE_DEFINITIONS.employee : ROLE_DEFINITIONS.employee;

  return (
    <Box>
      <Paper sx={{ p: 3, mb: 3, borderRadius: 4, background: 'linear-gradient(135deg, #f8fbff 0%, #eef4ff 55%, #fff 100%)', border: '1px solid', borderColor: 'divider' }}>
        <Stack direction={{ xs: 'column', md: isRtl ? 'row-reverse' : 'row' }} justifyContent="space-between" spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
          <Box sx={{ textAlign: isRtl ? 'right' : 'left' }}>
            <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <MedicalInformationIcon color="primary" />
              <Typography variant="overline" color="primary" fontWeight={900}>{isRtl ? 'إدارة النظام الصحي' : 'Health System Administration'}</Typography>
            </Stack>
            <Typography variant="h4" fontWeight="bold">{isRtl ? 'إدارة المستخدمين والهوية والصلاحيات' : 'Users, Identity & Access Management'}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {isRtl ? 'عرض بطاقات احترافية، منع التكرار عبر البريد ورقم الهوية/السجل والرقم الوظيفي ورقم الملف الطبي، وربط كامل مع Django/PostgreSQL.' : 'Professional cards with database persistence and duplicate prevention through email, National ID, employee number, and medical record number.'}
            </Typography>
          </Box>
          <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={1.5}>
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchUsers} disabled={loading}>{isRtl ? 'تحديث' : 'Refresh'}</Button>
            <Button variant="contained" size="large" startIcon={<AddIcon />} onClick={openAdd} sx={{ borderRadius: 3, px: 3 }}>{isRtl ? 'إضافة مستخدم' : 'Add User'}</Button>
          </Stack>
        </Stack>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}><Card sx={{ borderRadius: 3 }}><CardContent><Typography color="text.secondary">{isRtl ? 'إجمالي المستخدمين' : 'Total Users'}</Typography><Typography variant="h4" fontWeight="bold">{users.length}</Typography></CardContent></Card></Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}><Card sx={{ borderRadius: 3 }}><CardContent><Typography color="text.secondary">{isRtl ? 'الحسابات النشطة' : 'Active Accounts'}</Typography><Typography variant="h4" fontWeight="bold" color="success.main">{activeUsers}</Typography></CardContent></Card></Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}><Card sx={{ borderRadius: 3 }}><CardContent><Typography color="text.secondary">{isRtl ? 'الكادر الصحي' : 'Health Staff'}</Typography><Typography variant="h4" fontWeight="bold" color="primary.main">{healthStaff}</Typography></CardContent></Card></Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}><Card sx={{ borderRadius: 3 }}><CardContent><Typography color="text.secondary">{isRtl ? 'هويات غير مكتملة' : 'Missing Identity'}</Typography><Typography variant="h4" fontWeight="bold" color={incompleteIdentity ? 'warning.main' : 'success.main'}>{incompleteIdentity}</Typography></CardContent></Card></Grid>
      </Grid>

      <Paper sx={{ p: 2.5, mb: 3, borderRadius: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField fullWidth size="small" value={search} onChange={event => setSearch(event.target.value)} placeholder={isRtl ? 'بحث بالاسم، البريد، الهوية، الرقم الوظيفي، رقم الملف الطبي...' : 'Search name, email, ID, employee no., MRN...'} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }} />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <TextField fullWidth select size="small" label={isRtl ? 'نوع المستخدم' : 'User Type'} value={personTypeFilter} onChange={event => setPersonTypeFilter(event.target.value as PersonType | 'all')}>
              <MenuItem value="all">{isRtl ? 'كل الأنواع' : 'All Types'}</MenuItem>
              {personTypes.map(item => <MenuItem key={item.id} value={item.id}>{isRtl ? item.ar : item.en}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <TextField fullWidth select size="small" label={isRtl ? 'الدور' : 'Role'} value={roleFilter} onChange={event => setRoleFilter(event.target.value as UserRole | 'all')}>
              <MenuItem value="all">{isRtl ? 'كل الأدوار' : 'All Roles'}</MenuItem>
              {Object.values(ROLE_DEFINITIONS).map(role => <MenuItem key={role.id} value={role.id}>{isRtl ? role.nameAr : role.nameEn}</MenuItem>)}
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      <Grid container spacing={2.5}>
        {filteredUsers.map(target => (
          <Grid key={target.id} size={{ xs: 12, sm: 6, lg: 4 }}>
            <Card sx={{ height: '100%', borderRadius: 4, overflow: 'hidden', border: '1px solid', borderColor: 'divider', boxShadow: '0 18px 45px rgba(21,35,74,.10)', transition: 'transform .2s ease, box-shadow .2s ease', '&:hover': { transform: 'translateY(-6px)', boxShadow: '0 24px 60px rgba(21,35,74,.18)' } }}>
              <Box sx={{ p: 2.5, background: `linear-gradient(135deg, ${roleColor(target.role)} 0%, #667eea 100%)`, color: '#fff' }}>
                <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={2} alignItems="center" justifyContent="space-between">
                  <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center">
                    <Avatar sx={{ bgcolor: 'rgba(255,255,255,.22)', color: '#fff', fontWeight: 900, width: 54, height: 54 }}>{target.name?.charAt(0) || 'U'}</Avatar>
                    <Box sx={{ textAlign: isRtl ? 'right' : 'left' }}>
                      <Typography variant="h6" fontWeight={900}>{target.name}</Typography>
                      <Typography variant="caption" sx={{ opacity: .9 }}>{target.email}</Typography>
                    </Box>
                  </Stack>
                  <Chip label={target.isActive ? (isRtl ? 'نشط' : 'Active') : (isRtl ? 'معطل' : 'Inactive')} size="small" sx={{ bgcolor: target.isActive ? 'rgba(67,233,123,.95)' : 'rgba(255,107,107,.95)', color: '#fff', fontWeight: 800 }} />
                </Stack>
              </Box>
              <CardContent>
                <Stack spacing={1.3}>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    <RoleChip role={target.role} isRtl={isRtl} />
                    <Chip size="small" label={personTypeLabel(target.personType, isRtl)} variant="outlined" />
                  </Stack>
                  <Divider />
                  <Stack spacing={1}>
                    <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={1} alignItems="center"><FingerprintIcon fontSize="small" color="action" /><Typography variant="body2"><b>{getIdentityLabel(target, isRtl)}:</b> {maskIdentifier(fullIdentifier(target))}</Typography></Stack>
                    <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={1} alignItems="center"><WorkIcon fontSize="small" color="action" /><Typography variant="body2"><b>{isRtl ? 'الرقم الوظيفي' : 'Employee No.'}:</b> {target.employeeNumber || '-'}</Typography></Stack>
                    <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={1} alignItems="center"><MailIcon fontSize="small" color="action" /><Typography variant="body2" noWrap><b>{isRtl ? 'المركز' : 'Center'}:</b> {target.healthCenterName || '-'}</Typography></Stack>
                    <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={1} alignItems="center"><ShieldIcon fontSize="small" color="action" /><Typography variant="body2"><b>{isRtl ? 'الصلاحيات' : 'Permissions'}:</b> {ROLE_DEFINITIONS[target.role]?.permissions.length || 0}</Typography></Stack>
                  </Stack>
                  <Divider />
                  <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={1} justifyContent="space-between" alignItems="center">
                    <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={.75}>
                      <Tooltip title={isRtl ? 'عرض' : 'View'}><Button size="small" variant="outlined" startIcon={<VisibilityIcon />} onClick={() => openDetails(target)}>{isRtl ? 'عرض' : 'View'}</Button></Tooltip>
                      <Tooltip title={isRtl ? 'تعديل' : 'Edit'}><IconButton color="primary" onClick={() => openEdit(target)}><EditIcon /></IconButton></Tooltip>
                      <Tooltip title={isRtl ? 'الصلاحيات' : 'Permissions'}><IconButton color="secondary" onClick={() => openDetails(target)}><ShieldIcon /></IconButton></Tooltip>
                      <Tooltip title={isRtl ? 'إعادة كلمة المرور' : 'Reset Password'}><IconButton color="secondary" onClick={() => resetPassword(target)}><LockResetIcon /></IconButton></Tooltip>
                      <Tooltip title={isRtl ? 'حذف' : 'Delete'}><span><IconButton color="error" disabled={target.id === currentUser?.id} onClick={() => deleteUser(target)}><DeleteIcon /></IconButton></span></Tooltip>
                    </Stack>
                    <Switch checked={target.isActive} color="success" disabled={target.id === currentUser?.id} onChange={() => toggleStatus(target)} />
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {!loading && filteredUsers.length === 0 && <Alert severity="info" sx={{ mt: 2 }}>{isRtl ? 'لا توجد نتائج مطابقة.' : 'No matching users found.'}</Alert>}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{selectedUser ? (isRtl ? 'تعديل مستخدم' : 'Edit User') : (isRtl ? 'إضافة مستخدم جديد' : 'Add New User')}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3}>
            <Box>
              <Typography variant="subtitle1" fontWeight={900} sx={{ mb: 1 }}>{isRtl ? 'بيانات الحساب' : 'Account Details'}</Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label={isRtl ? 'البريد / اسم المستخدم' : 'Email / Username'} value={form.email || ''} onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))} /></Grid>
                <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label={isRtl ? 'الاسم الكامل' : 'Full Name'} value={form.name || ''} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} /></Grid>
                <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth select label={isRtl ? 'نوع المستخدم' : 'User Type'} value={form.personType || 'employee'} onChange={e => setForm(prev => ({ ...prev, personType: e.target.value as PersonType }))}>{personTypes.map(item => <MenuItem key={item.id} value={item.id}>{isRtl ? item.ar : item.en}</MenuItem>)}</TextField></Grid>
                <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth select label={isRtl ? 'الدور' : 'Role'} value={form.role || 'employee'} onChange={e => setForm(prev => ({ ...prev, role: e.target.value as UserRole }))}>{Object.values(ROLE_DEFINITIONS).map(role => <MenuItem key={role.id} value={role.id}>{isRtl ? role.nameAr : role.nameEn}</MenuItem>)}</TextField></Grid>
                <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth label={selectedUser ? (isRtl ? 'كلمة مرور جديدة اختيارية' : 'New password optional') : (isRtl ? 'كلمة المرور' : 'Password')} type="password" value={form.password || ''} onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))} /></Grid>
              </Grid>
            </Box>

            <Box>
              <Typography variant="subtitle1" fontWeight={900} sx={{ mb: 1 }}>{isRtl ? 'الهوية ومنع التكرار' : 'Identity & Duplicate Prevention'}</Typography>
              <Alert severity="info" sx={{ mb: 2 }}>{isRtl ? 'هذه الحقول فريدة في قاعدة البيانات: البريد، رقم الهوية/السجل، الرقم الوظيفي، رقم الملف الطبي.' : 'These fields are unique in the database: email, National ID, Employee No., and MRN.'}</Alert>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth label={isRtl ? 'رقم الهوية الوطنية / السجل' : 'National ID / Registry'} value={form.nationalId || ''} onChange={e => setForm(prev => ({ ...prev, nationalId: e.target.value }))} /></Grid>
                <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth label={isRtl ? 'الرقم الوظيفي' : 'Employee Number'} value={form.employeeNumber || ''} onChange={e => setForm(prev => ({ ...prev, employeeNumber: e.target.value }))} /></Grid>
                <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth label={isRtl ? 'رقم الملف الطبي MRN' : 'Medical Record Number'} value={form.medicalRecordNumber || ''} onChange={e => setForm(prev => ({ ...prev, medicalRecordNumber: e.target.value }))} /></Grid>
              </Grid>
            </Box>

            <Box>
              <Typography variant="subtitle1" fontWeight={900} sx={{ mb: 1 }}>{isRtl ? 'البيانات المهنية والصحية' : 'Professional / Healthcare Details'}</Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth select label={isRtl ? 'المركز الصحي' : 'Health Center'} value={form.healthCenterId || ''} onChange={e => setForm(prev => ({ ...prev, healthCenterId: e.target.value }))}><MenuItem value="">-</MenuItem>{healthCenters.map(center => <MenuItem key={center.id} value={center.id}>{isRtl ? (center.nameAr || center.name) : center.name}</MenuItem>)}</TextField></Grid>
                <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth label={isRtl ? 'القسم' : 'Department'} value={form.department || ''} onChange={e => setForm(prev => ({ ...prev, department: e.target.value }))} /></Grid>
                <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth label={isRtl ? 'المسمى الوظيفي' : 'Job Title'} value={form.jobTitle || ''} onChange={e => setForm(prev => ({ ...prev, jobTitle: e.target.value }))} /></Grid>
                <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth label={isRtl ? 'رقم الجوال' : 'Phone'} value={form.phone || ''} onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))} /></Grid>
                <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth label={isRtl ? 'التخصص' : 'Specialty'} value={form.specialty || ''} onChange={e => setForm(prev => ({ ...prev, specialty: e.target.value }))} /></Grid>
                <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth label={isRtl ? 'رقم الترخيص المهني' : 'License Number'} value={form.licenseNumber || ''} onChange={e => setForm(prev => ({ ...prev, licenseNumber: e.target.value }))} /></Grid>
              </Grid>
            </Box>

            <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={2} alignItems="center">
              <Switch checked={form.isActive ?? true} color="success" onChange={e => setForm(prev => ({ ...prev, isActive: e.target.checked }))} />
              <Typography>{isRtl ? 'حساب نشط' : 'Active account'}</Typography>
            </Stack>

            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Typography variant="subtitle2" fontWeight={900} sx={{ mb: 1 }}>{isRtl ? 'صلاحيات الدور المحدد' : 'Selected Role Permissions'}</Typography>
              <Stack spacing={1.25}>
                {permissionGroups.map(group => {
                  const perms = selectedRole.permissions.filter(permission => group.permissions.includes(permission));
                  if (!perms.length) return null;
                  return <Box key={group.titleEn}><Typography variant="caption" color="text.secondary">{isRtl ? group.titleAr : group.titleEn}</Typography><Stack direction="row" gap={.75} flexWrap="wrap" sx={{ mt: .5 }}>{perms.map(permission => <Chip key={permission} label={permission} size="small" />)}</Stack></Box>;
                })}
              </Stack>
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{isRtl ? 'إلغاء' : 'Cancel'}</Button>
          <Button variant="contained" onClick={saveUser}>{isRtl ? 'حفظ في قاعدة البيانات' : 'Save to Database'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{isRtl ? 'عرض بيانات المستخدم' : 'User Details'}</DialogTitle>
        <DialogContent dividers>
          {selectedUser && <Stack spacing={2}>
            <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={2} alignItems="center">
              <Avatar sx={{ width: 72, height: 72, bgcolor: roleColor(selectedUser.role), fontWeight: 900 }}>{selectedUser.name.charAt(0)}</Avatar>
              <Box sx={{ textAlign: isRtl ? 'right' : 'left' }}><Typography variant="h5" fontWeight={900}>{selectedUser.name}</Typography><Typography color="text.secondary">{selectedUser.email}</Typography><Stack direction="row" gap={1} sx={{ mt: 1 }}><RoleChip role={selectedUser.role} isRtl={isRtl} /><Chip label={personTypeLabel(selectedUser.personType, isRtl)} /></Stack></Box>
            </Stack>
            <Divider />
            <Grid container spacing={2}>
              {[
                [isRtl ? 'رقم الهوية/السجل' : 'National ID', maskIdentifier(selectedUser.nationalId)],
                [isRtl ? 'الرقم الوظيفي' : 'Employee No.', selectedUser.employeeNumber || '-'],
                [isRtl ? 'رقم الملف الطبي' : 'MRN', selectedUser.medicalRecordNumber || '-'],
                [isRtl ? 'المركز الصحي' : 'Health Center', selectedUser.healthCenterName || '-'],
                [isRtl ? 'القسم' : 'Department', selectedUser.department || '-'],
                [isRtl ? 'المسمى الوظيفي' : 'Job Title', selectedUser.jobTitle || '-'],
                [isRtl ? 'التخصص' : 'Specialty', selectedUser.specialty || '-'],
                [isRtl ? 'رقم الترخيص' : 'License No.', selectedUser.licenseNumber || '-'],
                [isRtl ? 'آخر دخول' : 'Last Login', selectedUser.lastLogin ? new Date(selectedUser.lastLogin).toLocaleString() : '-'],
              ].map(([label, value]) => <Grid key={label} size={{ xs: 12, md: 4 }}><Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={800}>{value}</Typography></Paper></Grid>)}
            </Grid>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Typography variant="subtitle2" fontWeight={900} sx={{ mb: 1 }}>{isRtl ? 'الصلاحيات' : 'Permissions'}</Typography>
              <Stack direction="row" flexWrap="wrap" gap={1}>{(ROLE_DEFINITIONS[selectedUser.role]?.permissions || []).map(permission => <Chip key={permission} icon={<ShieldIcon />} label={permission} size="small" />)}</Stack>
            </Paper>
          </Stack>}
        </DialogContent>
        <DialogActions><Button onClick={() => setDetailsOpen(false)}>{isRtl ? 'إغلاق' : 'Close'}</Button></DialogActions>
      </Dialog>

      <Snackbar open={toast.open} autoHideDuration={4200} onClose={() => setToast(prev => ({ ...prev, open: false }))}>
        <Alert severity={toast.severity} onClose={() => setToast(prev => ({ ...prev, open: false }))}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
}
