import { useEffect, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  Download as DownloadIcon,
  Security as SecurityIcon,
  Preview as PreviewIcon,
  Storage as StorageIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Edit as EditIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { getAccessToken } from '../context/AuthContext';
import { CalendarDateField } from '../components/CalendarDateField';

const PRODUCTION_API_BASE_URL = 'https://occupational-health-platform-production.up.railway.app/api';
const LOCAL_API_BASE_URL = 'http://localhost:8000/api';
const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? LOCAL_API_BASE_URL
    : PRODUCTION_API_BASE_URL)
).replace(/\/$/, '');

type ImportSummary = Record<string, number> & {
  total_rows: number;
  valid_rows: number;
  duplicate_rows: number;
  errors_count: number;
  skipped_rows: number;
};

type SheetImportResult = {
  sheet_name: string;
  processor?: string;
  summary: ImportSummary;
  errors?: { row: number; reason: string }[];
  duplicates?: { row: number; national_id?: string; name?: string; reason: string }[];
  preview_rows?: Record<string, string | number | null>[];
};

type ImportResult = {
  batch_id?: number;
  mode: 'preview' | 'commit';
  file_name: string;
  sheet_name: string;
  available_sheets: string[];
  importable_sheets?: string[];
  detected_headers?: string[];
  mapped_fields?: Record<string, number | string>;
  summary: ImportSummary;
  sheet_results?: SheetImportResult[];
  duplicates: { row: number; national_id?: string; name?: string; reason: string }[];
  errors: { row: number; reason: string }[];
  preview_rows: Record<string, string | number | null>[];
  privacy_note: string;
};

type ImportReview = {
  id: number;
  source_file: string;
  source_row: number;
  employee_payload: Record<string, unknown>;
  raw_payload: Record<string, unknown>;
  issues: string[];
  status: 'pending' | 'conflict' | 'activated' | 'discarded';
  conflict_employee_summary?: {
    id: number;
    name: string;
    employee_number: string;
    national_id_masked: string;
  } | null;
};

type HealthCenterOption = { id: number | string; name: string };

type ReviewForm = {
  name: string;
  email: string;
  national_id: string;
  employee_number: string;
  national_address: string;
  mobile: string;
  date_of_birth: string;
  birth_place: string;
  gender: string;
  marital_status: string;
  health_center: string;
  job_title: string;
  appointment_date: string;
  periodic_exam_status: string;
  vaccination_status: string;
  risk_level: string;
};

const EMPTY_REVIEW_FORM: ReviewForm = {
  name: '', email: '', national_id: '', employee_number: '', national_address: '',
  mobile: '', date_of_birth: '', birth_place: '', gender: 'male', marital_status: '',
  health_center: '', job_title: '', appointment_date: '', periodic_exam_status: 'incomplete',
  vaccination_status: 'due', risk_level: 'low',
};

function getImportedTotal(summary: ImportSummary) {
  return Object.entries(summary)
    .filter(([key, value]) => key.startsWith('imported_') && typeof value === 'number')
    .reduce((total, [, value]) => total + value, 0);
}

function friendlyFetchError(error: unknown, isRtl: boolean) {
  const rawMessage = error instanceof Error ? error.message : '';
  if (rawMessage === 'Failed to fetch' || error instanceof TypeError) {
    return isRtl
      ? `تعذر الاتصال بالـ Backend. تأكد من إعادة نشر Backend وFrontend وأن رابط API المستخدم هو: ${API_BASE_URL}`
      : `Could not reach the backend. Redeploy Backend and Frontend and verify API URL: ${API_BASE_URL}`;
  }
  return rawMessage || (isRtl ? 'تعذر استيراد الملف' : 'Import failed');
}

function summaryCard(label: string, value: number | string, color: string) {
  return (
    <Card sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
      <CardContent>
        <Typography color="text.secondary" variant="body2">{label}</Typography>
        <Typography variant="h4" fontWeight={900} sx={{ color }}>{value}</Typography>
      </CardContent>
    </Card>
  );
}

type DataImportPageProps = {
  employeeMode?: boolean;
};

