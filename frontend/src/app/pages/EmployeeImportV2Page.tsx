import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert, Box, Button, Chip, CircularProgress, Divider, Grid, Paper,
  Stack, Step, StepLabel, Stepper, Typography,
} from '@mui/material';
import {
  ArrowBack as BackIcon, CloudUpload as UploadIcon,
  FactCheckOutlined as CheckIcon, SecurityOutlined as SecurityIcon,
  DescriptionOutlined as FileIcon,
} from '@mui/icons-material';
import { authFetch, getAccessToken, useAuth } from '../context/AuthContext';

const API = (import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:8000/api' : '')).replace(/\/$/, '');

type PreflightResult = {
  mode: 'read_only_registry_match_v2';
  sheet_name: string;
  rows_total: number;
  header_row: number;
  recognized_columns: string[];
  missing_optional_columns: string[];
  counts: Record<string, number>;
  sample_masked: Array<{
    row: number;
    classification: string;
    identity_masked: string;
    missing_optional: string[];
  }>;
  database_identity_checked: true;
  registry_counts: Record<string, number>;
  identity_found: number;
  yellow_missing_information: number;
  missing_field_counts: Record<string, number>;
  review_examples_masked: Array<{
    row: number;
    identity_masked: string;
    status: string;
    missing_fields: string[];
    center_approved: boolean;
    organization_approved: boolean;
    existing_record: boolean;
    archived_record: boolean;
  }>;
  employee_count_created: 0;
  employee_count_updated: 0;
  import_enabled: false;
  notice: string;
};

const FIELDS: Record<string, string> = {
  name: 'اسم الموظف', national_id: 'رقم الهوية/الإقامة',
  employee_number: 'الرقم الوظيفي', email: 'البريد الإلكتروني',
  mobile: 'الجوال', health_center: 'المركز الصحي',
  nationality: 'الجنسية', date_of_birth: 'تاريخ الميلاد',
  appointment_date: 'تاريخ التعيين', job_title: 'المسمى الوظيفي',
  job_title_en: 'المسمى بالإنجليزية', current_job: 'الوظيفة الحالية',
  gender: 'الجنس', marital_status: 'الحالة الاجتماعية',
  national_address: 'العنوان الوطني', birth_place: 'مكان الميلاد',
  organization_unit: 'الجهة التنظيمية', sector: 'القطاع المرجعي',
};
const REGISTRY_STATES: Array<{
  key: string; title: string; tone: 'success' | 'warning' | 'error' | 'info' | 'default';
}> = [
  { key: 'new_candidate', title: 'هوية جديدة ومركز معتمد — مرشح للفحص النهائي', tone: 'info' },
  { key: 'new_incomplete', title: 'هوية جديدة تحتاج استكمال بيانات', tone: 'warning' },
  { key: 'existing_fill_only', title: 'سجل موجود — حقول فارغة قابلة للاستكمال', tone: 'info' },
  { key: 'existing_no_change', title: 'سجل موجود لا يحتاج استكمالًا ظاهرًا', tone: 'success' },
  { key: 'archived_review', title: 'سجل مؤرشف — يلزم قرار استعادة منفصل', tone: 'warning' },
  { key: 'name_review', title: 'اسم مختلف — يلزم التحقق من المصدر', tone: 'warning' },
  { key: 'center_review', title: 'مركز غير معتمد أو ارتباط مختلف', tone: 'warning' },
  { key: 'organization_review', title: 'جهة تنظيمية غير معتمدة أو ارتباط مختلف', tone: 'warning' },
  { key: 'identifier_disagreement', title: 'اختلاف الرقم الوظيفي أو البريد', tone: 'error' },
  { key: 'identifier_owned_by_other', title: 'معرّف يخص موظفًا آخر', tone: 'error' },
  { key: 'duplicate_file_identity', title: 'هوية مكررة داخل الملف', tone: 'error' },
  { key: 'duplicate_file_identifier', title: 'رقم وظيفي أو بريد مكرر في الملف', tone: 'error' },
  { key: 'invalid_identity', title: 'هوية أو اسم غير صالح', tone: 'error' },
];
const COUNTS: Array<{ key: string; label: string; color: 'success' | 'warning' | 'error' | 'info' }> = [
  { key: 'structurally_valid', label: 'مكتملة بنيويًا', color: 'success' },
  { key: 'incomplete_source', label: 'بيانات مصدر ناقصة', color: 'warning' },
  { key: 'duplicate_in_file', label: 'تكرار داخل الملف', color: 'error' },
  { key: 'invalid_core', label: 'هوية أو اسم غير صالح', color: 'error' },
];

export function EmployeeImportV2Page() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreflightResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState('Employees');

  const verify = async () => {
    if (!file || busy || !user?.isSuperuser) return;
    setBusy(true);
    setError('');
    setPreview(null);
    try {
      if (!API) throw new Error('إعداد اتصال بيئة المنصة غير مكتمل. لا تُرسل الملف إلى أي بيئة أخرى.');
      const token = getAccessToken();
      if (!token) throw new Error('انتهت جلسة المسؤول. سجّل الدخول مجددًا.');
      const body = new FormData();
      body.append('file', file);
      body.append('sheet_name', sheet.trim() || 'Employees');
      const response = await authFetch(API + '/employee-import-v2/preview/', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'تعذر فحص الملف.');
      setPreview(data as PreflightResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر إكمال فحص الملف.');
    } finally {
      setBusy(false);
    }
  };

  if (!user?.isSuperuser) {
    return <Alert severity="warning">إدارة استيراد الموظفين مخصصة للمسؤول الأعلى.</Alert>;
  }

  return <Box dir="rtl" sx={{ maxWidth: 1200, mx: 'auto', pb: 6 }}>
    <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }}
      justifyContent="space-between" gap={2} sx={{ mb: 3 }}>
      <Box>
        <Typography variant="h4" fontWeight={900}>استيراد بيانات الموظفين</Typography>
        <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap" sx={{ mt: 1 }}>
          <Chip size="small" color="primary" label="الإصدار الثاني — واجهة موحدة" />
          <Typography color="text.secondary" variant="body2">
            تجربة جديدة بثلاث خطوات فقط، دون أدوات المطابقة القديمة
          </Typography>
        </Stack>
      </Box>
      <Button variant="outlined" startIcon={<BackIcon />} onClick={() => navigate('/employees')}>
        العودة إلى الموظفين
      </Button>
    </Stack>

    <Paper sx={{ p: { xs: 2, md: 3 }, mb: 3, borderRadius: 3 }}>
      <Stepper activeStep={preview ? 1 : 0} alternativeLabel>
        {['رفع ملف Excel', 'فحص البيانات والمطابقة', 'المراجعة والاعتماد'].map(title =>
          <Step key={title}><StepLabel>{title}</StepLabel></Step>
        )}
      </Stepper>
    </Paper>

    <Alert severity="info" icon={<SecurityIcon />} sx={{ mb: 2 }}>
      يستعمل هذا الإصدار شاشة موحدة. عند فحص Excel يجري التحقق من الهويات
      مقابل السجلات النشطة والمؤرشفة، دون استعادة أو إضافة أو تعديل الموظفين،
      ودون تغيير المراكز أو الجهات التنظيمية أو أي بيانات صحية.
    </Alert>

    <Paper sx={{ p: { xs: 2, md: 3 }, mb: 3, borderRadius: 3 }}>
      <Typography variant="h6" fontWeight={900} sx={{ mb: 2 }}>1. رفع الملف</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} alignItems={{ sm: 'center' }}>
        <Button component="label" variant="contained" startIcon={<UploadIcon />} disabled={busy}>
          {file ? 'تغيير الملف' : 'اختيار ملف Excel'}
          <input type="file" accept=".xlsx" hidden onChange={event => {
            const picked = event.target.files?.[0] || null;
            setFile(picked);
            setPreview(null);
            setError('');
            event.target.value = '';
          }} />
        </Button>
        <Stack direction="row" alignItems="center" gap={1} sx={{ minWidth: 0 }}>
          <FileIcon color="action" />
          <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
            {file ? file.name : 'لم يتم اختيار ملف بعد'}
          </Typography>
        </Stack>
      </Stack>
      <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1.5 }}>
        ملف XLSX فقط، بحد أقصى 10 ميغابايت و2500 موظف. لن يُحفظ الملف على الخادم.
      </Typography>
      <Typography variant="caption" display="block" sx={{ mt: 1 }}>
        سيتم افتراض ورقة Employees في المرحلة الأولى، ويمكنك تغيير اسمها هنا.
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}
        alignItems={{ sm: 'center' }} sx={{ mt: 2 }}>
        <Box component="label" sx={{ fontSize: 13, fontWeight: 700 }}>اسم ورقة الموظفين</Box>
        <Box component="input" value={sheet} disabled={busy}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            setSheet(event.target.value);
            setPreview(null);
          }}
          sx={{
            border: '1px solid', borderColor: 'divider', p: 1.25, borderRadius: 1.5,
            bgcolor: 'background.paper', color: 'text.primary', maxWidth: 280, width: '100%',
          }} />
        <Button variant="contained" startIcon={<CheckIcon />} disabled={!file || busy}
          onClick={() => void verify()}>
          {busy ? 'جاري فحص بنية الملف...' : 'فحص الملف'}
        </Button>
      </Stack>
      {busy && <Stack direction="row" gap={1} alignItems="center" sx={{ mt: 2 }}>
        <CircularProgress size={20}/><Typography variant="body2">يجري الفحص دون حفظ أي بيانات</Typography>
      </Stack>}
    </Paper>

    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

    {preview && <Paper sx={{ p: { xs: 2, md: 3 }, mb: 3, borderRadius: 3 }}>
      <Typography variant="h6" fontWeight={900} sx={{ mb: 1 }}>
        2. نتائج فحص الملف ومطابقة السجل
      </Typography>
      <Alert severity="warning" sx={{ mb: 2 }}>
        تمت مقارنة أرقام الهوية بالسجل النشط والمؤرشف، وفحص تعارض الأسماء
        والمعرّفات والمراكز الصحية المعتمدة. النتائج تشخيصية فقط؛
        أي سجل جديد أو مؤرشف لن يُحفظ أو يُستعاد قبل مرحلة الاعتماد المستقلة.
      </Alert>
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, textAlign: 'center' }}>
            <Typography variant="h4" fontWeight={900}>{preview.rows_total}</Typography>
            <Typography variant="caption">السجلات المقروءة من Excel</Typography>
          </Paper>
        </Grid>
        {COUNTS.map(row => <Grid key={row.key} size={{ xs: 6, sm: 2 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, textAlign: 'center' }}>
            <Typography variant="h5" fontWeight={900}>
              {preview.counts[row.key] || 0}
            </Typography>
            <Chip color={row.color} size="small" label={row.label} sx={{ mt: 1 }} />
          </Paper>
        </Grid>)}
      </Grid>
      <Divider sx={{ my: 2 }}/>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} sx={{ mb: 2 }}>
        <Paper variant="outlined" sx={{ p: 2, flex: 1, textAlign: 'center' }}>
          <Typography variant="h4" fontWeight={900}>{preview.identity_found}</Typography>
          <Typography variant="body2">هويات موجودة سابقًا في قاعدة البيانات</Typography>
        </Paper>
        <Paper variant="outlined" sx={{
          p: 2, flex: 1, textAlign: 'center', bgcolor: '#fff4c5',
          color: '#533c00', borderColor: '#f0c757',
        }}>
          <Typography variant="h4" fontWeight={900}>
            {preview.yellow_missing_information}
          </Typography>
          <Typography variant="body2" fontWeight={700}>
            بطاقات ستحتاج استكمال بيانات (مؤشر أصفر)
          </Typography>
        </Paper>
      </Stack>
      <Typography fontWeight={900} sx={{ mb: 1 }}>مطابقة الموظفين مع قاعدة البيانات</Typography>
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {REGISTRY_STATES.filter(item => (preview.registry_counts[item.key] || 0) > 0)
          .map(item => <Grid key={item.key} size={{ xs: 12, sm: 6, lg: 4 }}>
            <Paper variant="outlined" sx={{ p: 1.5, minHeight: 84 }}>
              <Stack direction="row" gap={1.5} alignItems="center">
                <Chip color={item.tone} label={preview.registry_counts[item.key] || 0}/>
                <Typography fontSize={13} fontWeight={700}>{item.title}</Typography>
              </Stack>
            </Paper>
          </Grid>)}
      </Grid>
      <Typography fontWeight={800} sx={{ mb: 1 }}>أمثلة للحالات التي تحتاج مراجعة</Typography>
      <Stack gap={1} sx={{ mb: 2 }}>
        {preview.review_examples_masked.slice(0, 12).map(row => <Paper
          key={row.row} variant="outlined" sx={{ px: 2, py: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }}
            justifyContent="space-between" gap={1}>
            <Typography variant="body2">صف {row.row} — {row.identity_masked}</Typography>
            <Chip size="small" color="warning"
              label={REGISTRY_STATES.find(v => v.key === row.status)?.title || row.status}/>
            {row.missing_fields.length > 0 && <Chip size="small"
              sx={{ bgcolor: '#fff0ad', color: '#493900' }}
              label={`بيانات ناقصة: ${row.missing_fields.map(k => FIELDS[k] || k).join('، ')}`}/>}
          </Stack>
        </Paper>)}
        {preview.review_examples_masked.length === 0 &&
          <Typography variant="body2" color="text.secondary">
            لا توجد استثناءات ظاهرة في العينات الأولى.
          </Typography>}
      </Stack>
      <Divider sx={{ my: 2 }}/>
      <Typography fontWeight={800} sx={{ mb: 1 }}>الأعمدة التي تعرف عليها النظام</Typography>
      <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mb: 2 }}>
        {preview.recognized_columns.map(key =>
          <Chip key={key} color="success" variant="outlined" label={FIELDS[key] || key}/>)}
      </Stack>
      <Typography variant="body2" color="text.secondary">
        الأعمدة غير الموجودة في الملف لا تُعامل كأخطاء بالضرورة؛
        يُحدد إلزامها وفق قواعد الاستيراد النهائي.
      </Typography>
      <Alert severity="info" sx={{ mt: 2 }}>{preview.notice}</Alert>
    </Paper>}

    <Paper sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
      <Stack direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between" alignItems={{ md: 'center' }} gap={1.5}>
        <Box>
          <Typography variant="h6" fontWeight={900}>
            3. المراجعة والاعتماد
          </Typography>
          <Typography variant="body2" color="text.secondary">
            اكتملت المطابقة التشخيصية للهوية والمراكز والسجلات المؤرشفة.
            الخطوة التالية هي بناء اعتماد انتقائي موثق وآمن، مع حماية
            البيانات الصحية وعدم استبدال الحقول الممتلئة.
          </Typography>
        </Box>
        <Button variant="contained" disabled>الاعتماد والحفظ — غير مفعل بعد</Button>
      </Stack>
    </Paper>
  </Box>;
}
