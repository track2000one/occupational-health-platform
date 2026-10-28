import { Box, Button, Chip, Divider, Paper, Stack, Typography } from '@mui/material';
import {
  BadgeOutlined as HealthCardIcon,
  Edit as EditIcon,
  Visibility as VisibilityIcon,
  WorkHistoryOutlined as WorkHistoryIcon,
} from '@mui/icons-material';

type EmployeeCardRecord = {
  id: string | number;
  name: string;
  employee_number?: string | null;
  national_id: string;
  email?: string | null;
  mobile?: string;
  job_title?: string;
  age?: number;
  employment_status?: string;
  roster_source_status?: string;
};

type Props = {
  employee: EmployeeCardRecord;
  centerName: string;
  isRtl: boolean;
  canWrite: boolean;
  canManage: boolean;
  onView: () => void;
  onEdit: () => void;
  onHealthCard: () => void;
  onEmploymentHistory: () => void;
};

function maskedId(value: string) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length > 4 ? `${digits.slice(0, 2)}••••${digits.slice(-4)}` : '—';
}

const STATUS: Record<string, { ar: string; en: string; color: 'success' | 'warning' | 'info' | 'default' }> = {
  active: { ar: 'على رأس العمل', en: 'Active', color: 'success' },
  retired: { ar: 'متقاعد', en: 'Retired', color: 'default' },
  transferred: { ar: 'منقول خارج الجهة', en: 'Transferred out', color: 'info' },
  separated: { ar: 'منتهية خدمته', en: 'Separated', color: 'default' },
  under_review: { ar: 'تحتاج مراجعة', en: 'Under review', color: 'warning' },
};

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography component="dt" sx={{ fontSize: 12.5, color: '#51667C', fontWeight: 650, mb: 0.4 }}>
        {label}
      </Typography>
      <Typography component="dd" sx={{
        m: 0, minWidth: 0, fontSize: 14.5, fontWeight: 650, lineHeight: 1.7,
        color: '#143452', overflowWrap: 'anywhere',
      }}>
        {value || '—'}
      </Typography>
    </Box>
  );
}

export function EmployeeRegistryCard({
  employee, centerName, isRtl, canWrite, canManage,
  onView, onEdit, onHealthCard, onEmploymentHistory,
}: Props) {
  const status = STATUS[employee.employment_status || 'active'] || STATUS.under_review;
  const sourceCondition = employee.roster_source_status &&
    employee.roster_source_status !== 'تعيين نشط' &&
    employee.roster_source_status !== 'active'
    ? employee.roster_source_status : null;
  const isSynthetic = employee.employee_number?.startsWith('OHP-');

  return (
    <Paper elevation={0} component="article" sx={{
      height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0,
      p: { xs: 2, sm: 2.5 }, borderRadius: 3,
      border: '1px solid #D4E0EA', borderTop: '4px solid #173F5F',
      background: 'linear-gradient(155deg, #FFFFFF 0%, #F4F8FC 100%)',
      boxShadow: '0 8px 22px rgba(15, 46, 74, 0.07)',
      transition: 'box-shadow .2s ease, transform .2s ease',
      '&:hover': { boxShadow: '0 12px 26px rgba(15, 46, 74, 0.13)', transform: 'translateY(-2px)' },
    }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1.5} sx={{ mb: 1.5 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography component="h3" sx={{
            fontSize: { xs: 16, sm: 17 }, lineHeight: 1.6, fontWeight: 850,
            color: '#12314C', overflowWrap: 'anywhere',
          }}>
            {employee.name}
          </Typography>
          <Typography sx={{ color: '#4C6177', fontSize: 13.5, fontWeight: 700, mt: 0.5 }}>
            {employee.employee_number || '—'}
          </Typography>
        </Box>
        <Chip size="small" color={status.color} variant="outlined"
          label={isRtl ? status.ar : status.en}
          sx={{ fontWeight: 750, flexShrink: 0, height: 'auto', minHeight: 28,
            '& .MuiChip-label': { whiteSpace: 'normal', textAlign: 'center', py: 0.5 } }} />
      </Stack>
      {import.meta.env.VITE_STAGING_MODE === 'true' && isSynthetic && (
        <Typography sx={{ fontSize: 12, fontWeight: 750, color: '#855700', mb: 1.5 }}>
          {isRtl ? 'سجل تجريبي — بيانات غير حقيقية' : 'Synthetic test record'}
        </Typography>
      )}
      <Divider sx={{ mb: 1.8 }} />
      <Box component="dl" sx={{
        m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
        columnGap: 2, rowGap: 1.7, mb: 1.8,
      }}>
        <Info label={isRtl ? 'المركز الصحي' : 'Health center'} value={centerName} />
        <Info label={isRtl ? 'المسمى الوظيفي' : 'Job title'} value={employee.job_title || '—'} />
        <Info label={isRtl ? 'رقم الهوية (مخفي)' : 'National ID (masked)'} value={maskedId(employee.national_id)} />
        <Info label={isRtl ? 'البريد الإلكتروني' : 'Email'} value={employee.email || '—'} />
        <Info label={isRtl ? 'رقم الجوال' : 'Mobile'} value={employee.mobile || '—'} />
        <Info label={isRtl ? 'العمر' : 'Age'} value={employee.age && employee.age > 0 ? String(employee.age) : '—'} />
      </Box>
      {sourceCondition && (
        <Box sx={{ mb: 1.5, px: 1.5, py: 1, borderRadius: 2, background: '#FFF7E9', border: '1px solid #ECD6A7' }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 750, color: '#78501C' }}>
            {isRtl ? 'الحالة الواردة في ملف المصدر:' : 'Source employment condition:'}
          </Typography>
          <Typography sx={{ fontSize: 14, color: '#63401A', overflowWrap: 'anywhere' }}>
            {sourceCondition}
          </Typography>
        </Box>
      )}
      <Box sx={{ flex: 1 }} />
      <Divider sx={{ mb: 1.5 }} />
      <Stack direction="row" flexWrap="wrap" useFlexGap gap={1} sx={{
        '& .MuiButton-root': {
          minHeight: 38, fontSize: 13, fontWeight: 750, px: 1.4,
          borderColor: '#B6CEE0', color: '#153A5A', bgcolor: '#FFFFFF',
          '&:hover': { bgcolor: '#E8F2FA', borderColor: '#5687A8' },
        },
      }}>
        <Button variant="outlined" startIcon={<VisibilityIcon />} onClick={onView}>
          {isRtl ? 'عرض' : 'View'}
        </Button>
        <Button variant="outlined" startIcon={<HealthCardIcon />} onClick={onHealthCard}>
          {isRtl ? 'البطاقة الصحية' : 'Health card'}
        </Button>
        {canWrite && (
          <Button variant="outlined" startIcon={<EditIcon />} onClick={onEdit}>
            {isRtl ? 'تعديل' : 'Edit'}
          </Button>
        )}
        {canManage && (
          <Button variant="outlined" startIcon={<WorkHistoryIcon />} onClick={onEmploymentHistory}>
            {isRtl ? 'السجل الوظيفي' : 'History'}
          </Button>
        )}
      </Stack>
    </Paper>
  );
}
