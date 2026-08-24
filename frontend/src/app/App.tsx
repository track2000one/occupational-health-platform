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
import { DatePreferenceProvider } from './context/DatePreferenceContext';
import { type Permission } from './data/roles';
import './i18n/config';
import { LoginPage } from './pages/LoginPage';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { DashboardPage } from './pages/DashboardPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { EmployeeHealthCardPage } from './pages/EmployeeHealthCardPage';
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
        <Route path="employees/import" element={
          <PermissionRoute permission="manage:users">
            <DataImportPage employeeMode />
          </PermissionRoute>
        } />
        <Route path="employee-health-card" element={<EmployeeHealthCardPage />} />
        <Route path="employees/:employeeId/health-card" element={<EmployeeHealthCardPage />} />
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
  const neoLight = 'rgba(255,255,255,.82)';
  const neoDark = 'rgba(156,169,184,.34)';

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
        main: '#168B88',
        light: '#DFF8F1',
        dark: '#0F6F6D',
      },
      warning: {
        main: '#D97706',
        light: '#FEF3C7',
        dark: '#92400E',
      },
      error: {
        main: '#DC2626',
        light: '#FEE2E2',
        dark: '#991B1B',
      },
      info: {
        main: '#0284C7',
        light: '#E0F2FE',
        dark: '#075985',
      },
      text: {
        primary: '#111827',
        secondary: '#475569',
      },
      background: {
        default: palette.background,
        paper: palette.paper,
      },
    },
    typography: {
      fontFamily: '"Segoe UI", Tahoma, Arial, "Noto Sans Arabic", sans-serif',
      h4: { fontWeight: 850, letterSpacing: '-0.02em', color: '#111827' },
      h5: { fontWeight: 800, letterSpacing: '-0.01em', color: '#111827' },
      h6: { fontWeight: 780, color: '#111827' },
      subtitle1: { fontWeight: 740 },
      body1: { color: '#1F2937' },
      body2: { color: '#334155' },
      button: { fontWeight: 760 },
    },
    shape: { borderRadius: 18 },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            minHeight: '100vh',
            background: `radial-gradient(circle at 12% 10%, ${palette.primary}12 0, transparent 32%), radial-gradient(circle at 82% 0%, ${palette.secondary}10 0, transparent 28%), ${palette.background}`,
            color: '#111827',
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 780,
            borderRadius: 14,
            paddingInline: 16,
            minHeight: 40,
            transition: 'transform .18s ease, box-shadow .18s ease, background .18s ease',
          },
          sizeLarge: {
            minHeight: 46,
            paddingInline: 22,
          },
          contained: {
            background: `linear-gradient(145deg, ${palette.primary} 0%, ${palette.primaryDark} 100%)`,
            boxShadow: `7px 7px 15px ${palette.primary}30, -6px -6px 14px rgba(255,255,255,.75), inset 0 1px 0 rgba(255,255,255,.32)`,
            '&:hover': {
              transform: 'translateY(-1px)',
              boxShadow: `10px 10px 20px ${palette.primary}38, -7px -7px 16px rgba(255,255,255,.86), inset 0 1px 0 rgba(255,255,255,.42)`,
            },
            '&:active': {
              transform: 'translateY(1px)',
              boxShadow: `inset 4px 4px 9px ${palette.primaryDark}45, inset -4px -4px 8px rgba(255,255,255,.25)`,
            },
          },
          outlined: {
            backgroundColor: 'rgba(248,250,252,.78)',
            borderColor: 'rgba(148,163,184,.36)',
            color: '#1F2937',
            boxShadow: `5px 5px 12px ${neoDark}, -5px -5px 12px ${neoLight}`,
            '&:hover': {
              transform: 'translateY(-1px)',
              backgroundColor: '#F8FAFC',
              borderColor: `${palette.primary}66`,
              boxShadow: `7px 7px 16px ${neoDark}, -7px -7px 16px ${neoLight}`,
            },
          },
          text: {
            borderRadius: 12,
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 22,
            border: '1px solid rgba(255,255,255,.7)',
            background: 'linear-gradient(145deg, #F8FAFC 0%, #EEF3F8 100%)',
            boxShadow: `9px 9px 22px ${neoDark}, -9px -9px 22px ${neoLight}`,
            transition: 'transform .18s ease, box-shadow .18s ease, border-color .18s ease',
            '&:hover': {
              transform: 'translateY(-2px)',
              borderColor: `${palette.primary}33`,
              boxShadow: `12px 12px 28px rgba(156,169,184,.38), -10px -10px 24px rgba(255,255,255,.9)`,
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            borderRadius: 20,
            borderColor: 'rgba(255,255,255,.7)',
            backgroundImage: 'linear-gradient(145deg, #F8FAFC 0%, #EEF3F8 100%)',
            boxShadow: `8px 8px 20px ${neoDark}, -8px -8px 20px ${neoLight}`,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 760, borderRadius: 999 },
          sizeSmall: { height: 24 },
        },
      },
      MuiTextField: {
        defaultProps: { variant: 'outlined' },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 14,
            backgroundColor: '#F8FAFC',
            boxShadow: 'inset 4px 4px 9px rgba(156,169,184,.28), inset -4px -4px 9px rgba(255,255,255,.86)',
            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(148,163,184,.28)' },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: `${palette.primary}55` },
            '&.Mui-focused': {
              boxShadow: `inset 5px 5px 10px rgba(156,169,184,.30), inset -5px -5px 10px rgba(255,255,255,.9), 0 0 0 3px ${palette.primary}18`,
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
            borderRadius: 24,
            backgroundImage: 'linear-gradient(145deg, #F8FAFC 0%, #EEF3F8 100%)',
            boxShadow: '18px 18px 48px rgba(15,23,42,.20), -10px -10px 28px rgba(255,255,255,.75)',
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            color: '#1F2937',
          },
          head: {
            fontWeight: 820,
            color: '#111827',
            backgroundColor: '#F1F5F9',
          },
        },
      },
    },
  }), [palette, neoLight, neoDark]);

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
      <DatePreferenceProvider>
        <ThemedShell>
          <BrowserRouter>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </BrowserRouter>
        </ThemedShell>
      </DatePreferenceProvider>
    </AppThemeProvider>
  );
}
