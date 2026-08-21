import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  Divider,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Avatar,
  Stack,
} from '@mui/material';
import {
  AdminPanelSettings as AdminPanelSettingsIcon,
  People as PeopleIcon,
  Shield as ShieldIcon,
  Security as SecurityIcon,
  Settings as SettingsIcon,
  Domain as DomainIcon,
  FactCheck as FactCheckIcon,
  Storage as StorageIcon,
  ManageAccounts as ManageAccountsIcon,
  TrendingUp as TrendingUpIcon,
  WarningAmber as WarningAmberIcon,
} from '@mui/icons-material';
import { MOCK_USERS_LIST } from '../context/AuthContext';
import { PERMISSIONS, ROLE_DEFINITIONS } from '../data/roles';
import { mockEmployees, mockHealthCenters, mockLabTests, mockVaccinations } from '../data/mockData';

function MetricCard({
  title,
  value,
  caption,
  icon,
  color,
}: {
  title: string;
  value: string | number;
  caption: string;
  icon: ReactNode;
  color: string;
}) {
  return (
    <Card sx={{ height: '100%', border: '1px solid', borderColor: 'divider' }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>{title}</Typography>
            <Typography variant="h4" fontWeight="bold">{value}</Typography>
            <Typography variant="caption" color="text.secondary">{caption}</Typography>
          </Box>
          <Avatar sx={{ bgcolor: `${color}18`, color }}>{icon}</Avatar>
        </Box>
      </CardContent>
    </Card>
  );
}

function GovernanceItem({ label, value, color }: { label: string; value: number; color: 'success' | 'warning' | 'error' | 'primary' }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
        <Typography variant="body2" fontWeight={600}>{label}</Typography>
        <Typography variant="body2" color="text.secondary">{value}%</Typography>
      </Box>
      <LinearProgress variant="determinate" value={value} color={color} sx={{ height: 8, borderRadius: 99 }} />
    </Box>
  );
}

