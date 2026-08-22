import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  Stack,
  Typography,
  Avatar,
} from '@mui/material';
import {
  People as PeopleIcon,
  Science as ScienceIcon,
  Vaccines as VaccinesIcon,
  MedicalServices as MedicalServicesIcon,
  CalendarMonth as CalendarIcon,
  NotificationsActive as NotificationsIcon,
  WarningAmber as WarningIcon,
  Info as InfoIcon,
  TrendingUp as TrendingUpIcon,
  PersonAdd as PersonAddIcon,
  CloudUpload as CloudUploadIcon,
  Download as DownloadIcon,
  Visibility as VisibilityIcon,
  Edit as EditIcon,
  Security as SecurityIcon,
  LocalHospital as HospitalIcon,
  MonitorHeart as MonitorHeartIcon,
  Analytics as AnalyticsIcon,
} from '@mui/icons-material';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useAuth } from '../context/AuthContext';

const theme = {
  teal: '#168B88',
  tealDark: '#0F6F6D',
  tealSoft: '#DFF8F1',
  indigo: '#4F63F6',
  blue: '#0284C7',
  orange: '#D97706',
  red: '#DC2626',
  navy: '#111827',
  slate: '#475569',
  border: 'rgba(148, 163, 184, 0.18)',
  surface: '#FFFFFF',
  background: '#F4F7FB',
};

const panelSx = {
  borderRadius: 4,
  border: `1px solid ${theme.border}`,
  background: 'linear-gradient(145deg, rgba(255,255,255,.98), rgba(248,250,252,.96))',
  boxShadow: '0 14px 34px rgba(15, 23, 42, 0.07)',
};

const appointments = [
  { time: '09:00 ص', date: '2025/05/26', name: 'سلمان بن خالد', unit: 'عيادة الباطنة', status: 'مراجعة دورية', color: '#DBEAFE', text: '#1D4ED8', avatar: 'س' },
  { time: '10:30 ص', date: '2025/05/26', name: 'نورة بنت عبدالعزيز', unit: 'عيادة طب العمل', status: 'متابعة حالة', color: '#FEF3C7', text: '#92400E', avatar: 'ن' },
  { time: '12:00 م', date: '2025/05/26', name: 'محمد بن عبدالله', unit: 'عيادة الفحص الطبي', status: 'فحص ما قبل التوظيف', color: '#DFF8F1', text: '#0F6F6D', avatar: 'م' },
  { time: '02:30 م', date: '2025/05/26', name: 'فاطمة بنت محمد', unit: 'عيادة الباطنة', status: 'مراجعة نتائج', color: '#E0F2FE', text: '#0369A1', avatar: 'ف' },
];

const alerts = [
  { title: 'ارتفاع في حالات الإجهاد الحراري', details: 'تم تسجيل 5 حالات جديدة هذا الأسبوع', time: 'منذ 15 دقيقة', severity: 'danger' as const },
  { title: 'تحليل غير مكتمل', details: 'هناك 18 تحليل لم تُستكمل النتائج', time: 'منذ 1 ساعة', severity: 'warning' as const },
  { title: 'تطعيمات منتهية قريباً', details: 'تنتهي صلاحية 23 تطعيماً خلال 7 أيام', time: 'منذ 3 ساعات', severity: 'info' as const },
];

const trendData = [
  { month: 'ديسمبر', cases: 42 },
  { month: 'يناير', cases: 86 },
  { month: 'فبراير', cases: 92 },
  { month: 'مارس', cases: 138 },
  { month: 'أبريل', cases: 104 },
  { month: 'مايو', cases: 162 },
];

const donutData = [
  { name: 'مكتمل', value: 86 },
  { name: 'متبقي', value: 14 },
];