export function DataImportPage({ employeeMode = false }: DataImportPageProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';
  const [file, setFile] = useState<File | null>(null);
  const [sheetName, setSheetName] = useState('');
  const [commitMode, setCommitMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [reviews, setReviews] = useState<ImportReview[]>([]);
  const [healthCenters, setHealthCenters] = useState<HealthCenterOption[]>([]);
  const [activeReview, setActiveReview] = useState<ImportReview | null>(null);
  const [reviewForm, setReviewForm] = useState<ReviewForm>(EMPTY_REVIEW_FORM);
  const [reviewLoading, setReviewLoading] = useState(false);

  const loadReviews = async () => {
    if (!employeeMode) return;
    const token = getAccessToken();
    if (!token) return;
    try {
      const [reviewsResponse, centersResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/employee-import-reviews/?status=pending,conflict`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/health-centers/`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (!reviewsResponse.ok || !centersResponse.ok) return;
      const reviewBody = await reviewsResponse.json();
      const centerBody = await centersResponse.json();
      setReviews(Array.isArray(reviewBody) ? reviewBody : (reviewBody.results || []));
      setHealthCenters(Array.isArray(centerBody) ? centerBody : (centerBody.results || []));
    } catch {
      // The main import flow remains usable if review cards cannot be refreshed.
    }
  };

  useEffect(() => {
    void loadReviews();
  }, [employeeMode]);

  const payloadText = (payload: Record<string, unknown>, key: string) => {
    const value = payload[key];
    return value === null || value === undefined ? '' : String(value);
  };

  const openReview = (review: ImportReview) => {
    const payload = review.employee_payload || {};
    const allowedGender = ['male', 'female'].includes(payloadText(payload, 'gender')) ? payloadText(payload, 'gender') : 'male';
    const allowedMarital = ['single', 'married', 'divorced', 'widowed'].includes(payloadText(payload, 'marital_status')) ? payloadText(payload, 'marital_status') : '';
    setReviewForm({
      name: payloadText(payload, 'name'),
      email: payloadText(payload, 'email'),
      national_id: payloadText(payload, 'national_id'),
      employee_number: payloadText(payload, 'employee_number'),
      national_address: payloadText(payload, 'national_address'),
      mobile: payloadText(payload, 'mobile'),
      date_of_birth: /^\d{4}-\d{2}-\d{2}$/.test(payloadText(payload, 'date_of_birth')) ? payloadText(payload, 'date_of_birth') : '',
      birth_place: payloadText(payload, 'birth_place'),
      gender: allowedGender,
      marital_status: allowedMarital,
      health_center: payloadText(payload, 'health_center'),
      job_title: payloadText(payload, 'job_title'),
      appointment_date: /^\d{4}-\d{2}-\d{2}$/.test(payloadText(payload, 'appointment_date')) ? payloadText(payload, 'appointment_date') : '',
      periodic_exam_status: ['completed', 'incomplete', 'overdue'].includes(payloadText(payload, 'periodic_exam_status')) ? payloadText(payload, 'periodic_exam_status') : 'incomplete',
      vaccination_status: ['completed', 'due', 'refused'].includes(payloadText(payload, 'vaccination_status')) ? payloadText(payload, 'vaccination_status') : 'due',
      risk_level: ['low', 'medium', 'high'].includes(payloadText(payload, 'risk_level')) ? payloadText(payload, 'risk_level') : 'low',
    });
    setActiveReview(review);
  };

  const updateReviewField = (field: keyof ReviewForm, value: string) => {
    setReviewForm(current => ({ ...current, [field]: value }));
  };

  const activateReview = async () => {
    if (!activeReview) return;
    const token = getAccessToken();
    if (!token) return;
    setReviewLoading(true);
    const loadingToast = toast.loading(isRtl ? 'جاري التحقق وتفعيل الموظف...' : 'Validating and activating employee...');
    try {
      const response = await fetch(`${API_BASE_URL}/employee-import-reviews/${activeReview.id}/activate/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...reviewForm, health_center: Number(reviewForm.health_center) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = body.detail || Object.entries(body).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join('، ') : value}`).join(' | ');
        throw new Error(detail || 'Activation failed');
      }
      toast.success(isRtl ? 'تم تصحيح الموظف وتفعيل بطاقته' : 'Employee corrected and activated', { id: loadingToast });
      setActiveReview(null);
      await loadReviews();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (isRtl ? 'تعذر تفعيل الموظف' : 'Activation failed'), { id: loadingToast, duration: 9000 });
    } finally {
      setReviewLoading(false);
    }
  };

  const discardReview = async (review: ImportReview) => {
    if (!window.confirm(isRtl ? 'هل تريد تجاهل هذا السجل المعلق؟' : 'Discard this pending record?')) return;
    const token = getAccessToken();
    if (!token) return;
    const response = await fetch(`${API_BASE_URL}/employee-import-reviews/${review.id}/discard/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      toast.success(isRtl ? 'تم تجاهل السجل' : 'Record discarded');
      await loadReviews();
    } else {
      toast.error(isRtl ? 'تعذر تجاهل السجل' : 'Could not discard record');
    }
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] || null;
    setFile(selected);
    setResult(null);
  };

  const upload = async (commitOverride?: boolean) => {
    if (!file) {
      toast.error(isRtl ? 'اختر ملف Excel أولًا' : 'Select an Excel file first');
      return;
    }
    const token = getAccessToken();
    if (!token) {
      toast.error(isRtl ? 'انتهت الجلسة. سجّل الدخول مرة أخرى.' : 'Session expired. Login again.');
      return;
    }

    const shouldCommit = commitOverride ?? commitMode;
    setLoading(true);
    const loadingToast = toast.loading(shouldCommit ? (isRtl ? 'جاري الاستيراد إلى قاعدة البيانات...' : 'Importing into database...') : (isRtl ? 'جاري فحص الملف...' : 'Validating file...'));
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('commit', shouldCommit ? 'true' : 'false');
      if (employeeMode) form.append('sheetName', 'Employees');
      else if (sheetName.trim()) form.append('sheetName', sheetName.trim());

      const response = await fetch(`${API_BASE_URL}/excel-import/upload/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || body.file || body.password || 'Import failed');
      setResult(body as ImportResult);
      if (employeeMode && shouldCommit) await loadReviews();
      toast.success(shouldCommit ? (isRtl ? 'تم الحفظ في PostgreSQL بنجاح' : 'Committed to PostgreSQL') : (isRtl ? 'تم فحص الملف بنجاح' : 'File validated successfully'), { id: loadingToast });
    } catch (error) {
      toast.error(friendlyFetchError(error, isRtl), { id: loadingToast, duration: 9000 });
    } finally {
      setLoading(false);
    }
  };

  const importedTotal = result ? getImportedTotal(result.summary) : 0;

  return (
    <Box sx={{ direction: isRtl ? 'rtl' : 'ltr' }}>
      <Paper sx={{ p: 3, mb: 3, borderRadius: 4, background: 'linear-gradient(135deg, #f8fbff 0%, #eef4ff 55%, #fff 100%)', border: '1px solid rgba(102,126,234,.18)' }}>
        <Stack direction={{ xs: 'column', md: isRtl ? 'row-reverse' : 'row' }} justifyContent="space-between" spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
          <Box sx={{ textAlign: isRtl ? 'right' : 'left' }}>
            <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <SecurityIcon color="primary" />
              <Typography variant="overline" color="primary" fontWeight={900}>{isRtl ? 'استيراد آمن للبيانات الصحية' : 'Secure Health Data Import'}</Typography>
            </Stack>
            <Typography variant="h4" fontWeight={950}>
              {employeeMode
                ? (isRtl ? 'استيراد بيانات موظفي الجهة' : 'Import Organization Employees')
                : (isRtl ? 'استيراد Excel إلى قاعدة البيانات' : 'Excel Import to Database')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, maxWidth: 950, lineHeight: 1.9 }}>
              {employeeMode
                ? (isRtl ? 'نزّل القالب الرسمي وأرسله للجهة لتعبئة موظفيها، ثم ارفعه هنا بصلاحية مسؤول المنصة. تتم المعاينة أولًا ولا يُحفظ أي صف قبل الاعتماد.' : 'Send the official template to the organization, then upload the completed roster here as a platform administrator. Preview is mandatory before commit.')
                : (isRtl ? 'ارفع ملف Excel داخل المنصة فقط. يتم فحص الأعمدة، إخفاء أرقام الهوية في المعاينة، التحقق من التكرار، ثم الحفظ في PostgreSQL عند التفعيل.' : 'Upload Excel inside the platform only. Columns are validated, IDs are masked in preview, duplicates are checked, and records are committed to PostgreSQL only when enabled.')}
            </Typography>
          </Box>
          <Stack spacing={1} alignItems={isRtl ? 'flex-start' : 'flex-end'}>
            <Chip color="warning" icon={<WarningIcon />} label={isRtl ? 'لا ترفع ملفات البيانات إلى GitHub' : 'Do not upload data files to GitHub'} sx={{ fontWeight: 800 }} />
            <Typography variant="caption" color="text.secondary" sx={{ direction: 'ltr' }}>{API_BASE_URL}</Typography>
          </Stack>
        </Stack>
      </Paper>

      <Alert severity="warning" sx={{ mb: 3 }}>
        {isRtl ? 'هذه الشاشة مخصصة للملفات التي تحتوي على بيانات حساسة مثل الهوية والجوال والتشخيصات. الملف الخام لا يُحفظ في GitHub، ويُستخدم فقط أثناء عملية الفحص أو الاستيراد.' : 'This page is for sensitive files such as IDs, phone numbers, and diagnoses. Raw files are not stored in GitHub and are used only during validation/import.'}
      </Alert>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 5 }}>
          <Card sx={{ borderRadius: 4 }}>
            <CardContent>
              <Stack spacing={2.5}>
                {employeeMode && (
                  <Button
                    component="a"
                    href="/templates/employee-import-template.xlsx"
                    download
                    variant="outlined"
                    size="large"
                    startIcon={<DownloadIcon />}
                    sx={{ borderRadius: 3, py: 1.4 }}
                  >
                    {isRtl ? 'تنزيل قالب بيانات الموظفين' : 'Download Employee Template'}
                  </Button>
                )}
                <Button component="label" variant="contained" size="large" startIcon={<CloudUploadIcon />} sx={{ borderRadius: 3, py: 1.6 }}>
                  {file ? file.name : (isRtl ? 'اختيار ملف Excel' : 'Select Excel File')}
                  <input hidden type="file" accept={employeeMode ? '.xlsx' : '.xlsx,.xlsm,.xltx,.xltm'} onChange={onFileChange} />
                </Button>

                {!employeeMode && (
                  <TextField
                    label={isRtl ? 'اسم الشيت اختياري' : 'Sheet name optional'}
                    value={sheetName}
                    onChange={(event) => setSheetName(event.target.value)}
                    placeholder="Database أو ALL"
                    fullWidth
                  />
                )}

                {!employeeMode && <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                  <Stack direction={isRtl ? 'row-reverse' : 'row'} alignItems="center" justifyContent="space-between">
                    <Box sx={{ textAlign: isRtl ? 'right' : 'left' }}>
                      <Typography fontWeight={900}>{isRtl ? 'حفظ فعلي في PostgreSQL' : 'Commit to PostgreSQL'}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {isRtl ? 'اتركه مغلقًا للمعاينة فقط، وفعّله بعد مراجعة النتائج.' : 'Keep off for preview. Enable only after reviewing validation results.'}
                      </Typography>
                    </Box>
                    <Switch checked={commitMode} onChange={(event) => setCommitMode(event.target.checked)} color="success" />
                  </Stack>
                </Paper>}

                <Button onClick={() => void upload(employeeMode ? false : commitMode)} disabled={loading || !file} variant="contained" color={commitMode ? 'success' : 'primary'} size="large" startIcon={!employeeMode && commitMode ? <StorageIcon /> : <PreviewIcon />} sx={{ borderRadius: 3, py: 1.4 }}>
                  {employeeMode
                    ? (isRtl ? 'فحص الملف ومعاينة الموظفين' : 'Validate & Preview Employees')
                    : (commitMode ? (isRtl ? 'فحص وحفظ في قاعدة البيانات' : 'Validate & Commit') : (isRtl ? 'فحص ومعاينة فقط' : 'Validate Preview Only'))}
                </Button>

                {employeeMode && result?.mode === 'preview' && (
                  <Button
                    onClick={() => void upload(true)}
                    disabled={loading || !file || (result.summary.total_rows || 0) === 0}
                    variant="contained"
                    color="success"
                    size="large"
                    startIcon={<StorageIcon />}
                    sx={{ borderRadius: 3, py: 1.4 }}
                  >
                    {isRtl ? `اعتماد السليم وتعليق ${((result.summary.errors_count || 0) + (result.summary.duplicate_rows || 0))} للمراجعة` : `Commit valid rows & stage ${((result.summary.errors_count || 0) + (result.summary.duplicate_rows || 0))} for review`}
                  </Button>
                )}

                {loading && <LinearProgress />}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 7 }}>
          <Card sx={{ borderRadius: 4 }}>
            <CardContent>
              <Typography variant="h6" fontWeight={900} gutterBottom>{isRtl ? 'قواعد الاستيراد' : 'Import Rules'}</Typography>
              <Stack spacing={1.2}>
                {employeeMode ? (
                  <>
                    <Typography variant="body2">{isRtl ? '1. لا تغيّر اسم الشيت Employees ولا أسماء الأعمدة في القالب.' : '1. Do not rename the Employees sheet or template columns.'}</Typography>
                    <Typography variant="body2">{isRtl ? '2. الهوية الوطنية والبريد الإلكتروني والرقم الوظيفي يجب أن تكون فريدة.' : '2. National ID, email, and employee number must be unique.'}</Typography>
                    <Typography variant="body2">{isRtl ? '3. اسم المركز الصحي يجب أن يطابق مركزًا نشطًا موجودًا في المنصة.' : '3. Health center must exactly match an active center in the platform.'}</Typography>
                    <Typography variant="body2">{isRtl ? '4. الصفوف السليمة تُفعّل، والصفوف التي فيها خطأ أو تعارض تُحفظ كبطاقات معلقة للمراجعة دون تعطيل الملف كاملًا.' : '4. Valid rows are activated; invalid or conflicting rows become pending review cards without blocking the full file.'}</Typography>
                    <Typography variant="body2">{isRtl ? '5. ملف الجهة الخام لا يُحفظ في GitHub أو قاعدة البيانات.' : '5. The organization roster file is not stored in GitHub or the database.'}</Typography>
                  </>
                ) : (
                  <>
                    <Typography variant="body2">{isRtl ? '1. اكتب Database لاستيراد الملف الصحي الرئيسي أو ALL لفحص جميع الشيتات المدعومة.' : '1. Use Database for the main health file or ALL to validate all supported sheets.'}</Typography>
                    <Typography variant="body2">{isRtl ? '2. رقم الهوية يتم التحقق منه لمنع التكرار داخل الملف وقاعدة البيانات.' : '2. National ID is checked for duplicates inside the file and database.'}</Typography>
                    <Typography variant="body2">{isRtl ? '3. يتم إخفاء الهوية والجوال في المعاينة.' : '3. IDs and phone numbers are masked in preview.'}</Typography>
                    <Typography variant="body2">{isRtl ? '4. الشيتات المدعومة تحفظ في جداولها مثل التحاليل، التطعيمات، الوخز بالإبر، الهيئة الطبية والحملات.' : '4. Supported sheets are routed to their own tables: labs, vaccines, exposures, committee cases, and campaigns.'}</Typography>
                    <Typography variant="body2">{isRtl ? '5. لا يتم تخزين ملف Excel الخام داخل المستودع أو قاعدة البيانات.' : '5. Raw Excel files are not stored in the repository or database.'}</Typography>
                  </>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {result && (
        <Box sx={{ mt: 3 }}>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>{summaryCard(isRtl ? 'إجمالي الصفوف' : 'Total rows', result.summary.total_rows || 0, '#1e40af')}</Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>{summaryCard(isRtl ? 'صفوف صالحة' : 'Valid rows', result.summary.valid_rows || 0, '#16a34a')}</Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>{summaryCard(isRtl ? 'مكررة' : 'Duplicates', result.summary.duplicate_rows || 0, '#f59e0b')}</Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>{summaryCard(isRtl ? 'أخطاء' : 'Errors', result.summary.errors_count || 0, '#dc2626')}</Grid>
          </Grid>

          <Alert icon={<CheckCircleIcon />} severity={result.mode === 'commit' ? 'success' : 'info'} sx={{ mb: 2 }}>
            {result.mode === 'commit'
              ? (isRtl
                ? `تم تفعيل ${importedTotal} سجل سليم، وتعليق ${result.summary.staged_for_review || 0} سجل للمراجعة دون فقد بياناته.`
                : `Activated ${importedTotal} valid records and staged ${result.summary.staged_for_review || 0} records for review without data loss.`)
              : (isRtl ? 'هذه نتيجة معاينة فقط، لم يتم الحفظ في قاعدة البيانات.' : 'Preview only. Nothing was saved to the database.')}
          </Alert>

          <Paper sx={{ p: 2.5, borderRadius: 3, mb: 2 }}>
            <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={1} flexWrap="wrap">
              <Chip label={`${isRtl ? 'الشيت' : 'Sheet'}: ${result.sheet_name}`} />
              <Chip label={`${isRtl ? 'الدفعة' : 'Batch'}: ${result.batch_id || '-'}`} />
              <Chip label={`${isRtl ? 'الوضع' : 'Mode'}: ${result.mode}`} color={result.mode === 'commit' ? 'success' : 'primary'} />
              {!!result.importable_sheets?.length && <Chip label={`${isRtl ? 'الشيتات المدعومة' : 'Importable'}: ${result.importable_sheets.length}`} />}
            </Stack>
          </Paper>

          {!!result.sheet_results?.length && (
            <TableContainer component={Paper} sx={{ borderRadius: 3, mb: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{isRtl ? 'الشيت' : 'Sheet'}</TableCell>
                    <TableCell>{isRtl ? 'المعالج' : 'Processor'}</TableCell>
                    <TableCell>{isRtl ? 'الصفوف' : 'Rows'}</TableCell>
                    <TableCell>{isRtl ? 'صالحة' : 'Valid'}</TableCell>
                    <TableCell>{isRtl ? 'أخطاء' : 'Errors'}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {result.sheet_results.map((item) => (
                    <TableRow key={item.sheet_name}>
                      <TableCell>{item.sheet_name}</TableCell>
                      <TableCell>{item.processor || '-'}</TableCell>
                      <TableCell>{item.summary.total_rows || 0}</TableCell>
                      <TableCell>{item.summary.valid_rows || 0}</TableCell>
                      <TableCell>{item.summary.errors_count || 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <TableContainer component={Paper} sx={{ borderRadius: 3, mb: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{isRtl ? 'الصف' : 'Row'}</TableCell>
                  <TableCell>{isRtl ? 'الاسم' : 'Name'}</TableCell>
                  <TableCell>{isRtl ? 'الهوية masked' : 'Masked ID'}</TableCell>
                  <TableCell>{isRtl ? 'المركز' : 'Center'}</TableCell>
                  <TableCell>{isRtl ? 'المسمى' : 'Job Title'}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.preview_rows.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell>{row.row || '-'}</TableCell>
                    <TableCell>{row.name || '-'}</TableCell>
                    <TableCell>{row.national_id || '-'}</TableCell>
                    <TableCell>{row.health_center || '-'}</TableCell>
                    <TableCell>{row.job_title || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {(result.duplicates.length > 0 || result.errors.length > 0) && (
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Alert severity="warning" sx={{ mb: 1 }}>{isRtl ? 'التكرارات' : 'Duplicates'}</Alert>
                <Paper sx={{ p: 2, borderRadius: 3, maxHeight: 260, overflow: 'auto' }}>
                  {result.duplicates.length ? result.duplicates.map((item, index) => <Typography key={index} variant="body2">#{item.row} - {item.name || '-'} - {item.national_id || '-'} - {item.reason}</Typography>) : <Typography variant="body2">-</Typography>}
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Alert severity="error" sx={{ mb: 1 }}>{isRtl ? 'الأخطاء' : 'Errors'}</Alert>
                <Paper sx={{ p: 2, borderRadius: 3, maxHeight: 260, overflow: 'auto' }}>
                  {result.errors.length ? result.errors.map((item, index) => <Typography key={index} variant="body2">#{item.row} - {item.reason}</Typography>) : <Typography variant="body2">-</Typography>}
                </Paper>
              </Grid>
            </Grid>
          )}

          <Divider sx={{ my: 3 }} />
          <Alert severity="info">{result.privacy_note}</Alert>
        </Box>
      )}

      {employeeMode && (
        <Box sx={{ mt: 4 }}>
          <Stack direction={isRtl ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Box sx={{ textAlign: isRtl ? 'right' : 'left' }}>
              <Typography variant="h5" fontWeight={950}>{isRtl ? 'بطاقات الموظفين المعلقة' : 'Pending Employee Cards'}</Typography>
              <Typography variant="body2" color="text.secondary">
                {isRtl ? 'لا تظهر في سجلات الموظفين الفعالة حتى تتم معالجة جميع الملاحظات.' : 'These records stay inactive until all issues are corrected.'}
              </Typography>
            </Box>
            <Chip color={reviews.length ? 'warning' : 'success'} label={`${isRtl ? 'المعلقة' : 'Pending'}: ${reviews.length}`} />
          </Stack>

          {!reviews.length ? (
            <Alert severity="success">{isRtl ? 'لا توجد حاليًا بطاقات موظفين معلقة للمراجعة.' : 'There are no pending employee review cards.'}</Alert>
          ) : (
            <Grid container spacing={2}>
              {reviews.map(review => {
                const payload = review.employee_payload || {};
                return (
                  <Grid key={review.id} size={{ xs: 12, md: 6, xl: 4 }}>
                    <Card sx={{ height: '100%', borderRadius: 4, border: '1px solid', borderColor: review.status === 'conflict' ? 'error.light' : 'warning.light' }}>
                      <CardContent>
                        <Stack spacing={1.5}>
                          <Stack direction={isRtl ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center">
                            <Typography variant="h6" fontWeight={950}>{payloadText(payload, 'name') || (isRtl ? 'اسم غير مكتمل' : 'Incomplete name')}</Typography>
                            <Chip
                              size="small"
                              color={review.status === 'conflict' ? 'error' : 'warning'}
                              label={review.status === 'conflict' ? (isRtl ? 'تعارض' : 'Conflict') : (isRtl ? 'معلق' : 'Pending')}
                            />
                          </Stack>
                          <Typography variant="body2" color="text.secondary">
                            {isRtl ? 'صف Excel' : 'Excel row'}: {review.source_row} — {review.source_file}
                          </Typography>
                          <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={1} flexWrap="wrap">
                            <Chip size="small" variant="outlined" label={`${isRtl ? 'الرقم الوظيفي' : 'Employee no.'}: ${payloadText(payload, 'employee_number') || '-'}`} />
                            <Chip size="small" variant="outlined" label={`${isRtl ? 'المركز' : 'Center'}: ${payloadText(payload, 'health_center_name') || '-'}`} />
                          </Stack>
                          {review.conflict_employee_summary && (
                            <Alert severity="error">
                              {isRtl ? 'يتعارض مع الموظف الموجود' : 'Conflicts with existing employee'}: {review.conflict_employee_summary.name} ({review.conflict_employee_summary.employee_number || review.conflict_employee_summary.national_id_masked})
                            </Alert>
                          )}
                          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: 'warning.50' }}>
                            <Typography fontWeight={900} variant="body2" sx={{ mb: 0.5 }}>{isRtl ? 'الملاحظات المطلوب معالجتها' : 'Issues to resolve'}</Typography>
                            {review.issues.map((issue, index) => <Typography key={index} variant="caption" display="block">• {issue}</Typography>)}
                          </Paper>
                          <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={1}>
                            <Button fullWidth variant="contained" startIcon={<EditIcon />} onClick={() => openReview(review)}>
                              {isRtl ? 'معالجة وتفعيل' : 'Correct & Activate'}
                            </Button>
                            <Button variant="outlined" color="inherit" startIcon={<CancelIcon />} onClick={() => void discardReview(review)}>
                              {isRtl ? 'تجاهل' : 'Discard'}
                            </Button>
                          </Stack>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          )}
        </Box>
      )}

      <Dialog open={Boolean(activeReview)} onClose={() => !reviewLoading && setActiveReview(null)} fullWidth maxWidth="md" dir={isRtl ? 'rtl' : 'ltr'}>
        <DialogTitle fontWeight={950}>{isRtl ? 'معالجة ملاحظات الموظف وتفعيل البطاقة' : 'Correct Employee & Activate Card'}</DialogTitle>
        <DialogContent dividers>
          {activeReview && (
            <Alert severity={activeReview.status === 'conflict' ? 'error' : 'warning'} sx={{ mb: 2 }}>
              {activeReview.issues.join(' — ')}
            </Alert>
          )}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}><TextField required fullWidth label={isRtl ? 'اسم الموظف' : 'Employee name'} value={reviewForm.name} onChange={e => updateReviewField('name', e.target.value)} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField required fullWidth label={isRtl ? 'البريد الإلكتروني' : 'Email'} value={reviewForm.email} onChange={e => updateReviewField('email', e.target.value)} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField required fullWidth label={isRtl ? 'رقم الهوية الوطنية' : 'National ID'} value={reviewForm.national_id} onChange={e => updateReviewField('national_id', e.target.value)} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField required fullWidth label={isRtl ? 'الرقم الوظيفي' : 'Employee number'} value={reviewForm.employee_number} onChange={e => updateReviewField('employee_number', e.target.value)} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField required fullWidth label={isRtl ? 'رقم الجوال' : 'Mobile'} value={reviewForm.mobile} onChange={e => updateReviewField('mobile', e.target.value)} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField required fullWidth label={isRtl ? 'العنوان الوطني' : 'National address'} value={reviewForm.national_address} onChange={e => updateReviewField('national_address', e.target.value)} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><CalendarDateField required label={isRtl ? 'تاريخ الميلاد' : 'Date of birth'} value={reviewForm.date_of_birth} onChange={value => updateReviewField('date_of_birth', value)} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField required fullWidth label={isRtl ? 'مكان الميلاد' : 'Birth place'} value={reviewForm.birth_place} onChange={e => updateReviewField('birth_place', e.target.value)} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField select required fullWidth label={isRtl ? 'الجنس' : 'Gender'} value={reviewForm.gender} onChange={e => updateReviewField('gender', e.target.value)}><MenuItem value="male">{isRtl ? 'ذكر' : 'Male'}</MenuItem><MenuItem value="female">{isRtl ? 'أنثى' : 'Female'}</MenuItem></TextField></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField select required fullWidth label={isRtl ? 'الحالة الاجتماعية' : 'Marital status'} value={reviewForm.marital_status} onChange={e => updateReviewField('marital_status', e.target.value)}><MenuItem value="single">{isRtl ? 'أعزب' : 'Single'}</MenuItem><MenuItem value="married">{isRtl ? 'متزوج' : 'Married'}</MenuItem><MenuItem value="divorced">{isRtl ? 'مطلق' : 'Divorced'}</MenuItem><MenuItem value="widowed">{isRtl ? 'أرمل' : 'Widowed'}</MenuItem></TextField></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField select required fullWidth label={isRtl ? 'المركز الصحي' : 'Health center'} value={reviewForm.health_center} onChange={e => updateReviewField('health_center', e.target.value)}>{healthCenters.map(center => <MenuItem key={center.id} value={String(center.id)}>{center.name}</MenuItem>)}</TextField></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField required fullWidth label={isRtl ? 'المسمى الوظيفي' : 'Job title'} value={reviewForm.job_title} onChange={e => updateReviewField('job_title', e.target.value)} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><CalendarDateField required label={isRtl ? 'تاريخ التعيين' : 'Appointment date'} value={reviewForm.appointment_date} onChange={value => updateReviewField('appointment_date', value)} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField select fullWidth label={isRtl ? 'حالة الفحص الدوري' : 'Exam status'} value={reviewForm.periodic_exam_status} onChange={e => updateReviewField('periodic_exam_status', e.target.value)}><MenuItem value="completed">{isRtl ? 'مكتمل' : 'Completed'}</MenuItem><MenuItem value="incomplete">{isRtl ? 'غير مكتمل' : 'Incomplete'}</MenuItem><MenuItem value="overdue">{isRtl ? 'متأخر' : 'Overdue'}</MenuItem></TextField></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField select fullWidth label={isRtl ? 'حالة التطعيم' : 'Vaccination status'} value={reviewForm.vaccination_status} onChange={e => updateReviewField('vaccination_status', e.target.value)}><MenuItem value="completed">{isRtl ? 'مكتمل' : 'Completed'}</MenuItem><MenuItem value="due">{isRtl ? 'مستحق' : 'Due'}</MenuItem><MenuItem value="refused">{isRtl ? 'مرفوض' : 'Refused'}</MenuItem></TextField></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField select fullWidth label={isRtl ? 'مستوى الخطورة' : 'Risk level'} value={reviewForm.risk_level} onChange={e => updateReviewField('risk_level', e.target.value)}><MenuItem value="low">{isRtl ? 'منخفض' : 'Low'}</MenuItem><MenuItem value="medium">{isRtl ? 'متوسط' : 'Medium'}</MenuItem><MenuItem value="high">{isRtl ? 'مرتفع' : 'High'}</MenuItem></TextField></Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActiveReview(null)} disabled={reviewLoading}>{isRtl ? 'إلغاء' : 'Cancel'}</Button>
          <Button variant="contained" color="success" onClick={() => void activateReview()} disabled={reviewLoading} startIcon={<CheckCircleIcon />}>
            {reviewLoading ? (isRtl ? 'جاري التحقق...' : 'Validating...') : (isRtl ? 'حفظ التصحيح وتفعيل البطاقة' : 'Save & Activate Card')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
