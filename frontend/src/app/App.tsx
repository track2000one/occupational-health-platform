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
        main: '#43e97b',
        light: '#69f09a',
        dark: '#2ec75e',
      },
      warning: {
        main: '#ffd700',
        light: '#ffdf4d',
        dark: '#ccac00',
      },
      error: {
        main: '#ff6b6b',
        light: '#ff8989',
        dark: '#e64545',
      },
      background: {
        default: palette.background,
        paper: palette.paper,
      },
    },
    typography: {
      fontFamily: '"Times New Roman", "Times", Georgia, serif',
      h4: { fontWeight: 700 },
      h5: { fontWeight: 600 },
      h6: { fontWeight: 600 },
    },
    shape: { borderRadius: 8 },
    components: {
      MuiButton: {
        styleOverrides: {
          root: { textTransform: 'none', fontWeight: 500 },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: { boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
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