const users = [
  { name: 'أحمد بن سعود القحطاني', role: 'طبيب', badgeColor: '#DFF8F1', textColor: '#0F6F6D', center: 'مركز صحي الشمال', id: 'EMP-1001', avatar: 'أ' },
  { name: 'نورة بنت محمد العتيبي', role: 'ممرضة', badgeColor: '#F3E8FF', textColor: '#7E22CE', center: 'مركز صحي الوسط', id: 'EMP-1002', avatar: 'ن' },
  { name: 'عبدالله بن فهد الشهري', role: 'أخصائي صحة مهنية', badgeColor: '#DBEAFE', textColor: '#1D4ED8', center: 'مركز صحي الجنوب', id: 'EMP-1003', avatar: 'ع' },
  { name: 'مريم بنت خالد الدوسري', role: 'إداري', badgeColor: '#FFEDD5', textColor: '#C2410C', center: 'الإدارة الرئيسية', id: 'EMP-1004', avatar: 'م' },
];

function StatCard({ title, value, trend, icon, accent, soft }: {
  title: string;
  value: string;
  trend: string;
  icon: ReactNode;
  accent: string;
  soft: string;
}) {
  return (
    <Card sx={{ ...panelSx, height: '100%', overflow: 'hidden' }}>
      <CardContent sx={{ p: 2.35 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
          <Box>
            <Typography variant="body2" sx={{ color: theme.slate, fontWeight: 760, mb: .5 }}>{title}</Typography>
            <Typography variant="h4" sx={{ color: theme.navy, fontWeight: 900, lineHeight: 1.05 }}>{value}</Typography>
            <Stack direction="row" alignItems="center" spacing={.6} sx={{ mt: .85 }}>
              <TrendingUpIcon sx={{ color: theme.teal, fontSize: 16 }} />
              <Typography variant="caption" sx={{ color: theme.teal, fontWeight: 850 }}>{trend}</Typography>
              <Typography variant="caption" sx={{ color: '#64748B' }}>من الشهر الماضي</Typography>
            </Stack>
          </Box>
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              bgcolor: soft,
              color: accent,
              boxShadow: `0 14px 28px ${accent}18`,
            }}
          >
            {icon}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function SectionHeader({ title, icon }: { title: string; icon: ReactNode }) {
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.4 }}>
      <Typography variant="h6" sx={{ fontWeight: 900, color: theme.navy }}>{title}</Typography>
      <Box sx={{ color: '#334155', display: 'grid', placeItems: 'center' }}>{icon}</Box>
    </Stack>
  );
}

function QuickAction({ label, icon, color, onClick, variant = 'solid' }: {
  label: string;
  icon: ReactNode;
  color: string;
  onClick: () => void;
  variant?: 'solid' | 'soft';
}) {
  const solid = variant === 'solid';
  return (
    <Button
      fullWidth
      onClick={onClick}
      startIcon={icon}
      sx={{
        minHeight: 48,
        borderRadius: 2.2,
        fontWeight: 900,
        color: solid ? '#fff' : '#1F2937',
        bgcolor: solid ? color : '#FFFFFF',
        background: solid ? `linear-gradient(145deg, ${color}, ${color === theme.indigo ? '#2563EB' : theme.tealDark})` : '#FFFFFF',
        border: solid ? 'none' : `1px solid ${theme.border}`,
        boxShadow: solid ? `0 12px 24px ${color}35` : '0 10px 22px rgba(15,23,42,.07)',
        '&:hover': {
          transform: 'translateY(-2px)',
          bgcolor: solid ? color : '#F8FAFC',
          boxShadow: solid ? `0 16px 30px ${color}45` : '0 14px 28px rgba(15,23,42,.10)',
        },
      }}
    >
      {label}
    </Button>
  );
}

