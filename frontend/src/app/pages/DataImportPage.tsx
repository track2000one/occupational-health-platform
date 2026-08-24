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
  mapped_fields?: Record<string, number | string | null>;
  mapping_options?: { index: number; header: string; samples: string[] }[];
  mapping_candidates?: Record<string, number[]>;
  ignored_columns?: { index: number; header: string }[];
  missing_required_fields?: string[];
  header_row?: number;
  employee_import_mode?: 'template' | 'flexible';
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

const IMPORT_FIELD_LABELS_AR: Record<string, string> = {
  name: 'اسم الموظف',
  email: 'البريد الإلكتروني',
  national_id: 'رقم الهوية الوطنية',
  employee_number: 'الرقم الوظيفي',
  national_address: 'العنوان الوطني',
  mobile: 'رقم الجوال',
  date_of_birth: 'تاريخ الميلاد',
  birth_place: 'مكان الميلاد',
  gender: 'الجنس',
  marital_status: 'الحالة الاجتماعية',
  health_center: 'المركز الصحي',
  job_title: 'المسمى الوظيفي',
  appointment_date: 'تاريخ التعيين',
  periodic_exam_status: 'حالة الفحص الدوري',
  vaccination_status: 'حالة التطعيم',
  risk_level: 'مستوى الخطورة',
};

const IMPORT_FIELD_LABELS_EN: Record<string, string> = {
  name: 'Employee name',
  email: 'Email',
  national_id: 'National ID',
  employee_number: 'Employee number',
  national_address: 'National address',
  mobile: 'Mobile',
  date_of_birth: 'Date of birth',
  birth_place: 'Birth place',
  gender: 'Gender',
  marital_status: 'Marital status',
  health_center: 'Health center',
  job_title: 'Job title',
  appointment_date: 'Appointment date',
  periodic_exam_status: 'Periodic exam status',
  vaccination_status: 'Vaccination status',
  risk_level: 'Risk level',
};

const EMPLOYEE_IMPORT_FIELDS = Object.keys(IMPORT_FIELD_LABELS_AR);
const EMPLOYEE_REQUIRED_FIELDS = new Set([
  'name', 'email', 'national_id', 'employee_number', 'national_address', 'mobile',
  'date_of_birth', 'birth_place', 'gender', 'marital_status', 'health_center',
  'job_title', 'appointment_date',
]);

const IMPORT_ISSUE_LABELS_AR: Record<string, string> = {
  'Invalid email address': 'صيغة البريد الإلكتروني غير صحيحة',
  'National ID must contain exactly 10 digits': 'يجب أن يتكون رقم الهوية الوطنية من 10 أرقام بالضبط',
  'Mobile number must contain 9 to 15 digits': 'يجب أن يتكون رقم الجوال من 9 إلى 15 رقمًا',
  'Invalid date of birth': 'تاريخ الميلاد غير صحيح',
  'Invalid appointment date': 'تاريخ التعيين غير صحيح',
  'Use a real Excel date or YYYY-MM-DD': 'استخدم تاريخ Excel حقيقيًا أو الصيغة YYYY-MM-DD',
  'Date of birth cannot be in the future': 'لا يمكن أن يكون تاريخ الميلاد في المستقبل',
  'Appointment date cannot be in the future': 'لا يمكن أن يكون تاريخ التعيين في المستقبل',
  'Appointment date must be after date of birth': 'يجب أن يكون تاريخ التعيين بعد تاريخ الميلاد',
  'Invalid gender': 'قيمة الجنس غير صحيحة؛ استخدم ذكر أو أنثى',
  'Use male/female or ذكر/أنثى': 'استخدم ذكر أو أنثى',
  'Invalid marital status': 'الحالة الاجتماعية غير صحيحة',
  'Health center does not match an active center in the platform': 'اسم المركز الصحي لا يطابق مركزًا فعّالًا في المنصة',
  'National ID is duplicated inside the file': 'رقم الهوية الوطنية مكرر داخل الملف',
  'Email is duplicated inside the file': 'البريد الإلكتروني مكرر داخل الملف',
  'Employee number is duplicated inside the file': 'الرقم الوظيفي مكرر داخل الملف',
  'National ID already exists in PostgreSQL': 'رقم الهوية الوطنية موجود مسبقًا في قاعدة البيانات',
  'Email already exists in PostgreSQL': 'البريد الإلكتروني موجود مسبقًا في قاعدة البيانات',
  'Employee number already exists in PostgreSQL': 'الرقم الوظيفي موجود مسبقًا في قاعدة البيانات',
  'The row requires review before activation': 'يجب مراجعة الصف قبل تفعيل بطاقة الموظف',
  'Missing employee name or national ID': 'اسم الموظف أو رقم الهوية الوطنية مفقود',
  'Missing employee name': 'اسم الموظف مفقود',
  'Missing health center': 'المركز الصحي مفقود',
  'Missing trainee name': 'اسم المتدرب مفقود',
  'Duplicate national ID inside the uploaded sheet': 'رقم الهوية الوطنية مكرر داخل ورقة Excel المرفوعة',
  'National ID already exists in PostgreSQL; record will be updated in commit mode': 'رقم الهوية الوطنية موجود مسبقًا؛ سيُحدّث السجل عند الاعتماد',
};

