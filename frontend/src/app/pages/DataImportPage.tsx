import { useEffect, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'sonner';
import {
  Alert,
  Autocomplete,
  Checkbox,
  FormControlLabel,
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
import { authFetch, getAccessToken } from '../context/AuthContext';
import { CalendarDateField } from '../components/CalendarDateField';
import { getNationalityOptions, normalizeNationalitySearch } from '../data/employeeFormOptions';
import { restoreReviewCenterId, restoreReviewNationality } from '../utils/employeeReviewValidation';
import { StagingCenterReconciliationDialog } from './StagingCenterReconciliationDialog';
import { EmployeeImportPreviewTable, type EmployeePreviewRow } from './EmployeeImportPreviewTable';
import { EmployeeCenterQuickFixDialog } from './EmployeeCenterQuickFixDialog';

// Prevent Staging imports from silently falling back to the Production API.
const API_BASE_URL = (import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:8000/api' : '')).replace(/\/$/, '');
// These batch actions remain server-side restricted to the isolated Staging
// project. Do not advertise buttons on Production that are intentionally 403.
const IS_STAGING_IMPORT_UI = typeof window !== 'undefined' &&
  (window.location.hostname.includes('staging') ||
   ['localhost', '127.0.0.1'].includes(window.location.hostname));

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
  blocking_reasons?: Array<{ reason: string; count: number }>;
  sheet_results?: SheetImportResult[];
  duplicates: { row: number; national_id?: string; name?: string; reason: string }[];
  errors: { row: number; reason: string }[];
  preview_rows: EmployeePreviewRow[];
  preview_rows_total?: number;
  preview_rows_truncated?: boolean;
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

type BulkBlockedReason = { reason: string; label: string; count: number };
type BulkReviewPreview = {
  mode: 'preview'; selection: 'all' | 'selected';
  selected_count: number; eligible_count: number; blocked_count: number;
  eligible_ids: number[]; blocked_reasons: BulkBlockedReason[];
  preview_token: string; batch_size: number;
};
type BulkCommitResult = {
  mode: 'committed'; processed_count: number; created_count: number;
  skipped_count: number; skipped_reasons: BulkBlockedReason[];
};

type BulkDiscardPreview = {
  mode: 'preview'; selection: 'all' | 'selected';
  selected_count: number; discardable_count: number; blocked_count: number;
  discardable_ids: number[]; preview_token: string; batch_size: number;
};
type BulkDiscardCommit = {
  mode: 'committed'; processed_count: number;
  discarded_count: number; skipped_count: number;
  skipped_reasons: { reason: string; count: number }[];
};

type HealthCenterOption = { id: number | string; name: string; name_ar?: string; code?: string; is_active?: boolean };

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
  nationality: string;
  current_job: string;
  job_title_en: string;
  children_count: string;
  periodic_exam_status: string;
  vaccination_status: string;
  risk_level: string;
};

const REVIEW_NATIONALITIES = getNationalityOptions();

const EMPTY_REVIEW_FORM: ReviewForm = {
  name: '', email: '', national_id: '', employee_number: '', national_address: '',
  mobile: '', date_of_birth: '', birth_place: '', gender: '', marital_status: '',
  health_center: '', job_title: '', appointment_date: '', nationality: '', current_job: '',
  job_title_en: '', children_count: '', periodic_exam_status: 'unknown',
  vaccination_status: 'unknown', risk_level: 'unknown',
};

const IMPORT_FIELD_LABELS_AR: Record<string, string> = {
  name: 'اسم الموظف',
  email: 'البريد الإلكتروني',
  national_id: 'رقم الهوية / الإقامة',
  employee_number: 'الرقم الوظيفي',
  national_address: 'العنوان الوطني',
  mobile: 'رقم الجوال',
  date_of_birth: 'تاريخ الميلاد',
  birth_place: 'مكان الميلاد',
  gender: 'الجنس',
  marital_status: 'الحالة الاجتماعية',
  health_center: 'المركز الصحي',
  organization_unit_code: 'رمز الوحدة التنظيمية المعتمدة',
  nationality: 'الجنسية',
  current_job: 'الوظيفة الحالية',
  job_title_en: 'المسمى الوظيفي بالإنجليزية',
  children_count: 'عدد الأطفال',
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
  organization_unit_code: 'Approved organization unit code',
  nationality: 'Nationality',
  current_job: 'Current job',
  job_title_en: 'English job title',
  children_count: 'Children count',
  job_title: 'Job title',
  appointment_date: 'Appointment date',
  periodic_exam_status: 'Periodic exam status',
  vaccination_status: 'Vaccination status',
  risk_level: 'Risk level',
};

const EMPLOYEE_IMPORT_FIELDS = Object.keys(IMPORT_FIELD_LABELS_AR);
const EMPLOYEE_REQUIRED_FIELDS = new Set(['name', 'national_id', 'health_center']);

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
  'More than one active center has this name. Select a center manually': 'اسم المركز مكرر بين عدة مراكز فعالة؛ اختر المركز الصحيح يدويًا',
  'Invalid nationality. Choose a country from the template or use a two-letter ISO code': 'الجنسية غير مطابقة لقائمة الدول المعتمدة',
  'Children count must be a whole number between 0 and 100': 'عدد الأطفال يجب أن يكون عددًا صحيحًا من 0 إلى 100',
  'Job title or current job exceeds the allowed length': 'المسمى الوظيفي أو الوظيفة الحالية أطول من الحد المسموح',
  'Organization unit reference is not approved or does not exist': 'رمز الوحدة التنظيمية غير معتمد أو غير موجود',
  'Organizational sector cannot be assigned directly to an employee': 'لا يجوز ربط الموظف بالقطاع مباشرة؛ يلزم تحديد المركز أو الوحدة',
  'Organizational unit does not have an approved center mapping': 'الوحدة التنظيمية غير مرتبطة بمركز صحي معتمد',
  'Organizational unit belongs to a different health center': 'الوحدة التنظيمية مرتبطة بمركز صحي مختلف',
  'National ID is duplicated inside the file': 'رقم الهوية الوطنية مكرر داخل الملف',
  'Email is duplicated inside the file': 'البريد الإلكتروني مكرر داخل الملف',
  'Employee number is duplicated inside the file': 'الرقم الوظيفي مكرر داخل الملف',
  'National ID already exists in PostgreSQL': 'رقم الهوية الوطنية موجود مسبقًا في قاعدة البيانات',
  'Email already exists in PostgreSQL': 'البريد الإلكتروني موجود مسبقًا في قاعدة البيانات',
  'Employee already exists with this national ID': 'الموظف موجود مسبقًا برقم الهوية نفسه، ولن يتم إنشاء سجل مكرر',
  'Same national ID has a different employee name': 'رقم الهوية موجود ولكن اسم الموظف مختلف؛ يجب التحقق قبل التحديث',
  'Same national ID has a different employee number': 'رقم الهوية موجود ولكن الرقم الوظيفي مختلف؛ يحتاج مراجعة',
  'Email belongs to a different employee': 'البريد الإلكتروني مسجل لموظف آخر؛ تعارض فعلي',
  'Employee number belongs to a different employee': 'الرقم الوظيفي مسجل لموظف آخر؛ تعارض فعلي',
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
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [reviewHasNext, setReviewHasNext] = useState(false);
  const [reviewListLoading, setReviewListLoading] = useState(false);
  const [reviewListError, setReviewListError] = useState('');
  const [healthCenters, setHealthCenters] = useState<HealthCenterOption[]>([]);
  const [activeReview, setActiveReview] = useState<ImportReview | null>(null);
  const [reviewForm, setReviewForm] = useState<ReviewForm>(EMPTY_REVIEW_FORM);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [selectedReviewIds, setSelectedReviewIds] = useState<number[]>([]);
  const [bulkPreview, setBulkPreview] = useState<BulkReviewPreview | null>(null);
  const [discardPreview, setDiscardPreview] = useState<BulkDiscardPreview | null>(null);
  const [discardAcknowledged, setDiscardAcknowledged] = useState(false);
  const [discardProgress, setDiscardProgress] = useState({ processed: 0, discarded: 0, skipped: 0 });
  const [bulkAcknowledged, setBulkAcknowledged] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [centerMatchingOpen, setCenterMatchingOpen] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ processed: 0, created: 0, skipped: 0 });
  const [basicActivationConfirmOpen, setBasicActivationConfirmOpen] = useState(false);
  const [reviewCenterSource, setReviewCenterSource] = useState('');
  const [reviewNationalitySource, setReviewNationalitySource] = useState('');
  const [reviewValidationError, setReviewValidationError] = useState('');
  const [employeeImportMode, setEmployeeImportMode] = useState<'template' | 'flexible'>('flexible');
  const [employeeSheetName, setEmployeeSheetName] = useState('');
  const [availableEmployeeSheets, setAvailableEmployeeSheets] = useState<string[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, number | null>>({});
  const [mappingDirty, setMappingDirty] = useState(false);
  const [mappingConfirmed, setMappingConfirmed] = useState(false);
  const [centerCorrections, setCenterCorrections] = useState<Record<string, string>>({});
  const [centerQuickFixOpen, setCenterQuickFixOpen] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const loadReviews = async (page: number = reviewPage) => {
    if (!employeeMode || !API_BASE_URL) return;
    const token = getAccessToken();
    if (!token) return;
    setReviewListLoading(true);
    setReviewListError('');
    try {
      // One server-paginated page at a time; do not download and render all
      // 1,500+ pending employee cards on every page visit.
      const requestPage = async <T,>(endpoint: string, pageNumber: number) => {
        const separator = endpoint.includes('?') ? '&' : '?';
        const response = await authFetch(`${API_BASE_URL}${endpoint}${separator}page=${pageNumber}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('Failed to retrieve the requested page.');
        const body = await response.json();
        return {
          results: (Array.isArray(body) ? body : (body.results || [])) as T[],
          count: typeof body.count === 'number' ? body.count as number : 0,
          next: !Array.isArray(body) && Boolean(body.next),
        };
      };
      const reviewPageData = await requestPage<ImportReview>(
        '/employee-import-reviews/?status=pending,conflict', page,
      );
      setReviews(reviewPageData.results);
      setReviewTotal(reviewPageData.count || reviewPageData.results.length);
      setReviewHasNext(reviewPageData.next);
      setSelectedReviewIds(previous => previous.filter(id =>
        reviewPageData.results.some(review => review.id === id)));

      // Center reference data is small. Retrieve it once, separately from the
      // pending-card page, and keep it for individual correction dialogs.
      if (!healthCenters.length) {
        const centers: HealthCenterOption[] = [];
        for (let centerPage = 1; centerPage <= 60; centerPage++) {
          const pageData = await requestPage<HealthCenterOption>('/health-centers/', centerPage);
          centers.push(...pageData.results);
          if (!pageData.next) break;
        }
        setHealthCenters(centers);
      }
    } catch (error) {
      setReviewListError(error instanceof Error ? error.message : 'تعذر تحميل البطاقات المعلقة');
    } finally {
      setReviewListLoading(false);
    }
  };

  useEffect(() => {
    void loadReviews(reviewPage);
  }, [employeeMode, reviewPage]);

  const previewBulkActivation = async (selection: 'all' | 'selected') => {
    if (bulkBusy || !API_BASE_URL) return;
    if (selection === 'selected' && !selectedReviewIds.length) {
      toast.error(isRtl ? 'حدد بطاقة واحدة على الأقل.' : 'Select at least one card.');
      return;
    }
    const token = getAccessToken();
    if (!token) {
      toast.error(isRtl ? 'انتهت جلسة الدخول؛ سجّل الدخول من جديد.' : 'Please sign in again.');
      return;
    }
    setBulkBusy(true);
    setBulkPreview(null);
    setBulkAcknowledged(false);
    setBulkProgress({ processed: 0, created: 0, skipped: 0 });
    try {
      const response = await authFetch(`${API_BASE_URL}/employee-import-reviews/bulk-activate/`, {
        method: 'POST', headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'preview', selection,
          ...(selection === 'selected' ? { review_ids: selectedReviewIds } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'تعذر معاينة تفعيل الموظفين');
      setBulkPreview(data as BulkReviewPreview);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر معاينة التفعيل الجماعي');
    } finally {
      setBulkBusy(false);
    }
  };

  const confirmBulkActivation = async () => {
    if (!bulkPreview || !bulkAcknowledged || bulkBusy || !bulkPreview.eligible_count) return;
    const token = getAccessToken();
    if (!token) {
      toast.error('انتهت جلسة الدخول؛ سجّل الدخول من جديد.');
      return;
    }
    setBulkBusy(true);
    const ids = bulkPreview.eligible_ids;
    const batchSize = Math.min(bulkPreview.batch_size, 100);
    let processed = 0, created = 0, skipped = 0;
    const failed: string[] = [];
    try {
      for (let index = 0; index < ids.length; index += batchSize) {
        const chunk = ids.slice(index, index + batchSize);
        const response = await authFetch(`${API_BASE_URL}/employee-import-reviews/bulk-activate/`, {
          method: 'POST', headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: 'commit', confirmed: true, review_ids: chunk,
            preview_token: bulkPreview.preview_token,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'تعذر تنفيذ دفعة من التفعيل');
        const summary = data as BulkCommitResult;
        processed += summary.processed_count;
        created += summary.created_count;
        skipped += summary.skipped_count;
        failed.push(...summary.skipped_reasons.map(item => `${item.label}: ${item.count}`));
        setBulkProgress({ processed, created, skipped });
      }
      toast.success(
        isRtl
          ? `اكتمل التفعيل الجماعي: أضيف ${created} موظفًا، وتخطى النظام ${skipped} من المؤهلين بعد إعادة التحقق.`
          : `Bulk activation complete: ${created} added, ${skipped} skipped at final validation.`,
        { duration: 10000 },
      );
      if (failed.length) toast.warning(failed.slice(0, 5).join('؛ '), { duration: 12000 });
      setBulkPreview(null);
      setSelectedReviewIds([]);
    } catch (error) {
      toast.error(
        (error instanceof Error ? error.message : 'تعذر إكمال التفعيل') +
        ` — تمت معالجة ${processed} من ${ids.length} سجلًا. أعد المعاينة قبل المتابعة.`,
        { duration: 13000 },
      );
      setBulkPreview(null);
    } finally {
      await loadReviews();
      setBulkBusy(false);
    }
  };

  const previewBulkDiscard = async (selection: 'selected' | 'all') => {
    if (bulkBusy || !API_BASE_URL) return;
    if (selection === 'selected' && !selectedReviewIds.length) {
      toast.error(isRtl ? 'حدد بطاقة واحدة على الأقل.' : 'Select at least one pending card.');
      return;
    }
    const token = getAccessToken();
    if (!token) {
      toast.error(isRtl ? 'انتهت جلسة الدخول؛ أعد تسجيل الدخول.' : 'Sign in again.');
      return;
    }
    setBulkBusy(true);
    setBulkPreview(null);
    setDiscardPreview(null);
    setDiscardAcknowledged(false);
    setDiscardProgress({ processed: 0, discarded: 0, skipped: 0 });
    try {
      const response = await authFetch(`${API_BASE_URL}/employee-import-reviews/bulk-discard/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview', selection,
          ...(selection === 'selected' ? { review_ids: selectedReviewIds } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'تعذر معاينة تجاهل البطاقات');
      setDiscardPreview(data as BulkDiscardPreview);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر معاينة التجاهل الجماعي');
    } finally {
      setBulkBusy(false);
    }
  };

  const confirmBulkDiscard = async () => {
    if (!discardPreview || !discardAcknowledged || bulkBusy || !discardPreview.discardable_count) return;
    const token = getAccessToken();
    if (!token) {
      toast.error('انتهت جلسة الدخول؛ أعد تسجيل الدخول.');
      return;
    }
    setBulkBusy(true);
    const ids = discardPreview.discardable_ids;
    const batchSize = Math.min(discardPreview.batch_size, 100);
    let processed = 0, discarded = 0, skipped = 0;
    try {
      for (let index = 0; index < ids.length; index += batchSize) {
        const chunk = ids.slice(index, index + batchSize);
        const response = await authFetch(`${API_BASE_URL}/employee-import-reviews/bulk-discard/`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'commit', confirmed: true, review_ids: chunk,
            preview_token: discardPreview.preview_token,
          }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.detail || 'تعذر تجاهل دفعة من البطاقات');
        const result = body as BulkDiscardCommit;
        processed += result.processed_count;
        discarded += result.discarded_count;
        skipped += result.skipped_count;
        setDiscardProgress({ processed, discarded, skipped });
      }
      toast.success(
        isRtl
          ? `تم تجاهل ${discarded} بطاقة من السجلات المعلقة وحفظ بياناتها في المراجعة. تم تخطي ${skipped} بطاقة تغيرت أو عولجت مسبقًا.`
          : `Archived ${discarded} pending reviews. ${skipped} records were skipped after revalidation.`,
        { duration: 13000 },
      );
      setDiscardPreview(null);
      setSelectedReviewIds([]);
    } catch (error) {
      toast.error(
        (error instanceof Error ? error.message : 'تعذر استكمال العملية') +
        ` — تمت معالجة ${processed} من ${ids.length} بطاقة. أعد المعاينة لتحديد الباقي.`,
        { duration: 13000 },
      );
      setDiscardPreview(null);
    } finally {
      await loadReviews();
      setBulkBusy(false);
    }
  };

  const payloadText = (payload: Record<string, unknown>, key: string) => {
    const value = payload[key];
    return value === null || value === undefined ? '' : String(value);
  };

  const openReview = (review: ImportReview) => {
    const payload = review.employee_payload || {};
    const allowedGender = ['male', 'female'].includes(payloadText(payload, 'gender')) ? payloadText(payload, 'gender') : '';
    const allowedMarital = ['single', 'married', 'divorced', 'widowed'].includes(payloadText(payload, 'marital_status')) ? payloadText(payload, 'marital_status') : '';
    const originalCenter = payloadText(payload, 'health_center_name') || payloadText(payload, 'health_center');
    const originalNationality = payloadText(payload, 'nationality');
    setReviewCenterSource(originalCenter);
    setReviewNationalitySource(originalNationality);
    setReviewValidationError('');
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
      health_center: restoreReviewCenterId(payload, healthCenters),
      job_title: payloadText(payload, 'job_title'),
      appointment_date: /^\d{4}-\d{2}-\d{2}$/.test(payloadText(payload, 'appointment_date')) ? payloadText(payload, 'appointment_date') : '',
      nationality: restoreReviewNationality(payload.nationality, REVIEW_NATIONALITIES),
      current_job: payloadText(payload, 'current_job'),
      job_title_en: payloadText(payload, 'job_title_en'),
      children_count: payloadText(payload, 'children_count'),
      periodic_exam_status: ['completed', 'incomplete', 'overdue'].includes(payloadText(payload, 'periodic_exam_status')) ? payloadText(payload, 'periodic_exam_status') : 'unknown',
      vaccination_status: ['completed', 'due', 'refused'].includes(payloadText(payload, 'vaccination_status')) ? payloadText(payload, 'vaccination_status') : 'unknown',
      risk_level: ['low', 'medium', 'high'].includes(payloadText(payload, 'risk_level')) ? payloadText(payload, 'risk_level') : 'unknown',
    });
    setActiveReview(review);
  };

  const updateReviewField = (field: keyof ReviewForm, value: string) => {
    setReviewForm(current => ({ ...current, [field]: value }));
  };

  const activateReview = async (basicOnly = false) => {
    if (!activeReview) return;
    setReviewValidationError('');
    const matchedCenter = healthCenters.find(center =>
      center.is_active !== false && String(center.id) === reviewForm.health_center);
    if (!matchedCenter || !Number.isSafeInteger(Number(matchedCenter.id)) ||
        Number(matchedCenter.id) <= 0) {
      setReviewValidationError('يرجى اختيار مركز صحي مسجل ونشط من القائمة قبل تفعيل البطاقة.');
      return;
    }
    if (!reviewForm.name.trim() || !reviewForm.national_id.trim()) {
      setReviewValidationError('اسم الموظف ورقم الهوية أو الإقامة حقول إلزامية.');
      return;
    }
    if (!basicOnly && reviewForm.nationality &&
        !REVIEW_NATIONALITIES.some(country => country.code === reviewForm.nationality)) {
      setReviewValidationError('اختر الجنسية من قائمة الدول أو اتركها غير محددة.');
      return;
    }
    const token = getAccessToken();
    if (!token) return;
    setReviewLoading(true);
    const loadingToast = toast.loading(basicOnly
      ? (isRtl ? 'جارٍ إضافة الموظف بالبيانات المتاحة...' : 'Saving available employee data...')
      : (isRtl ? 'جاري التحقق وتفعيل الموظف...' : 'Validating and activating employee...'));
    try {
      const response = await authFetch(`${API_BASE_URL}/employee-import-reviews/${activeReview.id}/activate/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...reviewForm,
          date_of_birth: reviewForm.date_of_birth || null,
          appointment_date: reviewForm.appointment_date || null,
          children_count: reviewForm.children_count ? Number(reviewForm.children_count) : null,
          nationality: reviewForm.nationality,
          health_center: Number(matchedCenter.id),
          basic_only: basicOnly,
          confirm_basic_only: basicOnly,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = body.detail || Object.entries(body).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join('، ') : value}`).join(' | ');
        setReviewValidationError(String(detail || 'تعذر تفعيل البطاقة. راجع البيانات المدخلة.'));
        throw new Error(detail || 'Activation failed');
      }
      const omitted = Array.isArray(body.skipped_optional_fields)
        ? (body.skipped_optional_fields as string[]) : [];
      toast.success(basicOnly
        ? (isRtl
          ? `أُضيف الموظف بالبيانات المتاحة. ${omitted.length ? `${omitted.length} حقل اختياري يحتاج مراجعة.` : 'لم تُستبعد حقول غير صالحة.'}`
          : 'Employee added using verified available fields.')
        : (isRtl ? 'تم تصحيح الموظف وتفعيل بطاقته' : 'Employee corrected and activated'),
      { id: loadingToast, duration: basicOnly ? 8000 : 4500 });
      setBasicActivationConfirmOpen(false);
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
    const response = await authFetch(`${API_BASE_URL}/employee-import-reviews/${review.id}/discard/`, {
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
    setMappingConfirmed(false);
    setCenterCorrections({});
    setUploadError('');
    if (selected && employeeMode) void upload(false, selected);
  };

  const changeEmployeeImportMode = (mode: 'template' | 'flexible') => {
    if (loading) return;
    setCenterCorrections({});
    setEmployeeImportMode(mode);
    setResult(null);
    setEmployeeSheetName('');
    setAvailableEmployeeSheets([]);
    setFieldMapping({});
    setMappingDirty(false);
    setMappingConfirmed(false);
  };

  const changeEmployeeSheet = (value: string) => {
    if (loading) return;
    setCenterCorrections({});
    setEmployeeSheetName(value);
    setResult(null);
    setFieldMapping({});
    setMappingDirty(false);
    setMappingConfirmed(false);
  };

  const changeFieldMapping = (field: string, value: string) => {
    if (loading) return;
    setFieldMapping(current => ({ ...current, [field]: value === '' ? null : Number(value) }));
    setMappingDirty(true);
    setMappingConfirmed(false);
  };

  const downloadRosterTemplate = async () => {
    try {
      const token = getAccessToken();
      if (!token || !API_BASE_URL) throw new Error('تحقق من تسجيل الدخول وإعداد الاتصال بالمنصة.');
      const response = await authFetch(`${API_BASE_URL}/employee-roster-template/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('تعذّر تنزيل القالب المحدث؛ تحقق من صلاحية المسؤول.');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'قالب_الموظفين_الصحة_المهنية_المحدث.xlsx';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 30000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذّر تنزيل القالب');
    }
  };

  const upload = async (
    commitOverride?: boolean, selectedFile?: File,
    correctionOverrides?: Record<string, string>,
  ) => {
    if (loading) return;
    const uploadFile = selectedFile || file;
    if (!uploadFile) {
      toast.error(isRtl ? 'اختر ملف Excel أولًا' : 'Select an Excel file first');
      return;
    }
    const token = getAccessToken();
    if (!token || !API_BASE_URL) {
      toast.error(isRtl ? 'إعداد اتصال Staging أو جلسة الدخول غير مكتمل.' : 'API connection or session is not configured.');
      return;
    }

    const shouldCommit = commitOverride ?? commitMode;
    if (employeeMode && shouldCommit &&
        (result?.mode !== 'preview' || mappingDirty ||
         Boolean(result.missing_required_fields?.length) ||
         (employeeImportMode === 'flexible' && !mappingConfirmed))) {
      toast.error(isRtl
        ? 'أكمل مطابقة الحقول الإلزامية وراجع الأعمدة ثم أكد مطابقتها قبل الاستيراد.'
        : 'Review and confirm the required column mappings before importing.');
      return;
    }
    setUploadError('');
    setResult(null);
    setLoading(true);
    const loadingToast = toast.loading(shouldCommit ? (isRtl ? 'جاري الاستيراد إلى قاعدة البيانات...' : 'Importing into database...') : (isRtl ? 'جاري فحص الملف...' : 'Validating file...'));
    try {
      const form = new FormData();
      form.append('file', uploadFile);
      form.append('commit', shouldCommit ? 'true' : 'false');
      if (employeeMode) {
        form.append('centerCorrections', JSON.stringify(selectedFile ? {} : (correctionOverrides ?? centerCorrections)));
        form.append('employeeImportMode', employeeImportMode);
        if (employeeImportMode === 'template') form.append('sheetName', 'Employees');
        else if (!selectedFile && employeeSheetName) form.append('sheetName', employeeSheetName);
        if (!selectedFile && employeeImportMode === 'flexible' && Object.keys(fieldMapping).length) {
          form.append('fieldMapping', JSON.stringify(fieldMapping));
        }
      }
      else if (sheetName.trim()) form.append('sheetName', sheetName.trim());

      const response = await authFetch(`${API_BASE_URL}/excel-import/upload/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || body.file || body.password || 'Import failed');
      const nextResult = body as ImportResult;
      setResult(nextResult);
      setMappingDirty(false);
      if (!shouldCommit) setMappingConfirmed(false);
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
      const committedNone = employeeMode && shouldCommit && (nextResult.summary.imported_employees || 0) === 0;
      if (committedNone) {
        toast.warning(isRtl
          ? 'لم يُضف أي موظف؛ جميع السجلات غير مؤهلة أو تحتاج مراجعة. اطلع على أسباب المنع أدناه قبل إعادة الاستيراد.'
          : 'No employees were added. Review the blocking reasons before trying again.',
        { id: loadingToast, duration: 11000 });
      } else {
        toast.success(shouldCommit ? (isRtl ? 'اكتملت المعالجة؛ راجع أعداد المضاف والمعلق أدناه.' : 'Processing complete. Check added and pending counts below.') : (isRtl ? 'انتهى الفحص. لم تُضف الأسماء بعد؛ راجع النتائج ثم اضغط إضافة الموظفين.' : 'Preview ready. Review results, then add employees.'), { id: loadingToast });
      }
    } catch (error) {
      setUploadError(friendlyFetchError(error, isRtl));
      toast.error(friendlyFetchError(error, isRtl), { id: loadingToast, duration: 9000 });
    } finally {
      setLoading(false);
    }
  };

  const importedTotal = result ? getImportedTotal(result.summary) : 0;
  const unresolvedCenters = employeeMode && result?.mode === 'preview'
    ? result.preview_rows.filter(row => row.health_center_matched === false &&
      row.issues?.some(issue => /health center|health_center|active center/i.test(issue))).length
    : 0;

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
                        {isRtl ? 'القالب الرسمي الجديد' : 'New official template'}
                      </Button>
                      <Button fullWidth variant={employeeImportMode === 'flexible' ? 'contained' : 'outlined'} onClick={() => changeEmployeeImportMode('flexible')}>
                        {isRtl ? 'ملف Excel موجود (مطابقة الأعمدة)' : 'Existing Excel file (map columns)'}
                      </Button>
                    </Stack>
                  </Paper>
                )}
                {employeeMode && (
                  <Button onClick={() => void downloadRosterTemplate()} variant="outlined" size="large" startIcon={<DownloadIcon />} sx={{ borderRadius: 3, py: 1.4 }}>
                    {isRtl ? 'تنزيل قالب الموظفين المحدث (المراكز الحالية)' : 'Download Current Employee Template'}
                  </Button>
                )}
                {employeeMode && <Alert severity="info">
                  {isRtl
                    ? 'للملفات السابقة مثل قاعدة بيانات 002.xlsx: استخدم «ملف Excel موجود»، ثم راجع مطابقة الأعمدة قبل الاستيراد. لا يلزم نسخ البيانات يدويًا إلى القالب الجديد.'
                    : 'For an existing workbook, select Existing Excel file and review detected column mappings before importing. No manual re-entry is required.'}
                </Alert>}
                <Button component="label" disabled={loading} variant="contained" size="large" startIcon={<CloudUploadIcon />} sx={{ borderRadius: 3, py: 1.6 }}>
                  {file ? file.name : (isRtl ? 'اختيار ملف Excel' : 'Select Excel File')}
                  <input hidden disabled={loading} type="file" accept={employeeMode ? '.xlsx' : '.xlsx,.xlsm,.xltx,.xltm'} onChange={onFileChange} />
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
                      : (isRtl ? 'إعادة الفحص ومعاينة الموظفين' : 'Revalidate & Preview'))
                    : (commitMode ? (isRtl ? 'فحص وحفظ في قاعدة البيانات' : 'Validate & Commit') : (isRtl ? 'فحص ومعاينة فقط' : 'Validate Preview Only'))}
                </Button>

                {employeeMode && result?.mode === 'preview' && (
                  <Button
                    onClick={() => void upload(true)}
                    disabled={loading || !file || mappingDirty || (result.summary.total_rows || 0) === 0 ||
                      Boolean(result.missing_required_fields?.length) ||
                      (employeeImportMode === 'flexible' && !mappingConfirmed)}
                    variant="contained"
                    color="success"
                    size="large"
                    startIcon={<StorageIcon />}
                    sx={{ borderRadius: 3, py: 1.4 }}
                  >
                    {(result.summary.valid_rows || 0) > 0
                      ? (isRtl ? `إضافة الموظفين الآن (${result.summary.valid_rows})` : `Add employees now (${result.summary.valid_rows})`)
                      : (isRtl ? 'حفظ الصفوف للمراجعة والتصحيح' : 'Save rows for review and correction')}
                  </Button>
                )}

                {loading && <LinearProgress />}
                {uploadError && <Alert severity="error">{uploadError}</Alert>}
                {employeeMode && result?.mode === 'preview' && <Alert severity="warning">{isRtl ? 'لم يتم حفظ أي موظف بعد. الصفوف غير السليمة ستُحفظ للمراجعة عند الاعتماد، ويمكن تصحيحها داخل المنصة.' : 'No employees saved yet. Invalid rows will be staged on confirmation and can be corrected here.'}</Alert>}
                {employeeMode && result?.mode === 'commit' && <Button component={Link} to="/employees" variant="outlined">{isRtl ? 'عرض قائمة الموظفين' : 'View employee list'}</Button>}
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
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>{summaryCard(isRtl ? 'ازدواجيات فعلية' : 'Duplicate collisions', result.summary.duplicate_rows || 0, '#f59e0b')}</Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>{summaryCard(isRtl ? 'أخطاء' : 'Errors', result.summary.errors_count || 0, '#dc2626')}</Grid>
          </Grid>

          {employeeMode && typeof result.summary.new_ready === 'number' && (
            <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 3,
              bgcolor: '#f7fbff', borderColor: '#c6dae9' }}>
              <Typography fontWeight={900} color="#153f64" sx={{ mb: 1.2 }}>
                {isRtl ? 'تصنيف الموظفين قبل الاعتماد' : 'Pre-import employee classification'}
              </Typography>
              <Stack direction="row" gap={1} flexWrap="wrap">
                <Chip color="success" label={isRtl
                  ? `جديد مكتمل: ${result.summary.new_complete ?? result.summary.new_ready}`
                  : `New complete: ${result.summary.new_complete ?? result.summary.new_ready}`} />
                <Chip color="info" variant="outlined" label={isRtl
                  ? `جديد قابل للإضافة: ${result.summary.new_ready}`
                  : `New eligible: ${result.summary.new_ready}`} />
                <Chip color="info" label={isRtl
                  ? `موجود مسبقًا: ${result.summary.already_existing || 0}`
                  : `Already existing: ${result.summary.already_existing || 0}`} />
                <Chip color="error" label={isRtl
                  ? `تعارض فعلي: ${result.summary.true_conflicts || 0}`
                  : `True conflict: ${result.summary.true_conflicts || 0}`} />
                <Chip color="warning" label={isRtl
                  ? `تحتاج معالجة: ${result.summary.needs_correction || 0}`
                  : `Needs correction: ${result.summary.needs_correction || 0}`} />
                <Chip color="warning" variant="outlined" label={isRtl
                  ? `نواقص اختيارية: ${result.summary.optional_incomplete || 0}`
                  : `Optional gaps: ${result.summary.optional_incomplete || 0}`} />
              </Stack>
              <Typography color="text.secondary" fontSize={13} sx={{ mt: 1.2 }}>
                {isRtl
                  ? 'يمكن أن يكون الموظف موجودًا مسبقًا ولديه نواقص اختيارية في الوقت نفسه. لا تُضاف نسخ مكررة ولا تُستبدل بيانات الموظفين الحاليين تلقائيًا.'
                  : 'Existing staff may also have optional gaps. No duplicate staff or automatic updates to existing records.'}
              </Typography>
            </Paper>
          )}

          {employeeMode && (result.blocking_reasons?.length || 0) > 0 && (
            <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5, borderRadius: 3, borderColor: 'warning.main' }}>
              <Typography variant="h6" fontWeight={900} sx={{ mb: 0.75 }}>
                {isRtl ? 'الأسباب الفعلية التي منعت إضافة الموظفين' : 'Actual reasons blocking employee creation'}
              </Typography>
              <Alert severity="warning" sx={{ mb: 1.5 }}>
                {isRtl
                  ? 'هذه الأعداد تمثل الصفوف المتأثرة بكل سبب، وقد تظهر أسباب متعددة للموظف نفسه. لا يُنشئ النظام بطاقة فعالة حتى تصحح الحقول المطلوبة.'
                  : 'Counts indicate rows affected by each validation reason; one row can have several issues. No active card is created until required validation passes.'}
              </Alert>
              <Stack gap={1}>
                {(result.blocking_reasons || []).slice(0, 20).map((item, i) => (
                  <Stack key={i} direction="row" alignItems="center" justifyContent="space-between" gap={2}
                    sx={{ borderBottom: '1px solid', borderColor: 'divider', py: 0.7 }}>
                    <Typography variant="body2">{localizeImportIssue(item.reason, isRtl)}</Typography>
                    <Chip color="warning" label={item.count} sx={{ fontWeight: 900, minWidth: 58 }} />
                  </Stack>
                ))}
              </Stack>
            </Paper>
          )}

          {employeeMode && result.mode === 'preview' && unresolvedCenters > 0 && (
            <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5, borderRadius: 3, borderColor: 'primary.light' }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }}
                justifyContent="space-between" gap={2}>
                <Box>
                  <Typography variant="h6" fontWeight={900}>
                    {isRtl ? 'تصحيح مراكز الموظفين' : 'Correct employee centers'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {isRtl
                      ? `${unresolvedCenters} صفًا يحتاج تحديد المركز. صحّحها مباشرة من داخل المنصة دون تنزيل أي ملفات.`
                      : `${unresolvedCenters} rows need an approved center. Fix them here; no files to download.`}
                  </Typography>
                </Box>
                <Button variant="contained" size="large" disabled={loading || !file}
                  onClick={() => setCenterQuickFixOpen(true)}>
                  {isRtl ? 'تصحيح المراكز الآن' : 'Correct centers now'}
                </Button>
              </Stack>
              <EmployeeCenterQuickFixDialog
                open={centerQuickFixOpen}
                isRtl={isRtl}
                loading={loading}
                previewComplete={!result.preview_rows_truncated}
                rows={result.preview_rows}
                centers={healthCenters}
                corrections={centerCorrections}
                onClose={() => setCenterQuickFixOpen(false)}
                onRevalidate={updated => {
                  setCenterCorrections(updated);
                  setCenterQuickFixOpen(false);
                  void upload(false, undefined, updated);
                }}
              />
            </Paper>
          )}

          <Alert icon={<CheckCircleIcon />} severity={result.mode === 'commit' ? (importedTotal > 0 ? 'success' : 'warning') : 'info'} sx={{ mb: 2 }}>
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

          {employeeMode && Array.isArray(result.preview_rows) && result.preview_rows.length > 0 && (
            <EmployeeImportPreviewTable
              rows={result.preview_rows}
              totalRows={result.preview_rows_total ?? result.summary.total_rows}
              truncated={result.preview_rows_truncated}
              isRtl={isRtl}
              mode={result.mode}
              formatIssue={issue => localizeImportIssue(issue, isRtl)}
            />
          )}

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

              <Alert severity="info" sx={{ mb: 2 }}>
                {isRtl
                  ? 'تحقق من تعيين اسم الموظف، رقم الهوية أو الإقامة، المركز الصحي، والرقم الوظيفي والبريد والجوال والتاريخ عند توفرها. الأعمدة التي لا تتعرف عليها المنصة لن تُحفظ تلقائيًا.'
                  : 'Verify the employee name, ID, center and optional job number, email, mobile and dates. Unmapped columns are not saved automatically.'}
              </Alert>
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
              <FormControlLabel
                sx={{ mt: 2, '& .MuiFormControlLabel-label': { fontWeight: 750, fontSize: 14 } }}
                control={<Checkbox checked={mappingConfirmed} disabled={loading || mappingDirty ||
                  Boolean(result.missing_required_fields?.length)}
                  onChange={(_, checked) => setMappingConfirmed(checked)} />}
                label={isRtl
                  ? 'راجعت مطابقة الأعمدة، وتأكدت من ربط الاسم والهوية والمركز والبريد والرقم الوظيفي والجوال وسائر الحقول المتوفرة بشكل صحيح.'
                  : 'I verified the column mappings including name, ID, center and all available employment/contact fields.'}
              />
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

          {!employeeMode && <TableContainer component={Paper} sx={{ borderRadius: 3, mb: 2 }}>
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
          </TableContainer>}

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
                      {employeeMode && result.mode === 'preview' && /health center|health_center/i.test(item.reason) && <TextField
                        select fullWidth disabled={loading} sx={{ my: 1 }}
                        label={isRtl ? 'تصحيح المركز الصحي لهذا الصف' : 'Correct health center for this row'}
                        value={centerCorrections[String(item.row)] || ''}
                        helperText={isRtl ? 'اختر المركز ثم أعد الفحص قبل إضافة الموظفين.' : 'Select a center, then revalidate before adding employees.'}
                        onChange={event => { setCenterCorrections(current => ({ ...current, [String(item.row)]: event.target.value })); setMappingDirty(true); }}
                      >{healthCenters.map(center => <MenuItem key={center.id} value={String(center.id)}>{center.name}</MenuItem>)}</TextField>}
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
              <Alert severity="warning" sx={{ mt: 1.4, mb: 1.5 }}>
                {isRtl
                  ? 'مهم: البطاقات المعلقة من عمليات استيراد سابقة تعرض نتيجة الفحص وقت إنشائها ولا تتحدث تلقائيًا عند تعديل ملف Excel. ارفع الملف مجددًا في وضع «ملف Excel موجود» وراجع المعاينة، ولا تفعّل البطاقات القديمة ذات الحقول الفارغة.'
                  : 'Older pending cards keep the results of their original import. Re-upload the corrected workbook with column mapping, and do not activate legacy cards with empty fields.'}
              </Alert>
              <Typography variant="body2" color="text.secondary">
                {isRtl ? 'لا تظهر في سجلات الموظفين الفعالة حتى تتم معالجة جميع الملاحظات.' : 'These records stay inactive until all issues are corrected.'}
              </Typography>
            </Box>
            <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center">
              <Chip color={reviewTotal ? 'warning' : 'success'}
                label={`${isRtl ? 'إجمالي المعلقة' : 'Total pending'}: ${reviewTotal}`} />
              <Chip variant="outlined"
                label={`${isRtl ? 'المعروضة في الصفحة' : 'Shown on page'}: ${reviews.length}`} />
              {IS_STAGING_IMPORT_UI && <Chip color={selectedReviewIds.length ? 'primary' : 'default'}
                label={`${isRtl ? 'المحدد' : 'Selected'}: ${selectedReviewIds.length}`} />}
            </Stack>
          </Stack>

          {reviews.length > 0 && IS_STAGING_IMPORT_UI && <Paper variant="outlined" sx={{
            p: 2, mb: 2.5, borderRadius: 3, borderColor: '#b9d3e2', bgcolor: '#f1f8fc',
          }}>
            <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" alignItems={{ lg: 'center' }} gap={1.5}>
              <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
                <Button variant="outlined" size="small" disabled={bulkBusy}
                  onClick={() => setSelectedReviewIds(reviews.map(review => review.id))}>
                  {isRtl ? 'تحديد الكل' : 'Select all shown'}
                </Button>
                <Button variant="outlined" size="small" disabled={bulkBusy || !selectedReviewIds.length}
                  onClick={() => setSelectedReviewIds([])}>
                  {isRtl ? 'إلغاء التحديد' : 'Clear selection'}
                </Button>
                <Typography color="text.secondary" fontSize={13}>
                  {isRtl ? `المحدد: ${selectedReviewIds.length}` : `Selected: ${selectedReviewIds.length}`}
                </Typography>
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
                <Button variant="outlined" color="primary" startIcon={<CheckCircleIcon />}
                  disabled={bulkBusy || !selectedReviewIds.length}
                  onClick={() => void previewBulkActivation('selected')}>
                  {isRtl ? `تفعيل المحدد (${selectedReviewIds.length})` : `Activate selected (${selectedReviewIds.length})`}
                </Button>
                <Button variant="outlined" color="error" startIcon={<CancelIcon />}
                  disabled={bulkBusy || !selectedReviewIds.length}
                  onClick={() => void previewBulkDiscard('selected')}>
                  {isRtl ? `تجاهل المحدد (${selectedReviewIds.length})` : `Ignore selected (${selectedReviewIds.length})`}
                </Button>
                <Button variant="outlined" color="error"
                  disabled={bulkBusy} onClick={() => void previewBulkDiscard('all')}>
                  {isRtl ? 'تجاهل جميع البطاقات المعلقة' : 'Ignore all pending cards'}
                </Button>
                <Button variant="contained" color="success" startIcon={<CheckCircleIcon />}
                  disabled={bulkBusy}
                  onClick={() => void previewBulkActivation('all')}>
                  {isRtl ? 'تفعيل جميع البطاقات المؤهلة' : 'Activate all eligible'}
                </Button>
                {typeof window !== 'undefined' &&
                  (window.location.hostname.includes('staging') ||
                   ['localhost', '127.0.0.1'].includes(window.location.hostname)) &&
                  <Button variant="outlined" color="warning" startIcon={<EditIcon />}
                    disabled={bulkBusy} onClick={() => setCenterMatchingOpen(true)}>
                    {isRtl ? 'مطابقة المراكز المعلقة' : 'Match unmatched centers'}
                  </Button>}
              </Stack>
            </Stack>
            <Typography color="text.secondary" fontSize={13} sx={{ mt: 1 }}>
              {isRtl
                ? 'التفعيل أو التجاهل الجماعي لا يبدأ إلا بعد المعاينة والتأكيد. «تحديد الكل» يحدد البطاقات المعروضة، و«تجاهل جميع البطاقات المعلقة» يشمل المعلقة في قاعدة البيانات حتى خارج الصفحة.'
                : 'Bulk activation or discard requires preview and confirmation. Select all picks visible cards; Ignore all pending includes the full pending database queue.'}
            </Typography>
          </Paper>}
          {!IS_STAGING_IMPORT_UI && reviews.length > 0 && <Alert severity="info" sx={{ mb: 2 }}>
            {isRtl
              ? 'المراجعة الفردية متاحة. إجراءات الاعتماد والتجاهل الجماعي تجريبية حتى إتمام ضوابط الإطلاق على Production.'
              : 'Individual review is available. Bulk approval/discard remains disabled until Production release controls are completed.'}
          </Alert>}
          {reviewListError && <Alert severity="error" sx={{ mb: 2 }}>
            {isRtl ? 'تعذر تحديث قائمة البطاقات. يمكنك إعادة المحاولة دون تغيير البيانات.' : 'Could not refresh pending cards. Retry without changing data.'}
            {' '}{reviewListError}
            <Button size="small" onClick={() => void loadReviews(reviewPage)}>
              {isRtl ? 'إعادة المحاولة' : 'Retry'}
            </Button>
          </Alert>}
          {reviewListLoading && <LinearProgress sx={{ mb: 2 }} />}
          {reviewTotal > 0 && <Stack direction="row" justifyContent="space-between"
            alignItems="center" flexWrap="wrap" gap={1.5} sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {isRtl
                ? `الصفحة ${reviewPage} من ${Math.max(1, Math.ceil(reviewTotal / 25))} — عرض ${reviews.length} بطاقة من إجمالي ${reviewTotal}`
                : `Page ${reviewPage} of ${Math.max(1, Math.ceil(reviewTotal / 25))} — ${reviews.length} of ${reviewTotal} reviews`}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" size="small"
                disabled={reviewListLoading || reviewPage <= 1}
                onClick={() => { setSelectedReviewIds([]); setReviewPage(page => Math.max(1, page - 1)); }}>
                {isRtl ? 'السابق' : 'Previous'}
              </Button>
              <Button variant="outlined" size="small"
                disabled={reviewListLoading || !reviewHasNext}
                onClick={() => { setSelectedReviewIds([]); setReviewPage(page => page + 1); }}>
                {isRtl ? 'التالي' : 'Next'}
              </Button>
            </Stack>
          </Stack>}
          {!reviews.length && !reviewListLoading && !reviewListError ? (
            <Alert severity="success">{isRtl ? 'لا توجد حاليًا بطاقات موظفين معلقة في هذه الصفحة.' : 'No pending employee review cards on this page.'}</Alert>
          ) : (
            <Grid container spacing={2}>
              {reviews.map(review => {
                const payload = review.employee_payload || {};
                const importClassification = payload['_import_classification'];
                const isExistingMatch = importClassification === 'existing';
                const isLinkedToExisting = Boolean(review.conflict_employee_summary) || isExistingMatch;
                const reviewDifferences = Array.isArray(payload['_field_differences'])
                  ? (payload['_field_differences'] as Array<{field: string; existing: string; incoming: string}>)
                  : [];
                const isActualConflict = importClassification === 'conflict' || (
                  !isExistingMatch && review.status === 'conflict'
                );
                const reviewMissing = Array.isArray(payload['_optional_missing_fields'])
                  ? payload['_optional_missing_fields'].filter((value): value is string => typeof value === 'string')
                  : [];
                return (
                  <Grid key={review.id} size={{ xs: 12, md: 6, xl: 4 }}>
                    <Card sx={{ height: '100%', borderRadius: 4, border: '1px solid',
                      borderColor: selectedReviewIds.includes(review.id)
                        ? 'primary.main' : isExistingMatch ? 'info.light'
                          : isActualConflict ? 'error.light' : 'warning.light',
                      boxShadow: selectedReviewIds.includes(review.id) ? '0 0 0 2px #c8e4fa' : undefined }}>
                      <CardContent>
                        <Stack spacing={1.5}>
                          {IS_STAGING_IMPORT_UI && <FormControlLabel
                            control={<Checkbox size="small"
                              checked={selectedReviewIds.includes(review.id)}
                              disabled={bulkBusy}
                              onChange={(_, checked) => setSelectedReviewIds(current =>
                                checked ? [...new Set([...current, review.id])] : current.filter(pk => pk !== review.id))}
                              inputProps={{ 'aria-label': `تحديد بطاقة الموظف رقم ${review.id}` }} />}
                            label={<Typography fontWeight={800} fontSize={13}>
                              {isRtl ? 'تحديد لإجراء جماعي' : 'Select for bulk action'}
                            </Typography>} />}
                          <Stack direction={isRtl ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center">
                            <Typography variant="h6" fontWeight={950}>{payloadText(payload, 'name') || (isRtl ? 'اسم غير مكتمل' : 'Incomplete name')}</Typography>
                            <Stack direction="row" gap={0.5} flexWrap="wrap">
                              <Chip size="small"
                                color={isExistingMatch ? 'info' : isActualConflict ? 'error' : 'warning'}
                                label={isExistingMatch ? (isRtl ? 'موجود مسبقًا' : 'Existing')
                                  : isActualConflict ? (isRtl ? 'تعارض فعلي' : 'Conflict')
                                  : (isRtl ? 'يحتاج معالجة' : 'Needs correction')} />
                              {!!reviewMissing.length && <Chip size="small"
                                color="warning" variant="outlined"
                                label={isRtl ? `بيانات ناقصة: ${reviewMissing.length}`
                                  : `Optional gaps: ${reviewMissing.length}`} />}
                            </Stack>
                          </Stack>
                          <Typography variant="body2" color="text.secondary">
                            {isRtl ? 'صف Excel' : 'Excel row'}: {review.source_row} — {review.source_file}
                          </Typography>
                          <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={1} flexWrap="wrap">
                            <Chip size="small" variant="outlined" label={`${isRtl ? 'الرقم الوظيفي' : 'Employee no.'}: ${payloadText(payload, 'employee_number') || '-'}`} />
                            <Chip size="small" variant="outlined" label={`${isRtl ? 'المركز' : 'Center'}: ${payloadText(payload, 'health_center_name') || '-'}`} />
                          </Stack>
                          {review.conflict_employee_summary && (
                            <Alert severity={isExistingMatch ? 'info' : 'error'}>
                              {isExistingMatch
                                ? (isRtl ? 'هذا الموظف مسجل بالفعل، ولن يُضاف مرتين' : 'This employee already exists; no duplicate will be created')
                                : (isRtl ? 'راجع التعارض مع الموظف المسجل' : 'Investigate conflict with existing employee')}
                              {' — '}{review.conflict_employee_summary.name}
                              {' '}({review.conflict_employee_summary.employee_number ||
                                review.conflict_employee_summary.national_id_masked})
                            </Alert>
                          )}
                          {!!reviewMissing.length && <Alert severity="warning">
                            {isRtl ? 'بيانات اختيارية غير متوفرة:' : 'Missing optional data:'}
                            {' '}{reviewMissing.map(field => IMPORT_FIELD_LABELS_AR[field] || field).join('، ')}
                          </Alert>}
                          {isLinkedToExisting && <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: '#f1f7ff' }}>
                            <Typography fontWeight={900} fontSize={13} sx={{ mb: 0.5 }}>
                              {isRtl ? 'مقارنة السجل الحالي بملف Excel' : 'Existing record vs Excel'}
                            </Typography>
                            {reviewDifferences.length ? reviewDifferences.map((difference, index) => (
                              <Typography key={index} fontSize={12.5} sx={{ py: 0.3 }}>
                                <strong>{IMPORT_FIELD_LABELS_AR[difference.field] || difference.field}</strong>
                                {' — '}{isRtl ? 'المسجل:' : 'Stored:'} {String(difference.existing ?? '—')}
                                {' | '}{isRtl ? 'الوارد:' : 'Excel:'} {String(difference.incoming ?? '—')}
                              </Typography>
                            )) : <Typography variant="body2">
                              {isRtl ? 'لم تُرصد اختلافات في البيانات المقارنة.' : 'No compared field differences found.'}
                            </Typography>}
                          </Paper>}
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
                            {isLinkedToExisting ? (
                              <Alert severity="info" sx={{ flex: 1 }}>
                                {isRtl
                                  ? 'سجل مرتبط بموظف موجود. للمقارنة فقط؛ أي تحديث يتطلب إجراءً مستقلًا.'
                                  : 'Linked to an existing employee. Compare only; updates require a separate workflow.'}
                              </Alert>
                            ) : (
                              <Button fullWidth variant="contained" startIcon={<EditIcon />} onClick={() => openReview(review)}>
                                {isRtl ? 'معالجة وتفعيل' : 'Correct & Activate'}
                              </Button>
                            )}
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

      <StagingCenterReconciliationDialog open={centerMatchingOpen}
        isRtl={isRtl} onClose={() => setCenterMatchingOpen(false)}
        onMapped={() => loadReviews()} />

      <Dialog open={Boolean(discardPreview)}
        onClose={() => !bulkBusy && setDiscardPreview(null)}
        fullWidth maxWidth="sm" dir={isRtl ? 'rtl' : 'ltr'}>
        <DialogTitle sx={{ fontWeight: 900, color: 'error.main' }}>
          {isRtl ? 'معاينة تجاهل بطاقات الموظفين' : 'Preview ignoring employee review cards'}
        </DialogTitle>
        <DialogContent dividers>
          {discardPreview && <Stack gap={2}>
            <Alert severity="warning">
              {isRtl
                ? 'سيجري نقل البطاقات المحددة إلى حالة «متجاهلة»، وإخفاؤها من قائمة البطاقات المعلقة. لن تُحذف بياناتها الأصلية، ولن تتغير سجلات الموظفين الفعالة.'
                : 'Selected reviews will be archived as ignored and hidden from pending. Original review details remain stored; active employees are unaffected.'}
            </Alert>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>
              {[
                [isRtl ? 'المحددة' : 'Selected', discardPreview.selected_count],
                [isRtl ? 'جاهزة للتجاهل' : 'Discardable', discardPreview.discardable_count],
                [isRtl ? 'غير قابلة' : 'Excluded', discardPreview.blocked_count],
              ].map(([label, value]) => <Paper key={String(label)} variant="outlined"
                sx={{ p: 1.3, textAlign: 'center', borderRadius: 2 }}>
                <Typography fontWeight={900} fontSize={22}>{value}</Typography>
                <Typography fontSize={12} color="text.secondary">{label}</Typography>
              </Paper>)}
            </Box>
            <Alert severity="info">
              {isRtl
                ? 'التجاهل يزيل البطاقة من قائمة المعالجة اليومية. لاستعادتها لاحقًا يلزم إجراء إداري منفصل؛ إعادة رفع ملف Excel نفسه قد لا تعيد البطاقة المتجاهلة تلقائيًا.'
                : 'Ignoring hides cards from the review queue. Restoring them later requires a separate administrative action; re-uploading the same file may not reopen ignored cards.'}
            </Alert>
            {bulkBusy && <Box>
              <LinearProgress variant="determinate"
                value={discardPreview.discardable_count
                  ? discardProgress.processed / discardPreview.discardable_count * 100 : 0} />
              <Typography fontSize={13} color="text.secondary" sx={{ mt: 1 }}>
                {isRtl
                  ? `تمت معالجة ${discardProgress.processed} من ${discardPreview.discardable_count} — تم تجاهل ${discardProgress.discarded}، وتخطي ${discardProgress.skipped}`
                  : `Processed ${discardProgress.processed} / ${discardPreview.discardable_count} — ignored ${discardProgress.discarded}, skipped ${discardProgress.skipped}`}
              </Typography>
            </Box>}
            <FormControlLabel
              control={<Checkbox checked={discardAcknowledged} disabled={bulkBusy}
                onChange={(_, value) => setDiscardAcknowledged(value)} />}
              label={<Typography variant="body2" fontWeight={800}>
                {isRtl
                  ? `أقر بأنني راجعت العدد وأوافق على تجاهل ${discardPreview.discardable_count} بطاقة مع حفظ أصل بياناتها.`
                  : `I reviewed the count and confirm ignoring ${discardPreview.discardable_count} review cards, preserving original data.`}
              </Typography>}
            />
          </Stack>}
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button disabled={bulkBusy} onClick={() => setDiscardPreview(null)}>
            {isRtl ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button variant="contained" color="error"
            disabled={bulkBusy || !discardAcknowledged || !discardPreview?.discardable_count}
            onClick={() => void confirmBulkDiscard()}>
            {isRtl ? `تأكيد تجاهل ${discardPreview?.discardable_count || 0} بطاقة`
              : `Confirm ignoring ${discardPreview?.discardable_count || 0} cards`}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(bulkPreview)}
        onClose={() => !bulkBusy && setBulkPreview(null)}
        fullWidth maxWidth="sm" dir={isRtl ? 'rtl' : 'ltr'}>
        <DialogTitle sx={{ fontWeight: 900, color: '#153f64' }}>
          {isRtl ? 'معاينة التفعيل الجماعي للموظفين' : 'Bulk employee activation preview'}
        </DialogTitle>
        <DialogContent dividers>
          {bulkPreview && <Stack gap={2}>
            <Alert severity="info">
              {isRtl
                ? 'توضح المعاينة العدد المؤهل فقط؛ لا يمكن إنشاء موظف دون اسم وهوية صحيحة ومركز صحي مطابق، ولا يمكن تجاوز منع التكرار.'
                : 'Only eligible employees may be created. Valid name, ID, exact center and uniqueness are mandatory.'}
            </Alert>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 1 }}>
              {[
                [isRtl ? 'المحددة' : 'Selected', bulkPreview.selected_count],
                [isRtl ? 'مؤهلة' : 'Eligible', bulkPreview.eligible_count],
                [isRtl ? 'مستبعدة' : 'Excluded', bulkPreview.blocked_count],
              ].map(([label, value]) =>
                <Paper key={String(label)} variant="outlined" sx={{ p: 1.3, textAlign: 'center', borderRadius: 2 }}>
                  <Typography fontSize={23} fontWeight={900}>{value}</Typography>
                  <Typography fontSize={12} color="text.secondary">{label}</Typography>
                </Paper>)}
            </Box>
            {bulkPreview.blocked_reasons.length > 0 && <Paper variant="outlined" sx={{
              bgcolor: '#fff9ed', borderColor: '#edcf97', p: 2, borderRadius: 2,
            }}>
              <Typography fontWeight={900} sx={{ mb: 1 }}>
                {isRtl ? 'أسباب الاستبعاد' : 'Reasons for exclusion'}
              </Typography>
              {bulkPreview.blocked_reasons.map(reason =>
                <Typography key={reason.reason} variant="body2" sx={{ py: 0.3 }}>
                  {reason.label}: {reason.count}
                </Typography>)}
            </Paper>}
            {bulkBusy && <Box>
              <LinearProgress variant="determinate"
                value={bulkPreview.eligible_count
                  ? bulkProgress.processed / bulkPreview.eligible_count * 100 : 0} />
              <Typography color="text.secondary" fontSize={13} sx={{ mt: 0.8 }}>
                تمت معالجة {bulkProgress.processed} من {bulkPreview.eligible_count} —
                أُضيف {bulkProgress.created}، وتخطى {bulkProgress.skipped}.
              </Typography>
            </Box>}
            <FormControlLabel
              control={<Checkbox checked={bulkAcknowledged} disabled={bulkBusy || !bulkPreview.eligible_count}
                onChange={(_, checked) => setBulkAcknowledged(checked)} />}
              label={<Typography variant="body2" fontWeight={750}>
                {isRtl
                  ? 'راجعت الأعداد وأؤكد إضافة الموظفين المؤهلين بالبيانات المتاحة، مع إبقاء غير المؤهلين معلّقين.'
                  : 'I reviewed the totals and confirm adding only eligible employees using available validated data.'}
              </Typography>} />
            <Alert severity="warning" sx={{ fontSize: 13 }}>
              {isRtl
                ? 'ستُنشأ سجلات جديدة في قاعدة Staging بعد التأكيد. لن يُنشأ أي موظف مكرر، ولن تُنقل بيانات صحية غير موثقة.'
                : 'New Staging records are created only after confirmation. No duplicates or unverified clinical data will be added.'}
            </Alert>
          </Stack>}
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button disabled={bulkBusy} onClick={() => setBulkPreview(null)}>
            {isRtl ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button variant="contained" color="success" disabled={bulkBusy || !bulkAcknowledged ||
            !bulkPreview?.eligible_count}
            onClick={() => void confirmBulkActivation()}>
            {isRtl ? `تأكيد إضافة ${bulkPreview?.eligible_count || 0} موظف`
              : `Confirm ${bulkPreview?.eligible_count || 0} employees`}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={Boolean(activeReview)} onClose={() => !reviewLoading && setActiveReview(null)} fullWidth maxWidth="md" dir={isRtl ? 'rtl' : 'ltr'}>
        <DialogTitle fontWeight={950}>{isRtl ? 'معالجة ملاحظات الموظف وتفعيل البطاقة' : 'Correct Employee & Activate Card'}</DialogTitle>
        <DialogContent dividers>
          {activeReview && (
            <Stack gap={1.3} sx={{ mb: 2 }}>
              <Alert severity="info" sx={{ fontSize: 13.5 }}>
                هذه ملاحظات محفوظة عند فحص الملف سابقًا، وليست نتائج فحص الحقول الحالية.
                تاريخ الميلاد والتعيين، والجنسية، والوحدة التنظيمية حقول اختيارية عند إنشاء الموظف.
                يلزم التأكد من اسم الموظف ورقم الهوية أو الإقامة والمركز الصحي فقط.
              </Alert>
              {!!activeReview.issues.length && <Alert severity={activeReview.status === 'conflict' ? 'error' : 'warning'}>
                <Typography variant="body2" fontWeight={800} sx={{ mb: 0.8 }}>ملاحظات الاستيراد السابقة:</Typography>
                <Box component="ul" sx={{ m: 0, ps: 2.5 }}>
                  {activeReview.issues.flatMap(issue => localizeImportReason(issue, isRtl)).map((issue, index) => (
                    <Typography component="li" key={index} variant="body2">
                      {localizeImportIssue(issue, isRtl)}
                    </Typography>
                  ))}
                </Box>
              </Alert>}
              {reviewValidationError && <Alert severity="error" role="alert">{reviewValidationError}</Alert>}
            </Stack>
          )}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}><TextField required fullWidth label={isRtl ? 'اسم الموظف' : 'Employee name'} value={reviewForm.name} onChange={e => updateReviewField('name', e.target.value)} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label={isRtl ? 'البريد الإلكتروني (اختياري)' : 'Email (optional)'} value={reviewForm.email} onChange={e => updateReviewField('email', e.target.value)} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField required fullWidth label={isRtl ? 'رقم الهوية / الإقامة' : 'National ID / Iqama'} value={reviewForm.national_id} onChange={e => updateReviewField('national_id', e.target.value)} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label={isRtl ? 'الرقم الوظيفي (اختياري)' : 'Employee number (optional)'} value={reviewForm.employee_number} onChange={e => updateReviewField('employee_number', e.target.value)} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label={isRtl ? 'رقم الجوال' : 'Mobile'} value={reviewForm.mobile} onChange={e => updateReviewField('mobile', e.target.value)} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label={isRtl ? 'العنوان الوطني' : 'National address'} value={reviewForm.national_address} onChange={e => updateReviewField('national_address', e.target.value)} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><CalendarDateField label={isRtl ? 'تاريخ الميلاد' : 'Date of birth'} value={reviewForm.date_of_birth} onChange={value => updateReviewField('date_of_birth', value)} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label={isRtl ? 'مكان الميلاد' : 'Birth place'} value={reviewForm.birth_place} onChange={e => updateReviewField('birth_place', e.target.value)} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField select fullWidth label={isRtl ? 'الجنس' : 'Gender'} value={reviewForm.gender} onChange={e => updateReviewField('gender', e.target.value)}><MenuItem value="">غير محدد</MenuItem><MenuItem value="male">{isRtl ? 'ذكر' : 'Male'}</MenuItem><MenuItem value="female">{isRtl ? 'أنثى' : 'Female'}</MenuItem></TextField></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField select fullWidth label={isRtl ? 'الحالة الاجتماعية' : 'Marital status'} value={reviewForm.marital_status} onChange={e => updateReviewField('marital_status', e.target.value)}><MenuItem value="">غير محدد</MenuItem><MenuItem value="single">{isRtl ? 'أعزب' : 'Single'}</MenuItem><MenuItem value="married">{isRtl ? 'متزوج' : 'Married'}</MenuItem><MenuItem value="divorced">{isRtl ? 'مطلق' : 'Divorced'}</MenuItem><MenuItem value="widowed">{isRtl ? 'أرمل' : 'Widowed'}</MenuItem></TextField></Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Autocomplete
                options={healthCenters.filter(center => center.is_active !== false)
                  .sort((a,b) => Number(Boolean(b.code?.startsWith('OHP-REF-'))) -
                    Number(Boolean(a.code?.startsWith('OHP-REF-'))))}
                value={healthCenters.find(center => String(center.id) === reviewForm.health_center) || null}
                onChange={(_, center) => {
                  updateReviewField('health_center', center ? String(center.id) : '');
                  setReviewValidationError('');
                }}
                getOptionLabel={center => center.name_ar || center.name}
                isOptionEqualToValue={(option, value) => String(option.id) === String(value.id)}
                renderOption={(props, center) => <li {...props} key={center.id}>
                  {center.name_ar || center.name} {center.code ? `(${center.code})` : ''}
                </li>}
                renderInput={params => <TextField {...params} required
                  label={isRtl ? 'المركز الصحي – ابحث بالاسم' : 'Health center – search by name'}
                  error={Boolean(reviewValidationError && !reviewForm.health_center)}
                  helperText={reviewForm.health_center
                    ? 'المركز المختار مسجل في قاعدة البيانات.'
                    : `يجب اختيار مركز من القائمة. ${reviewCenterSource ? 'الاسم في الملف: ' + reviewCenterSource : ''}`}
                />}
                noOptionsText="لا يوجد مركز مطابق؛ راجع إدارة المراكز الصحية"
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label={isRtl ? 'المسمى الوظيفي' : 'Job title'} value={reviewForm.job_title} onChange={e => updateReviewField('job_title', e.target.value)} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><CalendarDateField label={isRtl ? 'تاريخ التعيين' : 'Appointment date'} value={reviewForm.appointment_date} onChange={value => updateReviewField('appointment_date', value)} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Autocomplete
                options={REVIEW_NATIONALITIES}
                value={REVIEW_NATIONALITIES.find(item => item.code === reviewForm.nationality) || null}
                onChange={(_, selected) => updateReviewField('nationality', selected?.code || '')}
                getOptionLabel={item => item.countryAr}
                isOptionEqualToValue={(option,value) => option.code === value.code}
                filterOptions={(items, state) => {
                  const search = normalizeNationalitySearch(state.inputValue);
                  return search ? items.filter(item => item.searchText.includes(search)) : items;
                }}
                renderInput={params => <TextField {...params} label="الجنسية (اختياري)"
                  helperText={reviewNationalitySource && !reviewForm.nationality
                    ? `لم يُتعرف على الجنسية الواردة: ${reviewNationalitySource}. اختر الدولة أو اترك الحقل فارغًا.`
                    : 'اختر اسم الدولة؛ سيحفظ النظام رمزها الصحيح.'} />}
                noOptionsText="لا توجد دولة مطابقة"
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label="الوظيفة الحالية" value={reviewForm.current_job} onChange={e => updateReviewField('current_job', e.target.value)} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label="المسمى الوظيفي بالإنجليزية" value={reviewForm.job_title_en} onChange={e => updateReviewField('job_title_en', e.target.value)} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth type="number" label="عدد الأطفال" value={reviewForm.children_count} onChange={e => updateReviewField('children_count', e.target.value)} inputProps={{ min: 0, max: 100, step: 1 }} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField select fullWidth label={isRtl ? 'حالة الفحص الدوري' : 'Exam status'} value={reviewForm.periodic_exam_status} onChange={e => updateReviewField('periodic_exam_status', e.target.value)}><MenuItem value="unknown">غير محدد</MenuItem><MenuItem value="completed">{isRtl ? 'مكتمل' : 'Completed'}</MenuItem><MenuItem value="incomplete">{isRtl ? 'غير مكتمل' : 'Incomplete'}</MenuItem><MenuItem value="overdue">{isRtl ? 'متأخر' : 'Overdue'}</MenuItem></TextField></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField select fullWidth label={isRtl ? 'حالة التطعيم' : 'Vaccination status'} value={reviewForm.vaccination_status} onChange={e => updateReviewField('vaccination_status', e.target.value)}><MenuItem value="unknown">غير محدد</MenuItem><MenuItem value="completed">{isRtl ? 'مكتمل' : 'Completed'}</MenuItem><MenuItem value="due">{isRtl ? 'مستحق' : 'Due'}</MenuItem><MenuItem value="refused">{isRtl ? 'مرفوض' : 'Refused'}</MenuItem></TextField></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField select fullWidth label={isRtl ? 'مستوى الخطورة' : 'Risk level'} value={reviewForm.risk_level} onChange={e => updateReviewField('risk_level', e.target.value)}><MenuItem value="unknown">غير محدد</MenuItem><MenuItem value="low">{isRtl ? 'منخفض' : 'Low'}</MenuItem><MenuItem value="medium">{isRtl ? 'متوسط' : 'Medium'}</MenuItem><MenuItem value="high">{isRtl ? 'مرتفع' : 'High'}</MenuItem></TextField></Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActiveReview(null)} disabled={reviewLoading}>{isRtl ? 'إلغاء' : 'Cancel'}</Button>
          <Button variant="outlined" color="warning"
            onClick={() => setBasicActivationConfirmOpen(true)}
            disabled={reviewLoading || !reviewForm.health_center || !reviewForm.name.trim() || !reviewForm.national_id.trim()}>
            {isRtl ? 'إضافة الموظف بالبيانات المتاحة' : 'Add using available data'}
          </Button>
          <Button variant="contained" color="success" onClick={() => void activateReview()}
            disabled={reviewLoading || !reviewForm.health_center || !reviewForm.name.trim() || !reviewForm.national_id.trim()}
            startIcon={<CheckCircleIcon />}>
            {reviewLoading ? (isRtl ? 'جاري التحقق...' : 'Validating...') : (isRtl ? 'حفظ جميع البيانات وتفعيل البطاقة' : 'Save All Valid Details & Activate')}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={basicActivationConfirmOpen && Boolean(activeReview)}
        onClose={() => !reviewLoading && setBasicActivationConfirmOpen(false)}
        maxWidth="sm" fullWidth dir={isRtl ? 'rtl' : 'ltr'}>
        <DialogTitle fontWeight={900}>
          {isRtl ? 'تأكيد إضافة الموظف بالبيانات المتاحة' : 'Confirm available-data activation'}
        </DialogTitle>
        <DialogContent dividers>
          <Stack gap={1.5}>
            <Alert severity="warning">
              {isRtl
                ? 'سيُضاف الموظف بالاسم ورقم الهوية أو الإقامة والمركز الصحي، مع حفظ كل حقل اختياري صالح. ستُستبعد فقط القيم غير الصحيحة، وتبقى تفاصيلها في سجل المراجعة الأصلي لاستكمالها لاحقًا.'
                : 'The employee will be added with name, ID and a confirmed center, plus any valid optional fields. Invalid optional values are skipped and retained in the original review for later correction.'}
            </Alert>
            <Typography fontSize={14} color="text.secondary">
              {isRtl
                ? 'لن تُقبل هوية مكررة أو مركز غير محدد. ولن يُعتمد ربط تنظيمي غير موثق أو تُنشأ بيانات صحية افتراضية.'
                : 'Duplicate identities, missing centers, unapproved organizational assignments and fabricated medical information are never allowed.'}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 2, gap: 1 }}>
          <Button disabled={reviewLoading} onClick={() => setBasicActivationConfirmOpen(false)}>
            {isRtl ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button variant="contained" color="warning" disabled={reviewLoading}
            onClick={() => void activateReview(true)}>
            {isRtl ? 'تأكيد إضافة الموظف' : 'Confirm employee activation'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
