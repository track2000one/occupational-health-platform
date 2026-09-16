from pathlib import Path
import re


def replace_once(path: str, old: str, new: str):
    file_path = Path(path)
    text = file_path.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Pattern not found in {path}: {old[:120]!r}')
    if text.count(old) != 1:
        raise SystemExit(f'Pattern is not unique in {path}: found {text.count(old)} matches')
    file_path.write_text(text.replace(old, new, 1), encoding='utf-8')


# Backend: provide a short, signed, non-guessable verification token without exposing health data.
replace_once(
    'backend/health/models.py',
    'from django.conf import settings\nfrom django.db import models\n',
    'from django.conf import settings\nfrom django.core import signing\nfrom django.db import models\n',
)
replace_once(
    'backend/health/models.py',
    '\n\ndef full_years_between(start_date, end_date=None):\n',
    "\n\nHEALTH_CARD_VERIFICATION_SALT = 'occupational-health-card-verification-v1'\n\n\ndef full_years_between(start_date, end_date=None):\n",
)
replace_once(
    'backend/health/models.py',
    '''    def __str__(self):\n        return f'{self.card_number or "Health card"} - {self.employee}'\n\n\nclass OccupationalHealthAssessment(models.Model):\n''',
    '''    @property\n    def verification_token(self):\n        """Return a compact HMAC-signed public verification token.\n\n        The token contains only the database identifier signed with Django's SECRET_KEY;\n        it does not embed employee identity or clinical information.\n        """\n        if not self.pk:\n            return ''\n        return signing.Signer(salt=HEALTH_CARD_VERIFICATION_SALT).sign(str(self.pk))\n\n    @classmethod\n    def from_verification_token(cls, token):\n        try:\n            raw_id = signing.Signer(salt=HEALTH_CARD_VERIFICATION_SALT).unsign(str(token or ''))\n            card_id = int(raw_id)\n        except (signing.BadSignature, TypeError, ValueError):\n            return None\n        return cls.objects.select_related('employee', 'employee__health_center').filter(pk=card_id).first()\n\n    def __str__(self):\n        return f'{self.card_number or "Health card"} - {self.employee}'\n\n\nclass OccupationalHealthAssessment(models.Model):\n''',
)

# Serializer: include token in successful save responses.
replace_once(
    'backend/health/serializers.py',
    'class EmployeeHealthCardSerializer(serializers.ModelSerializer):\n    class Meta:\n',
    'class EmployeeHealthCardSerializer(serializers.ModelSerializer):\n    verification_token = serializers.ReadOnlyField()\n\n    class Meta:\n',
)
replace_once(
    'backend/health/serializers.py',
    "            'id', 'employee', 'card_number', 'issue_date', 'next_review_date',\n",
    "            'id', 'employee', 'card_number', 'verification_token', 'issue_date', 'next_review_date',\n",
)

# Public verification endpoint and token in the existing health-card GET payload.
replace_once(
    'backend/health/views.py',
    'from rest_framework.response import Response\n',
    'from rest_framework.response import Response\nfrom rest_framework.views import APIView\n',
)
verification_view = '''\n\nclass HealthCardVerificationView(APIView):\n    """Public, privacy-minimised health-card authenticity check used by the QR code."""\n\n    permission_classes = [permissions.AllowAny]\n    authentication_classes = []\n\n    def get(self, request, token):\n        card = EmployeeHealthCard.from_verification_token(token)\n        if not card:\n            return Response(\n                {\n                    'valid': False,\n                    'status': 'invalid',\n                    'message_ar': 'رمز التحقق غير صالح أو أن البطاقة لم تعد متاحة.',\n                    'message_en': 'The verification code is invalid or the card is no longer available.',\n                },\n                status=status.HTTP_404_NOT_FOUND,\n                headers={'Cache-Control': 'no-store'},\n            )\n\n        employee = card.employee\n        center = employee.health_center\n        employee_number = str(employee.employee_number or '')\n        masked_employee_number = (f'••••{employee_number[-4:]}' if employee_number else '')\n        verification_status = 'approved' if card.is_approved else 'pending'\n        return Response(\n            {\n                'valid': True,\n                'status': verification_status,\n                'is_approved': bool(card.is_approved),\n                'card_number': card.card_number,\n                'employee_name': employee.name,\n                'employee_number_masked': masked_employee_number,\n                'health_center_name_ar': center.name_ar or center.name,\n                'health_center_name_en': center.name_en or center.name,\n                'issue_date': card.issue_date.isoformat() if card.issue_date else None,\n                'next_review_date': card.next_review_date.isoformat() if card.next_review_date else None,\n                'updated_at': card.updated_at.isoformat() if card.updated_at else None,\n                'message_ar': (\n                    'تم التحقق من البطاقة واعتمادها.'\n                    if card.is_approved\n                    else 'تم التحقق من البطاقة، وحالة الاعتماد ما زالت قيد المراجعة.'\n                ),\n                'message_en': (\n                    'The card is authentic and approved.'\n                    if card.is_approved\n                    else 'The card is authentic; approval is still pending.'\n                ),\n                'privacy_notice_ar': 'صفحة التحقق لا تعرض أي تشخيصات أو بيانات صحية سرية.',\n                'privacy_notice_en': 'The verification page does not expose diagnoses or confidential health data.',\n            },\n            headers={'Cache-Control': 'no-store'},\n        )\n\n'''
replace_once(
    'backend/health/views.py',
    '\n\nclass UserViewSet(viewsets.ModelViewSet):\n',
    verification_view + 'class UserViewSet(viewsets.ModelViewSet):\n',
)
replace_once(
    'backend/health/views.py',
    "            'card_number': card.card_number if card else f'EHC-{issue_date.year}-{employee.id:05d}',\n            'issue_date': issue_date.isoformat(),\n",
    "            'card_number': card.card_number if card else f'EHC-{issue_date.year}-{employee.id:05d}',\n            'verification_token': card.verification_token if card else '',\n            'issue_date': issue_date.isoformat(),\n",
)

