import { useTranslation } from 'react-i18next';
import {
  Grid, Paper, Typography, Box, Card, CardContent, Chip, List,
  ListItem, ListItemText, LinearProgress, Alert, Divider, Avatar
} from '@mui/material';
import {
  People as PeopleIcon, Science as ScienceIcon, Vaccines as VaccinesIcon,
  Warning as WarningIcon, TrendingUp as TrendingUpIcon,
  CheckCircle as CheckIcon, Pending as PendingIcon,
  CalendarMonth as CalendarIcon, Assessment as AssessmentIcon,
  Security as SecurityIcon, BugReport as BugReportIcon,
  HealthAndSafety as HealthIcon, LocalHospital as HospitalIcon,
  PersonSearch as PersonSearchIcon, Campaign as CampaignIcon,
  NotificationsActive as AlertIcon, DataObject as DataIcon,
} from '@mui/icons-material';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { ROLE_DEFINITIONS } from '../data/roles';
import {
  mockLabTests, mockVaccinations, mockNeedleStickInjuries,
  mockMedicalCommitteeReferrals, mockAppointments, mockNotifications,
  mockAuditLogs, mockEmployees,
} from '../data/mockData';

const COLORS = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#43e97b', '#fa709a'];

// ─── Shared Widget Components ──────────────────────────────────────────────────
function StatCard({
  title, value, subtitle, icon, color, trend,
}: {
  title: string; value: string | number; subtitle?: string;
  icon: React.ReactNode; color: string; trend?: string;
}) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ flex: 1 }}>
            <Typography color="text.secondary" variant="body2" gutterBottom>{title}</Typography>
            <Typography variant="h4" fontWeight="bold" color={color}>{value}</Typography>
            {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
            {trend && (
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5, gap: 0.5 }}>
                <TrendingUpIcon sx={{ fontSize: 14, color: 'success.main' }} />
                <Typography variant="caption" color="success.main">{trend}</Typography>
              </Box>
            )}
          </Box>
          <Box sx={{ width: 52, height: 52, borderRadius: 2, bgcolor: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: 'success' | 'warning' | 'error' | 'info' | 'default' }> = {
    completed: { label: 'مكتمل', color: 'success' },
    pending: { label: 'معلق', color: 'warning' },
    missing: { label: 'مفقود', color: 'error' },
    new: { label: 'جديد', color: 'info' },
    underReview: { label: 'قيد المراجعة', color: 'warning' },
    confirmed: { label: 'مؤكد', color: 'success' },
    cancelled: { label: 'ملغي', color: 'default' },
    noShow: { label: 'لم يحضر', color: 'error' },
    closed: { label: 'مغلق', color: 'default' },
    immune: { label: 'محصّن', color: 'success' },
    dose1: { label: 'جرعة 1', color: 'warning' },
    dose2: { label: 'جرعة 2', color: 'info' },
    refused: { label: 'رفض', color: 'error' },
    decisionIssued: { label: 'صدر القرار', color: 'success' },
    draft: { label: 'مسودة', color: 'default' },
    submitted: { label: 'مُقدَّم', color: 'info' },
    followUpRequired: { label: 'متابعة مطلوبة', color: 'warning' },
  };
  const s = map[status] ?? { label: status, color: 'default' as const };
  return <Chip label={s.label} size="small" color={s.color} />;
}

// ─── Role-specific Dashboard Sections ─────────────────────────────────────────

