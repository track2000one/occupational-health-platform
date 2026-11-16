import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert, Box, Button, Chip, CircularProgress, Divider, Grid, Paper,
  Stack, Step, StepLabel, Stepper, Typography, Checkbox, FormControlLabel, TextField, MenuItem,
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

type ArchivedEmployeeReviewPage = {
  mode: 'archived_employee_review_page_read_only';
  category: string;
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  restore_enabled: false;
  notice: string;
  items: Array<{
    row: number;
    identity_masked: string;
    source_name: string;
    registry_name: string;
    assessment: string;
    archive_group: string | null;
    employment_status: string;
    has_name_difference: boolean;
    reason_documented: boolean;
  }>;
};

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
  registry_facets: {
    matched_identity_total: number;
    active_identity_total: number;
    archived_identity_total: number;
    name_difference_total: number;
    archived_with_name_difference: number;
  };
  identity_found: number;
  archive_provenance: {
    matching_unfinished_bulk_reset: number;
    matching_older_unfinished_bulk_reset: number;
    matching_previously_restored_bulk_reset: number;
    other_or_unverified_archive: number;
    reset_batches_scanned: number;
    unfinished_reset_batches_scanned: number;
    completed_reset_batches_scanned: number;
    archive_reason_missing: number;
    employment_active: number;
    employment_transferred: number;
    employment_retired: number;
    employment_separated: number;
    employment_under_review: number;
    employment_unknown: number;
    has_unfinished_bulk_reset: boolean;
  };
  archive_review_examples_masked: Record<string, Array<{
    row: number;
    identity_masked: string;
    name_different: boolean;
    reason_documented: boolean;
  }>>;
  restoration_readiness: {
    counts: Record<string, number>;
    samples_masked: Record<string, Array<{
      row: number;
      identity_masked: string;
      archive_group: string | null;
    }>>;
    scanned_archived: number;
    restore_enabled: false;
    notice: string;
  };
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
  safe_import_candidate_counts: { create: number; fill_only: number; provisional: number };
  requires_manual_review: number;
  commit_token: string;
  confirm_phrase: string;
  commit_available: boolean;
  commit_notice: string;
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
  { key: 'new_provisional', title: 'هوية جديدة بإسناد غير معتمد — بطاقة مبدئية دون مركز وهمي', tone: 'warning' },
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
const ARCHIVE_GROUPS = [
  { key: 'matching_unfinished_bulk_reset', label: 'أرشفة تطابق آخر تصفير غير مستعاد (دليل للتدقيق فقط)' },
  { key: 'matching_older_unfinished_bulk_reset', label: 'أرشفة تطابق تصفيرًا أقدم لم تُعتمد استعادته' },
  { key: 'matching_previously_restored_bulk_reset', label: 'أرشفة تطابق دفعة مصنفة مستعادة سابقًا — يلزم تدقيق خاص' },
  { key: 'other_or_unverified_archive', label: 'أرشفة دون تطابق تاريخي فريد مثبت — تتطلب مراجعة مستقلة' },
] as const;