# Wire the anonymous verification endpoint ahead of the authenticated router routes.
Path('backend/health/urls.py').write_text('''from django.urls import path\nfrom rest_framework.routers import DefaultRouter\nfrom .views import AuditLogViewSet, ClinicVisitViewSet, CommitteeReferralViewSet, EmployeeImportReviewViewSet, EmployeeViewSet, ExcelImportViewSet, HealthCardVerificationView, HealthCenterViewSet, InjuryCaseViewSet, LabTestViewSet, OccupationalHealthAssessmentViewSet, UserViewSet, VaccinationViewSet\n\nrouter = DefaultRouter()\nrouter.register('users', UserViewSet, basename='users')\nrouter.register('excel-import', ExcelImportViewSet, basename='excel-import')\nrouter.register('employee-import-reviews', EmployeeImportReviewViewSet, basename='employee-import-reviews')\nrouter.register('health-centers', HealthCenterViewSet, basename='health-centers')\nrouter.register('employees', EmployeeViewSet)\nrouter.register('lab-tests', LabTestViewSet)\nrouter.register('occupational-health-assessments', OccupationalHealthAssessmentViewSet)\nrouter.register('vaccinations', VaccinationViewSet)\nrouter.register('clinic-visits', ClinicVisitViewSet)\nrouter.register('committee-referrals', CommitteeReferralViewSet)\nrouter.register('injury-cases', InjuryCaseViewSet)\nrouter.register('audit-logs', AuditLogViewSet)\n\nurlpatterns = [\n    path('health-card-verification/<str:token>/', HealthCardVerificationView.as_view(), name='health-card-verification'),\n] + router.urls\n''', encoding='utf-8')

# Health card: render a standards-compliant QR code that opens the public verification route.
replace_once(
    'frontend/src/app/pages/EmployeeHealthCardPage.tsx',
    "import { toast } from 'sonner';\n",
    "import { toast } from 'sonner';\nimport { QRCodeSVG } from 'qrcode.react';\n",
)
replace_once(
    'frontend/src/app/pages/EmployeeHealthCardPage.tsx',
    "  card_number?: string;\n  issue_date?: string;\n",
    "  card_number?: string;\n  verification_token?: string;\n  issue_date?: string;\n",
)
health_card_page = Path('frontend/src/app/pages/EmployeeHealthCardPage.tsx')
page_text = health_card_page.read_text(encoding='utf-8')
pattern = re.compile(r"function CardCode\(\{ seed \}: \{ seed: string \}\) \{.*?\n\}\n\nfunction Field\(", re.S)
replacement = '''function CardCode({ token, cardNumber }: { token?: string; cardNumber: string }) {\n  const verificationUrl = useMemo(() => {\n    if (!token || typeof window === 'undefined') return '';\n    return `${window.location.origin}/v/${encodeURIComponent(token)}`;\n  }, [token]);\n\n  if (!verificationUrl) {\n    return <div className="ohc-card-code inactive" aria-label="رمز التحقق غير مفعل"><span>QR</span></div>;\n  }\n\n  return (\n    <a\n      className="ohc-card-code active"\n      href={verificationUrl}\n      target="_blank"\n      rel="noreferrer"\n      title={`التحقق من البطاقة ${cardNumber}`}\n      aria-label="فتح صفحة التحقق من البطاقة الصحية"\n    >\n      <QRCodeSVG value={verificationUrl} size={68} level="L" bgColor="#ffffff" fgColor="#07365d" />\n    </a>\n  );\n}\n\nfunction Field('''
page_text, count = pattern.subn(replacement, page_text, count=1)
if count != 1:
    raise SystemExit(f'CardCode replacement failed: {count}')
