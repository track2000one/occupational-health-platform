import { useMemo, useState } from 'react';
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
  Lock as LockIcon,
  LockReset as LockResetIcon,
  ManageAccounts as ManageAccountsIcon,
  Search as SearchIcon,
  Shield as ShieldIcon,
  VerifiedUser as VerifiedUserIcon,
} from '@mui/icons-material';
import { MOCK_USERS_LIST, type User, useAuth } from '../context/AuthContext';
import { PERMISSIONS, ROLE_DEFINITIONS, type Permission, type UserRole } from '../data/roles';
import { mockHealthCenters } from '../data/mockData';

const permissionGroups: { titleAr: string; titleEn: string; permissions: Permission[] }[] = [
  { titleAr: 'إدارة الموظفين', titleEn: 'Employees', permissions: [PERMISSIONS.VIEW_EMPLOYEES, PERMISSIONS.CREATE_EMPLOYEE, PERMISSIONS.UPDATE_EMPLOYEE, PERMISSIONS.DELETE_EMPLOYEE] },
  { titleAr: 'البيانات الطبية الحساسة', titleEn: 'Sensitive Health Data', permissions: [PERMISSIONS.VIEW_SENSITIVE_DATA, PERMISSIONS.VIEW_LAB_TESTS, PERMISSIONS.UPDATE_LAB_RESULT, PERMISSIONS.APPROVE_LAB_RESULT] },
  { titleAr: 'التطعيمات والعيادات', titleEn: 'Vaccinations & Clinics', permissions: [PERMISSIONS.VIEW_VACCINATIONS, PERMISSIONS.CREATE_VACCINATION, PERMISSIONS.VIEW_CLINIC_VISITS, PERMISSIONS.CREATE_CLINIC_VISIT] },
  { titleAr: 'إدارة النظام', titleEn: 'System Administration', permissions: [PERMISSIONS.MANAGE_USERS, PERMISSIONS.MANAGE_ROLES, PERMISSIONS.MANAGE_SETTINGS, PERMISSIONS.VIEW_AUDIT_LOGS, PERMISSIONS.RESET_PASSWORDS] },
];

function roleLabel(role: UserRole, isRtl: boolean) {
  const def = ROLE_DEFINITIONS[role];
  return isRtl ? def.nameAr : def.nameEn;
}

function RoleChip({ role, isRtl }: { role: UserRole; isRtl: boolean }) {
  const def = ROLE_DEFINITIONS[role];
  return <Chip size="small" label={roleLabel(role, isRtl)} sx={{ bgcolor: def.bgColor, color: def.color, fontWeight: 700 }} />;
}

