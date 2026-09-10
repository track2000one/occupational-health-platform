import { useState, type ReactNode } from 'react';
import logoImg from '@/imports/ChatGPT_Image_21______2026__10_06_18__.png';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useAppTheme } from '../../context/ThemeContext';
import { ThemeSwitcher } from '../ThemeSwitcher';
import { PERMISSIONS, ROLE_DEFINITIONS } from '../../data/roles';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  ListSubheader,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Menu,
  MenuItem,
  Tooltip
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  People as PeopleIcon,
  Science as ScienceIcon,
  Vaccines as VaccinesIcon,
  LocalHospital as LocalHospitalIcon,
  Warning as WarningIcon,
  Gavel as GavelIcon,
  Campaign as CampaignIcon,
  Assessment as AssessmentIcon,
  Settings as SettingsIcon,
  AdminPanelSettings as AdminPanelSettingsIcon,
  Logout as LogoutIcon,
  Language as LanguageIcon,
  MedicalInformation as MedicalInformationIcon,
  Shield as ShieldIcon,
  FactCheck as FactCheckIcon,
  Notifications as NotificationsIcon,
  CalendarMonth as CalendarIcon,
  Security as SecurityIcon,
  CloudUpload as CloudUploadIcon,
  BadgeOutlined as HealthCardIcon,
} from '@mui/icons-material';
import { Badge } from '@mui/material';
import { mockNotifications } from '../../data/mockData';
import { type Permission } from '../../data/roles';

const drawerWidth = 268;

interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
  path: string;
  group: 'main' | 'health' | 'followup' | 'admin';
  permission?: Permission;
}

