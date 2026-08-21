import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  Grid, InputAdornment, Switch, FormControlLabel, Tooltip, Alert,
  Tabs, Tab, Divider, Avatar,
} from '@mui/material';
import {
  PersonAdd as PersonAddIcon,
  Edit as EditIcon,
  Search as SearchIcon,
  Block as BlockIcon,
  CheckCircle as CheckCircleIcon,
  Shield as ShieldIcon,
  Visibility as VisibilityIcon,
  Lock as LockIcon,
  AdminPanelSettings as AdminIcon,
} from '@mui/icons-material';
import { MOCK_USERS_LIST, type User, useAuth } from '../context/AuthContext';
import { ROLE_DEFINITIONS, type UserRole, type RoleDefinition, PERMISSIONS, hasPermission } from '../data/roles';
import { mockHealthCenters } from '../data/mockData';

// ─── Role Badge ───────────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: UserRole }) {
  const def = ROLE_DEFINITIONS[role];
  return (
    <Chip
      label={def.nameAr}
      size="small"
      sx={{
        bgcolor: def.bgColor,
        color: def.color,
        fontWeight: 600,
        fontSize: '0.7rem',
      }}
    />
  );
}

// ─── Permission Row ────────────────────────────────────────────────────────────
function PermissionRow({ label, value }: { label: string; value: boolean }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      {value
        ? <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />
        : <BlockIcon sx={{ fontSize: 16, color: 'error.light' }} />
      }
    </Box>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export function UsersManagementPage() {
  const { i18n, t } = useTranslation();
  const { user: currentUser, can } = useAuth();
  const isRtl = i18n.language === 'ar';

  const [users, setUsers] = useState<User[]>(MOCK_USERS_LIST);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [tab, setTab] = useState(0);

  const [form, setForm] = useState<Partial<User & { password: string }>>({
    name: '', email: '', role: 'employee', healthCenterId: '', isActive: true,
  });

  const canManage = can(PERMISSIONS.MANAGE_USERS);

  const filtered = useMemo(() => users.filter(u => {
    const matchSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole;
  }), [users, search, roleFilter]);

  const openAdd = () => {
    setSelectedUser(null);
    setForm({ name: '', email: '', role: 'employee', healthCenterId: '', isActive: true, password: '' });
    setDialogOpen(true);
  };

  const openEdit = (user: User) => {
    setSelectedUser(user);
    setForm({ ...user, password: '' });
    setDialogOpen(true);
  };

  const openDetail = (user: User) => {
    setSelectedUser(user);
    setDetailOpen(true);
  };

  const handleSave = () => {
    if (!form.name || !form.email || !form.role) return;
    if (selectedUser) {
      setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, ...form } as User : u));
    } else {
      const newUser: User = {
        id: String(Date.now()),
        name: form.name!,
        email: form.email!,
        role: form.role as UserRole,
        healthCenterId: form.healthCenterId,
        isActive: form.isActive ?? true,
      };
      setUsers(prev => [...prev, newUser]);
    }
    setDialogOpen(false);
  };

  const toggleActive = (userId: string) => {
    if (userId === currentUser?.id) return; // Can't disable yourself
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, isActive: !u.isActive } : u));
  };

  const roleDef: RoleDefinition | null = selectedUser ? ROLE_DEFINITIONS[selectedUser.role] : null;

  const PERMISSION_GROUPS = [
    {
      label: 'الموظفون', items: [
        { label: 'عرض الموظفين', p: PERMISSIONS.VIEW_EMPLOYEES },
        { label: 'إنشاء موظف', p: PERMISSIONS.CREATE_EMPLOYEE },
        { label: 'تعديل موظف', p: PERMISSIONS.UPDATE_EMPLOYEE },
        { label: 'عرض البيانات الحساسة', p: PERMISSIONS.VIEW_SENSITIVE_DATA },
      ],
    },
    {
      label: 'المختبر', items: [
        { label: 'عرض التحاليل', p: PERMISSIONS.VIEW_LAB_TESTS },
        { label: 'طلب تحليل', p: PERMISSIONS.CREATE_LAB_REQUEST },
        { label: 'إدخال نتيجة', p: PERMISSIONS.UPDATE_LAB_RESULT },
        { label: 'اعتماد نتيجة', p: PERMISSIONS.APPROVE_LAB_RESULT },
      ],
    },
    {
      label: 'التطعيمات', items: [
        { label: 'عرض التطعيمات', p: PERMISSIONS.VIEW_VACCINATIONS },
        { label: 'تسجيل جرعة', p: PERMISSIONS.CREATE_VACCINATION },
        { label: 'تحديث التطعيم', p: PERMISSIONS.UPDATE_VACCINATION },
      ],
    },
    {
      label: 'إصابات الوخز', items: [
        { label: 'عرض الإصابات', p: PERMISSIONS.VIEW_NEEDLE_STICK },
        { label: 'تسجيل بلاغ', p: PERMISSIONS.CREATE_NEEDLE_STICK },
        { label: 'إغلاق الحالة', p: PERMISSIONS.CLOSE_NEEDLE_STICK },
      ],
    },
    {
      label: 'الهيئة الطبية', items: [
        { label: 'عرض الإحالات', p: PERMISSIONS.VIEW_COMMITTEE },
        { label: 'إنشاء إحالة', p: PERMISSIONS.CREATE_REFERRAL },
        { label: 'اعتماد القرار', p: PERMISSIONS.APPROVE_COMMITTEE_DECISION },
      ],
    },
    {
      label: 'التقارير', items: [
        { label: 'عرض التقارير', p: PERMISSIONS.VIEW_REPORTS },
        { label: 'تصدير التقارير', p: PERMISSIONS.EXPORT_REPORTS },
        { label: 'إنشاء تقرير', p: PERMISSIONS.CREATE_REPORT },
      ],
    },
    {
      label: 'إدارة النظام', items: [
        { label: 'إدارة المستخدمين', p: PERMISSIONS.MANAGE_USERS },
        { label: 'إدارة الإعدادات', p: PERMISSIONS.MANAGE_SETTINGS },
        { label: 'سجل العمليات', p: PERMISSIONS.VIEW_AUDIT_LOGS },
        { label: 'إعادة تعيين كلمة المرور', p: PERMISSIONS.RESET_PASSWORDS },
      ],
    },
  ];

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" gutterBottom>
            {isRtl ? 'إدارة المستخدمين والصلاحيات' : 'Users & Permissions'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {isRtl
              ? `${users.filter(u => u.isActive).length} مستخدم نشط من أصل ${users.length}`
              : `${users.filter(u => u.isActive).length} active of ${users.length} users`}
          </Typography>
        </Box>
        {canManage && (
          <Button
            variant="contained"
            startIcon={<PersonAddIcon />}
            onClick={openAdd}
            sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
          >
            {isRtl ? 'إضافة مستخدم' : 'Add User'}
          </Button>
        )}
      </Box>

      {/* Stats row */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: isRtl ? 'إجمالي المستخدمين' : 'Total Users', value: users.length, color: 'primary.main' },
          { label: isRtl ? 'نشط' : 'Active', value: users.filter(u => u.isActive).length, color: 'success.main' },
          { label: isRtl ? 'معطل' : 'Inactive', value: users.filter(u => !u.isActive).length, color: 'error.main' },
          { label: isRtl ? 'الأدوار' : 'Roles', value: Object.keys(ROLE_DEFINITIONS).length, color: 'secondary.main' },
        ].map(stat => (
          <Grid key={stat.label} size={{ xs: 6, md: 3 }}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4" fontWeight="bold" color={stat.color}>{stat.value}</Typography>
              <Typography variant="caption" color="text.secondary">{stat.label}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 5 }}>
            <TextField
              fullWidth
              size="small"
              placeholder={isRtl ? 'بحث بالاسم أو البريد...' : 'Search by name or email...'}
              value={search}
              onChange={e => setSearch(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
                },
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              size="small"
              select
              label={isRtl ? 'تصفية حسب الدور' : 'Filter by role'}
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value as UserRole | 'all')}
            >
              <MenuItem value="all">{isRtl ? 'جميع الأدوار' : 'All Roles'}</MenuItem>
              {Object.values(ROLE_DEFINITIONS).map(def => (
                <MenuItem key={def.id} value={def.id}>{def.nameAr}</MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      {!canManage && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {isRtl ? 'أنت في وضع العرض فقط. تحتاج صلاحية إدارة المستخدمين لإجراء تعديلات.' : 'View-only mode. You need manage:users permission to make changes.'}
        </Alert>
      )}

      {/* Users Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'المستخدم' : 'User'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'البريد الإلكتروني' : 'Email'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'الدور' : 'Role'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'المركز الصحي' : 'Health Center'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }} align="center">{isRtl ? 'الحالة' : 'Status'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }} align="center">{isRtl ? 'الإجراءات' : 'Actions'}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map(user => (
              <TableRow
                key={user.id}
                hover
                sx={{ opacity: user.isActive ? 1 : 0.55 }}
              >
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Avatar sx={{ width: 36, height: 36, bgcolor: ROLE_DEFINITIONS[user.role].bgColor, fontSize: '0.85rem' }}>
                      {user.name.charAt(0)}
                    </Avatar>
                    <Box>
                      <Typography variant="body2" fontWeight="medium">{user.name}</Typography>
                      <Typography variant="caption" color="text.secondary">ID: {user.id}</Typography>
                    </Box>
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{user.email}</Typography>
                </TableCell>
                <TableCell>
                  <RoleBadge role={user.role} />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {user.healthCenterId
                      ? mockHealthCenters.find(c => c.id === user.healthCenterId)?.name || user.healthCenterId
                      : '—'}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Chip
                    label={user.isActive ? (isRtl ? 'نشط' : 'Active') : (isRtl ? 'معطل' : 'Inactive')}
                    size="small"
                    color={user.isActive ? 'success' : 'default'}
                    variant={user.isActive ? 'filled' : 'outlined'}
                  />
                </TableCell>
                <TableCell align="center">
                  <Tooltip title={isRtl ? 'عرض الصلاحيات' : 'View Permissions'}>
                    <IconButton size="small" onClick={() => openDetail(user)}>
                      <ShieldIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  {canManage && (
                    <>
                      <Tooltip title={isRtl ? 'تعديل' : 'Edit'}>
                        <IconButton size="small" color="primary" onClick={() => openEdit(user)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={user.isActive ? (isRtl ? 'تعطيل الحساب' : 'Disable') : (isRtl ? 'تفعيل الحساب' : 'Enable')}>
                        <span>
                          <IconButton
                            size="small"
                            color={user.isActive ? 'error' : 'success'}
                            onClick={() => toggleActive(user.id)}
                            disabled={user.id === currentUser?.id}
                          >
                            {user.isActive ? <BlockIcon fontSize="small" /> : <CheckCircleIcon fontSize="small" />}
                          </IconButton>
                        </span>
                      </Tooltip>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* ── Add / Edit Dialog ────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AdminIcon color="primary" />
            <Typography variant="h6" component="span" fontWeight="bold">
              {selectedUser ? (isRtl ? 'تعديل المستخدم' : 'Edit User') : (isRtl ? 'إضافة مستخدم جديد' : 'Add New User')}
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label={isRtl ? 'الاسم الكامل' : 'Full Name'}
                value={form.name || ''}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label={isRtl ? 'البريد الإلكتروني' : 'Email'}
                type="email"
                value={form.email || ''}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                required
                disabled={!!selectedUser}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                select
                label={isRtl ? 'الدور الوظيفي' : 'Role'}
                value={form.role || 'employee'}
                onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}
                required
              >
                {Object.values(ROLE_DEFINITIONS).map(def => (
                  <MenuItem key={def.id} value={def.id}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: def.bgColor }} />
                      {def.nameAr}
                    </Box>
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                select
                label={isRtl ? 'المركز الصحي' : 'Health Center'}
                value={form.healthCenterId || ''}
                onChange={e => setForm(f => ({ ...f, healthCenterId: e.target.value }))}
              >
                <MenuItem value="">{isRtl ? 'غير محدد' : 'Not assigned'}</MenuItem>
                {mockHealthCenters.map(c => (
                  <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label={selectedUser ? (isRtl ? 'كلمة مرور جديدة (اتركها فارغة للإبقاء على الحالية)' : 'New password (leave blank to keep current)') : (isRtl ? 'كلمة المرور' : 'Password')}
                type="password"
                value={form.password || ''}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                slotProps={{
                  input: { startAdornment: <InputAdornment position="start"><LockIcon fontSize="small" /></InputAdornment> },
                }}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={form.isActive ?? true}
                    onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                    color="success"
                  />
                }
                label={isRtl ? 'الحساب نشط' : 'Account Active'}
              />
            </Grid>

            {/* Preview of selected role permissions */}
            {form.role && (
              <Grid size={{ xs: 12 }}>
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                    {isRtl ? 'معاينة صلاحيات الدور المختار:' : 'Selected role permissions preview:'}
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {ROLE_DEFINITIONS[form.role as UserRole]?.permissions.slice(0, 8).map(p => (
                      <Chip key={p} label={p.replace(':', ': ')} size="small" variant="outlined" sx={{ fontSize: '0.65rem' }} />
                    ))}
                    {(ROLE_DEFINITIONS[form.role as UserRole]?.permissions.length ?? 0) > 8 && (
                      <Chip label={`+${(ROLE_DEFINITIONS[form.role as UserRole]?.permissions.length ?? 0) - 8} ${isRtl ? 'أخرى' : 'more'}`} size="small" color="primary" />
                    )}
                  </Box>
                </Paper>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{isRtl ? 'إلغاء' : 'Cancel'}</Button>
          <Button variant="contained" onClick={handleSave}>{isRtl ? 'حفظ' : 'Save'}</Button>
        </DialogActions>
      </Dialog>

      {/* ── Permission Detail Dialog ─────────────────────────────────────────── */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="md" fullWidth>
        {selectedUser && roleDef && (
          <>
            <DialogTitle>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Avatar sx={{ bgcolor: roleDef.bgColor, color: roleDef.color }}>
                  <ShieldIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6" component="span" fontWeight="bold">{selectedUser.name}</Typography>
                  <Box sx={{ mt: 0.5 }}><RoleBadge role={selectedUser.role} /></Box>
                </Box>
              </Box>
            </DialogTitle>
            <DialogContent dividers>
              <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
                <Tab label={isRtl ? 'الصلاحيات التفصيلية' : 'Detailed Permissions'} />
                <Tab label={isRtl ? 'معلومات الدور' : 'Role Info'} />
              </Tabs>

              {tab === 0 && (
                <Grid container spacing={2}>
                  {PERMISSION_GROUPS.map(group => (
                    <Grid key={group.label} size={{ xs: 12, sm: 6, md: 4 }}>
                      <Paper variant="outlined" sx={{ p: 1.5, height: '100%' }}>
                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>{group.label}</Typography>
                        <Divider sx={{ mb: 1 }} />
                        {group.items.map(item => (
                          <PermissionRow
                            key={item.p}
                            label={item.label}
                            value={hasPermission(selectedUser.role, item.p)}
                          />
                        ))}
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              )}

              {tab === 1 && (
                <Box>
                  <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                    <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                      {isRtl ? 'الصلاحيات الممنوحة لهذا الدور' : 'Granted Permissions'}
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                      {roleDef.permissions.map(p => (
                        <Chip
                          key={p}
                          label={p}
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ fontSize: '0.65rem' }}
                        />
                      ))}
                    </Box>
                  </Paper>
                  <Alert severity="info" icon={<VisibilityIcon />}>
                    {isRtl
                      ? `هذا الدور يملك ${roleDef.permissions.length} صلاحية من أصل ${Object.values(PERMISSIONS).length} صلاحية متاحة في النظام.`
                      : `This role has ${roleDef.permissions.length} of ${Object.values(PERMISSIONS).length} system permissions.`}
                  </Alert>
                </Box>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDetailOpen(false)}>{isRtl ? 'إغلاق' : 'Close'}</Button>
              {canManage && (
                <Button variant="outlined" startIcon={<EditIcon />} onClick={() => { setDetailOpen(false); openEdit(selectedUser); }}>
                  {isRtl ? 'تعديل' : 'Edit'}
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}
