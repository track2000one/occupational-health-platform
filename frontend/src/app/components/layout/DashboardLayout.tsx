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
} from '@mui/icons-material';
import { Badge } from '@mui/material';
import { mockNotifications } from '../../data/mockData';
import { type Permission } from '../../data/roles';

const drawerWidth = 292;

interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
  path: string;
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
    { key: 'dashboard',          label: t('dashboard'),          icon: <DashboardIcon />,          path: '/dashboard',              permission: PERMISSIONS.VIEW_DASHBOARD },
    { key: 'employees',          label: t('employees'),          icon: <PeopleIcon />,              path: '/employees',              permission: PERMISSIONS.VIEW_EMPLOYEES },
    { key: 'labTests',           label: t('labTests'),           icon: <ScienceIcon />,             path: '/lab-tests',              permission: PERMISSIONS.VIEW_LAB_TESTS },
    { key: 'vaccinations',       label: t('vaccinations'),       icon: <VaccinesIcon />,            path: '/vaccinations',           permission: PERMISSIONS.VIEW_VACCINATIONS },
    { key: 'clinicVisits',       label: t('clinicVisits'),       icon: <LocalHospitalIcon />,       path: '/clinic-visits',          permission: PERMISSIONS.VIEW_CLINIC_VISITS },
    { key: 'occupationalHealth', label: t('occupationalHealth'), icon: <MedicalInformationIcon />,  path: '/occupational-health',    permission: PERMISSIONS.VIEW_OH_VISITS },
    { key: 'needleStickInjury',  label: t('needleStickInjury'),  icon: <WarningIcon />,             path: '/needle-stick-injuries',  permission: PERMISSIONS.VIEW_NEEDLE_STICK },
    { key: 'medicalCommittee',   label: t('medicalCommittee'),   icon: <GavelIcon />,               path: '/medical-committee',      permission: PERMISSIONS.VIEW_COMMITTEE },
    { key: 'campaigns',          label: t('campaigns'),          icon: <CampaignIcon />,            path: '/campaigns',              permission: PERMISSIONS.VIEW_CAMPAIGNS },
    { key: 'reports',            label: t('reports'),            icon: <AssessmentIcon />,          path: '/reports',                permission: PERMISSIONS.VIEW_REPORTS },
    { key: 'dataQuality',        label: isRtl ? 'جودة البيانات' : 'Data Quality',              icon: <FactCheckIcon />,     path: '/data-quality',    permission: PERMISSIONS.VIEW_DATA_QUALITY },
    { key: 'dataImport',         label: isRtl ? 'استيراد Excel آمن' : 'Secure Excel Import',   icon: <CloudUploadIcon />,  path: '/data-import',     permission: PERMISSIONS.MANAGE_USERS },
    { key: 'appointments',       label: isRtl ? 'المواعيد' : 'Appointments',                   icon: <CalendarIcon />,     path: '/appointments',    permission: PERMISSIONS.VIEW_DASHBOARD },
    { key: 'notifications',      label: isRtl ? 'الإشعارات' : 'Notifications',                 icon: <NotificationsIcon />,path: '/notifications',   permission: PERMISSIONS.VIEW_DASHBOARD },
    { key: 'admin',              label: isRtl ? 'لوحة المسؤول' : 'Admin Console',              icon: <AdminPanelSettingsIcon />, path: '/admin',      permission: PERMISSIONS.MANAGE_USERS },
    { key: 'adminUsers',         label: isRtl ? 'إدارة المستخدمين' : 'Users Management',       icon: <PeopleIcon />,       path: '/admin/users',     permission: PERMISSIONS.MANAGE_USERS },
    { key: 'auditLog',           label: isRtl ? 'سجل العمليات' : 'Audit Log',                  icon: <SecurityIcon />,     path: '/audit-log',       permission: PERMISSIONS.VIEW_AUDIT_LOGS },
    { key: 'settings',           label: isRtl ? 'إعدادات النظام' : 'System Settings',          icon: <SettingsIcon />,     path: '/settings',        permission: PERMISSIONS.MANAGE_SETTINGS },
    { key: 'roles',              label: isRtl ? 'الأدوار والصلاحيات' : 'Roles & Perms',        icon: <ShieldIcon />,       path: '/roles',           permission: PERMISSIONS.MANAGE_USERS },
  ];

  const filteredNavItems = navItems.filter(
    item => !item.permission || can(item.permission)
  );

  const activeNav = filteredNavItems.find(item => {
    if (item.path === '/admin') return location.pathname === '/admin';
    return location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
  });

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

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
        background: 'linear-gradient(180deg, rgba(255,255,255,.98) 0%, rgba(248,250,252,.95) 100%)',
      }}
    >
      <Toolbar
        sx={{
          background: appPalette.drawerGradient,
          color: 'white',
          minHeight: 86,
          mx: 1.5,
          mt: 1.5,
          borderRadius: 4,
          boxShadow: `0 18px 38px ${appPalette.primary}44, inset 0 1px 0 rgba(255,255,255,.28)`,
          overflow: 'hidden',
          position: 'relative',
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at 15% 15%, rgba(255,255,255,.28) 0, transparent 34%)',
          },
        }}
      >
        <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', flexDirection: isRtl ? 'row-reverse' : 'row' }}>
          <Box sx={{ bgcolor: 'white', borderRadius: 2.5, p: 0.85, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 12px 22px rgba(15,23,42,.18)' }}>
            <img src={logoImg} alt="تجمع الشرقية الصحي" style={{ height: variant === 'mobile' ? 54 : 46, width: 'auto', objectFit: 'contain' }} />
          </Box>
          <Box sx={{ minWidth: 0, textAlign: isRtl ? 'right' : 'left' }}>
            <Typography variant="subtitle1" noWrap component="div" fontWeight={950} sx={{ lineHeight: 1.15 }}>
              {isRtl ? 'الصحة المهنية' : 'Occupational Health'}
            </Typography>
            <Typography variant="caption" sx={{ opacity: .86, fontWeight: 700 }}>
              {isRtl ? 'منصة إدارة صحية احترافية' : 'Premium Health Platform'}
            </Typography>
          </Box>
        </Box>
      </Toolbar>
      <Divider sx={{ mx: 2, my: 1.5, borderColor: 'rgba(148,163,184,.18)' }} />
      <List sx={{ pt: 0.5, px: 1.25, pb: 2, overflowY: 'auto' }}>
        {filteredNavItems.map((item) => {
          const isActive = item.path === '/admin'
            ? location.pathname === '/admin'
            : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
          return (
            <ListItem key={`${variant}-${item.key}`} disablePadding sx={{ mb: 0.65 }}>
              <ListItemButton
                onClick={() => {
                  navigate(item.path);
                  setMobileOpen(false);
                }}
                sx={{
                  position: 'relative',
                  minHeight: 48,
                  px: 1.6,
                  borderRadius: 3,
                  flexDirection: isRtl ? 'row-reverse' : 'row',
                  color: isActive ? '#fff' : '#334155',
                  overflow: 'hidden',
                  background: isActive ? `linear-gradient(135deg, ${appPalette.primary} 0%, ${appPalette.primaryDark} 100%)` : 'transparent',
                  boxShadow: isActive ? `0 14px 28px ${appPalette.primary}38, inset 0 1px 0 rgba(255,255,255,.25)` : 'none',
                  '&::before': isActive ? {
                    content: '""',
                    position: 'absolute',
                    insetInlineStart: isRtl ? 'auto' : 0,
                    insetInlineEnd: isRtl ? 0 : 'auto',
                    top: 10,
                    bottom: 10,
                    width: 4,
                    borderRadius: 999,
                    background: '#fff',
                    opacity: .95,
                  } : {},
                  '&:hover': {
                    transform: 'translateY(-1px)',
                    bgcolor: isActive ? undefined : `${appPalette.primary}12`,
                    boxShadow: isActive ? `0 16px 30px ${appPalette.primary}44` : `0 10px 24px ${appPalette.primary}18`,
                    '& .MuiListItemIcon-root': { color: isActive ? '#fff' : appPalette.primary },
                  },
                  transition: 'all .18s ease',
                }}
              >
                <ListItemIcon sx={{ minWidth: 40, color: isActive ? '#fff' : 'text.secondary', justifyContent: isRtl ? 'flex-end' : 'flex-start', transition: 'color .18s ease' }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  sx={{ textAlign: isRtl ? 'right' : 'left' }}
                  primaryTypographyProps={{ fontWeight: isActive ? 900 : 750, fontSize: '.92rem' }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', direction: isRtl ? 'rtl' : 'ltr' }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: isRtl ? 0 : `${drawerWidth}px` },
          mr: { sm: isRtl ? `${drawerWidth}px` : 0 },
          bgcolor: 'rgba(255,255,255,.78)',
          color: 'text.primary',
          borderBottom: '1px solid rgba(148,163,184,.18)',
          backdropFilter: 'blur(18px)',
          boxShadow: '0 12px 32px rgba(15,23,42,.06)',
          direction: isRtl ? 'rtl' : 'ltr',
        }}
      >
        <Toolbar sx={{ minHeight: 72 }}>
          <IconButton
            color="inherit"
            edge={isRtl ? 'end' : 'start'}
            onClick={handleDrawerToggle}
            sx={{ ml: isRtl ? 2 : 0, mr: isRtl ? 0 : 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Box sx={{ flexGrow: 1, minWidth: 0, textAlign: isRtl ? 'right' : 'left' }}>
            <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 900, color: '#0F172A' }}>
              {activeNav?.label || t(window.location.pathname.split('/')[1] || 'dashboard')}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
              {isRtl ? 'منصة إدارة الصحة المهنية' : 'Occupational Health Management Platform'}
            </Typography>
          </Box>
          <Tooltip title={isRtl ? 'الإشعارات' : 'Notifications'}>
            <IconButton
              color="inherit"
              onClick={() => navigate('/notifications')}
              sx={{
                mr: isRtl ? 0 : 1,
                ml: isRtl ? 1 : 0,
                bgcolor: 'rgba(255,255,255,.72)',
                border: '1px solid rgba(148,163,184,.2)',
                boxShadow: '0 10px 20px rgba(15,23,42,.07)',
                '&:hover': { bgcolor: '#fff', transform: 'translateY(-1px)' },
              }}
            >
              <Badge
                badgeContent={mockNotifications.filter(n => !n.isRead && (n.userId === user?.id || n.role === user?.role || n.userId === 'all')).length}
                color="error"
                max={99}
              >
                <NotificationsIcon />
              </Badge>
            </IconButton>
          </Tooltip>
          <Tooltip title={user?.name || ''}>
            <IconButton onClick={handleMenuOpen} sx={{ p: 0.35, borderRadius: 999, bgcolor: 'rgba(255,255,255,.78)', border: '1px solid rgba(148,163,184,.22)', boxShadow: '0 10px 22px rgba(15,23,42,.08)' }}>
              <Avatar sx={{ bgcolor: 'primary.main', background: `linear-gradient(135deg, ${appPalette.primary} 0%, ${appPalette.secondary} 100%)`, fontWeight: 900 }}>
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
            PaperProps={{ sx: { mt: 1, minWidth: 230, borderRadius: 3 } }}
          >
            <MenuItem disabled sx={{ flexDirection: 'column', alignItems: 'flex-start', gap: .5 }}>
              <Typography variant="body2" fontWeight={900}>{user?.name}</Typography>
              {user?.role && (
                <Box
                  sx={{
                    px: 1.1, py: 0.35,
                    borderRadius: 999,
                    bgcolor: ROLE_DEFINITIONS[user.role as keyof typeof ROLE_DEFINITIONS]?.bgColor || 'grey.300',
                    color: ROLE_DEFINITIONS[user.role as keyof typeof ROLE_DEFINITIONS]?.color || '#fff',
                    fontSize: '0.72rem',
                    fontWeight: 850,
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
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        <Drawer
          variant="temporary"
          anchor={isRtl ? 'right' : 'left'}
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth, border: 0, background: 'transparent' },
          }}
        >
          {getDrawerContent('mobile')}
        </Drawer>
        <Drawer
          variant="permanent"
          anchor={isRtl ? 'right' : 'left'}
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              borderRight: isRtl ? 'none' : '1px solid',
              borderLeft: isRtl ? '1px solid' : 'none',
              borderColor: 'rgba(148,163,184,.18)',
              background: 'rgba(255,255,255,.82)',
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
          p: { xs: 2, md: 3 },
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          minHeight: '100vh',
          background: `radial-gradient(circle at 8% 10%, ${appPalette.primary}14 0, transparent 28%), radial-gradient(circle at 95% 0%, ${appPalette.secondary}14 0, transparent 30%), linear-gradient(180deg, #F8FAFC 0%, ${appPalette.background} 100%)`,
          direction: isRtl ? 'rtl' : 'ltr',
        }}
      >
        <Toolbar sx={{ minHeight: 72 }} />
        <Outlet />
      </Box>
      <ThemeSwitcher />
    </Box>
  );
}