export function DashboardLayout() {
  const { t, i18n } = useTranslation();
  const { user, logout, can } = useAuth();
  const { palette: appPalette } = useAppTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const isRtl = i18n.language === 'ar';

  const navItems: NavItem[] = [
    { key: 'dashboard',          label: t('dashboard'),          icon: <DashboardIcon />,          path: '/dashboard',             group: 'main',     permission: PERMISSIONS.VIEW_DASHBOARD },
    { key: 'employees',          label: t('employees'),          icon: <PeopleIcon />,              path: '/employees',             group: 'main',     permission: PERMISSIONS.VIEW_EMPLOYEES },
    { key: 'employeeHealthCard', label: isRtl ? 'البطاقة الصحية' : 'Health Card', icon: <HealthCardIcon />, path: '/employee-health-card', group: 'main', permission: PERMISSIONS.VIEW_EMPLOYEES },
    { key: 'labTests',           label: t('labTests'),           icon: <ScienceIcon />,             path: '/lab-tests',             group: 'health',   permission: PERMISSIONS.VIEW_LAB_TESTS },
    { key: 'vaccinations',       label: t('vaccinations'),       icon: <VaccinesIcon />,            path: '/vaccinations',          group: 'health',   permission: PERMISSIONS.VIEW_VACCINATIONS },
    { key: 'clinicVisits',       label: t('clinicVisits'),       icon: <LocalHospitalIcon />,       path: '/clinic-visits',         group: 'health',   permission: PERMISSIONS.VIEW_CLINIC_VISITS },
    { key: 'occupationalHealth', label: t('occupationalHealth'), icon: <MedicalInformationIcon />,  path: '/occupational-health',   group: 'health',   permission: PERMISSIONS.VIEW_OH_VISITS },
    { key: 'needleStickInjury',  label: t('needleStickInjury'),  icon: <WarningIcon />,             path: '/needle-stick-injuries', group: 'health',   permission: PERMISSIONS.VIEW_NEEDLE_STICK },
    { key: 'medicalCommittee',   label: t('medicalCommittee'),   icon: <GavelIcon />,               path: '/medical-committee',     group: 'health',   permission: PERMISSIONS.VIEW_COMMITTEE },
    { key: 'campaigns',          label: t('campaigns'),          icon: <CampaignIcon />,            path: '/campaigns',             group: 'health',   permission: PERMISSIONS.VIEW_CAMPAIGNS },
    { key: 'reports',            label: t('reports'),            icon: <AssessmentIcon />,          path: '/reports',               group: 'followup', permission: PERMISSIONS.VIEW_REPORTS },
    { key: 'dataQuality',        label: isRtl ? 'جودة البيانات' : 'Data Quality',              icon: <FactCheckIcon />,      path: '/data-quality',  group: 'followup', permission: PERMISSIONS.VIEW_DATA_QUALITY },
    { key: 'dataImport',         label: isRtl ? 'استيراد Excel آمن' : 'Secure Excel Import',   icon: <CloudUploadIcon />,   path: '/data-import',   group: 'followup', permission: PERMISSIONS.MANAGE_USERS },
    { key: 'appointments',       label: isRtl ? 'المواعيد' : 'Appointments',                   icon: <CalendarIcon />,      path: '/appointments',  group: 'followup', permission: PERMISSIONS.VIEW_DASHBOARD },
    { key: 'notifications',      label: isRtl ? 'الإشعارات' : 'Notifications',                 icon: <NotificationsIcon />, path: '/notifications', group: 'followup', permission: PERMISSIONS.VIEW_DASHBOARD },
    { key: 'admin',              label: isRtl ? 'لوحة المسؤول' : 'Admin Console',              icon: <AdminPanelSettingsIcon />, path: '/admin',  group: 'admin', permission: PERMISSIONS.MANAGE_USERS },
    { key: 'adminUsers',         label: isRtl ? 'إدارة المستخدمين' : 'Users Management',       icon: <PeopleIcon />,        path: '/admin/users', group: 'admin', permission: PERMISSIONS.MANAGE_USERS },
    { key: 'auditLog',           label: isRtl ? 'سجل العمليات' : 'Audit Log',                  icon: <SecurityIcon />,      path: '/audit-log',   group: 'admin', permission: PERMISSIONS.VIEW_AUDIT_LOGS },
    { key: 'settings',           label: isRtl ? 'إعدادات النظام' : 'System Settings',          icon: <SettingsIcon />,      path: '/settings',    group: 'admin', permission: PERMISSIONS.MANAGE_SETTINGS },
    { key: 'roles',              label: isRtl ? 'الأدوار والصلاحيات' : 'Roles & Perms',        icon: <ShieldIcon />,        path: '/roles',       group: 'admin', permission: PERMISSIONS.MANAGE_USERS },
  ];

  const navGroups: Array<{ key: NavItem['group']; label: string }> = [
    { key: 'main', label: isRtl ? 'الرئيسية' : 'Main' },
    { key: 'health', label: isRtl ? 'الخدمات الصحية' : 'Health Services' },
    { key: 'followup', label: isRtl ? 'المتابعة والتقارير' : 'Follow-up & Reports' },
    { key: 'admin', label: isRtl ? 'الإدارة والنظام' : 'Administration' },
  ];

  const filteredNavItems = navItems.filter(item => !item.permission || can(item.permission));

  const activeNav = filteredNavItems.find(item => {
    if (item.path === '/admin') return location.pathname === '/admin';
    return location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
  });

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => setAnchorEl(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'ar' : 'en';
    i18n.changeLanguage(newLang);
    document.dir = newLang === 'ar' ? 'rtl' : 'ltr';
    handleMenuClose();
  };

  const getDrawerContent = (variant: 'mobile' | 'desktop') => (
    <Box
      sx={{
        direction: isRtl ? 'rtl' : 'ltr',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        color: '#1e293b',
        background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
        boxShadow: 'inset -1px 0 0 rgba(148,163,184,.16)',
      }}
    >
      <Toolbar
        sx={{
          background: appPalette.drawerGradient,
          color: 'white',
          minHeight: { xs: 74, md: 82 },
          mx: { xs: 1, md: 1.25 },
          mt: { xs: 1, md: 1.25 },
          borderRadius: { xs: 2.5, md: 2.75 },
          border: `1px solid ${appPalette.primary}22`,
          boxShadow: `0 6px 16px ${appPalette.primary}22`,
          overflow: 'hidden',
          position: 'relative',
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, rgba(255,255,255,.13), transparent 42%)',
          },
          '&::after': {
            content: '""',
            position: 'absolute',
            width: 4,
            height: '46%',
            borderRadius: 99,
            insetInlineEnd: 0,
            top: '27%',
            background: 'rgba(255,255,255,.72)',
          },
        }}
      >
        <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 1.25, width: '100%', flexDirection: isRtl ? 'row-reverse' : 'row' }}>
          <Box sx={{ bgcolor: 'white', borderRadius: 2.25, p: 0.7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 10px 18px rgba(15,23,42,.16)' }}>
            <img src={logoImg} alt="تجمع الشرقية الصحي" style={{ height: variant === 'mobile' ? 44 : 42, width: 'auto', objectFit: 'contain' }} />
          </Box>
          <Box sx={{ minWidth: 0, textAlign: isRtl ? 'right' : 'left' }}>
            <Typography variant="subtitle1" noWrap component="div" fontWeight={900} sx={{ lineHeight: 1.15, fontSize: { xs: '.92rem', md: '1rem' } }}>
              {isRtl ? 'الصحة المهنية' : 'Occupational Health'}
            </Typography>
            <Typography variant="caption" sx={{ opacity: .9, fontWeight: 700, fontSize: { xs: '.66rem', md: '.72rem' } }}>
              {isRtl ? 'منصة إدارة صحية' : 'Health Platform'}
            </Typography>
          </Box>
        </Box>
      </Toolbar>
      <Divider sx={{ mx: 2, mt: 1.4, mb: .4, borderColor: 'rgba(148,163,184,.18)' }} />
      <List
        sx={{
          pt: 0,
          px: 1.25,
          pb: 2.5,
          overflowY: 'auto',
          scrollbarWidth: 'thin',
          scrollbarColor: `${appPalette.primary}55 transparent`,
          '&::-webkit-scrollbar': { width: 5 },
          '&::-webkit-scrollbar-thumb': { borderRadius: 99, bgcolor: `${appPalette.primary}55` },
        }}
      >
        {navGroups.map(group => {
          const groupItems = filteredNavItems.filter(item => item.group === group.key);
          if (!groupItems.length) return null;
          return [
            <ListSubheader
              key={`${variant}-${group.key}-heading`}
              disableSticky
              component="div"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: .8,
                height: 30,
                px: 1.1,
                mt: group.key === 'main' ? .25 : 1.1,
                mb: .35,
                color: '#64748b',
                bgcolor: 'transparent',
                fontSize: '.69rem',
                fontWeight: 850,
                letterSpacing: isRtl ? 0 : '.08em',
                textTransform: isRtl ? 'none' : 'uppercase',
                '&::before': {
                  content: '""',
                  width: 7,
                  height: 7,
                  flexShrink: 0,
                  borderRadius: '50%',
                  background: appPalette.primary,
                  boxShadow: `0 0 0 3px ${appPalette.primary}14`,
                },
                '&::after': {
                  content: '""',
                  height: 1,
                  flex: 1,
                  background: `linear-gradient(${isRtl ? '270deg' : '90deg'}, rgba(148,163,184,.28), transparent)`,
                },
              }}
            >
              {group.label}
            </ListSubheader>,
            ...groupItems.map((item) => {
          const isActive = item.path === '/admin'
            ? location.pathname === '/admin'
            : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
          return (
            <ListItem key={`${variant}-${item.key}`} disablePadding sx={{ mb: 0.55 }}>
              <ListItemButton
                onClick={() => {
                  navigate(item.path);
                  setMobileOpen(false);
                }}
                sx={{
                  position: 'relative',
                  minHeight: { xs: 48, md: 49 },
                  px: { xs: 1, md: 1.1 },
                  py: .55,
                  borderRadius: 2.25,
                  flexDirection: isRtl ? 'row-reverse' : 'row',
                  color: isActive ? '#fff' : '#334155',
                  overflow: 'hidden',
                  border: isActive ? `1px solid ${appPalette.primary}` : '1px solid transparent',
                  background: isActive
                    ? `linear-gradient(135deg, ${appPalette.primary} 0%, ${appPalette.primaryDark} 100%)`
                    : 'transparent',
                  boxShadow: isActive
                    ? `0 5px 13px ${appPalette.primary}2e`
                    : 'none',
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    insetInlineStart: isRtl ? 'auto' : 0,
                    insetInlineEnd: isRtl ? 0 : 'auto',
                    top: 10,
                    bottom: 10,
                    width: 3,
                    borderRadius: 999,
                    background: isActive ? '#fff' : 'transparent',
                    opacity: .95,
                    boxShadow: 'none',
                  },
                  '&:hover': {
                    transform: 'none',
                    background: isActive
                      ? `linear-gradient(135deg, ${appPalette.primary} 0%, ${appPalette.primaryDark} 100%)`
                      : `${appPalette.primary}0d`,
                    boxShadow: isActive
                      ? `0 6px 15px ${appPalette.primary}38`
                      : 'none',
                    '& .nav-icon-3d': {
                      color: isActive ? '#fff' : appPalette.primaryDark,
                      transform: 'none',
                    },
                  },
                  '&:active': {
                    transform: 'none',
                  },
                  transition: 'color .16s ease, box-shadow .16s ease, background .16s ease',
                }}
              >
                <ListItemIcon sx={{ position: 'relative', zIndex: 1, minWidth: { xs: 43, md: 45 }, justifyContent: isRtl ? 'flex-end' : 'flex-start' }}>
                  <Box
                    className="nav-icon-3d"
                    sx={{
                      width: 34,
                      height: 34,
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                      borderRadius: 1.75,
                      color: isActive ? '#fff' : appPalette.primaryDark,
                      background: isActive
                        ? 'rgba(255,255,255,.15)'
                        : `${appPalette.primary}0d`,
                      border: isActive ? '1px solid rgba(255,255,255,.24)' : `1px solid ${appPalette.primary}1f`,
                      boxShadow: 'none',
                      transition: 'all .2s ease',
                      '& svg': { fontSize: 20 },
                    }}
                  >
                    {item.icon}
                  </Box>
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  sx={{ position: 'relative', zIndex: 1, textAlign: isRtl ? 'right' : 'left', minWidth: 0 }}
                  primaryTypographyProps={{
                    noWrap: true,
                    fontWeight: isActive ? 850 : 720,
                    fontSize: { xs: '.9rem', md: '.93rem' },
                    sx: {
                      color: isActive ? '#fff !important' : '#334155 !important',
                      textShadow: 'none',
                    },
                  }}
                />
              </ListItemButton>
            </ListItem>
          );
            }),
          ];
        })}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', direction: isRtl ? 'rtl' : 'ltr', maxWidth: '100vw', overflowX: 'hidden' }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: isRtl ? 0 : `${drawerWidth}px` },
          mr: { md: isRtl ? `${drawerWidth}px` : 0 },
          bgcolor: 'rgba(255,255,255,.82)',
          color: 'text.primary',
          borderBottom: '1px solid rgba(148,163,184,.18)',
          backdropFilter: 'blur(18px)',
          boxShadow: '0 8px 26px rgba(15,23,42,.05)',
          direction: isRtl ? 'rtl' : 'ltr',
        }}
      >
        <Toolbar sx={{ minHeight: { xs: 60, sm: 64, md: 68 }, px: { xs: 1.5, sm: 2.25, md: 3 } }}>
          <IconButton
            color="inherit"
            edge={isRtl ? 'end' : 'start'}
            onClick={handleDrawerToggle}
            sx={{ ml: isRtl ? 1.5 : 0, mr: isRtl ? 0 : 1.5, display: { md: 'none' }, width: 38, height: 38 }}
          >
            <MenuIcon />
          </IconButton>
          <Box sx={{ flexGrow: 1, minWidth: 0, textAlign: isRtl ? 'right' : 'left' }}>
            <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 850, color: '#111827', fontSize: { xs: '1rem', sm: '1.08rem', md: '1.18rem' } }}>
              {activeNav?.label || t(window.location.pathname.split('/')[1] || 'dashboard')}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' }, fontWeight: 650 }}>
              {isRtl ? 'منصة إدارة الصحة المهنية' : 'Occupational Health Management Platform'}
            </Typography>
          </Box>
          <Tooltip title={isRtl ? 'الإشعارات' : 'Notifications'}>
            <IconButton
              color="inherit"
              onClick={() => navigate('/notifications')}
              sx={{
                mr: isRtl ? 0 : { xs: .75, sm: 1 },
                ml: isRtl ? { xs: .75, sm: 1 } : 0,
                width: { xs: 38, sm: 42 },
                height: { xs: 38, sm: 42 },
                bgcolor: 'rgba(255,255,255,.76)',
                border: '1px solid rgba(148,163,184,.2)',
                boxShadow: '0 8px 18px rgba(15,23,42,.06)',
                '&:hover': { bgcolor: '#fff', transform: 'translateY(-1px)' },
              }}
            >
              <Badge
                badgeContent={mockNotifications.filter(n => !n.isRead && (n.userId === user?.id || n.role === user?.role || n.userId === 'all')).length}
                color="error"
                max={99}
              >
                <NotificationsIcon fontSize="small" />
              </Badge>
            </IconButton>
          </Tooltip>
          <Tooltip title={user?.name || ''}>
            <IconButton onClick={handleMenuOpen} sx={{ p: 0.3, borderRadius: 999, bgcolor: 'rgba(255,255,255,.78)', border: '1px solid rgba(148,163,184,.22)', boxShadow: '0 8px 18px rgba(15,23,42,.07)' }}>
              <Avatar sx={{ width: { xs: 34, sm: 38 }, height: { xs: 34, sm: 38 }, bgcolor: 'primary.main', background: `linear-gradient(135deg, ${appPalette.primary} 0%, ${appPalette.secondary} 100%)`, fontWeight: 850 }}>
                {user?.name?.charAt(0) || 'U'}
              </Avatar>
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            PaperProps={{ sx: { mt: 1, minWidth: { xs: 210, sm: 230 }, borderRadius: 3 } }}
          >
            <MenuItem disabled sx={{ flexDirection: 'column', alignItems: 'flex-start', gap: .5 }}>
              <Typography variant="body2" fontWeight={850}>{user?.name}</Typography>
              {user?.role && (
                <Box
                  sx={{
                    px: 1.1, py: 0.35,
                    borderRadius: 999,
                    bgcolor: ROLE_DEFINITIONS[user.role as keyof typeof ROLE_DEFINITIONS]?.bgColor || 'grey.300',
                    color: ROLE_DEFINITIONS[user.role as keyof typeof ROLE_DEFINITIONS]?.color || '#fff',
                    fontSize: '0.72rem',
                    fontWeight: 780,
                  }}
                >
                  {ROLE_DEFINITIONS[user.role as keyof typeof ROLE_DEFINITIONS]?.nameAr || user.role}
                </Box>
              )}
            </MenuItem>
            <Divider />
            <MenuItem onClick={toggleLanguage}>
              <ListItemIcon>
                <LanguageIcon fontSize="small" />
              </ListItemIcon>
              {isRtl ? 'English' : 'العربية'}
            </MenuItem>
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              {t('logout')}
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}
      >
        <Drawer
          variant="temporary"
          anchor={isRtl ? 'right' : 'left'}
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: { xs: 'min(268px, calc(100vw - 24px))', sm: drawerWidth },
              maxWidth: 'calc(100vw - 24px)',
              border: 0,
              background: 'transparent',
            },
          }}
        >
          {getDrawerContent('mobile')}
        </Drawer>
        <Drawer
          variant="permanent"
          anchor={isRtl ? 'right' : 'left'}
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              borderRight: isRtl ? 'none' : '1px solid',
              borderLeft: isRtl ? '1px solid' : 'none',
              borderColor: 'rgba(148,163,184,.18)',
              background: 'rgba(255,255,255,.84)',
              backdropFilter: 'blur(18px)',
            },
          }}
          open
        >
          {getDrawerContent('desktop')}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 1.5, sm: 2, md: 3 },
          width: { xs: '100%', md: `calc(100% - ${drawerWidth}px)` },
          maxWidth: '100vw',
          minHeight: '100vh',
          overflowX: 'hidden',
          background: `radial-gradient(circle at 8% 10%, ${appPalette.primary}12 0, transparent 28%), radial-gradient(circle at 95% 0%, ${appPalette.secondary}10 0, transparent 30%), linear-gradient(180deg, #F8FAFC 0%, ${appPalette.background} 100%)`,
          direction: isRtl ? 'rtl' : 'ltr',
        }}
      >
        <Toolbar sx={{ minHeight: { xs: 60, sm: 64, md: 68 } }} />
        <Outlet />
      </Box>
      <ThemeSwitcher />
    </Box>
  );
}