export function DashboardPage() {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isRtl = i18n.language === 'ar';

  return (
    <Box sx={{ direction: isRtl ? 'rtl' : 'ltr', color: theme.navy }}>
      <Box
        sx={{
          borderRadius: 4,
          minHeight: 176,
          p: { xs: 3, md: 4 },
          mb: 2.4,
          position: 'relative',
          overflow: 'hidden',
          background: `linear-gradient(135deg, ${theme.tealDark} 0%, ${theme.teal} 56%, #0FA7A2 100%)`,
          boxShadow: '0 18px 36px rgba(15, 111, 109, .24)',
        }}
      >
        <Box sx={{ position: 'absolute', inset: 0, opacity: .18, background: 'radial-gradient(circle at 22% 20%, #fff 0, transparent 24%), radial-gradient(circle at 88% 14%, #fff 0, transparent 18%)' }} />
        <Box sx={{ position: 'absolute', insetInlineStart: { xs: -35, md: 34 }, bottom: -4, width: 260, height: 138, display: { xs: 'none', md: 'block' } }}>
          <Box sx={{ position: 'absolute', bottom: 18, left: 45, width: 145, height: 92, borderRadius: 3, bgcolor: 'rgba(255,255,255,.88)', boxShadow: '0 18px 36px rgba(15,23,42,.18)' }} />
          <Box sx={{ position: 'absolute', bottom: 48, left: 78, width: 78, height: 88, borderRadius: 2.4, bgcolor: 'rgba(241,245,249,.96)', boxShadow: '0 14px 28px rgba(15,23,42,.14)' }} />
          <Box sx={{ position: 'absolute', bottom: 70, left: 100, width: 34, height: 34, borderRadius: '50%', bgcolor: theme.teal, color: '#fff', display: 'grid', placeItems: 'center' }}><MonitorHeartIcon fontSize="small" /></Box>
          <Box sx={{ position: 'absolute', bottom: 18, left: 24, width: 210, height: 12, borderRadius: 999, bgcolor: 'rgba(255,255,255,.28)' }} />
          <Box sx={{ position: 'absolute', bottom: 22, right: 0, color: 'rgba(255,255,255,.72)' }}><HospitalIcon sx={{ fontSize: 62 }} /></Box>
        </Box>
        <Box sx={{ position: 'relative', maxWidth: 760, mr: 'auto', textAlign: 'right' }}>
          <Typography variant="h4" sx={{ color: '#fff', fontWeight: 950, mb: 1.2 }}>
            مرحباً بك في منصة إدارة الصحة المهنية
          </Typography>
          <Typography variant="h6" sx={{ color: 'rgba(255,255,255,.92)', fontWeight: 700, lineHeight: 1.8, mb: 2.5 }}>
            إدارة شاملة لصحة الموظفين، الحالات المهنية، العيادات، التحاليل، التطعيمات والتقارير في مكان واحد.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="flex-start">
            <Button variant="contained" onClick={() => navigate('/reports')} startIcon={<AnalyticsIcon />} sx={{ bgcolor: '#fff', color: theme.tealDark, boxShadow: '0 10px 24px rgba(15,23,42,.18)', '&:hover': { bgcolor: '#F8FAFC' } }}>
              عرض التقارير
            </Button>
            <Button variant="outlined" onClick={() => navigate('/appointments')} startIcon={<CalendarIcon />} sx={{ color: '#fff', borderColor: 'rgba(255,255,255,.55)', bgcolor: 'rgba(255,255,255,.08)', '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,.16)' } }}>
              موعد جديد
            </Button>
          </Stack>
        </Box>
      </Box>

      <Grid container spacing={2.2} sx={{ mb: 2.2 }}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}><StatCard title="إجمالي الموظفين" value="2,458" trend="5.2%" icon={<PeopleIcon sx={{ fontSize: 30 }} />} accent={theme.teal} soft="#DFF8F1" /></Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}><StatCard title="الحالات المهنية" value="142" trend="8.7%" icon={<MedicalServicesIcon sx={{ fontSize: 30 }} />} accent={theme.red} soft="#FEE2E2" /></Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}><StatCard title="التحاليل" value="3,256" trend="12.4%" icon={<ScienceIcon sx={{ fontSize: 30 }} />} accent={theme.blue} soft="#E0F2FE" /></Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}><StatCard title="التطعيمات" value="1,987" trend="6.3%" icon={<VaccinesIcon sx={{ fontSize: 30 }} />} accent="#7C3AED" soft="#F3E8FF" /></Grid>
      </Grid>

      <Grid container spacing={2.2} sx={{ mb: 2.2 }}>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Card sx={{ ...panelSx, height: '100%' }}>
            <CardContent sx={{ p: 2.5 }}>
              <SectionHeader title="المواعيد القادمة" icon={<CalendarIcon />} />
              <Divider sx={{ mb: 1 }} />
              <Stack spacing={0}>
                {appointments.map((item) => (
                  <Stack key={`${item.name}-${item.time}`} direction="row" alignItems="center" spacing={1.4} sx={{ py: 1.15, borderBottom: `1px solid ${theme.border}` }}>
                    <Box sx={{ minWidth: 76, textAlign: 'left' }}>
                      <Typography variant="caption" sx={{ color: theme.teal, fontWeight: 900 }}>{item.time}</Typography>
                      <Typography variant="caption" display="block" sx={{ color: '#64748B' }}>{item.date}</Typography>
                    </Box>
                    <Chip label={item.status} size="small" sx={{ bgcolor: item.color, color: item.text, fontWeight: 850, minWidth: 96 }} />
                    <Box sx={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
                      <Typography variant="body2" noWrap sx={{ fontWeight: 850 }}>{item.name}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>{item.unit}</Typography>
                    </Box>
                    <Avatar sx={{ width: 32, height: 32, bgcolor: '#EEF2F7', color: theme.teal, fontWeight: 900 }}>{item.avatar}</Avatar>
                  </Stack>
                ))}
              </Stack>
              <Button size="small" sx={{ mt: 1.2, color: theme.blue }} endIcon={<span>←</span>}>عرض جميع المواعيد</Button>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 3.4 }}>
          <Card sx={{ ...panelSx, height: '100%' }}>
            <CardContent sx={{ p: 2.5 }}>
              <SectionHeader title="تنبيهات الصحة المهنية" icon={<NotificationsIcon />} />
              <Divider sx={{ mb: 1 }} />
              <Stack spacing={0}>
                {alerts.map((alert) => {
                  const colors = alert.severity === 'danger'
                    ? { bg: '#FEE2E2', color: theme.red, icon: <WarningIcon /> }
                    : alert.severity === 'warning'
                      ? { bg: '#FEF3C7', color: theme.orange, icon: <WarningIcon /> }
                      : { bg: '#E0F2FE', color: theme.blue, icon: <InfoIcon /> };
                  return (
                    <Stack key={alert.title} direction="row" alignItems="center" spacing={1.3} sx={{ py: 1.35, borderBottom: `1px solid ${theme.border}` }}>
                      <Box sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: colors.bg, color: colors.color, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{colors.icon}</Box>
                      <Box sx={{ flex: 1, textAlign: 'right' }}>
                        <Typography variant="body2" sx={{ fontWeight: 900 }}>{alert.title}</Typography>
                        <Typography variant="caption" sx={{ color: '#64748B' }}>{alert.details}</Typography>
                      </Box>
                      <Typography variant="caption" sx={{ color: '#94A3B8', whiteSpace: 'nowrap' }}>{alert.time}</Typography>
                    </Stack>
                  );
                })}
              </Stack>
              <Button size="small" sx={{ mt: 1.2, color: theme.blue }} endIcon={<span>←</span>}>عرض جميع التنبيهات</Button>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 4.6 }}>
          <Card sx={{ ...panelSx, height: '100%' }}>
            <CardContent sx={{ p: 2.5 }}>
              <SectionHeader title="نظرة تحليلية" icon={<AnalyticsIcon />} />
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 4.2 }}>
                  <Box sx={{ border: `1px solid ${theme.border}`, borderRadius: 3, p: 1.5, height: '100%' }}>
                    <Typography variant="body2" sx={{ fontWeight: 900, mb: 1 }}>نسبة اكتمال التحاليل</Typography>
                    <Box sx={{ height: 170, position: 'relative' }}>
                      <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={donutData} innerRadius={48} outerRadius={68} paddingAngle={2} dataKey="value"><Cell fill={theme.teal} /><Cell fill="#E5E7EB" /></Pie></PieChart></ResponsiveContainer>
                      <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}><Box><Typography variant="h5" sx={{ fontWeight: 950, color: theme.navy }}>86%</Typography><Typography variant="caption" sx={{ color: '#64748B' }}>مكتمل</Typography></Box></Box>
                    </Box>
                    <Typography variant="caption" color="text.secondary">3,256 من أصل 3,784 تحليل</Typography>
                  </Box>
                </Grid>
                <Grid size={{ xs: 12, md: 7.8 }}>
                  <Box sx={{ border: `1px solid ${theme.border}`, borderRadius: 3, p: 1.5, height: '100%' }}>
                    <Typography variant="body2" sx={{ fontWeight: 900 }}>اتجاه الحالات المهنية</Typography>
                    <Typography variant="caption" color="text.secondary">آخر 6 أشهر</Typography>
                    <Box sx={{ height: 190, mt: 1 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.28)" />
                          <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                          <Tooltip />
                          <Line type="monotone" dataKey="cases" stroke={theme.teal} strokeWidth={3} dot={{ r: 4, fill: theme.teal }} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </Box>
                  </Box>
                </Grid>
              </Grid>
              <Button size="small" sx={{ mt: 1.2, color: theme.blue }} endIcon={<span>←</span>}>عرض التقرير الكامل</Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={1.6} sx={{ mb: 2.2 }}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}><QuickAction label="إضافة مستخدم" icon={<PersonAddIcon />} color={theme.indigo} onClick={() => navigate('/admin/users')} /></Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}><QuickAction label="استيراد Excel" icon={<CloudUploadIcon />} color="#16A34A" onClick={() => navigate('/data-import')} /></Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}><QuickAction label="تصدير تقرير" icon={<DownloadIcon />} color="#2563EB" onClick={() => navigate('/reports')} /></Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}><QuickAction label="موعد جديد" icon={<CalendarIcon />} color={theme.teal} onClick={() => navigate('/appointments')} /></Grid>
      </Grid>

      <Card sx={{ ...panelSx }}>
        <CardContent sx={{ p: 2.5 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.7 }}>
            <Stack direction="row" alignItems="center" spacing={1}><PeopleIcon sx={{ color: '#334155' }} /><Typography variant="h6" sx={{ fontWeight: 900 }}>إدارة المستخدمين</Typography></Stack>
            <Button size="small" onClick={() => navigate('/admin/users')} sx={{ color: theme.blue }}>عرض جميع المستخدمين</Button>
          </Stack>
          <Grid container spacing={1.7}>
            {users.map((u) => (
              <Grid key={u.id} size={{ xs: 12, md: 6, xl: 3 }}>
                <Box sx={{ p: 1.8, borderRadius: 3, border: `1px solid ${theme.border}`, bgcolor: '#FFFFFF', boxShadow: '0 10px 24px rgba(15, 23, 42, .06)', position: 'relative', minHeight: 164 }}>
                  <Box sx={{ position: 'absolute', top: 14, insetInlineEnd: 14, width: 10, height: 10, borderRadius: '50%', bgcolor: '#22C55E' }} />
                  <Stack direction="row" alignItems="center" spacing={1.4} sx={{ mb: 1.3 }}>
                    <Avatar sx={{ width: 58, height: 58, bgcolor: '#EEF2F7', color: theme.teal, fontWeight: 950, fontSize: 24 }}>{u.avatar}</Avatar>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body1" noWrap sx={{ fontWeight: 900, color: theme.navy }}>{u.name}</Typography>
                      <Chip label={u.role} size="small" sx={{ mt: .6, bgcolor: u.badgeColor, color: u.textColor, fontWeight: 850 }} />
                    </Box>
                  </Stack>
                  <Typography variant="body2" sx={{ color: '#64748B', mb: .4 }}>{u.center}</Typography>
                  <Typography variant="caption" sx={{ color: '#64748B' }}>ID: {u.id}</Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 1.6 }}>
                    <Button size="small" variant="outlined" fullWidth startIcon={<VisibilityIcon fontSize="small" />} sx={{ minHeight: 34 }}>عرض</Button>
                    <Button size="small" variant="outlined" fullWidth startIcon={<EditIcon fontSize="small" />} sx={{ minHeight: 34 }}>تعديل</Button>
                    <Button size="small" variant="outlined" fullWidth startIcon={<SecurityIcon fontSize="small" />} sx={{ minHeight: 34 }}>صلاحيات</Button>
                  </Stack>
                </Box>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
}