export function AdminDashboardPage() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const isRtl = i18n.language === 'ar';

  const stats = useMemo(() => {
    const activeUsers = MOCK_USERS_LIST.filter(u => u.isActive).length;
    const activeCenters = mockHealthCenters.filter(c => c.isActive).length;
    const completedLab = mockLabTests.filter(t => t.status === 'completed').length;
    const immuneVaccinations = mockVaccinations.filter(v => v.status === 'immune' || v.status === 'dose3').length;

    return {
      activeUsers,
      activeCenters,
      completedLab,
      immuneVaccinations,
      totalUsers: MOCK_USERS_LIST.length,
      totalPermissions: Object.values(PERMISSIONS).length,
      totalRoles: Object.values(ROLE_DEFINITIONS).length,
    };
  }, []);

  const privilegedUsers = MOCK_USERS_LIST
    .filter(u => ROLE_DEFINITIONS[u.role].permissions.some(p => [PERMISSIONS.MANAGE_USERS, PERMISSIONS.MANAGE_ROLES, PERMISSIONS.VIEW_AUDIT_LOGS].includes(p)))
    .slice(0, 6);

  const quickActions = [
    {
      title: isRtl ? 'إدارة المستخدمين' : 'Users Management',
      desc: isRtl ? 'إضافة، تعديل، تعطيل، وحذف المستخدمين' : 'Create, edit, disable, and remove users',
      icon: <PeopleIcon />,
      path: '/admin/users',
    },
    {
      title: isRtl ? 'الأدوار والصلاحيات' : 'Roles & Permissions',
      desc: isRtl ? 'مصفوفة صلاحيات مفصلة حسب الدور' : 'Detailed permission matrix by role',
      icon: <ShieldIcon />,
      path: '/roles',
    },
    {
      title: isRtl ? 'سجل العمليات' : 'Audit Log',
      desc: isRtl ? 'متابعة التغييرات الحساسة داخل النظام' : 'Track sensitive operational changes',
      icon: <SecurityIcon />,
      path: '/audit-log',
    },
    {
      title: isRtl ? 'جودة البيانات' : 'Data Quality',
      desc: isRtl ? 'مؤشرات اكتمال البيانات والتنبيهات' : 'Completeness indicators and alerts',
      icon: <FactCheckIcon />,
      path: '/data-quality',
    },
  ];

  return (
    <Box>
      <Paper
        sx={{
          p: 3,
          mb: 3,
          color: 'white',
          overflow: 'hidden',
          position: 'relative',
          background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 52%, #764ba2 100%)',
        }}
      >
        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Stack direction={{ xs: 'column', md: isRtl ? 'row-reverse' : 'row' }} spacing={2} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between">
            <Box>
              <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <AdminPanelSettingsIcon />
                <Typography variant="overline" sx={{ opacity: 0.85, letterSpacing: 1 }}>
                  {isRtl ? 'لوحة تحكم المسؤول' : 'Administrator Console'}
                </Typography>
              </Stack>
              <Typography variant="h4" fontWeight="bold" gutterBottom>
                {isRtl ? 'إدارة النظام والصلاحيات' : 'System Administration & Access Control'}
              </Typography>
              <Typography variant="body1" sx={{ opacity: 0.9, maxWidth: 760 }}>
                {isRtl
                  ? 'مركز موحد لإدارة المستخدمين، الأدوار، الصلاحيات، المراكز الصحية، وسجل العمليات الحساسة داخل منصة الصحة المهنية.'
                  : 'A unified control center for users, roles, permissions, health centers, and sensitive audit activities in the occupational health platform.'}
              </Typography>
            </Box>
            <Button
              variant="contained"
              color="inherit"
              startIcon={<ManageAccountsIcon />}
              onClick={() => navigate('/admin/users')}
              sx={{ color: '#1e3c72', fontWeight: 700, bgcolor: 'white', '&:hover': { bgcolor: 'grey.100' } }}
            >
              {isRtl ? 'إدارة المستخدمين الآن' : 'Manage Users'}
            </Button>
          </Stack>
        </Box>
        <Box sx={{ position: 'absolute', insetInlineEnd: -60, top: -60, width: 220, height: 220, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.10)' }} />
        <Box sx={{ position: 'absolute', insetInlineEnd: 80, bottom: -80, width: 160, height: 160, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.08)' }} />
      </Paper>

      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard title={isRtl ? 'المستخدمون النشطون' : 'Active Users'} value={stats.activeUsers} caption={`${stats.totalUsers} ${isRtl ? 'مستخدم إجمالي' : 'total users'}`} icon={<PeopleIcon />} color="#1976d2" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard title={isRtl ? 'الأدوار المعتمدة' : 'Configured Roles'} value={stats.totalRoles} caption={`${stats.totalPermissions} ${isRtl ? 'صلاحية معرفة' : 'defined permissions'}`} icon={<ShieldIcon />} color="#6a1b9a" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard title={isRtl ? 'المراكز الصحية' : 'Health Centers'} value={stats.activeCenters} caption={isRtl ? 'مراكز مفعّلة في النظام' : 'active centers in system'} icon={<DomainIcon />} color="#2e7d32" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard title={isRtl ? 'الموظفون المسجلون' : 'Registered Employees'} value={mockEmployees.length} caption={isRtl ? 'ضمن قاعدة بيانات المنصة' : 'in platform dataset'} icon={<StorageIcon />} color="#ef6c00" />
        </Grid>
      </Grid>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Paper sx={{ p: 2.5, height: '100%' }}>
            <Stack direction={isRtl ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Box>
                <Typography variant="h6" fontWeight="bold">{isRtl ? 'الإجراءات الإدارية السريعة' : 'Quick Administrative Actions'}</Typography>
                <Typography variant="body2" color="text.secondary">{isRtl ? 'اختصارات للمهام الأكثر استخدامًا' : 'Shortcuts for the most-used admin workflows'}</Typography>
              </Box>
              <Chip icon={<SettingsIcon />} label={isRtl ? 'نظام الصلاحيات' : 'RBAC'} color="primary" variant="outlined" />
            </Stack>
            <Grid container spacing={2}>
              {quickActions.map(action => (
                <Grid key={action.path} size={{ xs: 12, sm: 6 }}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2,
                      height: '100%',
                      cursor: 'pointer',
                      transition: '0.2s ease',
                      '&:hover': { transform: 'translateY(-2px)', boxShadow: 3, borderColor: 'primary.main' },
                    }}
                    onClick={() => navigate(action.path)}
                  >
                    <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={1.5} alignItems="flex-start">
                      <Avatar sx={{ bgcolor: 'primary.main' }}>{action.icon}</Avatar>
                      <Box sx={{ textAlign: isRtl ? 'right' : 'left' }}>
                        <Typography variant="subtitle1" fontWeight="bold">{action.title}</Typography>
                        <Typography variant="body2" color="text.secondary">{action.desc}</Typography>
                      </Box>
                    </Stack>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper sx={{ p: 2.5, height: '100%' }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>{isRtl ? 'حوكمة النظام' : 'System Governance'}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {isRtl ? 'مؤشرات تشغيلية أولية قابلة للربط ببيانات حقيقية لاحقًا.' : 'Initial operational indicators ready for backend integration.'}
            </Typography>
            <GovernanceItem label={isRtl ? 'تغطية الأدوار' : 'Role Coverage'} value={92} color="success" />
            <GovernanceItem label={isRtl ? 'اكتمال بيانات المستخدمين' : 'User Data Completeness'} value={84} color="primary" />
            <GovernanceItem label={isRtl ? 'جاهزية سجل العمليات' : 'Audit Readiness'} value={76} color="warning" />
            <Divider sx={{ my: 2 }} />
            <Stack spacing={1}>
              <Chip icon={<TrendingUpIcon />} label={`${stats.completedLab} ${isRtl ? 'تحاليل مكتملة' : 'completed lab tests'}`} color="success" variant="outlined" />
              <Chip icon={<WarningAmberIcon />} label={`${stats.immuneVaccinations} ${isRtl ? 'سجلات تطعيم محصنة/مكتملة' : 'immune/completed vaccinations'}`} color="warning" variant="outlined" />
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Paper sx={{ p: 2.5 }}>
            <Stack direction={isRtl ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Box>
                <Typography variant="h6" fontWeight="bold">{isRtl ? 'المستخدمون ذوو الصلاحيات العالية' : 'Privileged Users'}</Typography>
                <Typography variant="body2" color="text.secondary">{isRtl ? 'قائمة مختصرة بالحسابات الإدارية والحساسة' : 'A short list of administrative and sensitive accounts'}</Typography>
              </Box>
              <Button startIcon={<PeopleIcon />} onClick={() => navigate('/admin/users')}>{isRtl ? 'عرض الكل' : 'View All'}</Button>
            </Stack>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{isRtl ? 'المستخدم' : 'User'}</TableCell>
                    <TableCell>{isRtl ? 'الدور' : 'Role'}</TableCell>
                    <TableCell>{isRtl ? 'حالة الحساب' : 'Status'}</TableCell>
                    <TableCell>{isRtl ? 'عدد الصلاحيات' : 'Permissions'}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {privilegedUsers.map(u => {
                    const role = ROLE_DEFINITIONS[u.role];
                    return (
                      <TableRow key={u.id} hover>
                        <TableCell>
                          <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={1.25} alignItems="center">
                            <Avatar sx={{ width: 32, height: 32, bgcolor: role.bgColor, color: role.color }}>{u.name.charAt(0)}</Avatar>
                            <Box sx={{ textAlign: isRtl ? 'right' : 'left' }}>
                              <Typography variant="body2" fontWeight={600}>{u.name}</Typography>
                              <Typography variant="caption" color="text.secondary">{u.email}</Typography>
                            </Box>
                          </Stack>
                        </TableCell>
                        <TableCell><Chip label={isRtl ? role.nameAr : role.nameEn} size="small" sx={{ bgcolor: role.bgColor, color: role.color, fontWeight: 700 }} /></TableCell>
                        <TableCell><Chip label={u.isActive ? (isRtl ? 'نشط' : 'Active') : (isRtl ? 'معطل' : 'Disabled')} color={u.isActive ? 'success' : 'default'} size="small" /></TableCell>
                        <TableCell>{role.permissions.length}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
