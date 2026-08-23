import { useState } from 'react';
import logoImg from '@/imports/ChatGPT_Image_21______2026__10_06_18__.png';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import {
  Alert,
  Box,
  Button,
  Container,
  IconButton,
  InputAdornment,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import {
  Email as EmailIcon,
  Language,
  LocalHospital as LocalHospitalIcon,
  Lock as LockIcon,
  Shield as ShieldIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from '@mui/icons-material';

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const isRtl = i18n.language === 'ar';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch {
      setError(isRtl ? 'تعذر تسجيل الدخول. تأكد من بيانات حساب Django/PostgreSQL.' : 'Login failed. Check your Django/PostgreSQL account credentials.');
    } finally {
      setLoading(false);
    }
  };

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
      position: 'relative',
    }}>
      <Container maxWidth="sm" sx={{ position: 'relative', zIndex: 1 }}>
        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, sm: 4.5 },
            borderRadius: { xs: 6, md: 8 },
            background: 'linear-gradient(145deg, #F8FAFC 0%, #E9EDF3 100%)',
            border: '1px solid rgba(255,255,255,.68)',
            boxShadow: '24px 24px 55px rgba(163,174,190,.48), -24px -24px 55px rgba(255,255,255,.96)',
            overflow: 'hidden',
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
            <IconButton onClick={toggleLanguage}>
              <Language />
            </IconButton>
          </Box>

          <Box sx={{ textAlign: 'center', mb: 3.5 }}>
            <Box sx={{
              margin: '0 auto 18px',
              width: 128,
              height: 128,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(145deg, #F8FAFC 0%, #DDE5EF 100%)',
              boxShadow: '18px 18px 34px rgba(163,174,190,.42), -18px -18px 34px rgba(255,255,255,.96)',
            }}>
              <img src={logoImg} alt="Occupational Health" style={{ height: 86, width: 'auto', maxWidth: '82%', objectFit: 'contain' }} />
            </Box>
            <Typography variant="h4" gutterBottom sx={{ fontWeight: 950, color: '#0F172A' }}>
              {isRtl ? 'منصة إدارة الصحة المهنية' : 'Occupational Health Management Platform'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 650 }}>
              {isRtl ? 'تسجيل الدخول بالحسابات الرسمية فقط' : 'Sign in with official platform accounts only'}
            </Typography>
          </Box>

          <Alert severity="info" sx={{ mb: 3 }} icon={<ShieldIcon />}>
            {isRtl
              ? 'تمت إزالة حسابات العرض التجريبية من الواجهة. استخدم حسابًا موجودًا في Django/PostgreSQL.'
              : 'Demo accounts were removed from the frontend. Use an account stored in Django/PostgreSQL.'}
          </Alert>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label={isRtl ? 'البريد الإلكتروني أو اسم المستخدم' : 'Email or username'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              margin="normal"
              required
              InputProps={{ startAdornment: <InputAdornment position="start"><EmailIcon /></InputAdornment> }}
            />
            <TextField
              fullWidth
              label={isRtl ? 'كلمة المرور' : 'Password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type={showPassword ? 'text' : 'password'}
              margin="normal"
              required
              InputProps={{
                startAdornment: <InputAdornment position="start"><LockIcon /></InputAdornment>,
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowPassword((prev) => !prev)} edge="end">
                      {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Button
              fullWidth
              type="submit"
              variant="contained"
              disabled={loading}
              startIcon={<LocalHospitalIcon />}
              sx={{ mt: 3, py: 1.35, borderRadius: 3, fontWeight: 900 }}
            >
              {loading ? (isRtl ? 'جاري الدخول...' : 'Signing in...') : (isRtl ? 'تسجيل الدخول' : t('login'))}
            </Button>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
