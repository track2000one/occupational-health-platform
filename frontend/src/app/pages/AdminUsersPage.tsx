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
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Switch,
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
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  LockReset as LockResetIcon,
  ManageAccounts as ManageAccountsIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Shield as ShieldIcon,
  VerifiedUser as VerifiedUserIcon,
} from '@mui/icons-material';
import { getAccessToken, type User, useAuth } from '../context/AuthContext';
import { PERMISSIONS, ROLE_DEFINITIONS, type Permission, type UserRole } from '../data/roles';
import { mockHealthCenters } from '../data/mockData';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/$/, '');

interface HealthCenterOption {
  id: string;
  name: string;
  nameAr?: string;
}

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

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('لا يوجد رمز دخول من Django. سجّل الدخول مرة أخرى من الواجهة بعد إعادة نشر الـ Backend.');
  }

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
  if (!response.ok) {
    const message = body.detail || body.email || body.password || body.name || body.role || body.healthCenterId || 'تعذر تنفيذ العملية على قاعدة البيانات';
    throw new Error(Array.isArray(message) ? message.join(', ') : String(message));
  }
  return body as T;
}

function normalizeUser(user: any): User {
  return {
    id: String(user.id),
    name: user.name || user.username || user.email,
    email: user.email,
    role: user.role || 'employee',
    healthCenterId: user.healthCenterId || '',
    healthCenterName: user.healthCenterName || '',
    isActive: user.isActive ?? true,
    isStaff: user.isStaff,
    isSuperuser: user.isSuperuser,
    lastLogin: user.lastLogin,
    permissions: user.permissions || [],
  };
}

function normalizeHealthCenter(center: any): HealthCenterOption {
  return {
    id: String(center.id),
    name: center.name || center.nameAr || '-',
    nameAr: center.nameAr || center.name,
  };
}

function roleLabel(role: UserRole, isRtl: boolean) {
  const def = ROLE_DEFINITIONS[role] || ROLE_DEFINITIONS.employee;
  return isRtl ? def.nameAr : def.nameEn;
}

