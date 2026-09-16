import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  Alert, Box, Button, Chip, CircularProgress, Container, Divider, Paper, Stack, Typography,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  HealthAndSafety as HealthAndSafetyIcon,
  Login as LoginIcon,
} from '@mui/icons-material';

const PRODUCTION_API_BASE_URL = 'https://occupational-health-platform-production.up.railway.app/api';
const LOCAL_API_BASE_URL = 'http://localhost:8000/api';
const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? LOCAL_API_BASE_URL
    : PRODUCTION_API_BASE_URL)
).replace(/\/$/, '');

type VerificationData = {
  valid: boolean;
  status: 'approved' | 'pending' | 'invalid';
  is_approved?: boolean;
  card_number?: string;
  employee_name?: string;
  employee_number_masked?: string;
  health_center_name_ar?: string;
  health_center_name_en?: string;
  issue_date?: string | null;
  next_review_date?: string | null;
  updated_at?: string | null;
  message_ar?: string;
  message_en?: string;
  privacy_notice_ar?: string;
  privacy_notice_en?: string;
};

function displayDate(value?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(parsed);
}

export function HealthCardVerificationPage() {
  const { token = '' } = useParams();
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';
  const [data, setData] = useState<VerificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [networkError, setNetworkError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8_000);
    setLoading(true);
    setNetworkError('');
    fetch(`${API_BASE_URL}/health-card-verification/${encodeURIComponent(token)}/`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async response => {
        const body = await response.json().catch(() => null);
        if (body && typeof body === 'object') {
          setData(body as VerificationData);
          return;
        }
        throw new Error(isRtl ? 'تعذر قراءة نتيجة التحقق.' : 'Unable to read the verification result.');
      })
      .catch(error => {
        if (controller.signal.aborted) {
          setNetworkError(isRtl ? 'استغرق الاتصال بالخادم وقتًا أطول من المتوقع. حاول مرة أخرى.' : 'The server took too long to respond. Please try again.');
        } else {
          setNetworkError(error instanceof Error ? error.message : (isRtl ? 'تعذر التحقق من البطاقة.' : 'Unable to verify this card.'));
        }
      })
      .finally(() => {
        window.clearTimeout(timer);
        setLoading(false);
      });
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [token, isRtl]);

  const approved = Boolean(data?.valid && data?.status === 'approved');
  const pending = Boolean(data?.valid && data?.status === 'pending');
  const accent = approved ? '#07875f' : pending ? '#b66a00' : '#b42318';
  const centerName = useMemo(
    () => isRtl
      ? (data?.health_center_name_ar || data?.health_center_name_en || '—')
      : (data?.health_center_name_en || data?.health_center_name_ar || '—'),
    [data, isRtl],
  );

  return (
    <Box
      dir={isRtl ? 'rtl' : 'ltr'}
      sx={{
        minHeight: '100vh',
        py: { xs: 3, md: 7 },
        px: 2,
        background: 'radial-gradient(circle at 15% 10%, rgba(14,165,164,.12), transparent 28%), radial-gradient(circle at 85% 0%, rgba(37,99,235,.10), transparent 28%), #f6fafc',
      }}
    >
      <Container maxWidth="sm">
        <Paper sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 4, borderTop: `5px solid ${accent}` }}>
          <Stack spacing={2.5} alignItems="stretch">
            <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="center">
              <HealthAndSafetyIcon sx={{ fontSize: 42, color: 'primary.main' }} />
              <Box textAlign={isRtl ? 'right' : 'left'}>
                <Typography variant="h5" fontWeight={950}>{isRtl ? 'التحقق من البطاقة الصحية' : 'Health Card Verification'}</Typography>
                <Typography variant="body2" color="text.secondary">Occupational Health Management Platform</Typography>
              </Box>
            </Stack>

            <Divider />

            {loading ? (
              <Stack alignItems="center" spacing={1.5} sx={{ py: 5 }}>
                <CircularProgress />
                <Typography color="text.secondary">{isRtl ? 'جاري التحقق من صحة البطاقة...' : 'Verifying the card...'}</Typography>
              </Stack>
            ) : networkError ? (
              <Alert severity="error">{networkError}</Alert>
            ) : data?.valid ? (
              <>
                <Stack alignItems="center" spacing={1} textAlign="center">
                  {approved ? <CheckCircleIcon sx={{ fontSize: 66, color: 'success.main' }} /> : <HealthAndSafetyIcon sx={{ fontSize: 66, color: 'warning.main' }} />}
                  <Typography variant="h5" fontWeight={950} sx={{ color: accent }}>
                    {approved
                      ? (isRtl ? 'بطاقة صحيحة ومعتمدة' : 'Authentic & Approved Card')
                      : (isRtl ? 'بطاقة صحيحة — الاعتماد قيد المراجعة' : 'Authentic Card — Approval Pending')}
                  </Typography>
                  <Typography color="text.secondary">{isRtl ? data.message_ar : data.message_en}</Typography>
                </Stack>

                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25 }}>
                  {[
                    [isRtl ? 'رقم البطاقة' : 'Card Number', data.card_number || '—'],
                    [isRtl ? 'اسم الموظف' : 'Employee Name', data.employee_name || '—'],
                    [isRtl ? 'الرقم الوظيفي' : 'Employee No.', data.employee_number_masked || '—'],
                    [isRtl ? 'المركز الصحي' : 'Health Center', centerName],
                    [isRtl ? 'تاريخ الإصدار' : 'Issue Date', displayDate(data.issue_date)],
                    [isRtl ? 'المراجعة القادمة' : 'Next Review', displayDate(data.next_review_date)],
                  ].map(([label, value]) => (
                    <Box key={label} sx={{ p: 1.5, borderRadius: 2.5, border: '1px solid rgba(148,163,184,.28)', bgcolor: '#fff' }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={800}>{label}</Typography>
                      <Typography fontWeight={900} sx={{ mt: .3, overflowWrap: 'anywhere' }}>{value}</Typography>
                    </Box>
                  ))}
                </Box>

                <Stack direction="row" justifyContent="center">
                  <Chip
                    color={approved ? 'success' : 'warning'}
                    label={approved ? (isRtl ? 'معتمدة' : 'Approved') : (isRtl ? 'قيد المراجعة' : 'Pending')}
                    sx={{ fontWeight: 900 }}
                  />
                </Stack>

                <Alert severity="info">
                  <Typography variant="body2" fontWeight={750}>{isRtl ? data.privacy_notice_ar : data.privacy_notice_en}</Typography>
                </Alert>
              </>
            ) : (
              <Alert severity="error">
                <Typography fontWeight={900}>{isRtl ? 'رمز التحقق غير صالح' : 'Invalid Verification Code'}</Typography>
                <Typography variant="body2">{isRtl ? data?.message_ar : data?.message_en}</Typography>
              </Alert>
            )}

            <Divider />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems="center">
              <Typography variant="caption" color="text.secondary" textAlign={isRtl ? 'right' : 'left'}>
                {isRtl ? 'لا تُعرض البيانات الطبية السرية في صفحة التحقق العامة.' : 'Confidential medical information is never displayed on this public verification page.'}
              </Typography>
              <Button variant="outlined" size="small" href="/login" startIcon={<LoginIcon />}>
                {isRtl ? 'دخول المنصة' : 'Platform Login'}
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}