function AdminDashboard({ isRtl }: { isRtl: boolean }) {
  const recentLogs = mockAuditLogs.slice(0, 5);
  const activeUsers = 14;
  const inactiveUsers = 2;
  const pendingActivations = 3;

  return (
    <>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <StatCard title={isRtl ? 'إجمالي المستخدمين' : 'Total Users'} value={activeUsers + inactiveUsers} subtitle={`${activeUsers} نشط`} icon={<PeopleIcon sx={{ fontSize: 28 }} />} color="#667eea" />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <StatCard title={isRtl ? 'بانتظار التفعيل' : 'Awaiting Activation'} value={pendingActivations} icon={<PendingIcon sx={{ fontSize: 28 }} />} color="#f093fb" />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <StatCard title={isRtl ? 'إجمالي الموظفين' : 'Total Employees'} value={mockEmployees.length} icon={<PersonSearchIcon sx={{ fontSize: 28 }} />} color="#43e97b" />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <StatCard title={isRtl ? 'عمليات اليوم' : "Today's Actions"} value={mockAuditLogs.length} icon={<SecurityIcon sx={{ fontSize: 28 }} />} color="#fa709a" />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            {isRtl ? 'سجل العمليات الأخيرة' : 'Recent Audit Log'}
          </Typography>
          <Divider sx={{ mb: 2 }} />
          {recentLogs.map((log) => (
            <Box key={log.id} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Avatar sx={{ width: 32, height: 32, fontSize: '0.75rem', bgcolor: 'primary.main' }}>
                {log.userName.charAt(0)}
              </Avatar>
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" fontWeight="medium">{log.description}</Typography>
                <Typography variant="caption" color="text.secondary">{log.userName} • {log.module} • {log.ipAddress}</Typography>
              </Box>
              <Chip label={log.action} size="small" variant="outlined" />
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                {new Date(log.createdAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
              </Typography>
            </Box>
          ))}
        </Paper>
      </Grid>
    </>
  );
}

function OhManagerDashboard({ isRtl }: { isRtl: boolean }) {
  const centerData = [
    { name: 'المستشفى المركزي', coverage: 85, target: 120, examined: 102 },
    { name: 'المركز الشرقي', coverage: 72, target: 95, examined: 68 },
    { name: 'العيادة الغربية', coverage: 91, target: 80, examined: 73 },
  ];
  const openNSI = mockNeedleStickInjuries.filter(n => n.status !== 'closed').length;
  const pendingCommittee = mockMedicalCommitteeReferrals.filter(r => r.status === 'underReview').length;

  return (
    <>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <StatCard title={isRtl ? 'الموظفون الكلي' : 'Total Employees'} value="295" subtitle="في جميع المراكز" icon={<PeopleIcon sx={{ fontSize: 28 }} />} color="#667eea" trend="+5% عن الشهر الماضي" />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <StatCard title={isRtl ? 'متوسط تغطية الفحص' : 'Avg Exam Coverage'} value="83%" icon={<CheckIcon sx={{ fontSize: 28 }} />} color="#43e97b" />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <StatCard title={isRtl ? 'بلاغات وخز مفتوحة' : 'Open Needle Stick'} value={openNSI} icon={<WarningIcon sx={{ fontSize: 28 }} />} color="#fa709a" />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <StatCard title={isRtl ? 'إحالات قيد المراجعة' : 'Pending Committee'} value={pendingCommittee} icon={<HospitalIcon sx={{ fontSize: 28 }} />} color="#f093fb" />
      </Grid>
      <Grid size={{ xs: 12, lg: 8 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight="bold" gutterBottom>{isRtl ? 'نسبة التغطية بالفحص الدوري' : 'Periodic Exam Coverage by Center'}</Typography>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={centerData}>
              <CartesianGrid key="grid" strokeDasharray="3 3" />
              <XAxis key="xaxis" dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis key="yaxis" />
              <Tooltip key="tooltip" />
              <Legend key="legend" />
              <Bar key="bar-examined" dataKey="examined" fill="#667eea" name="تم الفحص" radius={[6,6,0,0]} />
              <Bar key="bar-target" dataKey="target" fill="#e0e7ff" name="المستهدف" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Paper>
      </Grid>
      <Grid size={{ xs: 12, lg: 4 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight="bold" gutterBottom>{isRtl ? 'نسبة الإنجاز' : 'Achievement Rate'}</Typography>
          {centerData.map((c) => (
            <Box key={c.name} sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2">{c.name}</Typography>
                <Typography variant="body2" fontWeight="bold">{c.coverage}%</Typography>
              </Box>
              <LinearProgress variant="determinate" value={c.coverage} sx={{ height: 8, borderRadius: 4, bgcolor: '#e0e7ff', '& .MuiLinearProgress-bar': { borderRadius: 4, bgcolor: c.coverage >= 85 ? 'success.main' : c.coverage >= 70 ? 'warning.main' : 'error.main' } }} />
            </Box>
          ))}
        </Paper>
      </Grid>
    </>
  );
}

function OhDoctorDashboard({ isRtl }: { isRtl: boolean }) {
  const pendingTests = mockLabTests.filter(t => t.status === 'pending');
  const todayAppts = mockAppointments.filter(a => a.appointmentType === 'ohVisit' && a.status === 'confirmed');
  const openReferrals = mockMedicalCommitteeReferrals.filter(r => r.status !== 'closed');

  return (
    <>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <StatCard title={isRtl ? 'زيارات اليوم' : "Today's Visits"} value={todayAppts.length} icon={<CalendarIcon sx={{ fontSize: 28 }} />} color="#667eea" />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <StatCard title={isRtl ? 'تحاليل معلقة' : 'Pending Lab Tests'} value={pendingTests.length} icon={<ScienceIcon sx={{ fontSize: 28 }} />} color="#f093fb" />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <StatCard title={isRtl ? 'إحالات مفتوحة' : 'Open Referrals'} value={openReferrals.length} icon={<HospitalIcon sx={{ fontSize: 28 }} />} color="#fa709a" />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <StatCard title={isRtl ? 'مواعيد قادمة' : 'Upcoming Appts'} value={mockAppointments.filter(a => a.status === 'new').length} icon={<AlertIcon sx={{ fontSize: 28 }} />} color="#43e97b" />
      </Grid>
      <Grid size={{ xs: 12, lg: 7 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight="bold" gutterBottom>{isRtl ? 'التحاليل المعلقة' : 'Pending Lab Tests'}</Typography>
          <Divider sx={{ mb: 2 }} />
          {pendingTests.map((test) => (
            <Box key={test.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Box>
                <Typography variant="body2" fontWeight="medium">{test.employeeName}</Typography>
                <Typography variant="caption" color="text.secondary">{test.testType} • {test.requestedDate}</Typography>
              </Box>
              <StatusBadge status={test.status} />
            </Box>
          ))}
        </Paper>
      </Grid>
      <Grid size={{ xs: 12, lg: 5 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight="bold" gutterBottom>{isRtl ? 'المواعيد القادمة' : 'Upcoming Appointments'}</Typography>
          <Divider sx={{ mb: 2 }} />
          {mockAppointments.filter(a => a.status !== 'completed').slice(0, 5).map((apt) => (
            <Box key={apt.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Box>
                <Typography variant="body2" fontWeight="medium">{apt.employeeName}</Typography>
                <Typography variant="caption" color="text.secondary">{apt.appointmentDate} — {apt.appointmentTime}</Typography>
              </Box>
              <StatusBadge status={apt.status} />
            </Box>
          ))}
        </Paper>
      </Grid>
    </>
  );
}

function LabOfficerDashboard({ isRtl }: { isRtl: boolean }) {
  const pending = mockLabTests.filter(t => t.status === 'pending');
  const completed = mockLabTests.filter(t => t.status === 'completed');
  const missing = mockLabTests.filter(t => t.status === 'missing');
  const byType = ['Anti-HBs', 'HBsAg', 'HCV', 'HIV', 'PPD', 'Rubella IgG'].map(type => ({
    name: type,
    pending: mockLabTests.filter(t => t.testType === type && t.status === 'pending').length,
    completed: mockLabTests.filter(t => t.testType === type && t.status === 'completed').length,
  }));

  return (
    <>
      <Grid size={{ xs: 12, sm: 4 }}>
        <StatCard title={isRtl ? 'معلقة — بانتظار الإدخال' : 'Pending — Entry Required'} value={pending.length} icon={<PendingIcon sx={{ fontSize: 28 }} />} color="#f093fb" />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <StatCard title={isRtl ? 'مكتملة' : 'Completed'} value={completed.length} icon={<CheckIcon sx={{ fontSize: 28 }} />} color="#43e97b" />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <StatCard title={isRtl ? 'مفقودة' : 'Missing'} value={missing.length} icon={<WarningIcon sx={{ fontSize: 28 }} />} color="#fa709a" />
      </Grid>
      <Grid size={{ xs: 12, lg: 8 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight="bold" gutterBottom>{isRtl ? 'التحاليل حسب النوع' : 'Tests by Type'}</Typography>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byType}>
              <CartesianGrid key="grid" strokeDasharray="3 3" />
              <XAxis key="xaxis" dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis key="yaxis" />
              <Tooltip key="tooltip" />
              <Legend key="legend" />
              <Bar key="bar-pending" dataKey="pending" fill="#f093fb" name="معلق" radius={[4,4,0,0]} />
              <Bar key="bar-completed" dataKey="completed" fill="#43e97b" name="مكتمل" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Paper>
      </Grid>
      <Grid size={{ xs: 12, lg: 4 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight="bold" gutterBottom>{isRtl ? 'قائمة الانتظار' : 'Pending Queue'}</Typography>
          <Divider sx={{ mb: 1.5 }} />
          {pending.length === 0 ? (
            <Alert severity="success">{isRtl ? 'لا توجد تحاليل معلقة' : 'No pending tests'}</Alert>
          ) : pending.map((t) => (
            <Box key={t.id} sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="body2" fontWeight="medium">{t.employeeName}</Typography>
              <Typography variant="caption" color="text.secondary">{t.testType} • طُلب: {t.requestedDate}</Typography>
            </Box>
          ))}
        </Paper>
      </Grid>
    </>
  );
}

function VaccinationOfficerDashboard({ isRtl }: { isRtl: boolean }) {
  const due = mockVaccinations.filter(v => v.nextDueDate);
  const refused = mockVaccinations.filter(v => v.status === 'refused');
  const immune = mockVaccinations.filter(v => v.status === 'immune');
  const coverage = ((immune.length / mockVaccinations.length) * 100).toFixed(0);
  const byVaccine = ['HBV', 'Influenza', 'Rubella', 'PPD'].map(v => ({
    name: v,
    محصّن: mockVaccinations.filter(x => x.vaccineType === v && x.status === 'immune').length,
    جزئي: mockVaccinations.filter(x => x.vaccineType === v && ['dose1','dose2'].includes(x.status)).length,
    رفض: mockVaccinations.filter(x => x.vaccineType === v && x.status === 'refused').length,
  }));

  return (
    <>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <StatCard title={isRtl ? 'نسبة التغطية' : 'Coverage Rate'} value={`${coverage}%`} icon={<VaccinesIcon sx={{ fontSize: 28 }} />} color="#43e97b" />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <StatCard title={isRtl ? 'جرعات مستحقة' : 'Due Doses'} value={due.length} icon={<AlertIcon sx={{ fontSize: 28 }} />} color="#f093fb" />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <StatCard title={isRtl ? 'محصّنون بالكامل' : 'Fully Immune'} value={immune.length} icon={<CheckIcon sx={{ fontSize: 28 }} />} color="#667eea" />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <StatCard title={isRtl ? 'حالات رفض' : 'Refusals'} value={refused.length} icon={<WarningIcon sx={{ fontSize: 28 }} />} color="#fa709a" />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight="bold" gutterBottom>{isRtl ? 'تغطية التطعيم حسب النوع' : 'Vaccination Coverage by Type'}</Typography>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byVaccine}>
              <CartesianGrid key="grid" strokeDasharray="3 3" />
              <XAxis key="xaxis" dataKey="name" />
              <YAxis key="yaxis" />
              <Tooltip key="tooltip" />
              <Legend key="legend" />
              <Bar key="bar-immune" dataKey="محصّن" fill="#43e97b" radius={[4,4,0,0]} />
              <Bar key="bar-partial" dataKey="جزئي" fill="#f093fb" radius={[4,4,0,0]} />
              <Bar key="bar-refused" dataKey="رفض" fill="#fa709a" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Paper>
      </Grid>
    </>
  );
}

function NeedleStickDashboard({ isRtl }: { isRtl: boolean }) {
  const openCases = mockNeedleStickInjuries.filter(n => n.status !== 'closed');
  const followUp = mockNeedleStickInjuries.filter(n => n.followUpRequired && n.status !== 'closed');

  return (
    <>
      <Grid size={{ xs: 12, sm: 4 }}>
        <StatCard title={isRtl ? 'إجمالي البلاغات' : 'Total Reports'} value={mockNeedleStickInjuries.length} icon={<HealthIcon sx={{ fontSize: 28 }} />} color="#667eea" />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <StatCard title={isRtl ? 'حالات مفتوحة' : 'Open Cases'} value={openCases.length} icon={<WarningIcon sx={{ fontSize: 28 }} />} color="#fa709a" />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <StatCard title={isRtl ? 'متابعة مطلوبة' : 'Follow-up Required'} value={followUp.length} icon={<AlertIcon sx={{ fontSize: 28 }} />} color="#f093fb" />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight="bold" gutterBottom>{isRtl ? 'بلاغات الوخز' : 'Needle Stick Reports'}</Typography>
          <Divider sx={{ mb: 2 }} />
          {mockNeedleStickInjuries.map((nsi) => (
            <Box key={nsi.id} sx={{ p: 2, mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: nsi.status !== 'closed' ? 'warning.50' : 'transparent' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="body2" fontWeight="bold">{nsi.id} — {nsi.employeeName}</Typography>
                <StatusBadge status={nsi.status} />
              </Box>
              <Typography variant="caption" color="text.secondary">{nsi.workplace} • {nsi.exposureDate}</Typography>
              {nsi.followUpRequired && <Chip label={isRtl ? 'متابعة مطلوبة' : 'Follow-up Required'} size="small" color="warning" sx={{ ml: 1 }} />}
            </Box>
          ))}
        </Paper>
      </Grid>
    </>
  );
}

function CommitteeDashboard({ isRtl }: { isRtl: boolean }) {
  const pending = mockMedicalCommitteeReferrals.filter(r => r.status === 'underReview' || r.status === 'submitted');
  const decided = mockMedicalCommitteeReferrals.filter(r => r.status === 'decisionIssued');

  return (
    <>
      <Grid size={{ xs: 12, sm: 4 }}>
        <StatCard title={isRtl ? 'إجمالي الإحالات' : 'Total Referrals'} value={mockMedicalCommitteeReferrals.length} icon={<HospitalIcon sx={{ fontSize: 28 }} />} color="#667eea" />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <StatCard title={isRtl ? 'بانتظار القرار' : 'Awaiting Decision'} value={pending.length} icon={<PendingIcon sx={{ fontSize: 28 }} />} color="#f093fb" />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <StatCard title={isRtl ? 'صدر القرار' : 'Decision Issued'} value={decided.length} icon={<CheckIcon sx={{ fontSize: 28 }} />} color="#43e97b" />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight="bold" gutterBottom>{isRtl ? 'الإحالات قيد المراجعة' : 'Referrals Under Review'}</Typography>
          <Divider sx={{ mb: 2 }} />
          {pending.length === 0 ? (
            <Alert severity="success">{isRtl ? 'لا توجد إحالات معلقة' : 'No pending referrals'}</Alert>
          ) : pending.map((r) => (
            <Box key={r.id} sx={{ p: 2, mb: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2" fontWeight="bold">{r.employeeName}</Typography>
                <StatusBadge status={r.status} />
              </Box>
              <Typography variant="caption" color="text.secondary">{r.transactionNumber} • {r.diagnosis}</Typography>
            </Box>
          ))}
        </Paper>
      </Grid>
    </>
  );
}

function ExecutiveDashboard({ isRtl }: { isRtl: boolean }) {
  const kpis = [
    { label: isRtl ? 'إجمالي الموظفين' : 'Total Employees', value: '295', color: '#667eea' },
    { label: isRtl ? 'نسبة الفحص الدوري' : 'Periodic Exam Rate', value: '83%', color: '#43e97b' },
    { label: isRtl ? 'تغطية التطعيم' : 'Vaccination Coverage', value: '67%', color: '#f093fb' },
    { label: isRtl ? 'إصابات وخز مفتوحة' : 'Open NSI Cases', value: '1', color: '#fa709a' },
    { label: isRtl ? 'إحالات مفتوحة' : 'Open Referrals', value: '1', color: '#764ba2' },
    { label: isRtl ? 'معدل الامتثال' : 'Compliance Rate', value: '98%', color: '#4facfe' },
  ];
  const centerData = [
    { name: 'المستشفى المركزي', فحص: 85, تطعيم: 72 },
    { name: 'المركز الشرقي', فحص: 72, تطعيم: 68 },
    { name: 'العيادة الغربية', فحص: 91, تطعيم: 79 },
  ];

  return (
    <>
      {kpis.map((kpi) => (
        <Grid key={kpi.label} size={{ xs: 6, sm: 4, lg: 2 }}>
          <Card sx={{ textAlign: 'center', p: 2 }}>
            <Typography variant="h4" fontWeight="bold" color={kpi.color}>{kpi.value}</Typography>
            <Typography variant="caption" color="text.secondary">{kpi.label}</Typography>
          </Card>
        </Grid>
      ))}
      <Grid size={{ xs: 12 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight="bold" gutterBottom>{isRtl ? 'مقارنة أداء المراكز' : 'Center Performance Comparison'}</Typography>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={centerData}>
              <CartesianGrid key="grid" strokeDasharray="3 3" />
              <XAxis key="xaxis" dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis key="yaxis" domain={[0, 100]} unit="%" />
              <Tooltip key="tooltip" />
              <Legend key="legend" />
              <Bar key="bar-exam" dataKey="فحص" fill="#667eea" name="الفحص الدوري %" radius={[4,4,0,0]} />
              <Bar key="bar-vac" dataKey="تطعيم" fill="#43e97b" name="التطعيم %" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Paper>
      </Grid>
    </>
  );
}

function EmployeeDashboard({ isRtl }: { isRtl: boolean }) {
  const myAppts = mockAppointments.filter(a => a.employeeId === '1001').slice(0, 4);
  const myTests = mockLabTests.filter(t => t.employeeId === '1001');
  const myVax = mockVaccinations.filter(v => v.employeeId === '1001');

  return (
    <>
      <Grid size={{ xs: 12, sm: 4 }}>
        <StatCard title={isRtl ? 'مواعيدي القادمة' : 'My Upcoming Appts'} value={myAppts.filter(a => a.status !== 'completed').length} icon={<CalendarIcon sx={{ fontSize: 28 }} />} color="#667eea" />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <StatCard title={isRtl ? 'تحاليلي' : 'My Lab Tests'} value={myTests.length} icon={<ScienceIcon sx={{ fontSize: 28 }} />} color="#f093fb" />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <StatCard title={isRtl ? 'تطعيماتي' : 'My Vaccinations'} value={myVax.length} icon={<VaccinesIcon sx={{ fontSize: 28 }} />} color="#43e97b" />
      </Grid>
      <Grid size={{ xs: 12, lg: 6 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight="bold" gutterBottom>{isRtl ? 'مواعيدي' : 'My Appointments'}</Typography>
          <Divider sx={{ mb: 2 }} />
          {myAppts.map((a) => (
            <Box key={a.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Box>
                <Typography variant="body2" fontWeight="medium">{a.appointmentDate} — {a.appointmentTime}</Typography>
                <Typography variant="caption" color="text.secondary">{a.assignedTo}</Typography>
              </Box>
              <StatusBadge status={a.status} />
            </Box>
          ))}
        </Paper>
      </Grid>
      <Grid size={{ xs: 12, lg: 6 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight="bold" gutterBottom>{isRtl ? 'حالة تطعيماتي' : 'My Vaccination Status'}</Typography>
          <Divider sx={{ mb: 2 }} />
          {myVax.map((v) => (
            <Box key={v.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Box>
                <Typography variant="body2" fontWeight="medium">{v.vaccineType}</Typography>
                {v.nextDueDate && <Typography variant="caption" color="warning.main">الجرعة التالية: {v.nextDueDate}</Typography>}
              </Box>
              <StatusBadge status={v.status} />
            </Box>
          ))}
        </Paper>
      </Grid>
    </>
  );
}

function DataQualityDashboard({ isRtl }: { isRtl: boolean }) {
  const issues = [
    { issue: isRtl ? 'موظفون بدون رقم جوال' : 'Missing Mobile', count: 8, color: '#fa709a' },
    { issue: isRtl ? 'موظفون بدون تاريخ ميلاد' : 'Missing DOB', count: 12, color: '#f093fb' },
    { issue: isRtl ? 'تكرار رقم الهوية' : 'Duplicate ID', count: 5, color: '#ff6b6b' },
    { issue: isRtl ? 'تحاليل ناقصة' : 'Incomplete Labs', count: 17, color: '#764ba2' },
    { issue: isRtl ? 'تطعيمات غير مكتملة' : 'Incomplete Vaccines', count: 9, color: '#4facfe' },
    { issue: isRtl ? 'تواريخ غير منطقية' : 'Illogical Dates', count: 3, color: '#43e97b' },
  ];

  return (
    <>
      {issues.map((i) => (
        <Grid key={i.issue} size={{ xs: 6, sm: 4, lg: 2 }}>
          <Card sx={{ textAlign: 'center', p: 1.5, borderTop: `4px solid ${i.color}` }}>
            <Typography variant="h4" fontWeight="bold" color={i.color}>{i.count}</Typography>
            <Typography variant="caption" color="text.secondary">{i.issue}</Typography>
          </Card>
        </Grid>
      ))}
      <Grid size={{ xs: 12 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight="bold" gutterBottom>{isRtl ? 'توزيع مشكلات جودة البيانات' : 'Data Quality Issues Distribution'}</Typography>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={issues} layout="vertical">
              <CartesianGrid key="grid" strokeDasharray="3 3" />
              <XAxis key="xaxis" type="number" />
              <YAxis key="yaxis" type="category" dataKey="issue" width={160} tick={{ fontSize: 11 }} />
              <Tooltip key="tooltip" />
              <Bar key="bar-count" dataKey="count" fill="#667eea" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Paper>
      </Grid>
    </>
  );
}

function GenericDashboard({ isRtl }: { isRtl: boolean }) {
  const activityData = [
    { month: 'يناير', تحاليل: 45, تطعيمات: 52, زيارات: 38 },
    { month: 'فبراير', تحاليل: 52, تطعيمات: 61, زيارات: 42 },
    { month: 'مارس', تحاليل: 48, تطعيمات: 58, زيارات: 39 },
    { month: 'أبريل', تحاليل: 61, تطعيمات: 72, زيارات: 51 },
    { month: 'مايو', تحاليل: 55, تطعيمات: 68, زيارات: 47 },
  ];

  return (
    <>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <StatCard title={isRtl ? 'إجمالي الموظفين' : 'Total Employees'} value={mockEmployees.length} icon={<PeopleIcon sx={{ fontSize: 28 }} />} color="#667eea" trend="+5%" />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <StatCard title={isRtl ? 'تحاليل معلقة' : 'Pending Tests'} value={mockLabTests.filter(t => t.status === 'pending').length} icon={<ScienceIcon sx={{ fontSize: 28 }} />} color="#764ba2" />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <StatCard title={isRtl ? 'تطعيمات قادمة' : 'Upcoming Vaccinations'} value={mockVaccinations.filter(v => v.nextDueDate).length} icon={<VaccinesIcon sx={{ fontSize: 28 }} />} color="#f093fb" />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <StatCard title={isRtl ? 'مواعيد اليوم' : "Today's Appointments"} value={mockAppointments.filter(a => a.status === 'confirmed').length} icon={<CalendarIcon sx={{ fontSize: 28 }} />} color="#43e97b" />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight="bold" gutterBottom>{isRtl ? 'النشاط الشهري' : 'Monthly Activity'}</Typography>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={activityData}>
              <CartesianGrid key="grid" strokeDasharray="3 3" />
              <XAxis key="xaxis" dataKey="month" />
              <YAxis key="yaxis" />
              <Tooltip key="tooltip" />
              <Legend key="legend" />
              <Line key="line-tests" type="monotone" dataKey="تحاليل" stroke="#667eea" strokeWidth={2} />
              <Line key="line-vax" type="monotone" dataKey="تطعيمات" stroke="#43e97b" strokeWidth={2} />
              <Line key="line-visits" type="monotone" dataKey="زيارات" stroke="#fa709a" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Paper>
      </Grid>
    </>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────
export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const isRtl = i18n.language === 'ar';
  const roleDef = user ? ROLE_DEFINITIONS[user.role] : null;

  const unreadNotifs = mockNotifications.filter(
    n => !n.isRead && (n.userId === user?.id || n.role === user?.role || n.userId === 'all')
  ).length;

  const greetingsByRole: Record<string, { en: string; ar: string }> = {
    systemAdmin: { en: 'System overview and user management', ar: 'نظرة عامة على النظام وإدارة المستخدمين' },
    ohManager: { en: 'Monitor overall OH performance and center achievement', ar: 'متابعة الأداء العام للصحة المهنية وإنجاز المراكز' },
    ohDoctor: { en: 'Manage occupational health files and employee evaluations', ar: 'إدارة ملفات الصحة المهنية وتقييمات الموظفين' },
    clinicDoctor: { en: "Today's clinic visits and follow-up cases", ar: 'زيارات العيادة اليوم وحالات المتابعة' },
    labOfficer: { en: 'Pending lab tests and result entry queue', ar: 'التحاليل المعلقة وقائمة إدخال النتائج' },
    vaccinationOfficer: { en: 'Vaccination coverage and dose schedules', ar: 'تغطية التطعيم وجداول الجرعات' },
    needleStickOfficer: { en: 'Needle stick incident tracking and follow-up', ar: 'متابعة بلاغات الوخز بالإبر' },
    medicalCommitteeOfficer: { en: 'Referrals and committee decisions', ar: 'الإحالات وقرارات الهيئة الطبية' },
    campaignOfficer: { en: 'Health campaign management and coverage tracking', ar: 'إدارة الحملات الصحية ومتابعة التغطية' },
    centerManager: { en: 'Your center performance and employee compliance', ar: 'أداء المركز ومتابعة التزام الموظفين' },
    executive: { en: 'Key performance indicators and strategic overview', ar: 'مؤشرات الأداء الرئيسية والنظرة الاستراتيجية' },
    employee: { en: 'Your health file, appointments, and vaccination status', ar: 'ملفك الصحي ومواعيدك وحالة التطعيمات' },
    dataEntry: { en: 'Data entry tasks and pending records', ar: 'مهام إدخال البيانات والسجلات المعلقة' },
    dataQuality: { en: 'Data quality issues and missing fields overview', ar: 'مشكلات جودة البيانات والحقول المفقودة' },
    reportsOfficer: { en: 'Reports, analytics, and export tools', ar: 'التقارير والتحليلات وأدوات التصدير' },
    techSupport: { en: 'System status and open support tickets', ar: 'حالة النظام وتذاكر الدعم الفني المفتوحة' },
  };

  const greeting = user ? (greetingsByRole[user.role] ?? { en: 'Welcome', ar: 'مرحباً' }) : { en: 'Welcome', ar: 'مرحباً' };

  function renderRoleDashboard() {
    if (!user) return <GenericDashboard isRtl={isRtl} />;
    switch (user.role) {
      case 'systemAdmin': return <AdminDashboard isRtl={isRtl} />;
      case 'ohManager': case 'centerManager': return <OhManagerDashboard isRtl={isRtl} />;
      case 'ohDoctor': case 'clinicDoctor': return <OhDoctorDashboard isRtl={isRtl} />;
      case 'labOfficer': return <LabOfficerDashboard isRtl={isRtl} />;
      case 'vaccinationOfficer': return <VaccinationOfficerDashboard isRtl={isRtl} />;
      case 'needleStickOfficer': return <NeedleStickDashboard isRtl={isRtl} />;
      case 'medicalCommitteeOfficer': return <CommitteeDashboard isRtl={isRtl} />;
      case 'executive': case 'reportsOfficer': return <ExecutiveDashboard isRtl={isRtl} />;
      case 'employee': return <EmployeeDashboard isRtl={isRtl} />;
      case 'dataQuality': return <DataQualityDashboard isRtl={isRtl} />;
      default: return <GenericDashboard isRtl={isRtl} />;
    }
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" gutterBottom>
            {t('dashboard')}
          </Typography>
          {roleDef && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip
                label={isRtl ? roleDef.nameAr : roleDef.nameEn}
                size="small"
                sx={{ bgcolor: roleDef.bgColor, color: roleDef.color, fontWeight: 700 }}
              />
              <Typography variant="body2" color="text.secondary">
                {isRtl ? greeting.ar : greeting.en}
              </Typography>
            </Box>
          )}
        </Box>
        {unreadNotifs > 0 && (
          <Alert severity="info" sx={{ py: 0.5 }}>
            {isRtl ? `لديك ${unreadNotifs} إشعارات غير مقروءة` : `You have ${unreadNotifs} unread notifications`}
          </Alert>
        )}
      </Box>

      <Grid container spacing={3}>
        {renderRoleDashboard()}
      </Grid>
    </Box>
  );
}
