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
} from '@mui/icons-material';

const DEMO_ACCOUNTS = [
  { email: 'admin@health.gov',      password: 'admin123',    nameAr: 'أحمد المنصور',    nameEn: 'Ahmed Al-Mansour',    roleAr: 'مدير النظام',          roleEn: 'System Admin',             color: '#764ba2' },
  { email: 'manager@health.gov',    password: 'manager123',  nameAr: 'خالد إبراهيم',    nameEn: 'Khalid Ibrahim',      roleAr: 'مدير الصحة المهنية',   roleEn: 'OH Manager',               color: '#667eea' },
  { email: 'ohdoctor@health.gov',   password: 'doctor123',   nameAr: 'د. سارة محمد',    nameEn: 'Dr. Sarah Mohammed',  roleAr: 'طبيب الصحة المهنية',   roleEn: 'OH Doctor',                color: '#4facfe' },
  { email: 'clinicdoc@health.gov',  password: 'clinic123',   nameAr: 'د. عمر الزهراني', nameEn: 'Dr. Omar Al-Zahrani', roleAr: 'طبيب العيادة',         roleEn: 'Clinic Doctor',            color: '#43e97b' },
  { email: 'lab@health.gov',        password: 'lab123',      nameAr: 'فاطمة علي',       nameEn: 'Fatima Ali',          roleAr: 'مسؤول المختبر',        roleEn: 'Lab Officer',              color: '#f093fb' },
  { email: 'vaccine@health.gov',    password: 'vaccine123',  nameAr: 'عمر حسن',         nameEn: 'Omar Hassan',         roleAr: 'مسؤول التطعيم',        roleEn: 'Vaccination Officer',      color: '#00b894' },
  { email: 'needle@health.gov',     password: 'needle123',   nameAr: 'نورة العتيبي',    nameEn: 'Noura Al-Otaibi',     roleAr: 'مسؤول الوخز بالإبرة', roleEn: 'Needle Stick Officer',     color: '#fa709a' },
  { email: 'committee@health.gov',  password: 'comm123',     nameAr: 'عبدالله القحطاني',nameEn: 'Abdullah Al-Qahtani', roleAr: 'مسؤول الهيئة الطبية', roleEn: 'Committee Officer',        color: '#f9a825' },
  { email: 'campaign@health.gov',   password: 'camp123',     nameAr: 'ريم الشمري',      nameEn: 'Reem Al-Shammari',    roleAr: 'مسؤول الحملات',        roleEn: 'Campaign Officer',         color: '#fd79a8' },
  { email: 'center@health.gov',     password: 'center123',   nameAr: 'سلطان المطيري',   nameEn: 'Sultan Al-Mutairi',   roleAr: 'مدير المركز',          roleEn: 'Center Manager',           color: '#6c5ce7' },
  { email: 'executive@health.gov',  password: 'exec123',     nameAr: 'الأمير فيصل',     nameEn: 'Prince Faisal',       roleAr: 'المدير التنفيذي',      roleEn: 'Executive',                color: '#2d3436' },
  { email: 'employee@health.gov',   password: 'emp123',      nameAr: 'ليلى أحمد',       nameEn: 'Layla Ahmed',         roleAr: 'موظف',                 roleEn: 'Employee',                 color: '#00cec9' },
  { email: 'dataentry@health.gov',  password: 'entry123',    nameAr: 'هند السيف',       nameEn: 'Hind Al-Sayf',        roleAr: 'مدخل البيانات',        roleEn: 'Data Entry',               color: '#e17055' },
  { email: 'quality@health.gov',    password: 'quality123',  nameAr: 'بدر الرشيدي',     nameEn: 'Badr Al-Rashidi',     roleAr: 'مسؤول جودة البيانات', roleEn: 'Data Quality',             color: '#0984e3' },
  { email: 'reports@health.gov',    password: 'reports123',  nameAr: 'مريم البلوي',     nameEn: 'Mariam Al-Balawi',    roleAr: 'مسؤول التقارير',       roleEn: 'Reports Officer',          color: '#00b894' },
  { email: 'support@health.gov',    password: 'support123',  nameAr: 'وليد الحربي',     nameEn: 'Walid Al-Harbi',      roleAr: 'الدعم التقني',         roleEn: 'Tech Support',             color: '#636e72' },
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

  // Forgot Password state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState(0); // 0=email, 1=code, 2=new password, 3=done
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotEmailError, setForgotEmailError] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const DEMO_CODE = '123456'; // fixed demo OTP

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
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      direction: isRtl ? 'rtl' : 'ltr',
      py: 4,
    }}>
      <Container maxWidth="sm">
        <Paper elevation={6} sx={{ p: 4, borderRadius: 3, position: 'relative' }}>
          <Box sx={{ position: 'absolute', top: 16, right: 16 }}>
            <IconButton onClick={toggleLanguage} color="primary">
              <Language />
            </IconButton>
          </Box>

          {/* Logo + Title */}
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Box sx={{ margin: '0 auto 16px', width: 'fit-content' }}>
              <img src={logoImg} alt="تجمع الشرقية الصحي" style={{ height: 120, width: 'auto', maxWidth: '100%', objectFit: 'contain' }} />
            </Box>
            <Typography variant="h5" gutterBottom fontWeight="bold">{t('appName')}</Typography>
            <Typography variant="body2" color="text.secondary">{t('loginSubtitle')}</Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {/* Login form */}
          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
            <TextField fullWidth label={t('email')} type="email" value={email}
              onChange={e => setEmail(e.target.value)} required margin="normal" autoComplete="email" />
            <TextField fullWidth label={t('password')} type={showPassword ? 'text' : 'password'} value={password}
              onChange={e => setPassword(e.target.value)} required margin="normal" autoComplete="current-password"
              slotProps={{ input: { endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowPassword(p => !p)} edge="end" size="small">
                    {showPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ) } }} />
            <FormControlLabel control={<Checkbox defaultChecked />} label={t('rememberMe')} sx={{ mt: 1 }} />
            <Button type="submit" fullWidth variant="contained" size="large" disabled={loading}
              sx={{
                mt: 3, mb: 2, py: 1.5,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                '&:hover': { background: 'linear-gradient(135deg, #764ba2 0%, #667eea 100%)' },
              }}>
              {loading ? t('loading') : t('login')}
            </Button>
            <Box sx={{ textAlign: 'center' }}>
              <Button color="primary" size="small" onClick={openForgot}
                sx={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>
                {t('forgotPassword')}
              </Button>
            </Box>
          </Box>

          {/* Demo accounts section */}
          <Box sx={{ mt: 3 }}>
            <Button
              fullWidth
              variant="outlined"
              size="small"
              onClick={() => setShowAccounts(p => !p)}
              endIcon={showAccounts ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              sx={{ borderStyle: 'dashed', color: 'text.secondary', borderColor: 'divider' }}
            >
              {isRtl
                ? (showAccounts ? 'إخفاء الحسابات التجريبية' : 'عرض الحسابات التجريبية')
                : (showAccounts ? 'Hide Demo Accounts' : 'Show Demo Accounts')}
            </Button>

            <Collapse in={showAccounts}>
              <Box sx={{ mt: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
                <Box sx={{ px: 2, py: 1, bgcolor: 'grey.50' }}>
                  <Typography variant="caption" color="text.secondary" fontWeight="bold">
                    {isRtl ? 'انقر على اسم المستخدم للدخول مباشرة' : 'Click a name to log in instantly'}
                  </Typography>
                </Box>
                <Box sx={{ maxHeight: 340, overflowY: 'auto' }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.50', fontSize: '0.7rem' }}>
                          {isRtl ? 'الاسم' : 'Name'}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.50', fontSize: '0.7rem' }}>
                          {isRtl ? 'الدور' : 'Role'}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 'bold', bgcolor: 'grey.50', fontSize: '0.7rem' }}>
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
                                width: 28, height: 28, borderRadius: '50%',
                                bgcolor: account.color, color: '#fff',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.65rem', fontWeight: 'bold', flexShrink: 0,
                              }}>
                                {(isRtl ? account.nameAr : account.nameEn).charAt(isRtl ? account.nameAr.indexOf('د') === 0 ? 2 : 0 : 0)}
                              </Box>
                              <Typography variant="body2" fontWeight="medium" noWrap>
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
                              sx={{ bgcolor: `${account.color}20`, color: account.color, fontWeight: 600, fontSize: '0.65rem', height: 20 }}
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
          </Box>
        </Paper>
      </Container>

      {/* ── Forgot Password Dialog ───────────────────────────────────────── */}
      <Dialog open={forgotOpen} onClose={() => setForgotOpen(false)} maxWidth="xs" fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
        <DialogTitle component="div" sx={{ pb: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{
              width: 40, height: 40, borderRadius: '50%',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <LockIcon sx={{ color: 'white', fontSize: 20 }} />
            </Box>
            <Box>
              <Typography variant="h6" fontWeight="bold">
                {isRtl ? 'استعادة كلمة المرور' : 'Reset Password'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {isRtl ? 'اتبع الخطوات لإعادة تعيين كلمة المرور' : 'Follow the steps to reset your password'}
              </Typography>
            </Box>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ pt: 2 }}>
          {/* Step indicators */}
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

          {/* Step 0 — enter email */}
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

          {/* Step 1 — enter OTP */}
          {forgotStep === 1 && (
            <Box>
              <Alert severity="info" sx={{ mb: 2, fontSize: '0.8rem' }}>
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

          {/* Step 2 — new password */}
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

          {/* Step 3 — success */}
          {forgotStep === 3 && (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
              <Typography variant="h6" fontWeight="bold" gutterBottom>
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
              startIcon={forgotLoading ? <CircularProgress size={16} color="inherit" /> : <EmailIcon />}
              sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
              {isRtl ? 'إرسال الرمز' : 'Send Code'}
            </Button>
          )}
          {forgotStep === 1 && (
            <Button variant="contained" onClick={handleVerifyCode}
              sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
              {isRtl ? 'تحقق' : 'Verify'}
            </Button>
          )}
          {forgotStep === 2 && (
            <Button variant="contained" onClick={handleResetPassword} disabled={forgotLoading}
              startIcon={forgotLoading ? <CircularProgress size={16} color="inherit" /> : <LockIcon />}
              sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
              {isRtl ? 'إعادة التعيين' : 'Reset Password'}
            </Button>
          )}
          {forgotStep === 3 && (
            <Button variant="contained" fullWidth onClick={() => setForgotOpen(false)}
              sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
              {isRtl ? 'تسجيل الدخول' : 'Go to Login'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
