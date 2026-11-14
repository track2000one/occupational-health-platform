import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Divider,
  FormControlLabel, Grid, Paper, Stack, TextField, Typography,
} from '@mui/material';
import {
  ArrowBack as BackIcon, UploadFile as UploadIcon,
  FactCheck as PreviewIcon, ManageAccounts as SaveIcon,
} from '@mui/icons-material';
import { authFetch, getAccessToken, useAuth } from '../context/AuthContext';

const API = (import.meta.env.VITE_API_URL ||
  'https://occupational-health-platform-production.up.railway.app/api').replace(/\/$/, '');

type Preview = {
  mode: 'preview';
  total_rows: number;
  eligible_count: number;
  breakdown: Record<string, number>;
  fill_field_counts: Record<string, number>;
  examples_masked: Array<{ status: string; row: number; national_id_masked: string }>;
  preview_token: string;
  confirm_phrase: string;
  warning: string;
  notice: string;
};
type Done = {
  mode: 'committed';
  processed: number;
  matched_and_updated: number;
  restored: number;
  changed_fields_total: number;
  not_modified: number;
  notice: string;
};
const CATEGORIES: Record<string, string> = {
  restore_and_fill: 'استعادة موظف مؤرشف واستكمال بياناته الناقصة',
  restore_only: 'استعادة موظف مؤرشف دون تعديل حقوله',
  fill_only: 'استكمال بيانات موظف نشط',
  no_change: 'مسجل ولا توجد حقول ناقصة قابلة للاستكمال',
  invalid_identity_or_name: 'هوية أو اسم غير صالح',
  duplicate_identity_in_file: 'هوية مكررة داخل Excel',
  duplicate_email_in_file: 'بريد إلكتروني مكرر داخل Excel',
  duplicate_employee_number_in_file: 'رقم وظيفي مكرر داخل Excel',
  new_identity_requires_normal_import: 'هوية جديدة (تحتاج مسار إضافة الموظفين)',
  name_mismatch: 'اختلاف اسم الموظف عن السجل الأصلي',
  invalid_source_value: 'قيمة في المصدر تحتاج تحققًا',
  unique_value_owned_by_other: 'رقم وظيفي أو بريد يخص موظفًا آخر',
  unique_field_mismatch: 'اختلاف الرقم الوظيفي أو البريد الحالي',
  individually_archived_requires_review: 'مؤرشف بإجراء مستقل ويتطلب استعادة فردية',
  date_inconsistency: 'عدم اتساق تاريخ الميلاد والتعيين',
};
const FIELD_NAMES: Record<string, string> = {
  employee_number: 'الرقم الوظيفي', email: 'البريد الإلكتروني',
  mobile: 'الجوال', national_address: 'العنوان الوطني',
  date_of_birth: 'تاريخ الميلاد', birth_place: 'مكان الميلاد',
  gender: 'الجنس', marital_status: 'الحالة الاجتماعية',
  job_title: 'المسمى الوظيفي', job_title_en: 'المسمى بالإنجليزية',
  current_job: 'الوظيفة الحالية', nationality: 'الجنسية',
  appointment_date: 'تاريخ التعيين',
};

export function EmployeeExcelReconciliationPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState('Employees');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Done | null>(null);
  const [reason, setReason] = useState('');
  const [phrase, setPhrase] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const process = async (action: 'preview' | 'commit') => {
    if (busy || !file || !user?.isSuperuser) return;
    if (action === 'commit') {
      if (!preview || preview.eligible_count <= 0 || preview.eligible_count > 500 ||
          phrase !== preview.confirm_phrase || !acknowledged ||
          reason.trim().length < 20 || reason.trim().length > 500) return;
      if (!window.confirm(
        `هل تؤكد استعادة/استكمال ${preview.eligible_count} موظفًا مطابقًا فقط، مع الإبقاء على جميع البيانات الحالية والملفات الصحية دون استبدال؟`
      )) return;
    }
    setBusy(true);
    setError('');
    if (action === 'preview') {
      setPreview(null);
      setResult(null);
      setAcknowledged(false);
      setReason('');
      setPhrase('');
    }
    try {
      const token = getAccessToken();
      if (!token) throw new Error('انتهت جلسة المسؤول؛ أعد تسجيل الدخول.');
      const form = new FormData();
      form.append('action', action);
      form.append('file', file);
      form.append('sheet_name', sheet || 'Employees');
      if (action === 'commit' && preview) {
        form.append('preview_token', preview.preview_token);
        form.append('confirmed', 'true');
        form.append('identity_checked', 'true');
        form.append('confirm_phrase', phrase);
        form.append('reason', reason.trim());
      }
      const response = await authFetch(API + '/employee-roster/reconcile/', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'تعذرت معالجة ملف الموظفين.');
      if (action === 'preview') setPreview(data as Preview);
      else {
        setResult(data as Done);
        setPreview(null);
        setPhrase('');
        setReason('');
        setAcknowledged(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إكمال العملية.');
      if (action === 'commit') setPreview(null); // Stale token; force a new preview.
    } finally {
      setBusy(false);
    }
  };

  if (!user?.isSuperuser) {
    return <Alert severity="warning">هذه الصفحة مخصصة للمسؤول الأعلى فقط.</Alert>;
  }

  return <Box dir="rtl" sx={{ pb: 5 }}>
    <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5}
      alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
      <Box>
        <Typography variant="h4" fontWeight={900}>مطابقة واستكمال الموظفين من Excel</Typography>
        <Typography color="text.secondary" variant="body2">
          استعادة السجلات المؤرشفة من دفعة التصفير بعد التحقق، وتعبئة الحقول الفارغة فقط
        </Typography>
      </Box>
      <Button variant="outlined" startIcon={<BackIcon />}
        onClick={() => navigate('/employees/import')}>
        العودة إلى الاستيراد
      </Button>
    </Stack>

    <Alert severity="info" sx={{ mb: 2 }}>
      هذا المسار مختلف عن «إضافة موظفين جدد». لا ينشئ أي هوية مكررة،
      ولا يستبدل اسمًا أو رقمًا وظيفيًا أو بريدًا موجودًا،
      ولا يغير المركز الصحي أو الجهة التنظيمية أو الملفات الطبية.
      اختلاف الاسم أو المعرفات يعزل السجل للمراجعة.
    </Alert>

    <Paper sx={{ p: 3, mb: 2 }}>
      <Stack gap={2}>
        <Button component="label" variant="contained" startIcon={<UploadIcon />}
          sx={{ alignSelf: 'start' }} disabled={busy}>
          {file ? file.name : 'اختيار ملف الموظفين Excel'}
          <input type="file" accept=".xlsx" hidden onChange={e => {
            const candidate = e.target.files?.[0] || null;
            setFile(candidate);
            setPreview(null); setResult(null); setError('');
          }}/>
        </Button>
        <TextField label="اسم ورقة الموظفين" value={sheet} sx={{ maxWidth: 300 }}
          onChange={e => { setSheet(e.target.value); setPreview(null); }} />
        <Button variant="contained" color="primary" startIcon={<PreviewIcon />}
          disabled={!file || busy} onClick={() => void process('preview')}>
          فحص مطابقة الملف (قراءة فقط)
        </Button>
        {busy && <Stack direction="row" alignItems="center" gap={2}>
          <CircularProgress size={24}/>
          <Typography>جارٍ التحقق من الملف والسجلات الموجودة...</Typography>
        </Stack>}
      </Stack>
    </Paper>

    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

    {preview && <>
      <Paper sx={{ p: 3, mb: 2 }}>
        <Typography fontWeight={900} variant="h6" sx={{ mb: 1.5 }}>
          نتائج المطابقة — دون إجراء أي تعديل
        </Typography>
        <Grid container spacing={1.5}>
          {[
            ['إجمالي الموظفين في الملف', preview.total_rows],
            ['المؤهلون للاستعادة أو الاستكمال', preview.eligible_count],
            ['يحتاجون مراجعة أو مسارًا منفصلًا', preview.total_rows - preview.eligible_count],
          ].map(([caption, n]) => <Grid key={String(caption)} size={{ xs: 12, md: 4 }}>
            <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
              <Typography fontSize={28} fontWeight={900}>{n}</Typography>
              <Typography fontSize={12}>{caption}</Typography>
            </Paper>
          </Grid>)}
        </Grid>
        <Divider sx={{ my: 2 }}/>
        <Typography fontWeight={900} sx={{ mb: 1 }}>تصنيف السجلات</Typography>
        <Grid container spacing={1}>
          {Object.entries(preview.breakdown).map(([key, n]) => <Grid key={key}
            size={{ xs: 12, md: 6 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between"
              sx={{ p: 1.2, borderBottom: '1px solid #CBD5E1' }}>
              <Typography fontSize={13}>{CATEGORIES[key] || key}</Typography>
              <Chip label={n} color={key.includes('mismatch') ? 'error' : 'default'}/>
            </Stack>
          </Grid>)}
        </Grid>
        {!!Object.keys(preview.fill_field_counts).length && <>
          <Typography fontWeight={900} sx={{ my: 2 }}>الحقول المتوقع استكمالها</Typography>
          <Stack direction="row" gap={1} flexWrap="wrap">
            {Object.entries(preview.fill_field_counts).map(([key, n]) =>
              <Chip key={key} variant="outlined" label={`${FIELD_NAMES[key] || key}: ${n}`}/>)}
          </Stack>
        </>}
        <Alert severity="info" sx={{ mt: 2 }}>{preview.notice}</Alert>
        {preview.warning && <Alert severity="warning" sx={{ mt: 1.5 }}>{preview.warning}</Alert>}
      </Paper>

      {preview.eligible_count > 0 && preview.eligible_count <= 500 && (
        <Paper sx={{ p: 3, mb: 2, border: '1px solid #94A3B8' }}>
          <Typography fontWeight={900} variant="h6" sx={{ mb: 1 }}>
            اعتماد الاستعادة والاستكمال للسجلات المطابقة فقط
          </Typography>
          <Alert severity="warning" sx={{ mb: 2 }}>
            الإجراء سيحدّث بيانات الموظفين في Production.
            يتطلب مطابقة الهوية والاسم والمصدر إداريًا؛ تبقى الحالات المتعارضة
            والمؤرشفة يدويًا خارج هذا الاعتماد، ولا تتغير الزيارات والملفات الصحية.
          </Alert>
          <Stack gap={2}>
            <TextField label="المبرر الإداري المعتمد" multiline minRows={3}
              value={reason} onChange={e => setReason(e.target.value)}
              helperText="20–500 حرف، دون بيانات شخصية أو طبية"
              inputProps={{ maxLength: 500 }}/>
            <TextField label="اكتب عبارة التأكيد كما تظهر"
              value={phrase} onChange={e => setPhrase(e.target.value)}
              helperText={preview.confirm_phrase}/>
            <FormControlLabel
              control={<Checkbox checked={acknowledged}
                onChange={(_, checked) => setAcknowledged(checked)}/>}
              label="تحققت من أن الملف المعتمد يخص الموظفين المطلوبين، وأوافق على استعادة المطابقين وتعبئة حقولهم الناقصة فقط دون استبدال بيانات قائمة."/>
            <Button variant="contained" color="warning" startIcon={<SaveIcon />}
              disabled={busy || !acknowledged || phrase !== preview.confirm_phrase ||
                reason.trim().length < 20 || reason.trim().length > 500}
              onClick={() => void process('commit')}>
              تأكيد استعادة واستكمال {preview.eligible_count} موظفًا مطابقًا
            </Button>
          </Stack>
        </Paper>
      )}
    </>}

    {result && <Alert severity="success" sx={{ mb: 2 }}>
      <Typography fontWeight={900}>تمت العملية وفق المعاينة المعتمدة</Typography>
      <Typography>السجلات المستعادة: {result.restored}،
        السجلات التي عولجت: {result.matched_and_updated}،
        الحقول المستكملة: {result.changed_fields_total}،
        السجلات غير المعدلة: {result.not_modified}.</Typography>
      <Typography>{result.notice}</Typography>
      <Button variant="outlined" sx={{ mt: 1 }} onClick={() => navigate('/employees')}>
        عرض سجل الموظفين
      </Button>
    </Alert>}
  </Box>;
}