const RESTORATION_REVIEW_GROUPS = [
  { key: 'candidate_for_administrative_review', label: 'مطابقة أولية للمراجعة الإدارية (ليست موافقة استعادة)', tone: 'info' },
  { key: 'name_difference_review', label: 'اختلاف اسم — يلزم دليل تحقق قبل الاستعادة', tone: 'warning' },
  { key: 'identity_or_identifier_review', label: 'هوية أو رقم وظيفي أو بريد يحتاج معالجة تعارض', tone: 'error' },
  { key: 'employment_status_review', label: 'الحالة الوظيفية غير نشطة أو غير مؤكدة', tone: 'warning' },
  { key: 'archive_reason_review', label: 'سبب الأرشفة لا يطابق سجل التصفير', tone: 'warning' },
  { key: 'archive_history_review', label: 'دليل الأرشفة غير كافٍ أو سبق اعتماد استعادة الدفعة', tone: 'error' },
] as const;

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
  const [reviewPageData, setReviewPageData] = useState<ArchivedEmployeeReviewPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState('Employees');
  const [columnIssue, setColumnIssue] = useState<{
    headerRow: number;
    availableColumns: Array<{ index: number; label: string }>;
  } | null>(null);
  const [selectedNameColumn, setSelectedNameColumn] = useState<number | ''>('');
  const [selectedIdentityColumn, setSelectedIdentityColumn] = useState<number | ''>('');
  const [accepted, setAccepted] = useState(false);
  const [reason, setReason] = useState(
    'اعتماد إضافة الهويات الجديدة واستكمال الحقول الفارغة من ملف الموظفين المرجعي دون استعادة المؤرشفين أو تجاوز التعارضات.'
  );
  const [committed, setCommitted] = useState<{
    created: number; filled: number; provisional: number; skipped: number;
    archived_restored: number; existing_overwritten: number; batch_id: number;
  } | null>(null);

  const applyApprovedImport = async () => {
    if (!file || !preview || !preview.commit_available || !accepted || busy ||
        reason.trim().length < 20) return;
    const total = preview.safe_import_candidate_counts.create +
      preview.safe_import_candidate_counts.fill_only;
    if (!window.confirm(
      `اعتماد إدراج ${total} سجلًا مؤهلًا فقط؟ لن تُستعاد السجلات المؤرشفة أو تُستبدل البيانات الموجودة. سيتم تنفيذ إجراء فعلي في قاعدة البيانات.`
    )) return;
    setBusy(true); setError('');
    try {
      const token = getAccessToken();
      if (!token) throw new Error('انتهت جلسة المسؤول. أعد تسجيل الدخول.');
      const payload = new FormData();
      payload.append('action', 'commit');
      payload.append('file', file);
      payload.append('sheet_name', sheet.trim() || 'Employees');
      if (selectedNameColumn !== '' && selectedIdentityColumn !== '') {
        payload.append('map_name_column', String(selectedNameColumn));
        payload.append('map_national_id_column', String(selectedIdentityColumn));
      }
      payload.append('commit_token', preview.commit_token);
      payload.append('confirm_phrase', preview.confirm_phrase);
      payload.append('confirmed', 'true');
      payload.append('identity_checked', 'true');
      payload.append('reason', reason.trim());
      const response = await authFetch(API + '/employee-import-v2/preview/', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: payload,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'تعذر حفظ دفعة الاستيراد.');
      setCommitted(data);
      setPreview(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تنفيذ عملية الاستيراد.');
    } finally {
      setBusy(false);
    }
  };

  const loadReviewPage = async (category: string, page: number) => {
    if (!file || !preview || busy || !user?.isSuperuser) return;
    setBusy(true);
    setError('');
    try {
      if (!API) throw new Error('إعداد اتصال المنصة غير مكتمل.');
      const token = getAccessToken();
      if (!token) throw new Error('انتهت جلسة المسؤول. أعد تسجيل الدخول.');
      const body = new FormData();
      body.append('action', 'review_page');
      body.append('file', file);
      body.append('sheet_name', sheet.trim() || 'Employees');
      body.append('review_category', category);
      body.append('review_page', String(page));
      if (selectedNameColumn !== '' && selectedIdentityColumn !== '') {
        body.append('map_name_column', String(selectedNameColumn));
        body.append('map_national_id_column', String(selectedIdentityColumn));
      }
      const response = await authFetch(API + '/employee-import-v2/preview/', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token }, body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'تعذر عرض حالات المراجعة.');
      setReviewPageData(data as ArchivedEmployeeReviewPage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل حالات المراجعة.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!file || busy || !user?.isSuperuser) return;
    setBusy(true);
    setError('');
    setPreview(null);
    setReviewPageData(null);
    setCommitted(null);
    setAccepted(false);
    try {
      if (!API) throw new Error('إعداد اتصال بيئة المنصة غير مكتمل. لا تُرسل الملف إلى أي بيئة أخرى.');
      const token = getAccessToken();
      if (!token) throw new Error('انتهت جلسة المسؤول. سجّل الدخول مجددًا.');
      const body = new FormData();
      body.append('file', file);
      body.append('sheet_name', sheet.trim() || 'Employees');
      if (selectedNameColumn !== '' && selectedIdentityColumn !== '') {
        body.append('map_name_column', String(selectedNameColumn));
        body.append('map_national_id_column', String(selectedIdentityColumn));
      }
      const response = await authFetch(API + '/employee-import-v2/preview/', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (Array.isArray(data.available_columns) && data.available_columns.length) {
          setColumnIssue({
            headerRow: Number(data.header_row) || 1,
            availableColumns: data.available_columns,
          });
        } else {
          setColumnIssue(null);
        }
        throw new Error(data.detail || 'تعذر فحص الملف.');
      }
      setColumnIssue(null);
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
      <Stepper activeStep={committed ? 3 : preview ? 2 : 0} alternativeLabel>
        {['رفع ملف Excel', 'فحص البيانات والمطابقة', 'المراجعة والاعتماد'].map(title =>
          <Step key={title}><StepLabel>{title}</StepLabel></Step>
        )}
      </Stepper>
    </Paper>

    <Alert severity="info" icon={<SecurityIcon />} sx={{ mb: 2 }}>
      في الخطوة الأولى يجري الفحص دون تعديل. عند تفعيل الاستيراد الآمن
      والضغط على زر الاعتماد بعد المراجعة، تُضاف الهويات الجديدة وتُستكمل
      الحقول الفارغة فقط. السجلات المؤرشفة أو المتعارضة لا تُستعاد تلقائيًا
      ولا تُعدّل ملفاتها الصحية.
    </Alert>

    <Paper sx={{ p: { xs: 2, md: 3 }, mb: 3, borderRadius: 3 }}>
      <Typography variant="h6" fontWeight={900} sx={{ mb: 2 }}>1. رفع الملف</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} alignItems={{ sm: 'center' }}>
        <Button component="label" variant="contained" startIcon={<UploadIcon />} disabled={busy}>
          {file ? 'تغيير الملف' : 'اختيار ملف Excel'}
          <input type="file" accept=".xlsx" hidden onChange={event => {
            const picked = event.target.files?.[0] || null;
            setFile(picked);
            setColumnIssue(null);
            setSelectedNameColumn('');
            setSelectedIdentityColumn('');
            setPreview(null);
            setReviewPageData(null);
            setCommitted(null);
            setAccepted(false);
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
      <Alert severity="info" sx={{ mt: 1.5 }}>
        تُعرض أرقام الهوية مخفية في المعاينة وبطاقات الموظفين لحماية الخصوصية،
        لكن يجب أن يحتوي ملف Excel الأصلي على الأرقام الكاملة المكونة من 10 خانات.
        لا ترفع نسخة تقرير أخفيت فيها الأرقام برموز (•••• أو ****)؛
        لأن النظام لا يستطيع استرجاع الخانات المحجوبة.
        ويمكن للمسؤول المخوّل اختيار إخفاء الهوية أو إظهارها عند إعداد تقرير الطباعة.
      </Alert>
      <Typography variant="caption" display="block" sx={{ mt: 1 }}>
        سيتم افتراض ورقة Employees في المرحلة الأولى، ويمكنك تغيير اسمها هنا.
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}
        alignItems={{ sm: 'center' }} sx={{ mt: 2 }}>
        <Box component="label" sx={{ fontSize: 13, fontWeight: 700 }}>اسم ورقة الموظفين</Box>
        <Box component="input" value={sheet} disabled={busy}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            setSheet(event.target.value);
            setColumnIssue(null);
            setSelectedNameColumn('');
            setSelectedIdentityColumn('');
            setPreview(null);
            setCommitted(null);
            setAccepted(false);
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
    {columnIssue && <Paper sx={{ p: { xs: 2, md: 3 }, mb: 2, borderRadius: 3 }}>
      <Typography variant="h6" fontWeight={900} sx={{ mb: 1 }}>
        تحديد أعمدة الموظفين
      </Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        لم يُكتشف اسم العمود بصورة تلقائية. اختر العمود الذي يحتوي على أسماء الموظفين،
        ثم العمود الذي يحتوي على أرقام الهوية الكاملة. هذه خطوة فحص فقط،
        ولا تُغيّر أسماء الأعمدة في ملف Excel.
        صف العناوين الذي تعرّف عليه النظام: {columnIssue.headerRow}.
      </Alert>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}>
        <TextField select fullWidth label="عمود اسم الموظف"
          value={selectedNameColumn}
          onChange={e => setSelectedNameColumn(Number(e.target.value))}>
          {columnIssue.availableColumns.map(c => (
            <MenuItem key={c.index} value={c.index}>
              {c.index} — {c.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField select fullWidth label="عمود رقم الهوية / الإقامة"
          value={selectedIdentityColumn}
          onChange={e => setSelectedIdentityColumn(Number(e.target.value))}>
          {columnIssue.availableColumns.map(c => (
            <MenuItem key={c.index} value={c.index}>
              {c.index} — {c.label}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="contained" disabled={busy ||
          selectedNameColumn === '' || selectedIdentityColumn === '' ||
          selectedNameColumn === selectedIdentityColumn}
          onClick={() => void verify()}>
          إعادة الفحص
        </Button>
      </Stack>
    </Paper>}

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
      <Typography fontWeight={900} sx={{ mb: 1 }}>الحالة الفعلية للسجلات المتطابقة</Typography>
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {[
          { label: 'موظفون نشطون أو غير مؤرشفين في السجل', count: preview.registry_facets.active_identity_total },
          { label: 'إجمالي السجلات المؤرشفة (بما فيها اختلافات الأسماء)', count: preview.registry_facets.archived_identity_total },
          { label: 'أسماء مختلفة عن السجل الأصلي', count: preview.registry_facets.name_difference_total },
          { label: 'مؤرشفون ولديهم أيضًا اختلاف في الاسم', count: preview.registry_facets.archived_with_name_difference },
        ].map(item => <Grid key={item.label} size={{ xs: 12, sm: 6 }}>
          <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 2 }}>
            <Typography variant="h5" fontWeight={900}>{item.count}</Typography>
            <Typography variant="body2">{item.label}</Typography>
          </Paper>
        </Grid>)}
      </Grid>
      <Alert severity="info" sx={{ mb: 2 }}>
        الأعداد أعلاه مستقلة ويمكن أن تتداخل؛ الموظف المؤرشف قد يكون اسمه
        مختلفًا أيضًا. أما بطاقات التصنيف أدناه فتعرض السبب الأساسي الذي أوقف
        الاستكمال التلقائي لكل صف، لذلك لا تجمع الفئتين معًا.
      </Alert>
      {preview.registry_facets.archived_identity_total > 0 && <>
        <Typography fontWeight={900} sx={{ mb: 1 }}>التحقق من مصدر أرشفة الموظفين</Typography>
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          {[
            ...ARCHIVE_GROUPS.map(group => ({
              label: group.label,
              count: preview.archive_provenance[group.key] || 0,
            })),
            {
              label: 'حالة وظيفية مسجلة: على رأس العمل',
              count: preview.archive_provenance.employment_active,
            },
            {
              label: 'حالة وظيفية مسجلة: متقاعد أو منتهية خدمته',
              count: preview.archive_provenance.employment_retired +
                preview.archive_provenance.employment_separated,
            },
            {
              label: 'حالة وظيفية مسجلة: منقول أو قيد المراجعة',
              count: preview.archive_provenance.employment_transferred +
                preview.archive_provenance.employment_under_review,
            },
          ].map(item => <Grid key={item.label} size={{ xs: 12, sm: 6, lg: 4 }}>
            <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 2 }}>
              <Typography variant="h5" fontWeight={900}>{item.count}</Typography>
              <Typography variant="body2">{item.label}</Typography>
            </Paper>
          </Grid>)}
        </Grid>
        <Alert severity="info" sx={{ mb: 2 }}>
          فُحصت {preview.archive_provenance.reset_batches_scanned} دفعة تصفير مسجلة،
          منها {preview.archive_provenance.unfinished_reset_batches_scanned} غير مستعادة
          و{preview.archive_provenance.completed_reset_batches_scanned} مصنفة مستعادة.
          تطابق الدفعة مبني على رقم السجل الداخلي وتوقيت الأرشفة الدقيق معًا؛
          ولا يعني أن الموظف مستحق للاستعادة.
        </Alert>
        {ARCHIVE_GROUPS.map(group => {
          const examples = preview.archive_review_examples_masked?.[group.key] || [];
          return examples.length > 0 && <Paper key={group.key}
            variant="outlined" sx={{ p: 1.5, mb: 1.5, borderRadius: 2 }}>
            <Typography variant="body2" fontWeight={800} sx={{ mb: 0.5 }}>
              عينات تدقيق: {group.label}
            </Typography>
            <Stack direction="row" gap={1} flexWrap="wrap">
              {examples.map(example => <Chip key={example.row} size="small"
                variant="outlined"
                label={`صف Excel ${example.row} — ${example.identity_masked}${example.name_different ? ' · اختلاف اسم' : ''}${!example.reason_documented ? ' · سبب أرشفة غير موثق' : ''}`} />)}
            </Stack>
          </Paper>;
        })}
        <Alert severity="warning" sx={{ mb: 2 }}>
          هذه مؤشرات تدقيق مستقلة، ولا تُثبت أهلية الاستعادة. يجب مراجعة سبب
          الأرشفة وسجلات جميع دفعات التصفير والحالة الوظيفية الحالية ونسخة
          PostgreSQL الاحتياطية قبل اعتماد أي استعادة. قد تكون بعض الأرشفة
          مستقلة عن التصفير أو لا توجد أدلة كافية على مصدرها.
          لا تستعد جميع المؤرشفين تلقائيًا، ولا تغيّر الأسماء أو الملفات الصحية
          بسبب اختلاف بيانات Excel.
          {preview.archive_provenance.archive_reason_missing > 0 &&
            ` توجد ${preview.archive_provenance.archive_reason_missing} حالة دون سبب أرشفة مدوّن، وتحتاج تحققًا منفصلًا.`}
        </Alert>
      </>}
      {preview.registry_facets.archived_identity_total > 0 && <>
        <Divider sx={{ my: 2 }} />
        <Typography fontWeight={900} sx={{ mb: 1 }}>
          تقييم أهلية مراجعة الاستعادة — قراءة فقط
        </Typography>
        <Alert severity="info" sx={{ mb: 2 }}>
          تم تقييم {preview.restoration_readiness.scanned_archived} سجل مؤرشف بمقارنة
          مصدر الأرشفة، الاسم، المعرّفات والحالة الوظيفية وسبب التصفير.
          النتائج مؤشرات للمراجعة الإدارية فقط، ولا تسمح بالاستعادة أو تغيير
          بطاقة الموظف. تصنيفات هذه المرحلة مستقلة عن أسباب منع الاستيراد.
        </Alert>
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          {RESTORATION_REVIEW_GROUPS.map(group => (
            <Grid key={group.key} size={{ xs: 12, sm: 6, lg: 4 }}>
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                <Typography variant="h5" fontWeight={900}>
                  {preview.restoration_readiness.counts[group.key] || 0}
                </Typography>
                <Typography variant="body2">{group.label}</Typography>
                {(preview.restoration_readiness.counts[group.key] || 0) > 0 &&
                  <Button size="small" variant="outlined" sx={{ mt: 1 }}
                    disabled={busy}
                    onClick={() => void loadReviewPage(group.key, 1)}>
                    استعراض حالات الفئة (25 لكل صفحة)
                  </Button>}
                {(preview.restoration_readiness.samples_masked[group.key] || []).length > 0 &&
                  <Stack gap={0.5} sx={{ mt: 1.25 }}>
                    {preview.restoration_readiness.samples_masked[group.key].map(item =>
                      <Typography key={item.row} variant="caption" color="text.secondary">
                        صف Excel {item.row} — {item.identity_masked}
                      </Typography>)}
                  </Stack>}
              </Paper>
            </Grid>
          ))}
        </Grid>
        {reviewPageData && <Paper variant="outlined"
          sx={{ p: { xs: 1.5, sm: 2 }, mb: 2, borderRadius: 2 }}>
          <Typography fontWeight={900} sx={{ mb: 1 }}>
            قائمة المراجعة التفصيلية — {RESTORATION_REVIEW_GROUPS.find(
              v => v.key === reviewPageData.category)?.label || 'جميع الحالات'}
          </Typography>
          <Alert severity="info" sx={{ mb: 1.5 }}>
            تظهر أسماء الموظفين للمسؤول الأعلى فقط لتسهيل مطابقتها
            مع المستندات المرجعية. تبقى أرقام الهوية مخفية، ولا توجد
            في هذه الصفحة وظيفة للاعتماد أو الاستعادة.
          </Alert>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {reviewPageData.total} سجلًا — الصفحة {reviewPageData.page} من {reviewPageData.total_pages}
          </Typography>
          <Stack gap={1}>
            {reviewPageData.items.map(item =>
              <Paper key={item.row} variant="outlined" sx={{ p: 1.5 }}>
                <Typography variant="body2" fontWeight={800}>
                  صف Excel {item.row} — {item.identity_masked}
                </Typography>
                <Typography variant="body2">
                  الاسم في Excel: {item.source_name}
                </Typography>
                <Typography variant="body2">
                  الاسم في السجل: {item.registry_name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {item.has_name_difference ? 'يوجد اختلاف في الاسم · ' : ''}
                  الحالة الوظيفية المسجلة: {item.employment_status}
                  {item.reason_documented ? ' · سبب الأرشفة موثق' : ' · سبب الأرشفة غير موثق'}
                </Typography>
              </Paper>
            )}
            {reviewPageData.items.length === 0 &&
              <Typography color="text.secondary" variant="body2">
                لا توجد سجلات في هذا التصنيف.
              </Typography>}
          </Stack>
          <Stack direction="row" justifyContent="space-between" sx={{ mt: 2 }}>
            <Button variant="outlined"
              disabled={busy || reviewPageData.page <= 1}
              onClick={() => void loadReviewPage(reviewPageData.category, reviewPageData.page - 1)}>
              الصفحة السابقة
            </Button>
            <Button variant="outlined"
              disabled={busy || reviewPageData.page >= reviewPageData.total_pages}
              onClick={() => void loadReviewPage(reviewPageData.category, reviewPageData.page + 1)}>
              الصفحة التالية
            </Button>
          </Stack>
        </Paper>}
        <Alert severity="warning" sx={{ mb: 2 }}>
          {preview.restoration_readiness.notice} تتطلب أي عملية استعادة مستقبلية
          نسخة احتياطية PostgreSQL قابلة للاسترجاع، وتحققًا من الحالة الوظيفية
          وقرارًا إداريًا موثقًا وسجل تدقيق مستقلًا.
        </Alert>
      </>}
      <Typography fontWeight={900} sx={{ mb: 1 }}>تصنيف سبب المنع الأساسي</Typography>
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
      <Typography variant="h6" fontWeight={900} sx={{ mb: 1 }}>3. المراجعة والاعتماد</Typography>
      {preview && <>
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4">{preview.safe_import_candidate_counts.create}</Typography>
              <Typography variant="body2">مرشحون للإضافة الجديدة</Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4">{preview.safe_import_candidate_counts.fill_only}</Typography>
              <Typography variant="body2">مرشحون لاستكمال الحقول الفارغة</Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4" color="warning.main">{preview.requires_manual_review}</Typography>
              <Typography variant="body2">تبقى للمراجعة أو الأرشيف</Typography>
            </Paper>
          </Grid>
        </Grid>
        <Alert severity="warning" sx={{ mb: 2 }}>{preview.commit_notice}</Alert>
        {preview.commit_available ? <Stack gap={1.5}>
          <TextField value={reason} multiline minRows={2} label="مبرر الاعتماد الإداري"
            inputProps={{ maxLength: 500 }}
            onChange={e => setReason(e.target.value)} />
          <FormControlLabel
            control={<Checkbox checked={accepted}
              onChange={(_, checked) => setAccepted(checked)} disabled={busy}/>}
            label="راجعت مصدر الهوية والنتائج، وأوافق على إضافة المرشحين الآمنين واستكمال الحقول الفارغة فقط دون المساس بالمؤرشفين أو البيانات الصحية."/>
          <Button variant="contained" color="success" disabled={busy || !accepted || reason.trim().length < 20 ||
            (preview.safe_import_candidate_counts.create + preview.safe_import_candidate_counts.fill_only === 0)}
            onClick={() => void applyApprovedImport()}>
            {busy ? 'جاري اعتماد الدفعة...' : preview.confirm_phrase}
          </Button>
        </Stack> :
        <Alert severity="info">تم تجهيز آلية الاعتماد، ولكنها غير مفعلة في بيئة التشغيل الحالية
          حتى تُختبر سلامة النسخ الاحتياطي والمطابقة على Staging.</Alert>}
      </>}
      {committed && <Alert severity="success">
        اكتملت عملية الاستيراد. أُضيف {committed.created} موظفًا، واستُكملت بيانات
        {committed.filled}، منها {committed.provisional} تسجيل مبدئي،
        وتُرك {committed.skipped} سجلًا دون تغيير للمراجعة.
        رقم دفعة التدقيق {committed.batch_id}.
      </Alert>}
      {!preview && !committed && <Typography variant="body2" color="text.secondary">
        ارفع الملف وافحصه أولًا لعرض أعداد السجلات التي يمكن اعتمادها.
      </Typography>}
    </Paper>
  </Box>;
}