export function AdminUsersPage() {
  const { i18n } = useTranslation();
  const { user: currentUser } = useAuth();
  const isRtl = i18n.language === 'ar';

  const [users, setUsers] = useState<User[]>(MOCK_USERS_LIST);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [form, setForm] = useState<Partial<User & { password: string }>>({ name: '', email: '', role: 'employee', healthCenterId: '', isActive: true, password: '' });
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' as 'success' | 'info' | 'warning' | 'error' });

  const filteredUsers = useMemo(() => users.filter(user => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || user.name.toLowerCase().includes(q) || user.email.toLowerCase().includes(q) || roleLabel(user.role, isRtl).toLowerCase().includes(q);
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  }), [users, search, roleFilter, isRtl]);

  const selectedRole = form.role ? ROLE_DEFINITIONS[form.role as UserRole] : ROLE_DEFINITIONS.employee;
  const activeUsers = users.filter(u => u.isActive).length;
  const adminUsers = users.filter(u => ROLE_DEFINITIONS[u.role].permissions.includes(PERMISSIONS.MANAGE_USERS)).length;

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

  const saveUser = () => {
    if (!form.name || !form.email || !form.role) {
      setToast({ open: true, severity: 'error', message: isRtl ? 'الاسم والبريد والدور حقول إلزامية' : 'Name, email, and role are required' });
      return;
    }

    if (selectedUser) {
      setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, ...form, role: form.role as UserRole, isActive: form.isActive ?? true } as User : u));
      setToast({ open: true, severity: 'success', message: isRtl ? 'تم تحديث بيانات المستخدم' : 'User has been updated' });
    } else {
      const newUser: User = {
        id: String(Date.now()),
        name: form.name,
        email: form.email,
        role: form.role as UserRole,
        healthCenterId: form.healthCenterId || undefined,
        isActive: form.isActive ?? true,
      };
      setUsers(prev => [newUser, ...prev]);
      setToast({ open: true, severity: 'success', message: isRtl ? 'تمت إضافة المستخدم' : 'User has been created' });
    }
    setDialogOpen(false);
  };

  const toggleStatus = (target: User) => {
    if (target.id === currentUser?.id) return;
    setUsers(prev => prev.map(u => u.id === target.id ? { ...u, isActive: !u.isActive } : u));
    setToast({
      open: true,
      severity: target.isActive ? 'warning' : 'success',
      message: target.isActive ? (isRtl ? 'تم تعطيل الحساب' : 'Account has been disabled') : (isRtl ? 'تم تفعيل الحساب' : 'Account has been enabled'),
    });
  };

  const resetPassword = (target: User) => {
    setToast({ open: true, severity: 'info', message: isRtl ? `تم تجهيز إعادة تعيين كلمة المرور لـ ${target.name}` : `Password reset prepared for ${target.name}` });
  };

  const deleteUser = (target: User) => {
    if (target.id === currentUser?.id) return;
    const confirmed = window.confirm(isRtl ? `هل تريد حذف المستخدم ${target.name}؟` : `Delete user ${target.name}?`);
    if (!confirmed) return;
    setUsers(prev => prev.filter(u => u.id !== target.id));
    setToast({ open: true, severity: 'success', message: isRtl ? 'تم حذف المستخدم' : 'User has been deleted' });
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
              {isRtl ? 'إضافة المستخدمين، تعديل بياناتهم، تعطيل الحسابات، حذف المستخدمين، وربط كل مستخدم بدور وصلاحيات محددة.' : 'Create users, update profiles, disable accounts, delete users, and assign each user to a controlled role.'}
            </Typography>
          </Box>
          <Button variant="contained" size="large" startIcon={<AddIcon />} onClick={openAdd} sx={{ borderRadius: 2, px: 3 }}>
            {isRtl ? 'إضافة مستخدم' : 'Add User'}
          </Button>
        </Stack>
      </Paper>

      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 4 }}><Card><CardContent><Typography color="text.secondary">{isRtl ? 'إجمالي المستخدمين' : 'Total Users'}</Typography><Typography variant="h4" fontWeight="bold">{users.length}</Typography></CardContent></Card></Grid>
        <Grid size={{ xs: 12, md: 4 }}><Card><CardContent><Typography color="text.secondary">{isRtl ? 'الحسابات النشطة' : 'Active Accounts'}</Typography><Typography variant="h4" fontWeight="bold" color="success.main">{activeUsers}</Typography></CardContent></Card></Grid>
        <Grid size={{ xs: 12, md: 4 }}><Card><CardContent><Typography color="text.secondary">{isRtl ? 'حسابات بصلاحيات إدارية' : 'Privileged Accounts'}</Typography><Typography variant="h4" fontWeight="bold" color="primary.main">{adminUsers}</Typography></CardContent></Card></Grid>
      </Grid>

      <Paper sx={{ p: 2.5, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, md: 7 }}>
            <TextField
              fullWidth
              size="small"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder={isRtl ? 'بحث بالاسم أو البريد أو الدور...' : 'Search by name, email, or role...'}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
            />
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
            {filteredUsers.map(target => {
              const center = mockHealthCenters.find(c => c.id === target.healthCenterId);
              return (
                <TableRow key={target.id} hover>
                  <TableCell>
                    <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={1.25} alignItems="center">
                      <Avatar sx={{ bgcolor: ROLE_DEFINITIONS[target.role].bgColor, color: ROLE_DEFINITIONS[target.role].color }}>{target.name.charAt(0)}</Avatar>
                      <Box sx={{ textAlign: isRtl ? 'right' : 'left' }}>
                        <Typography variant="body2" fontWeight={700}>{target.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{target.email}</Typography>
                      </Box>
                    </Stack>
                  </TableCell>
                  <TableCell><RoleChip role={target.role} isRtl={isRtl} /></TableCell>
                  <TableCell>{center?.nameAr || center?.name || '-'}</TableCell>
                  <TableCell><Chip icon={<ShieldIcon />} label={ROLE_DEFINITIONS[target.role].permissions.length} size="small" variant="outlined" /></TableCell>
                  <TableCell><Switch checked={target.isActive} color="success" disabled={target.id === currentUser?.id} onChange={() => toggleStatus(target)} /></TableCell>
                  <TableCell align="center">
                    <Tooltip title={isRtl ? 'تعديل' : 'Edit'}><IconButton color="primary" onClick={() => openEdit(target)}><EditIcon /></IconButton></Tooltip>
                    <Tooltip title={isRtl ? 'إعادة تعيين كلمة المرور' : 'Reset Password'}><IconButton color="secondary" onClick={() => resetPassword(target)}><LockResetIcon /></IconButton></Tooltip>
                    <Tooltip title={target.id === currentUser?.id ? (isRtl ? 'لا يمكن حذف حسابك الحالي' : 'You cannot delete your current account') : (isRtl ? 'حذف' : 'Delete')}>
                      <span><IconButton color="error" disabled={target.id === currentUser?.id} onClick={() => deleteUser(target)}><DeleteIcon /></IconButton></span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
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
            <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label={isRtl ? 'البريد الإلكتروني' : 'Email'} value={form.email || ''} disabled={!!selectedUser} onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth select label={isRtl ? 'الدور والصلاحية' : 'Role & Permission'} value={form.role || 'employee'} onChange={e => setForm(prev => ({ ...prev, role: e.target.value as UserRole }))}>
                {Object.values(ROLE_DEFINITIONS).map(role => <MenuItem key={role.id} value={role.id}>{isRtl ? role.nameAr : role.nameEn}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth select label={isRtl ? 'المركز الصحي' : 'Health Center'} value={form.healthCenterId || ''} onChange={e => setForm(prev => ({ ...prev, healthCenterId: e.target.value }))}>
                <MenuItem value="">{isRtl ? 'غير محدد' : 'Not Assigned'}</MenuItem>
                {mockHealthCenters.map(center => <MenuItem key={center.id} value={center.id}>{center.nameAr || center.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth type="password" label={selectedUser ? (isRtl ? 'كلمة مرور جديدة - اختياري' : 'New password - optional') : (isRtl ? 'كلمة المرور' : 'Password')} value={form.password || ''} onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))} InputProps={{ startAdornment: <InputAdornment position="start"><LockIcon /></InputAdornment> }} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><Stack direction={isRtl ? 'row-reverse' : 'row'} alignItems="center" spacing={1} sx={{ height: '100%' }}><Switch checked={form.isActive ?? true} onChange={e => setForm(prev => ({ ...prev, isActive: e.target.checked }))} color="success" /><Typography>{isRtl ? 'الحساب نشط' : 'Account Active'}</Typography></Stack></Grid>
            <Grid size={{ xs: 12 }}>
              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
                <Stack direction={isRtl ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="subtitle2" fontWeight="bold">{isRtl ? 'معاينة الصلاحيات الممنوحة' : 'Granted Permissions Preview'}</Typography>
                  <RoleChip role={selectedRole.id} isRtl={isRtl} />
                </Stack>
                <Divider sx={{ mb: 1.5 }} />
                <Grid container spacing={1.25}>
                  {permissionGroups.map(group => (
                    <Grid key={group.titleEn} size={{ xs: 12, md: 6 }}>
                      <Typography variant="caption" fontWeight={800} color="text.secondary">{isRtl ? group.titleAr : group.titleEn}</Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
                        {group.permissions.map(permission => {
                          const granted = selectedRole.permissions.includes(permission);
                          return <Chip key={permission} size="small" color={granted ? 'success' : 'default'} variant={granted ? 'filled' : 'outlined'} label={permission} sx={{ fontSize: '0.65rem' }} />;
                        })}
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              </Paper>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{isRtl ? 'إلغاء' : 'Cancel'}</Button>
          <Button variant="contained" onClick={saveUser}>{isRtl ? 'حفظ' : 'Save'}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={toast.open} autoHideDuration={3500} onClose={() => setToast(prev => ({ ...prev, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: isRtl ? 'left' : 'right' }}>
        <Alert severity={toast.severity} variant="filled" onClose={() => setToast(prev => ({ ...prev, open: false }))}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
}
