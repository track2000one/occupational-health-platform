import { useState } from 'react';
import logoImg from '@/imports/ChatGPT_Image_21______2026__10_06_18__.png';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import {
  Container, Box, Paper, TextField, Button, Typography,
  FormControlLabel, Checkbox, Alert, IconButton,
  Table, TableBody, TableCell, TableHead, TableRow,
  Collapse, Chip, Dialog, DialogTitle, DialogContent,
  DialogActions, InputAdornment, CircularProgress, Stepper,
  Step, StepLabel,
} from '@mui/material';
import {
  Language, ExpandMore as ExpandMoreIcon, ExpandLess as ExpandLessIcon,
  Email as EmailIcon, Lock as LockIcon, CheckCircle as CheckCircleIcon,
  Visibility as VisibilityIcon, VisibilityOff as VisibilityOffIcon,
  LocalHospital as LocalHospitalIcon, Shield as ShieldIcon,
} from '@mui/icons-material';

const DEMO_ACCOUNTS = [
  { email: 'admin@health.gov',      password: 'admin123',    nameAr: 'أحمد المنصور',    nameEn: 'Ahmed Al-Mansour',    roleAr: 'مدير النظام',          roleEn: 'System Admin',             color: '#2FBF9F' },
  { email: 'manager@health.gov',    password: 'manager123',  nameAr: 'خالد إبراهيم',    nameEn: 'Khalid Ibrahim',      roleAr: 'مدير الصحة المهنية',   roleEn: 'OH Manager',               color: '#6C7EF8' },
  { email: 'ohdoctor@health.gov',   password: 'doctor123',   nameAr: 'د. سارة محمد',    nameEn: 'Dr. Sarah Mohammed',  roleAr: 'طبيب الصحة المهنية',   roleEn: 'OH Doctor',                color: '#0EA5E9' },
  { email: 'clinicdoc@health.gov',  password: 'clinic123',   nameAr: 'د. عمر الزهراني', nameEn: 'Dr. Omar Al-Zahrani', roleAr: 'طبيب العيادة',         roleEn: 'Clinic Doctor',            color: '#34D399' },
  { email: 'lab@health.gov',        password: 'lab123',      nameAr: 'فاطمة علي',       nameEn: 'Fatima Ali',          roleAr: 'مسؤول المختبر',        roleEn: 'Lab Officer',              color: '#14B8A6' },
  { email: 'vaccine@health.gov',    password: 'vaccine123',  nameAr: 'عمر حسن',         nameEn: 'Omar Hassan',         roleAr: 'مسؤول التطعيم',        roleEn: 'Vaccination Officer',      color: '#10B981' },
  { email: 'needle@health.gov',     password: 'needle123',   nameAr: 'نورة العتيبي',    nameEn: 'Noura Al-Otaibi',     roleAr: 'مسؤول الوخز بالإبرة', roleEn: 'Needle Stick Officer',     color: '#EF4444' },
  { email: 'committee@health.gov',  password: 'comm123',     nameAr: 'عبدالله القحطاني',nameEn: 'Abdullah Al-Qahtani', roleAr: 'مسؤول الهيئة الطبية', roleEn: 'Committee Officer',        color: '#F59E0B' },
  { email: 'campaign@health.gov',   password: 'camp123',     nameAr: 'ريم الشمري',      nameEn: 'Reem Al-Shammari',    roleAr: 'مسؤول الحملات',        roleEn: 'Campaign Officer',         color: '#E84D63' },
  { email: 'center@health.gov',     password: 'center123',   nameAr: 'سلطان المطيري',   nameEn: 'Sultan Al-Mutairi',   roleAr: 'مدير المركز',          roleEn: 'Center Manager',           color: '#6366F1' },
  { email: 'executive@health.gov',  password: 'exec123',     nameAr: 'الأمير فيصل',     nameEn: 'Prince Faisal',       roleAr: 'المدير التنفيذي',      roleEn: 'Executive',                color: '#0F172A' },
  { email: 'employee@health.gov',   password: 'emp123',      nameAr: 'ليلى أحمد',       nameEn: 'Layla Ahmed',         roleAr: 'موظف',                 roleEn: 'Employee',                 color: '#06B6D4' },
  { email: 'dataentry@health.gov',  password: 'entry123',    nameAr: 'هند السيف',       nameEn: 'Hind Al-Sayf',        roleAr: 'مدخل البيانات',        roleEn: 'Data Entry',               color: '#F97316' },
  { email: 'quality@health.gov',    password: 'quality123',  nameAr: 'بدر الرشيدي',     nameEn: 'Badr Al-Rashidi',     roleAr: 'مسؤول جودة البيانات', roleEn: 'Data Quality',             color: '#0284C7' },
  { email: 'reports@health.gov',    password: 'reports123',  nameAr: 'مريم البلوي',     nameEn: 'Mariam Al-Balawi',    roleAr: 'مسؤول التقارير',       roleEn: 'Reports Officer',          color: '#059669' },
  { email: 'support@health.gov',    password: 'support123',  nameAr: 'وليد الحربي',     nameEn: 'Walid Al-Harbi',      roleAr: 'الدعم التقني',         roleEn: 'Tech Support',             color: '#64748B' },
];

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);
  const [loggingIn, setLoggingIn] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const isRtl = i18n.language === 'ar';

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState(0);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotEmailError, setForgotEmailError] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const DEMO_CODE = '123456';

  function openForgot() {
    setForgotStep(0);
    setForgotEmail('');
    setForgotEmailError('');
    setVerifyCode('');
    setVerifyError('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setForgotOpen(true);
  }

  async function handleSendCode() {
    if (!forgotEmail) {
      setForgotEmailError(isRtl ? 'يرجى إدخال البريد الإلكتروني' : 'Please enter your email');
      return;
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(forgotEmail)) {
      setForgotEmailError(isRtl ? 'صيغة البريد الإلكتروني غير صحيحة' : 'Invalid email format');
      return;
    }
    setForgotLoading(true);
    await new Promise(r => setTimeout(r, 1200));
    setForgotLoading(false);
    setForgotEmailError('');
    setForgotStep(1);
  }

  async function handleVerifyCode() {
    if (verifyCode !== DEMO_CODE) {
      setVerifyError(isRtl ? `الرمز غير صحيح. استخدم: ${DEMO_CODE}` : `Incorrect code. Use: ${DEMO_CODE}`);
      return;
    }
    setVerifyError('');
    setForgotStep(2);
  }

  async function handleResetPassword() {
    if (newPassword.length < 6) {
      setPasswordError(isRtl ? 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' : 'Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(isRtl ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match');
      return;
    }
    setForgotLoading(true);
    await new Promise(r => setTimeout(r, 1000));
    setForgotLoading(false);
    setPasswordError('');
    setForgotStep(3);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch {
      setError(t('loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  async function quickLogin(account: typeof DEMO_ACCOUNTS[0]) {
    setLoggingIn(account.email);
    setError('');
    try {
      await login(account.email, account.password);
      navigate('/dashboard');
    } catch {
      setError(t('loginFailed'));
    } finally {
      setLoggingIn(null);
    }
  }

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'ar' : 'en';
    i18n.changeLanguage(newLang);
    document.dir = newLang === 'ar' ? 'rtl' : 'ltr';
  };

  return (
    <Box sx={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(circle at 18% 18%, rgba(47,191,159,.16), transparent 28%), radial-gradient(circle at 82% 0%, rgba(108,126,248,.14), transparent 30%), #E9EDF3',
      direction: isRtl ? 'rtl' : 'ltr',
      py: { xs: 3, md: 5 },
      overflow: 'hidden',
      position: 'relative',
    }}>
      <Box sx={{ position: 'absolute', width: 420, height: 420, borderRadius: '50%', right: -120, top: -130, background: 'linear-gradient(145deg, rgba(255,255,255,.55), rgba(221,229,239,.45))', boxShadow: '20px 20px 45px rgba(163,174,190,.35), -20px -20px 45px rgba(255,255,255,.75)' }} />
      <Box sx={{ position: 'absolute', width: 240, height: 240, borderRadius: '50%', left: -80, bottom: -80, background: 'linear-gradient(145deg, rgba(47,191,159,.15), rgba(255,255,255,.5))', boxShadow: '18px 18px 40px rgba(163,174,190,.32), -18px -18px 40px rgba(255,255,255,.72)' }} />

      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.02fr .98fr' }, gap: { xs: 3, md: 5 }, alignItems: 'center' }}>
          <Paper
            elevation={0}
            sx={{
              p: { xs: 3, sm: 4.5 },
              borderRadius: { xs: 8, md: 10 },
              position: 'relative',
              background: 'linear-gradient(145deg, #F8FAFC 0%, #E9EDF3 100%)',
              border: '1px solid rgba(255,255,255,.68)',
              boxShadow: '24px 24px 55px rgba(163,174,190,.48), -24px -24px 55px rgba(255,255,255,.96)',
              overflow: 'hidden',
              '&::before': {
                content: '""',
                position: 'absolute',
                width: 230,
                height: 230,
                borderRadius: '50%',
                insetInlineStart: -70,
                top: -90,
                border: '1px solid rgba(255,255,255,.72)',
                boxShadow: 'inset 10px 10px 22px rgba(163,174,190,.18), inset -10px -10px 22px rgba(255,255,255,.72)',
              },
            }}
          >
            <Box sx={{ position: 'absolute', top: 18, insetInlineEnd: 18 }}>
              <IconButton
                onClick={toggleLanguage}
                sx={{
                  bgcolor: '#E9EDF3',
                  boxShadow: '8px 8px 16px rgba(163,174,190,.42), -8px -8px 16px rgba(255,255,255,.92)',
                  '&:hover': { bgcolor: '#EEF2F7', transform: 'translateY(-1px)' },
                }}
              >
                <Language />
              </IconButton>
            </Box>

            <Box sx={{ position: 'relative', textAlign: 'center', mb: 3.5 }}>
              <Box sx={{
                margin: '0 auto 18px',
                width: 130,
                height: 130,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(145deg, #F8FAFC 0%, #DDE5EF 100%)',
                boxShadow: '18px 18px 34px rgba(163,174,190,.42), -18px -18px 34px rgba(255,255,255,.96), inset 1px 1px 0 rgba(255,255,255,.9)',
              }}>
                <img src={logoImg} alt="تجمع الشرقية الصحي" style={{ height: 86, width: 'auto', maxWidth: '82%', objectFit: 'contain' }} />
              </Box>
              <Typography variant="h4" gutterBottom sx={{ fontWeight: 950, color: '#0F172A', letterSpacing: '-.03em' }}>{t('appName')}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 650 }}>{t('loginSubtitle')}</Typography>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 4 }}>{error}</Alert>}

            <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2, position: 'relative' }}>
              <TextField
                fullWidth
                label={t('email')}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                margin="normal"
                autoComplete="email"
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><EmailIcon fontSize="small" color="action" /></InputAdornment> } }}
              />
              <TextField
                fullWidth
                label={t('password')}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                margin="normal"
                autoComplete="current-password"
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><LockIcon fontSize="small" color="action" /></InputAdornment>, endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowPassword(p => !p)} edge="end" size="small">
                      {showPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ) } }}
              />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.2, gap: 1, flexWrap: 'wrap' }}>
                <FormControlLabel control={<Checkbox defaultChecked />} label={t('rememberMe')} />
                <Button color="primary" size="small" onClick={openForgot} sx={{ textDecoration: 'underline', textUnderlineOffset: 4, fontWeight: 850 }}>
                  {t('forgotPassword')}
                </Button>
              </Box>
              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={loading}
                sx={{ mt: 3, mb: 2, py: 1.45, borderRadius: 999 }}
              >
                {loading ? t('loading') : t('login')}
              </Button>
            </Box>
          </Paper>

          <Paper
            elevation={0}
            sx={{
              p: { xs: 2.4, md: 3.5 },
              borderRadius: { xs: 7, md: 9 },
              background: 'linear-gradient(145deg, #F8FAFC 0%, #E9EDF3 100%)',
              border: '1px solid rgba(255,255,255,.68)',
              boxShadow: '18px 18px 42px rgba(163,174,190,.42), -18px -18px 42px rgba(255,255,255,.92)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.6, flexDirection: isRtl ? 'row-reverse' : 'row', mb: 2.5 }}>
              <Box sx={{ width: 54, height: 54, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: 'linear-gradient(145deg, #2FBF9F, #0F9F85)', boxShadow: '10px 10px 20px rgba(47,191,159,.28), -8px -8px 18px rgba(255,255,255,.85)' }}>
                <LocalHospitalIcon />
              </Box>
              <Box sx={{ textAlign: isRtl ? 'right' : 'left' }}>
                <Typography variant="h5" sx={{ fontWeight: 950, color: '#0F172A' }}>
                  {isRtl ? 'تصميم صحي ناعم وآمن' : 'Soft, secure health experience'}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 650 }}>
                  {isRtl ? 'واجهة Neumorphic مناسبة للبيانات الصحية الحساسة' : 'Neumorphic interface suitable for sensitive health data'}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5, mb: 2.8 }}>
              {[
                { label: isRtl ? 'حماية' : 'Secure', icon: <ShieldIcon fontSize="small" />, color: '#2FBF9F' },
                { label: isRtl ? 'سهل' : 'Usable', icon: <CheckCircleIcon fontSize="small" />, color: '#6C7EF8' },
                { label: isRtl ? 'طبي' : 'Clinical', icon: <LocalHospitalIcon fontSize="small" />, color: '#0EA5E9' },
              ].map(item => (
                <Box key={item.label} sx={{ p: 1.5, borderRadius: 4, textAlign: 'center', background: '#E9EDF3', boxShadow: 'inset 6px 6px 12px rgba(163,174,190,.38), inset -6px -6px 12px rgba(255,255,255,.92)' }}>
                  <Box sx={{ color: item.color, mb: .5 }}>{item.icon}</Box>
                  <Typography variant="caption" fontWeight={850}>{item.label}</Typography>
                </Box>
              ))}
            </Box>

            <Button
              fullWidth
              variant="outlined"
              size="medium"
              onClick={() => setShowAccounts(p => !p)}
              endIcon={showAccounts ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            >
              {isRtl
                ? (showAccounts ? 'إخفاء الحسابات التجريبية' : 'عرض الحسابات التجريبية')
                : (showAccounts ? 'Hide Demo Accounts' : 'Show Demo Accounts')}
            </Button>

            <Collapse in={showAccounts}>
              <Box sx={{ mt: 2, border: '1px solid rgba(255,255,255,.65)', borderRadius: 5, overflow: 'hidden', background: '#E9EDF3', boxShadow: 'inset 7px 7px 14px rgba(163,174,190,.35), inset -7px -7px 14px rgba(255,255,255,.9)' }}>
                <Box sx={{ px: 2, py: 1.2, bgcolor: 'rgba(255,255,255,.4)' }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={850}>
                    {isRtl ? 'انقر على اسم المستخدم للدخول مباشرة' : 'Click a name to log in instantly'}
                  </Typography>
                </Box>
                <Box sx={{ maxHeight: 420, overflowY: 'auto' }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 900, bgcolor: '#EEF2F7', fontSize: '0.72rem' }}>
                          {isRtl ? 'الاسم' : 'Name'}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 900, bgcolor: '#EEF2F7', fontSize: '0.72rem' }}>
                          {isRtl ? 'الدور' : 'Role'}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 900, bgcolor: '#EEF2F7', fontSize: '0.72rem' }}>
                          {isRtl ? 'البريد الإلكتروني' : 'Email'}
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {DEMO_ACCOUNTS.map(account => (
                        <TableRow
                          key={account.email}
                          hover
                          onClick={() => quickLogin(account)}
                          sx={{
                            cursor: 'pointer',
                            opacity: loggingIn && loggingIn !== account.email ? 0.4 : 1,
                            transition: 'opacity 0.15s, background 0.15s',
                            '&:hover': { bgcolor: `${account.color}12` },
                          }}
                        >
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Box sx={{
                                width: 30, height: 30, borderRadius: '50%',
                                bgcolor: account.color, color: '#fff',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.68rem', fontWeight: 900, flexShrink: 0,
                                boxShadow: `0 8px 16px ${account.color}44`,
                              }}>
                                {(isRtl ? account.nameAr : account.nameEn).charAt(isRtl ? account.nameAr.indexOf('د') === 0 ? 2 : 0 : 0)}
                              </Box>
                              <Typography variant="body2" fontWeight={750} noWrap>
                                {loggingIn === account.email
                                  ? (isRtl ? 'جارٍ الدخول...' : 'Logging in...')
                                  : (isRtl ? account.nameAr : account.nameEn)}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={isRtl ? account.roleAr : account.roleEn}
                              size="small"
                              sx={{ bgcolor: `${account.color}18`, color: account.color, fontWeight: 850, fontSize: '0.65rem', height: 22 }}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" color="text.secondary" noWrap>
                              {account.email}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              </Box>
            </Collapse>
          </Paper>
        </Box>
      </Container>

      <Dialog open={forgotOpen} onClose={() => setForgotOpen(false)} maxWidth="xs" fullWidth
        slotProps={{ paper: { sx: { borderRadius: 6, background: 'linear-gradient(145deg, #F8FAFC 0%, #E9EDF3 100%)' } } }}>
        <DialogTitle component="div" sx={{ pb: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexDirection: isRtl ? 'row-reverse' : 'row' }}>
            <Box sx={{
              width: 46, height: 46, borderRadius: '50%',
              background: 'linear-gradient(145deg, #2FBF9F 0%, #0F9F85 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '8px 8px 16px rgba(47,191,159,.28), -8px -8px 16px rgba(255,255,255,.75)',
            }}>
              <LockIcon sx={{ color: 'white', fontSize: 22 }} />
            </Box>
            <Box sx={{ textAlign: isRtl ? 'right' : 'left' }}>
              <Typography variant="h6" fontWeight={950}>
                {isRtl ? 'استعادة كلمة المرور' : 'Reset Password'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {isRtl ? 'اتبع الخطوات لإعادة تعيين كلمة المرور' : 'Follow the steps to reset your password'}
              </Typography>
            </Box>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ pt: 2 }}>
          {forgotStep < 3 && (
            <Stepper activeStep={forgotStep} sx={{ mb: 3, mt: 1 }} alternativeLabel>
              {[
                isRtl ? 'البريد الإلكتروني' : 'Email',
                isRtl ? 'التحقق' : 'Verify',
                isRtl ? 'كلمة المرور' : 'New Password',
              ].map(label => (
                <Step key={label}><StepLabel>{label}</StepLabel></Step>
              ))}
            </Stepper>
          )}

          {forgotStep === 0 && (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {isRtl
                  ? 'أدخل بريدك الإلكتروني المسجّل وسنرسل لك رمز التحقق.'
                  : 'Enter your registered email and we will send you a verification code.'}
              </Typography>
              <TextField
                fullWidth autoFocus
                label={isRtl ? 'البريد الإلكتروني' : 'Email Address'}
                type="email"
                value={forgotEmail}
                onChange={e => { setForgotEmail(e.target.value); setForgotEmailError(''); }}
                error={!!forgotEmailError}
                helperText={forgotEmailError}
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><EmailIcon fontSize="small" color="action" /></InputAdornment> } }}
              />
            </Box>
          )}

          {forgotStep === 1 && (
            <Box>
              <Alert severity="info" sx={{ mb: 2, fontSize: '0.8rem', borderRadius: 4 }}>
                {isRtl
                  ? `تم إرسال رمز التحقق إلى ${forgotEmail}. (للتجربة: ${DEMO_CODE})`
                  : `A code was sent to ${forgotEmail}. (Demo code: ${DEMO_CODE})`}
              </Alert>
              <TextField
                fullWidth autoFocus
                label={isRtl ? 'رمز التحقق' : 'Verification Code'}
                value={verifyCode}
                onChange={e => { setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setVerifyError(''); }}
                error={!!verifyError}
                helperText={verifyError}
                inputProps={{ inputMode: 'numeric', maxLength: 6 }}
                sx={{ '& input': { letterSpacing: 6, fontSize: '1.4rem', textAlign: 'center' } }}
              />
            </Box>
          )}

          {forgotStep === 2 && (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {isRtl ? 'اختر كلمة مرور جديدة قوية.' : 'Choose a strong new password.'}
              </Typography>
              <TextField
                fullWidth autoFocus margin="dense"
                label={isRtl ? 'كلمة المرور الجديدة' : 'New Password'}
                type="password"
                value={newPassword}
                onChange={e => { setNewPassword(e.target.value); setPasswordError(''); }}
                error={!!passwordError}
              />
              <TextField
                fullWidth margin="dense"
                label={isRtl ? 'تأكيد كلمة المرور' : 'Confirm Password'}
                type="password"
                value={confirmPassword}
                onChange={e => { setConfirmPassword(e.target.value); setPasswordError(''); }}
                error={!!passwordError}
                helperText={passwordError}
              />
              {newPassword.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  {[
                    { label: isRtl ? '6 أحرف على الأقل' : 'At least 6 characters', ok: newPassword.length >= 6 },
                    { label: isRtl ? 'يحتوي على رقم' : 'Contains a number', ok: /\d/.test(newPassword) },
                    { label: isRtl ? 'يحتوي على حرف كبير' : 'Contains uppercase', ok: /[A-Z]/.test(newPassword) },
                  ].map(rule => (
                    <Box key={rule.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: rule.ok ? 'success.main' : 'grey.300', flexShrink: 0 }} />
                      <Typography variant="caption" color={rule.ok ? 'success.main' : 'text.secondary'}>{rule.label}</Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          )}

          {forgotStep === 3 && (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
              <Typography variant="h6" fontWeight={950} gutterBottom>
                {isRtl ? 'تمت إعادة التعيين بنجاح!' : 'Password Reset Successful!'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {isRtl
                  ? 'يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.'
                  : 'You can now log in with your new password.'}
              </Typography>
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3 }}>
          {forgotStep < 3 && (
            <Button onClick={() => setForgotOpen(false)} color="inherit">
              {isRtl ? 'إلغاء' : 'Cancel'}
            </Button>
          )}
          {forgotStep === 0 && (
            <Button variant="contained" onClick={handleSendCode} disabled={forgotLoading}
              startIcon={forgotLoading ? <CircularProgress size={16} color="inherit" /> : <EmailIcon />}>
              {isRtl ? 'إرسال الرمز' : 'Send Code'}
            </Button>
          )}
          {forgotStep === 1 && (
            <Button variant="contained" onClick={handleVerifyCode}>
              {isRtl ? 'تحقق' : 'Verify'}
            </Button>
          )}
          {forgotStep === 2 && (
            <Button variant="contained" onClick={handleResetPassword} disabled={forgotLoading}
              startIcon={forgotLoading ? <CircularProgress size={16} color="inherit" /> : <LockIcon />}>
              {isRtl ? 'إعادة التعيين' : 'Reset Password'}
            </Button>
          )}
          {forgotStep === 3 && (
            <Button variant="contained" fullWidth onClick={() => setForgotOpen(false)}>
              {isRtl ? 'تسجيل الدخول' : 'Go to Login'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