page_text = page_text.replace(
    "<CardCode seed={value(card.card_number, 'EHC')} />",
    "<CardCode token={card.verification_token} cardNumber={value(card.card_number, 'EHC')} />",
    1,
)
health_card_page.write_text(page_text, encoding='utf-8')

# Card CSS: give the real QR enough physical pixels and a clean quiet zone.
css_path = Path('frontend/src/styles/employee-health-card.css')
css = css_path.read_text(encoding='utf-8')
css = css.replace(
    '  grid-template-columns: 210px 70px 1fr 260px 240px;',
    '  grid-template-columns: 210px 88px 1fr 260px 240px;',
    1,
)
old_css = '''.ohc-card-code {\n  width: 58px;\n  height: 58px;\n  padding: 3px;\n  display: grid;\n  grid-template-columns: repeat(11, 1fr);\n  grid-template-rows: repeat(11, 1fr);\n  gap: 1px;\n  border: 2px solid #07365d;\n  border-radius: 5px;\n  background: #fff;\n}\n\n.ohc-card-code i {\n  display: block;\n  background: transparent;\n}\n\n.ohc-card-code i.filled {\n  background: #07365d;\n}\n'''
new_css = '''.ohc-card-code {\n  width: 78px;\n  height: 78px;\n  padding: 5px;\n  display: grid;\n  place-items: center;\n  border: 2px solid #07365d;\n  border-radius: 7px;\n  background: #fff;\n  text-decoration: none;\n  box-sizing: border-box;\n}\n\n.ohc-card-code svg {\n  display: block;\n  width: 68px;\n  height: 68px;\n}\n\n.ohc-card-code.active {\n  cursor: pointer;\n}\n\n.ohc-card-code.inactive {\n  border-style: dashed;\n  color: #6b8198;\n  background: #f7fbfd;\n}\n\n.ohc-card-code.inactive span {\n  font-size: .72rem;\n  font-weight: 950;\n  letter-spacing: .04em;\n}\n'''
if old_css not in css:
    raise SystemExit('Old CardCode CSS block not found')
css = css.replace(old_css, new_css, 1)
css_path.write_text(css, encoding='utf-8')

# Public verification page: no login required and no confidential clinical payload.
Path('frontend/src/app/pages/HealthCardVerificationPage.tsx').write_text(r'''import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  Alert, Box, Button, Chip, CircularProgress, Container, Divider, Paper, Stack, Typography,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  ErrorOutline as ErrorOutlineIcon,
  HealthAndSafety as HealthAndSafetyIcon,
  Login as LoginIcon,
  VerifiedUser as VerifiedUserIcon,
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
              <Alert severity="error" icon={<ErrorOutlineIcon />}>{networkError}</Alert>
            ) : data?.valid ? (
              <>
                <Stack alignItems="center" spacing={1} textAlign="center">
                  {approved ? <CheckCircleIcon sx={{ fontSize: 66, color: 'success.main' }} /> : <VerifiedUserIcon sx={{ fontSize: 66, color: 'warning.main' }} />}
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
              <Alert severity="error" icon={<ErrorOutlineIcon />}>
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
''', encoding='utf-8')

# Public frontend route must sit outside ProtectedRoute so phone scans work without login.
replace_once(
    'frontend/src/app/App.tsx',
    "import { HealthCentersPage } from './pages/HealthCentersPage';\n",
    "import { HealthCentersPage } from './pages/HealthCentersPage';\nimport { HealthCardVerificationPage } from './pages/HealthCardVerificationPage';\n",
)
replace_once(
    'frontend/src/app/App.tsx',
    '    <Routes>\n      <Route\n        path="/login"\n',
    '    <Routes>\n      <Route path="/v/:token" element={<HealthCardVerificationPage />} />\n      <Route\n        path="/login"\n',
)

print('Real health-card QR verification implementation applied successfully.')