function RoleChip({ role, isRtl }: { role: UserRole; isRtl: boolean }) {
  const def = ROLE_DEFINITIONS[role] || ROLE_DEFINITIONS.employee;
  return <Chip size="small" label={roleLabel(role, isRtl)} sx={{ bgcolor: def.bgColor, color: def.color, fontWeight: 700 }} />;
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [form, setForm] = useState<Partial<User & { password: string }>>({ name: '', email: '', role: 'employee', healthCenterId: '', isActive: true, password: '' });
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' as 'success' | 'info' | 'warning' | 'error' });

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const [usersPayload, centersPayload] = await Promise.all([
        apiRequest<any>('/users/'),
        apiRequest<any>('/health-centers/'),
      ]);
      setUsers(normalizeList<any>(usersPayload).map(normalizeUser));
      const apiCenters = normalizeList<any>(centersPayload).map(normalizeHealthCenter);
      if (apiCenters.length) setHealthCenters(apiCenters);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الاتصال بقاعدة البيانات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filteredUsers = useMemo(() => users.filter(user => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || user.name.toLowerCase().includes(q) || user.email.toLowerCase().includes(q) || roleLabel(user.role, isRtl).toLowerCase().includes(q);
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  }), [users, search, roleFilter, isRtl]);

  const selectedRole = form.role ? ROLE_DEFINITIONS[form.role as UserRole] : ROLE_DEFINITIONS.employee;
  const activeUsers = users.filter(u => u.isActive).length;
  const adminUsers = users.filter(u => ROLE_DEFINITIONS[u.role]?.permissions.includes(PERMISSIONS.MANAGE_USERS)).length;

  const openAdd = () => {
    setSelectedUser(null);
    setForm({ name: '', email: '', role: 'employee', healthCenterId: '', isActive: true, password: '' });
    setDialogOpen(true);
  };

  const openEdit = (target: User) => {
    setSelectedUser(target);
    setForm({ ...target, password: '' });
    setDialogOpen(true);
  };

  const saveUser = async () => {
    if (!form.name || !form.email || !form.role) {
      setToast({ open: true, severity: 'error', message: isRtl ? 'الاسم والبريد والدور حقول إلزامية' : 'Name, email, and role are required' });
      return;
    }

    try {
      const payload: any = {
        name: form.name,
        email: form.email,
        role: form.role,
        healthCenterId: form.healthCenterId || '',
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
      setToast({
        open: true,
        severity: target.isActive ? 'warning' : 'success',
        message: target.isActive ? (isRtl ? 'تم تعطيل الحساب في قاعدة البيانات' : 'Account disabled in database') : (isRtl ? 'تم تفعيل الحساب في قاعدة البيانات' : 'Account enabled in database'),
      });
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
      setToast({ open: true, severity: 'info', message: isRtl ? 'تم تحديث كلمة المرور في قاعدة البيانات' : 'Password updated in database' });
    } catch (err) {
      setToast({ open: true, severity: 'error', message: err instanceof Error ? err.message : 'تعذر تحديث كلمة المرور' });
    }
  };

  const deleteUser = async (target: User) => {
    if (target.id === currentUser?.id) return;
    const confirmed = window.confirm(isRtl ? `هل تريد حذف المستخدم ${target.name} نهائيًا من قاعدة البيانات؟` : `Delete user ${target.name} from database?`);
    if (!confirmed) return;
    try {
      await apiRequest(`/users/${target.id}/`, { method: 'DELETE' });
      setToast({ open: true, severity: 'success', message: isRtl ? 'تم حذف المستخدم من قاعدة البيانات' : 'User deleted from database' });
      await fetchUsers();
    } catch (err) {
      setToast({ open: true, severity: 'error', message: err instanceof Error ? err.message : 'تعذر حذف المستخدم' });
    }
  };

  const centerLabel = (user: User) => {
    if (user.healthCenterName) return user.healthCenterName;
    const center = healthCenters.find(c => c.id === user.healthCenterId);
    return isRtl ? center?.nameAr || center?.name || '-' : center?.name || '-';
  };

  return (
    <Box>
      <Paper sx={{ p: 3, mb: 3, background: 'linear-gradient(135deg, #f8fbff 0%, #eef4ff 100%)', border: '1px solid', borderColor: 'divider' }}>
        <Stack direction={{ xs: 'column', md: isRtl ? 'row-reverse' : 'row' }} justifyContent="space-between" spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
          <Box sx={{ textAlign: isRtl ? 'right' : 'left' }}>
            <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <ManageAccountsIcon color="primary" />
              <Typography variant="overline" color="primary" fontWeight={800}>{isRtl ? 'إدارة النظام' : 'System Administration'}</Typography>
            </Stack>
            <Typography variant="h4" fontWeight="bold">{isRtl ? 'إدارة المستخدمين والصلاحيات' : 'Users & Access Management'}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {isRtl ? 'البيانات مرتبطة الآن بـ Django/PostgreSQL؛ أي إضافة أو تعديل أو حذف يتم حفظه في قاعدة البيانات.' : 'This page is now connected to Django/PostgreSQL; create, update, and delete operations persist in the database.'}
            </Typography>
          </Box>
          <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={1.5}>
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchUsers} disabled={loading}>{isRtl ? 'تحديث' : 'Refresh'}</Button>
            <Button variant="contained" size="large" startIcon={<AddIcon />} onClick={openAdd} sx={{ borderRadius: 2, px: 3 }}>
              {isRtl ? 'إضافة مستخدم' : 'Add User'}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 4 }}><Card><CardContent><Typography color="text.secondary">{isRtl ? 'إجمالي المستخدمين' : 'Total Users'}</Typography><Typography variant="h4" fontWeight="bold">{users.length}</Typography></CardContent></Card></Grid>
        <Grid size={{ xs: 12, md: 4 }}><Card><CardContent><Typography color="text.secondary">{isRtl ? 'الحسابات النشطة' : 'Active Accounts'}</Typography><Typography variant="h4" fontWeight="bold" color="success.main">{activeUsers}</Typography></CardContent></Card></Grid>
        <Grid size={{ xs: 12, md: 4 }}><Card><CardContent><Typography color="text.secondary">{isRtl ? 'حسابات بصلاحيات إدارية' : 'Privileged Accounts'}</Typography><Typography variant="h4" fontWeight="bold" color="primary.main">{adminUsers}</Typography></CardContent></Card></Grid>
      </Grid>

      <Paper sx={{ p: 2.5, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, md: 7 }}>
            <TextField fullWidth size="small" value={search} onChange={event => setSearch(event.target.value)} placeholder={isRtl ? 'بحث بالاسم أو البريد أو الدور...' : 'Search by name, email, or role...'} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }} />
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <TextField fullWidth select size="small" label={isRtl ? 'تصفية حسب الدور' : 'Filter by role'} value={roleFilter} onChange={event => setRoleFilter(event.target.value as UserRole | 'all')}>
              <MenuItem value="all">{isRtl ? 'كل الأدوار' : 'All Roles'}</MenuItem>
              {Object.values(ROLE_DEFINITIONS).map(role => <MenuItem key={role.id} value={role.id}>{isRtl ? role.nameAr : role.nameEn}</MenuItem>)}
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>{isRtl ? 'المستخدم' : 'User'}</TableCell>
              <TableCell>{isRtl ? 'الدور' : 'Role'}</TableCell>
              <TableCell>{isRtl ? 'المركز الصحي' : 'Health Center'}</TableCell>
              <TableCell>{isRtl ? 'الصلاحيات' : 'Permissions'}</TableCell>
              <TableCell>{isRtl ? 'الحالة' : 'Status'}</TableCell>
              <TableCell align="center">{isRtl ? 'الإجراءات' : 'Actions'}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredUsers.map(target => (
              <TableRow key={target.id} hover>
                <TableCell>
                  <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={1.25} alignItems="center">
                    <Avatar sx={{ bgcolor: ROLE_DEFINITIONS[target.role]?.bgColor || '#ECEFF1', color: ROLE_DEFINITIONS[target.role]?.color || '#333' }}>{target.name.charAt(0)}</Avatar>
                    <Box sx={{ textAlign: isRtl ? 'right' : 'left' }}>
                      <Typography variant="body2" fontWeight={700}>{target.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{target.email}</Typography>
                    </Box>
                  </Stack>
                </TableCell>
                <TableCell><RoleChip role={target.role} isRtl={isRtl} /></TableCell>
                <TableCell>{centerLabel(target)}</TableCell>
                <TableCell><Chip icon={<ShieldIcon />} label={ROLE_DEFINITIONS[target.role]?.permissions.length || target.permissions?.length || 0} size="small" variant="outlined" /></TableCell>
                <TableCell><Switch checked={Boolean(target.isActive)} color="success" disabled={target.id === currentUser?.id} onChange={() => toggleStatus(target)} /></TableCell>
                <TableCell align="center">
                  <Tooltip title={isRtl ? 'تعديل' : 'Edit'}><IconButton color="primary" onClick={() => openEdit(target)}><EditIcon /></IconButton></Tooltip>
                  <Tooltip title={isRtl ? 'إعادة تعيين كلمة المرور' : 'Reset Password'}><IconButton color="secondary" onClick={() => resetPassword(target)}><LockResetIcon /></IconButton></Tooltip>
                  <Tooltip title={target.id === currentUser?.id ? (isRtl ? 'لا يمكن حذف حسابك الحالي' : 'You cannot delete your current account') : (isRtl ? 'حذف' : 'Delete')}>
                    <span><IconButton color="error" disabled={target.id === currentUser?.id} onClick={() => deleteUser(target)}><DeleteIcon /></IconButton></span>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={1} alignItems="center">
            <VerifiedUserIcon color="primary" />
            <Typography variant="h6" fontWeight="bold">{selectedUser ? (isRtl ? 'تعديل مستخدم' : 'Edit User') : (isRtl ? 'إضافة مستخدم جديد' : 'Add New User')}</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2.25}>
            <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label={isRtl ? 'الاسم الكامل' : 'Full Name'} value={form.name || ''} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label={isRtl ? 'البريد الإلكتروني / اسم المستخدم' : 'Email / Username'} value={form.email || ''} onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth select label={isRtl ? 'الدور' : 'Role'} value={form.role || 'employee'} onChange={e => setForm(prev => ({ ...prev, role: e.target.value as UserRole }))}>{Object.values(ROLE_DEFINITIONS).map(role => <MenuItem key={role.id} value={role.id}>{isRtl ? role.nameAr : role.nameEn}</MenuItem>)}</TextField></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth select label={isRtl ? 'المركز الصحي' : 'Health Center'} value={form.healthCenterId || ''} onChange={e => setForm(prev => ({ ...prev, healthCenterId: e.target.value }))}><MenuItem value="">{isRtl ? 'بدون مركز' : 'No center'}</MenuItem>{healthCenters.map(center => <MenuItem key={center.id} value={center.id}>{isRtl ? center.nameAr || center.name : center.name}</MenuItem>)}</TextField></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth type="password" label={selectedUser ? (isRtl ? 'كلمة مرور جديدة - اختياري' : 'New password - optional') : (isRtl ? 'كلمة المرور' : 'Password')} value={form.password || ''} onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><Stack direction={isRtl ? 'row-reverse' : 'row'} alignItems="center" spacing={1} sx={{ height: '100%' }}><Typography>{isRtl ? 'الحساب نشط' : 'Active account'}</Typography><Switch checked={form.isActive ?? true} onChange={e => setForm(prev => ({ ...prev, isActive: e.target.checked }))} color="success" /></Stack></Grid>
            <Grid size={{ xs: 12 }}>
              <Paper variant="outlined" sx={{ p: 2, bgcolor: '#fafafa' }}>
                <Typography fontWeight={700} sx={{ mb: 1 }}>{isRtl ? 'صلاحيات الدور المحدد' : 'Selected role permissions'}</Typography>
                <Grid container spacing={1.5}>
                  {permissionGroups.map(group => (
                    <Grid key={group.titleEn} size={{ xs: 12, md: 6 }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={700}>{isRtl ? group.titleAr : group.titleEn}</Typography>
                      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                        {group.permissions.map(permission => <Chip key={permission} size="small" label={permission} color={selectedRole.permissions.includes(permission) ? 'primary' : 'default'} variant={selectedRole.permissions.includes(permission) ? 'filled' : 'outlined'} />)}
                      </Stack>
                    </Grid>
                  ))}
                </Grid>
              </Paper>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDialogOpen(false)}>{isRtl ? 'إلغاء' : 'Cancel'}</Button>
          <Button variant="contained" onClick={saveUser}>{isRtl ? 'حفظ في قاعدة البيانات' : 'Save to Database'}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={toast.open} autoHideDuration={4000} onClose={() => setToast(prev => ({ ...prev, open: false }))}>
        <Alert severity={toast.severity} onClose={() => setToast(prev => ({ ...prev, open: false }))}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
}
