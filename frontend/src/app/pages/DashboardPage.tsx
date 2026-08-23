import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  Stack,
  Typography,
} from '@mui/material';
import {
  People as PeopleIcon,
  Science as ScienceIcon,
  Vaccines as VaccinesIcon,
  MedicalServices as MedicalServicesIcon,
  CalendarMonth as CalendarIcon,
  NotificationsActive as NotificationsIcon,
  PersonAdd as PersonAddIcon,
  CloudUpload as CloudUploadIcon,
  Download as DownloadIcon,
  Security as SecurityIcon,
  LocalHospital as HospitalIcon,
  MonitorHeart as MonitorHeartIcon,
  Analytics as AnalyticsIcon,
} from '@mui/icons-material';

const theme = {
  teal: '#168B88',
  tealDark: '#0F6F6D',
  tealSoft: '#DFF8F1',
  indigo: '#4F63F6',
  blue: '#0284C7',
  orange: '#D97706',
  navy: '#111827',
  slate: '#475569',
  border: 'rgba(148, 163, 184, 0.18)',
};

const panelSx = {
  borderRadius: 4,
  border: `1px solid ${theme.border}`,
  background: 'linear-gradient(145deg, rgba(255,255,255,.98), rgba(248,250,252,.96))',
  boxShadow: '0 14px 34px rgba(15, 23, 42, 0.07)',
};

function StatCard({ title, value, hint, icon, accent, soft }: {
  title: string;
  value: string;
  hint: string;
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
            <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mt: .85 }}>{hint}</Typography>
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

function QuickAction({ label, icon, color, onClick }: {
  label: string;
  icon: ReactNode;
  color: string;
  onClick: () => void;
}) {
  return (
    <Button
      fullWidth
      onClick={onClick}
      variant="contained"
      startIcon={icon as any}
      sx={{
        height: 50,
        borderRadius: 3,
        fontWeight: 900,
        bgcolor: color,
        boxShadow: `0 12px 22px ${color}28`,
        '&:hover': { bgcolor: color, transform: 'translateY(-1px)' },
      }}
    >
      {label}
    </Button>
  );
}

function EmptyPanel({ title, description, icon }: { title: string; description: string; icon: ReactNode }) {
  return (
    <Card sx={{ ...panelSx, height: '100%' }}>
      <CardContent sx={{ p: 3, minHeight: 220, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <Box>
          <Box sx={{ color: theme.teal, mb: 1 }}>{icon}</Box>
          <Typography variant="h6" sx={{ fontWeight: 900, color: theme.navy }}>{title}</Typography>
          <Typography variant="body2" sx={{ color: theme.slate, maxWidth: 520, mx: 'auto', mt: 1 }}>
            {description}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ color: theme.navy, fontWeight: 950, mb: .5 }}>
          لوحة التحكم
        </Typography>
        <Typography variant="body2" sx={{ color: theme.slate }}>
          تم تصفير بيانات العرض التجريبية. ستظهر المؤشرات بعد إدخال البيانات الرسمية أو استيرادها وحفظها في قاعدة البيانات.
        </Typography>
      </Box>

      <Box
        sx={{
          ...panelSx,
          p: { xs: 2.5, md: 4 },
          mb: 3,
          background: 'linear-gradient(135deg, #0F6F6D 0%, #16A3A0 55%, #4F63F6 100%)',
          color: 'white',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} alignItems="center" justifyContent="space-between" spacing={3}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 950, mb: 1 }}>
              منصة إدارة الصحة المهنية
            </Typography>
            <Typography variant="body1" sx={{ opacity: .92, maxWidth: 760 }}>
              ابدأ بإدخال الموظفين الرسميين، ثم اربط الزيارات والتحاليل والتطعيمات والإصابات بالملف الصحي لكل موظف.
            </Typography>
          </Box>
          <HospitalIcon sx={{ fontSize: 96, opacity: .22 }} />
        </Stack>
      </Box>

      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 3 }}>
          <StatCard title="إجمالي الموظفين" value="0" hint="لا توجد بيانات رسمية بعد" icon={<PeopleIcon />} accent={theme.teal} soft={theme.tealSoft} />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <StatCard title="التحاليل" value="0" hint="تظهر بعد تسجيل/استيراد التحاليل" icon={<ScienceIcon />} accent={theme.blue} soft="#E0F2FE" />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <StatCard title="التطعيمات" value="0" hint="تظهر بعد تسجيل الجرعات" icon={<VaccinesIcon />} accent={theme.indigo} soft="#EEF2FF" />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <StatCard title="الزيارات" value="0" hint="تظهر بعد تسجيل الزيارات" icon={<MedicalServicesIcon />} accent={theme.orange} soft="#FEF3C7" />
        </Grid>
      </Grid>

      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 3 }}>
          <QuickAction label="إضافة موظف" icon={<PersonAddIcon />} color={theme.teal} onClick={() => navigate('/employees')} />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <QuickAction label="استيراد Excel آمن" icon={<CloudUploadIcon />} color="#16A34A" onClick={() => navigate('/data-import')} />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <QuickAction label="تصدير تقرير" icon={<DownloadIcon />} color="#2563EB" onClick={() => navigate('/reports')} />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <QuickAction label="إدارة الصلاحيات" icon={<SecurityIcon />} color="#4F63F6" onClick={() => navigate('/roles-permissions')} />
        </Grid>
      </Grid>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 6 }}>
          <EmptyPanel
            title="المواعيد القادمة"
            description="لا توجد مواعيد تجريبية. عند تسجيل موعد رسمي سيظهر هنا."
            icon={<CalendarIcon sx={{ fontSize: 44 }} />}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <EmptyPanel
            title="تنبيهات الصحة المهنية"
            description="لا توجد تنبيهات تجريبية. ستظهر التنبيهات المرتبطة بالتحاليل أو التطعيمات أو الإصابات بعد إدخال البيانات."
            icon={<NotificationsIcon sx={{ fontSize: 44 }} />}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <EmptyPanel
            title="نظرة تحليلية"
            description="لا توجد بيانات كافية للرسم والتحليل حتى يتم إدخال سجلات رسمية في PostgreSQL."
            icon={<AnalyticsIcon sx={{ fontSize: 44 }} />}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <EmptyPanel
            title="حالة الصحة المهنية"
            description="ستظهر حالة اللياقة للعمل والتقييمات المهنية بعد تسجيل تقييمات رسمية للموظفين."
            icon={<MonitorHeartIcon sx={{ fontSize: 44 }} />}
          />
        </Grid>
      </Grid>
    </Box>
  );
}
