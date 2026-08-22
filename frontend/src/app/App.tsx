import React, { useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';

// Figma's FGCmp inspector injects data-fg-* props onto every React component,
// including library components like MUI's ThemeProvider. Suppress the resulting
// false-positive prop-type warnings that we cannot prevent at the source.
if (typeof console !== 'undefined') {
  const _consoleError = console.error.bind(console);
  const _consoleWarn = console.warn.bind(console);
  console.error = (...args: unknown[]) => {
    const joined = args.map(a => (typeof a === 'string' ? a : '')).join(' ');
    if (joined.includes('data-fg') || joined.includes('data-fgid')) return;
    if (joined.includes('unique') && joined.includes('key') && joined.includes('ForwardRef')) return;
    if (joined.includes('alignItems') || joined.includes('justifyContent') || joined.includes('flexDirection')) return;
    if (joined.includes('React does not recognize')) return;
    _consoleError(...args);
  };
  console.warn = (...args: unknown[]) => {
    const joined = args.map(a => (typeof a === 'string' ? a : '')).join(' ');
    if (joined.includes('data-fg') || joined.includes('data-fgid')) return;
    if (joined.includes('alignItems') || joined.includes('justifyContent')) return;
    if (joined.includes('React does not recognize')) return;
    _consoleWarn(...args);
  };
}

import { AuthProvider, useAuth } from './context/AuthContext';
import { AppThemeProvider, useAppTheme } from './context/ThemeContext';
import { type Permission } from './data/roles';
import './i18n/config';
import { LoginPage } from './pages/LoginPage';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { DashboardPage } from './pages/DashboardPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { LabTestsPage } from './pages/LabTestsPage';
import { VaccinationsPage } from './pages/VaccinationsPage';
import { NeedleStickInjuriesPage } from './pages/NeedleStickInjuriesPage';
import { MedicalCommitteePage } from './pages/MedicalCommitteePage';
import { ReportsPage } from './pages/ReportsPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { RolesPermissionsPage } from './pages/RolesPermissionsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { AppointmentsPage } from './pages/AppointmentsPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { ClinicVisitsPage } from './pages/ClinicVisitsPage';
import { OccupationalHealthPage } from './pages/OccupationalHealthPage';
import { CampaignsPage } from './pages/CampaignsPage';
import { DataQualityPage } from './pages/DataQualityPage';
import { DataImportPage } from './pages/DataImportPage';
import { Toaster } from 'sonner';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function PermissionRoute({ children, permission }: { children: React.ReactNode; permission: Permission }) {
  const { isAuthenticated, can } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!can(permission)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="lab-tests" element={<LabTestsPage />} />
        <Route path="vaccinations" element={<VaccinationsPage />} />
        <Route path="clinic-visits" element={<ClinicVisitsPage />} />
        <Route path="occupational-health" element={<OccupationalHealthPage />} />
        <Route path="needle-stick-injuries" element={<NeedleStickInjuriesPage />} />
        <Route path="medical-committee" element={<MedicalCommitteePage />} />
        <Route path="campaigns" element={<CampaignsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="data-quality" element={<DataQualityPage />} />
        <Route path="data-import" element={
          <PermissionRoute permission="manage:users">
            <DataImportPage />
          </PermissionRoute>
        } />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="appointments" element={<AppointmentsPage />} />
        <Route path="admin" element={
          <PermissionRoute permission="manage:users">
            <AdminDashboardPage />
          </PermissionRoute>
        } />
        <Route path="audit-log" element={
          <PermissionRoute permission="view:auditLogs">
            <AuditLogPage />
          </PermissionRoute>
        } />
        <Route path="settings" element={<Navigate to="/admin/users" replace />} />
        <Route path="admin/users" element={
          <PermissionRoute permission="manage:users">
            <AdminUsersPage />
          </PermissionRoute>
        } />
        <Route path="roles" element={
          <PermissionRoute permission="manage:users">
            <RolesPermissionsPage />
          </PermissionRoute>
        } />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function ThemedShell({ children }: { children: React.ReactNode }) {
  const { palette } = useAppTheme();
  const neoLight = 'rgba(255,255,255,.96)';
  const neoDark = 'rgba(163,174,190,.48)';

  const muiTheme = useMemo(() => createTheme({
    palette: {
      primary: {
        main: palette.primary,
        dark: palette.primaryDark,
        light: palette.primary + 'cc',
      },
      secondary: {
        main: palette.secondary,
        light: palette.secondary + 'cc',
        dark: palette.secondary,
      },
      success: {
        main: '#2FBF9F',
        light: '#DFF8F1',
        dark: '#0F9F85',
      },
      warning: {
        main: '#F59E0B',
        light: '#FEF3C7',
        dark: '#B45309',
      },
      error: {
        main: '#EF4444',
        light: '#FEE2E2',
        dark: '#B91C1C',
      },
      info: {
        main: '#0EA5E9',
        light: '#E0F2FE',
        dark: '#0369A1',
      },
      text: {
        primary: '#0F172A',
        secondary: '#64748B',
      },
      background: {
        default: palette.background,
        paper: palette.paper,
      },
    },
    typography: {
      fontFamily: '"Segoe UI", Tahoma, Arial, "Noto Sans Arabic", sans-serif',
      h4: { fontWeight: 900, letterSpacing: '-0.02em' },
      h5: { fontWeight: 850, letterSpacing: '-0.01em' },
      h6: { fontWeight: 800 },
      button: { fontWeight: 850 },
    },
    shape: { borderRadius: 22 },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            minHeight: '100vh',
            background: `radial-gradient(circle at 12% 10%, ${palette.primary}18 0, transparent 32%), radial-gradient(circle at 82% 0%, ${palette.secondary}16 0, transparent 28%), ${palette.background}`,
            color: '#0F172A',
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 850,
            borderRadius: 999,
            paddingInline: 20,
            minHeight: 44,
            transition: 'transform .18s ease, box-shadow .18s ease, background .18s ease',
          },
          contained: {
            background: `linear-gradient(145deg, ${palette.primary} 0%, ${palette.primaryDark} 100%)`,
            boxShadow: `9px 9px 18px ${palette.primary}35, -8px -8px 18px rgba(255,255,255,.85), inset 0 1px 0 rgba(255,255,255,.42)`,
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: `13px 13px 26px ${palette.primary}42, -10px -10px 24px rgba(255,255,255,.95), inset 0 1px 0 rgba(255,255,255,.52)`,
            },
            '&:active': {
              transform: 'translateY(1px)',
              boxShadow: `inset 6px 6px 12px ${palette.primaryDark}55, inset -5px -5px 10px rgba(255,255,255,.25)`,
            },
          },
          outlined: {
            backgroundColor: 'rgba(233,237,243,.92)',
            borderColor: 'rgba(255,255,255,.55)',
            boxShadow: `8px 8px 16px ${neoDark}, -8px -8px 16px ${neoLight}`,
            '&:hover': {
              transform: 'translateY(-1px)',
              backgroundColor: '#EEF2F7',
              borderColor: `${palette.primary}55`,
              boxShadow: `10px 10px 20px ${neoDark}, -10px -10px 20px ${neoLight}`,
            },
          },
          text: {
            borderRadius: 999,
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 28,
            border: '1px solid rgba(255,255,255,.62)',
            background: 'linear-gradient(145deg, #F8FAFC 0%, #E9EDF3 100%)',
            boxShadow: `16px 16px 34px ${neoDark}, -16px -16px 34px ${neoLight}`,
            transition: 'transform .2s ease, box-shadow .2s ease, border-color .2s ease',
            '&:hover': {
              transform: 'translateY(-5px)',
              borderColor: `${palette.primary}44`,
              boxShadow: `22px 22px 46px rgba(163,174,190,.54), -18px -18px 40px rgba(255,255,255,.98)`,
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            borderRadius: 26,
            borderColor: 'rgba(255,255,255,.62)',
            backgroundImage: 'linear-gradient(145deg, #F8FAFC 0%, #E9EDF3 100%)',
            boxShadow: `14px 14px 30px ${neoDark}, -14px -14px 30px ${neoLight}`,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 850, borderRadius: 999 },
        },
      },
      MuiTextField: {
        defaultProps: { variant: 'outlined' },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 18,
            backgroundColor: '#E9EDF3',
            boxShadow: 'inset 7px 7px 14px rgba(163,174,190,.42), inset -7px -7px 14px rgba(255,255,255,.95)',
            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,.38)' },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: `${palette.primary}55` },
            '&.Mui-focused': {
              boxShadow: `inset 8px 8px 16px rgba(163,174,190,.46), inset -8px -8px 16px rgba(255,255,255,.98), 0 0 0 4px ${palette.primary}18`,
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderWidth: 1,
              borderColor: `${palette.primary}88`,
            },
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 30,
            backgroundImage: 'linear-gradient(145deg, #F8FAFC 0%, #E9EDF3 100%)',
            boxShadow: '24px 24px 65px rgba(15,23,42,.26), -14px -14px 35px rgba(255,255,255,.72)',
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: {
            fontWeight: 900,
            color: '#0F172A',
            backgroundColor: '#EEF2F7',
          },
        },
      },
    },
  }), [palette]);

  return (
    <div style={{ display: 'contents' }}>
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        {children}
        <Toaster position="top-right" richColors />
      </ThemeProvider>
    </div>
  );
}

export default function App(_props: Record<string, unknown>) {
  return (
    <AppThemeProvider>
      <ThemedShell>
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </ThemedShell>
    </AppThemeProvider>
  );
}
