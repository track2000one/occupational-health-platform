import { useState } from 'react';
import logoImg from '@/imports/ChatGPT_Image_21______2026__10_06_18__.png';
import { Outlet, useNavigate } from 'react-router';
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
  Logout as LogoutIcon,
  Language as LanguageIcon,
  MedicalInformation as MedicalInformationIcon,
  Shield as ShieldIcon,
  FactCheck as FactCheckIcon,
  Notifications as NotificationsIcon,
  CalendarMonth as CalendarIcon,
  Security as SecurityIcon,
} from '@mui/icons-material';
import { Badge } from '@mui/material';
import { mockNotifications } from '../../data/mockData';
import { type Permission } from '../../data/roles';

const drawerWidth = 280;

interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  permission?: Permission;
}

export function DashboardLayout() {
  const { t, i18n } = useTranslation();
  const { user, logout, can } = useAuth();
  const { palette: appPalette } = useAppTheme();
  const navigate = useNavigate();
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
    { key: 'dataQuality',     label: isRtl ? 'جودة البيانات' : 'Data Quality',        icon: <FactCheckIcon />,     path: '/data-quality',    permission: PERMISSIONS.VIEW_DATA_QUALITY },
    { key: 'appointments',    label: isRtl ? 'المواعيد' : 'Appointments',             icon: <CalendarIcon />,      path: '/appointments',    permission: PERMISSIONS.VIEW_DASHBOARD },
    { key: 'notifications',   label: isRtl ? 'الإشعارات' : 'Notifications',           icon: <NotificationsIcon />, path: '/notifications',   permission: PERMISSIONS.VIEW_DASHBOARD },
    { key: 'auditLog',        label: isRtl ? 'سجل العمليات' : 'Audit Log',            icon: <SecurityIcon />,      path: '/audit-log',       permission: PERMISSIONS.VIEW_AUDIT_LOGS },
    { key: 'settings',        label: t('settings'),                                    icon: <SettingsIcon />,      path: '/settings',        permission: PERMISSIONS.MANAGE_USERS },
    { key: 'roles',           label: isRtl ? 'الأدوار والصلاحيات' : 'Roles & Perms', icon: <ShieldIcon />,        path: '/roles',           permission: PERMISSIONS.MANAGE_USERS },
  ];

  const filteredNavItems = navItems.filter(
    item => !item.permission || can(item.permission)
  );

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
    <Box sx={{ direction: isRtl ? 'rtl' : 'ltr', height: '100%' }}>
      <Toolbar
        sx={{
          background: appPalette.drawerGradient,
          color: 'white',
          minHeight: 64,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', flexDirection: isRtl ? 'row-reverse' : 'row' }}>
          <Box sx={{ bgcolor: 'white', borderRadius: 1, p: 0.75, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <img src={logoImg} alt="تجمع الشرقية الصحي" style={{ height: variant === 'mobile' ? 52 : 44, width: 'auto', objectFit: 'contain' }} />
          </Box>
          <Typography variant="subtitle1" noWrap component="div" fontWeight="bold" sx={{ lineHeight: 1.2 }}>
            {isRtl ? 'الصحة المهنية' : 'Occup. Health'}
          </Typography>
        </Box>
      </Toolbar>
      <Divider />
      <List sx={{ pt: 2 }}>
        {filteredNavItems.map((item) => (
          <ListItem key={`${variant}-${item.key}`} disablePadding sx={{ px: 1, mb: 0.5 }}>
            <ListItemButton
              onClick={() => {
                navigate(item.path);
                setMobileOpen(false);
              }}
              sx={{
                borderRadius: 2,
                flexDirection: isRtl ? 'row-reverse' : 'row',
                '&:hover': {
                  bgcolor: 'primary.50',
                  '& .MuiListItemIcon-root': { color: 'primary.main' },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 40, color: 'text.secondary', justifyContent: isRtl ? 'flex-end' : 'flex-start' }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.label} sx={{ textAlign: isRtl ? 'right' : 'left' }} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', direction: isRtl ? 'rtl' : 'ltr' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: isRtl ? 0 : `${drawerWidth}px` },
          mr: { sm: isRtl ? `${drawerWidth}px` : 0 },
          bgcolor: 'white',
          color: 'text.primary',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          direction: isRtl ? 'rtl' : 'ltr',
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge={isRtl ? 'end' : 'start'}
            onClick={handleDrawerToggle}
            sx={{ ml: isRtl ? 2 : 0, mr: isRtl ? 0 : 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            {t(window.location.pathname.split('/')[1] || 'dashboard')}
          </Typography>
          {/* Bell icon */}
          <Tooltip title={isRtl ? 'الإشعارات' : 'Notifications'}>
            <IconButton color="inherit" onClick={() => navigate('/notifications')} sx={{ mr: 1 }}>
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
            <IconButton onClick={handleMenuOpen} sx={{ p: 0 }}>
              <Avatar sx={{ bgcolor: 'primary.main' }}>
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
          >
            <MenuItem disabled sx={{ flexDirection: 'column', alignItems: 'flex-start' }}>
              <Typography variant="body2" fontWeight="bold">{user?.name}</Typography>
              {user?.role && (
                <Box
                  sx={{
                    mt: 0.5,
                    px: 1, py: 0.25,
                    borderRadius: 1,
                    bgcolor: ROLE_DEFINITIONS[user.role as keyof typeof ROLE_DEFINITIONS]?.bgColor || 'grey.300',
                    color: ROLE_DEFINITIONS[user.role as keyof typeof ROLE_DEFINITIONS]?.color || '#fff',
                    fontSize: '0.7rem',
                    fontWeight: 700,
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
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
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
              borderColor: 'divider',
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
          p: 3,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          minHeight: '100vh',
          bgcolor: 'grey.50',
          direction: isRtl ? 'rtl' : 'ltr',
        }}
      >
        <Toolbar />
        <Outlet />
      </Box>
      <ThemeSwitcher />
    </Box>
  );
}