function localizeImportIssue(issue: string, isRtl: boolean) {
  const normalized = issue.trim().replace(/\.$/, '');
  if (!isRtl) return normalized;

  const missingField = normalized.match(/^Missing required field:\s*([a-z_]+)$/i);
  if (missingField) {
    const field = IMPORT_FIELD_LABELS_AR[missingField[1]] || missingField[1];
    return `${field} مطلوب ولا يمكن تركه فارغًا`;
  }

  const invalidField = normalized.match(/^Invalid value for\s+([a-z_]+)$/i);
  if (invalidField) {
    const field = IMPORT_FIELD_LABELS_AR[invalidField[1]] || invalidField[1];
    return `قيمة ${field} غير صحيحة`;
  }

  return IMPORT_ISSUE_LABELS_AR[normalized] || normalized;
}

function localizeImportReason(reason: string, isRtl: boolean) {
  const parts = reason.match(/[^.]+(?:\.|$)/g) || [reason];
  return parts
    .map(part => localizeImportIssue(part, isRtl))
    .filter(Boolean)
    .filter((part, index, values) => values.indexOf(part) === index);
}

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
  const [employeeImportMode, setEmployeeImportMode] = useState<'template' | 'flexible'>('template');
  const [employeeSheetName, setEmployeeSheetName] = useState('');
  const [availableEmployeeSheets, setAvailableEmployeeSheets] = useState<string[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, number | null>>({});
  const [mappingDirty, setMappingDirty] = useState(false);

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
    setEmployeeSheetName('');
    setAvailableEmployeeSheets([]);
    setFieldMapping({});
    setMappingDirty(false);
  };

  const changeEmployeeImportMode = (mode: 'template' | 'flexible') => {
    setEmployeeImportMode(mode);
    setResult(null);
    setEmployeeSheetName('');
    setAvailableEmployeeSheets([]);
    setFieldMapping({});
    setMappingDirty(false);
  };

  const changeEmployeeSheet = (value: string) => {
    setEmployeeSheetName(value);
    setResult(null);
    setFieldMapping({});
    setMappingDirty(false);
  };

  const changeFieldMapping = (field: string, value: string) => {
    setFieldMapping(current => ({ ...current, [field]: value === '' ? null : Number(value) }));
    setMappingDirty(true);
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
      if (employeeMode) {
        form.append('employeeImportMode', employeeImportMode);
        if (employeeImportMode === 'template') form.append('sheetName', 'Employees');
        else if (employeeSheetName) form.append('sheetName', employeeSheetName);
        if (employeeImportMode === 'flexible' && Object.keys(fieldMapping).length) {
          form.append('fieldMapping', JSON.stringify(fieldMapping));
        }
      }
      else if (sheetName.trim()) form.append('sheetName', sheetName.trim());

      const response = await fetch(`${API_BASE_URL}/excel-import/upload/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || body.file || body.password || 'Import failed');
      const nextResult = body as ImportResult;
      setResult(nextResult);
      if (employeeMode && nextResult.employee_import_mode === 'flexible') {
        const nextMapping = Object.fromEntries(
          EMPLOYEE_IMPORT_FIELDS.map(field => {
            const value = nextResult.mapped_fields?.[field];
            return [field, typeof value === 'number' ? value : null];
          }),
        );
        setFieldMapping(nextMapping);
        setEmployeeSheetName(nextResult.sheet_name || '');
        setAvailableEmployeeSheets(nextResult.available_sheets || []);
        setMappingDirty(false);
      }
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
                  <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 3 }}>
                    <Typography fontWeight={900} variant="body2" sx={{ mb: 1 }}>
                      {isRtl ? 'طريقة قراءة ملف الموظفين' : 'Employee file mode'}
                    </Typography>
                    <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={1}>
                      <Button fullWidth variant={employeeImportMode === 'template' ? 'contained' : 'outlined'} onClick={() => changeEmployeeImportMode('template')}>
                        {isRtl ? 'القالب الرسمي' : 'Official template'}
                      </Button>
                      <Button fullWidth variant={employeeImportMode === 'flexible' ? 'contained' : 'outlined'} onClick={() => changeEmployeeImportMode('flexible')}>
                        {isRtl ? 'ملف مرن' : 'Flexible file'}
                      </Button>
                    </Stack>
                  </Paper>
                )}
                {employeeMode && employeeImportMode === 'template' && (
                  <Button component="a" href="/templates/employee-import-template.xlsx" download variant="outlined" size="large" startIcon={<DownloadIcon />} sx={{ borderRadius: 3, py: 1.4 }}>
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

                {employeeMode && employeeImportMode === 'flexible' && availableEmployeeSheets.length > 1 && (
                  <TextField select fullWidth label={isRtl ? 'ورقة الموظفين داخل الملف' : 'Employee worksheet'} value={employeeSheetName} onChange={event => changeEmployeeSheet(event.target.value)}>
                    {availableEmployeeSheets.map(sheet => <MenuItem key={sheet} value={sheet}>{sheet}</MenuItem>)}
                  </TextField>
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
                    ? (employeeImportMode === 'flexible'
                      ? (mappingDirty ? (isRtl ? 'إعادة فحص المطابقة' : 'Revalidate mapping') : (isRtl ? 'اكتشاف الأعمدة ومعاينة الموظفين' : 'Detect Columns & Preview'))
                      : (isRtl ? 'فحص القالب ومعاينة الموظفين' : 'Validate Template & Preview'))
                    : (commitMode ? (isRtl ? 'فحص وحفظ في قاعدة البيانات' : 'Validate & Commit') : (isRtl ? 'فحص ومعاينة فقط' : 'Validate Preview Only'))}
                </Button>

                {employeeMode && result?.mode === 'preview' && (
                  <Button
                    onClick={() => void upload(true)}
                    disabled={loading || !file || mappingDirty || (result.summary.total_rows || 0) === 0}
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
                {employeeMode ? (employeeImportMode === 'flexible' ? (
                  <>
                    <Typography variant="body2">{isRtl ? '1. يمكن رفع ملف .xlsx بأي ترتيب للأعمدة وبأي اسم لورقة العمل.' : '1. Upload any .xlsx file regardless of column order or worksheet name.'}</Typography>
                    <Typography variant="body2">{isRtl ? '2. تتعرف المنصة على أسماء الأعمدة العربية والإنجليزية وتعرض المطابقة قبل الحفظ.' : '2. Arabic and English column names are detected and mapped before saving.'}</Typography>
                    <Typography variant="body2">{isRtl ? '3. الأعمدة الزائدة تُعرض على أنها متجاهلة ولا تُحفظ.' : '3. Extra columns are shown as ignored and are not stored.'}</Typography>
                    <Typography variant="body2">{isRtl ? '4. يمكنك تصحيح أي مطابقة ثم إعادة الفحص قبل الاعتماد.' : '4. Correct any mapping and revalidate before committing.'}</Typography>
                    <Typography variant="body2">{isRtl ? '5. السليم يُفعّل، والناقص أو المتعارض يُعلّق للمراجعة دون فقد الصف.' : '5. Valid rows activate; incomplete/conflicting rows are staged without data loss.'}</Typography>
                  </>
                ) : (
                  <>
                    <Typography variant="body2">{isRtl ? '1. لا تغيّر اسم الشيت Employees ولا أسماء الأعمدة في القالب.' : '1. Do not rename the Employees sheet or template columns.'}</Typography>
                    <Typography variant="body2">{isRtl ? '2. الهوية الوطنية والبريد الإلكتروني والرقم الوظيفي يجب أن تكون فريدة.' : '2. National ID, email, and employee number must be unique.'}</Typography>
                    <Typography variant="body2">{isRtl ? '3. اسم المركز الصحي يجب أن يطابق مركزًا نشطًا موجودًا في المنصة.' : '3. Health center must exactly match an active center in the platform.'}</Typography>
                    <Typography variant="body2">{isRtl ? '4. الصفوف السليمة تُفعّل، والصفوف التي فيها خطأ أو تعارض تُحفظ كبطاقات معلقة للمراجعة دون تعطيل الملف كاملًا.' : '4. Valid rows are activated; invalid or conflicting rows become pending review cards without blocking the full file.'}</Typography>
                    <Typography variant="body2">{isRtl ? '5. ملف الجهة الخام لا يُحفظ في GitHub أو قاعدة البيانات.' : '5. The organization roster file is not stored in GitHub or the database.'}</Typography>
                  </>
                )) : (
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

          {employeeMode && employeeImportMode === 'flexible' && result.mapping_options && (
            <Paper sx={{ p: 2.5, borderRadius: 3, mb: 2, border: '1px solid', borderColor: mappingDirty ? 'warning.main' : 'primary.light' }}>
              <Stack direction={{ xs: 'column', md: isRtl ? 'row-reverse' : 'row' }} justifyContent="space-between" spacing={1.5} sx={{ mb: 2 }}>
                <Box sx={{ textAlign: isRtl ? 'right' : 'left' }}>
                  <Typography variant="h6" fontWeight={950}>{isRtl ? 'مطابقة أعمدة الملف مع بيانات الموظف' : 'Map File Columns to Employee Fields'}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {isRtl
                      ? `تم اكتشاف صف العناوين في الصف رقم ${result.header_row || '-'}. راجع المطابقة، وعدّل أي حقل غير صحيح قبل الاعتماد.`
                      : `Headers were detected on row ${result.header_row || '-'}. Review the mapping before committing.`}
                  </Typography>
                </Box>
                <Chip
                  color={mappingDirty ? 'warning' : 'success'}
                  label={mappingDirty ? (isRtl ? 'المطابقة معدّلة وتحتاج إعادة فحص' : 'Mapping changed; revalidate') : (isRtl ? 'تم فحص المطابقة' : 'Mapping validated')}
                />
              </Stack>

              <Grid container spacing={1.5}>
                {EMPLOYEE_IMPORT_FIELDS.map(field => {
                  const currentIndex = fieldMapping[field];
                  const selectedOption = result.mapping_options?.find(option => option.index === currentIndex);
                  return (
                    <Grid key={field} size={{ xs: 12, sm: 6, lg: 4 }}>
                      <TextField
                        select
                        fullWidth
                        required={EMPLOYEE_REQUIRED_FIELDS.has(field)}
                        label={`${isRtl ? IMPORT_FIELD_LABELS_AR[field] : IMPORT_FIELD_LABELS_EN[field]}${EMPLOYEE_REQUIRED_FIELDS.has(field) ? ' *' : ''}`}
                        value={currentIndex ?? ''}
                        onChange={event => changeFieldMapping(field, event.target.value)}
                        helperText={selectedOption?.samples?.length ? `${isRtl ? 'عينة' : 'Sample'}: ${selectedOption.samples.join('، ')}` : (isRtl ? 'لم يُربط بعمود' : 'Not mapped')}
                      >
                        <MenuItem value="">{isRtl ? 'غير موجود في الملف' : 'Not present in file'}</MenuItem>
                        {result.mapping_options.map(option => (
                          <MenuItem key={option.index} value={option.index}>{option.header}</MenuItem>
                        ))}
                      </TextField>
                    </Grid>
                  );
                })}
              </Grid>

              {!!result.missing_required_fields?.length && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  {isRtl ? 'حقول إلزامية غير مرتبطة: ' : 'Required fields not mapped: '}
                  {result.missing_required_fields.map(field => isRtl ? IMPORT_FIELD_LABELS_AR[field] : IMPORT_FIELD_LABELS_EN[field]).join('، ')}
                  {isRtl ? '. ستصبح السجلات المتأثرة معلقة للمراجعة.' : '. Affected records will be staged for review.'}
                </Alert>
              )}

              {!!result.ignored_columns?.length && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" fontWeight={900} sx={{ mb: 1 }}>{isRtl ? 'الأعمدة التي سيتم تجاهلها' : 'Columns that will be ignored'}</Typography>
                  <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={0.75} flexWrap="wrap" useFlexGap>
                    {result.ignored_columns.map(column => <Chip key={column.index} size="small" variant="outlined" label={column.header} />)}
                  </Stack>
                </Box>
              )}

              {mappingDirty && (
                <Button onClick={() => void upload(false)} disabled={loading || !file} variant="contained" color="warning" startIcon={<PreviewIcon />} sx={{ mt: 2, borderRadius: 3 }}>
                  {isRtl ? 'إعادة فحص الملف بهذه المطابقة' : 'Revalidate File with This Mapping'}
                </Button>
              )}
            </Paper>
          )}

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
                <Stack spacing={1.25} sx={{ maxHeight: 360, overflow: 'auto', pr: isRtl ? 0 : 0.5, pl: isRtl ? 0.5 : 0 }}>
                  {result.duplicates.length ? result.duplicates.map((item, index) => (
                    <Paper key={`${item.row}-${index}`} variant="outlined" sx={{ p: 1.5, borderRadius: 3, borderColor: 'warning.light', bgcolor: 'warning.50' }}>
                      <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 0.75 }}>
                        <Chip size="small" color="warning" label={`${isRtl ? 'صف' : 'Row'} ${item.row}`} />
                        <Typography variant="body2" fontWeight={900}>{item.name || (isRtl ? 'اسم غير متوفر' : 'Name unavailable')}</Typography>
                        {item.national_id && <Chip size="small" variant="outlined" label={`${isRtl ? 'الهوية' : 'ID'}: ${item.national_id}`} />}
                      </Stack>
                      <Box component="ul" sx={{ m: 0, ps: 2.5 }}>
                        {localizeImportReason(item.reason, isRtl).map((issue, issueIndex) => (
                          <Typography component="li" key={issueIndex} variant="body2" sx={{ mb: 0.35 }}>{issue}</Typography>
                        ))}
                      </Box>
                    </Paper>
                  )) : <Typography variant="body2">-</Typography>}
                </Stack>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Alert severity="error" sx={{ mb: 1 }}>{isRtl ? 'الأخطاء' : 'Errors'}</Alert>
                <Stack spacing={1.25} sx={{ maxHeight: 360, overflow: 'auto', pr: isRtl ? 0 : 0.5, pl: isRtl ? 0.5 : 0 }}>
                  {result.errors.length ? result.errors.map((item, index) => (
                    <Paper key={`${item.row}-${index}`} variant="outlined" sx={{ p: 1.5, borderRadius: 3, borderColor: 'error.light', bgcolor: 'error.50' }}>
                      <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
                        <Chip size="small" color="error" label={`${isRtl ? 'صف' : 'Row'} ${item.row}`} />
                        <Typography variant="body2" fontWeight={900}>{isRtl ? 'ملاحظات تمنع تفعيل البطاقة' : 'Issues blocking card activation'}</Typography>
                      </Stack>
                      <Box component="ul" sx={{ m: 0, ps: 2.5 }}>
                        {localizeImportReason(item.reason, isRtl).map((issue, issueIndex) => (
                          <Typography component="li" key={issueIndex} variant="body2" sx={{ mb: 0.35 }}>{issue}</Typography>
                        ))}
                      </Box>
                    </Paper>
                  )) : <Typography variant="body2">-</Typography>}
                </Stack>
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
                            <Box component="ul" sx={{ m: 0, ps: 2.5 }}>
                              {review.issues.flatMap(issue => localizeImportReason(issue, isRtl)).map((issue, index) => (
                                <Typography component="li" key={index} variant="caption" sx={{ mb: 0.25 }}>
                                  {localizeImportIssue(issue, isRtl)}
                                </Typography>
                              ))}
                            </Box>
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
              <Box component="ul" sx={{ m: 0, ps: 2.5 }}>
                {activeReview.issues.flatMap(issue => localizeImportReason(issue, isRtl)).map((issue, index) => (
                  <Typography component="li" key={index} variant="body2">
                    {localizeImportIssue(issue, isRtl)}
                  </Typography>
                ))}
              </Box>
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
