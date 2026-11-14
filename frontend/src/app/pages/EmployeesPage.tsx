import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  Typography,
} from '@mui/material';
import { Grid } from '@mui/material';
import {
  Add as AddIcon,
  WorkHistoryOutlined as WorkHistoryIcon,
  Edit as EditIcon,
  People as PeopleIcon,
  Refresh as RefreshIcon,
  Assessment as EmployeeReportIcon,
  Search as SearchIcon,
  UploadFile as UploadFileIcon,
  Visibility as VisibilityIcon,
  BadgeOutlined as HealthCardIcon,
  DeleteSweepOutlined as ResetTestCardsIcon,
  DeleteSweepOutlined as DeleteEmployeeIcon,
  Refresh as RestoreEmployeeIcon,
} from '@mui/icons-material';
import { toast } from 'sonner';
import { authFetch, getAccessToken, useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../data/roles';
import { CalendarDateField } from '../components/CalendarDateField';
import { HealthCenterAutocomplete } from '../components/HealthCenterAutocomplete';
import { EmployeeRegistryCard } from '../components/EmployeeRegistryCard';
import { JOB_TITLES, getNationalityOptions, normalizeNationalitySearch } from '../data/employeeFormOptions';
import {
  normalizeNationalId, isValidNationalId, isValidEmployeeEmail,
  isValidChildrenCount, toWesternDigits, calculateAgeFromIso,
  joinedPrecedesOrEqualsBirth,
} from '../utils/employeeFormValidation';

// A Staging write must never fall back to the Production API.
const API_BASE_URL = (import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:8000/api' : '')).replace(/\/$/, '');
const IS_STAGING_UI = typeof window !== 'undefined' &&
  (/staging/i.test(window.location.hostname) ||
  ['localhost', '127.0.0.1'].includes(window.location.hostname));

type ResetScope = 'all_synthetic' | 'load_only' | 'examples_only';
type ResetPreview = {
  mode: 'preview'; scope: ResetScope; total_employees: number;
  marked_test_records: number; verified_test_records: number;
  eligible_count: number; eligible_load_count: number; eligible_example_count: number;
  excluded_with_related_records: number; excluded_unverified_markers: number;
  other_records_to_keep: number; preview_token: string;
};
type ResetResult = {
  mode: 'reset'; deleted_test_cards: number; remaining_employee_cards: number; notice: string;
};
const RESET_CONFIRMATION_TEXT = 'تصفير بطاقات الاختبار';

// Unlike the QA-only Staging reset, Production uses reversible employee
// archival. No employee identity or medical record is ever physically deleted.
type RegistryBulkPreview =
  | { mode: 'preview'; total_active: number; will_archive: number; already_archived: number;
      restorable_from_last_batch: number; confirm_phrase: string; preview_token: string; notice: string }
  | { mode: 'restore_preview'; restorable: number; previous_batch_total: number;
      confirm_phrase: string; preview_token: string };
type RegistryBulkResult =
  | { mode: 'archived'; archived_count: number; active_count: number; batch_id: string }
  | { mode: 'restored'; restored_count: number; batch_id: string };

type Gender = 'male' | 'female';
type MaritalStatus = '' | 'single' | 'married' | 'divorced' | 'widowed';
type ExamStatus = 'completed' | 'incomplete' | 'overdue';
type VaccineStatus = 'completed' | 'due' | 'refused';
type RiskLevel = 'low' | 'medium' | 'high';

type ApiHealthCenter = {
  id: number | string;
  name: string;
  name_ar?: string;
  name_en?: string;
  code?: string | null;
  region?: string;
  city?: string;
  district?: string;
  building_type?: string;
  is_active?: boolean;
};

type ApprovedOrganizationUnit = {
  id: number; code: string; name: string; kind: 'department' | 'sector' | 'center' | 'unit';
  parent_name: string; health_center_id: number | null; source_path: string;
  is_approved: boolean; is_active: boolean;
};

type ApiEmployee = {
  id: number | string;
  name: string;
  email?: string | null;
  national_id: string;
  employee_number?: string | null;
  organization_unit?: number | null;
  nationality?: string;
  current_job?: string;
  national_address?: string;
  mobile?: string;
  date_of_birth?: string | null;
  birth_place?: string;
  age?: number;
  gender: Gender;
  marital_status?: MaritalStatus;
  health_center: number | string;
  health_center_name?: string;
  job_title?: string;
  job_title_en?: string;
  moh_id?: string;
  children_count?: number | null;
  latest_virtual_visit?: string | null;
  latest_field_visit?: string | null;
  lab_request?: string;
  lab_request_date?: string | null;
  employment_start_date?: string | null;
  appointment_date?: string | null;
  years_of_experience?: string | number | null;
  periodic_exam_status?: ExamStatus;
  vaccination_status?: VaccineStatus;
  risk_level?: RiskLevel;
  employment_status?: 'active' | 'transferred' | 'retired' | 'separated' | 'under_review';
  roster_source_status?: string;
  is_archived?: boolean;
  archive_reason?: string;
  archived_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

type EmployeeForm = {
  name: string;
  email: string;
  national_id: string;
  employee_number: string;
  organization_unit: string;
  nationality: string;
  current_job: string;
  national_address: string;
  mobile: string;
  date_of_birth: string;
  birth_place: string;
  gender: Gender | '';
  marital_status: MaritalStatus;
  health_center: string;
  job_title: string;
  job_title_en: string;
  moh_id: string;
  children_count: string;
  appointment_date: string;
  periodic_exam_status: ExamStatus;
  vaccination_status: VaccineStatus;
  risk_level: RiskLevel;
};

const EMPTY_FORM: EmployeeForm = {
  name: '',
  email: '',
  national_id: '',
  employee_number: '',
  organization_unit: '',
  nationality: '',
  current_job: '',
  national_address: '',
  mobile: '',
  date_of_birth: '',
  birth_place: '',
  gender: '',
  marital_status: '',
  health_center: '',
  job_title: '',
  job_title_en: '',
  moh_id: '',
  children_count: '',
  appointment_date: '',
  periodic_exam_status: 'incomplete',
  vaccination_status: 'due',
  risk_level: 'low',
};

function getList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object' && Array.isArray((payload as { results?: unknown }).results)) {
    return (payload as { results: T[] }).results;
  }
  return [];
}

// Administrative data completeness is separate from medical/clinical status.
const OPTIONAL_EMPLOYEE_FIELDS: Array<[keyof ApiEmployee, string]> = [
  ['employee_number', 'الرقم الوظيفي'],
  ['date_of_birth', 'تاريخ الميلاد'],
  ['gender', 'الجنس'],
  ['nationality', 'الجنسية'],
  ['birth_place', 'مكان الميلاد'],
  ['marital_status', 'الحالة الاجتماعية'],
  ['mobile', 'الجوال'],
  ['email', 'البريد الإلكتروني'],
  ['national_address', 'العنوان الوطني'],
  ['job_title', 'المسمى الوظيفي'],
  ['current_job', 'الوظيفة الحالية'],
  ['appointment_date', 'تاريخ التعيين'],
];
function missingEmployeeOptionalFields(employee: ApiEmployee): string[] {
  return OPTIONAL_EMPLOYEE_FIELDS.filter(([field]) =>
    !String(employee[field] ?? '').trim()
  ).map(([, label]) => label);
}

function maskNationalId(value: string) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length <= 4) return digits || '-';
  if (digits.length <= 8) return `${digits.slice(0, 2)}****${digits.slice(-2)}`;
  return `${digits.slice(0, 2)}****${digits.slice(-4)}`;
}

function calculateExperience(dateValue: string) {
  if (!dateValue) return '';
  const start = new Date(dateValue);
  if (Number.isNaN(start.getTime())) return '';
  const today = new Date();
  const days = Math.max(0, Math.floor((today.getTime() - start.getTime()) / 86400000));
  return (days / 365.25).toFixed(2);
}

function normalizeDate(value?: string | null) {
  return value ? String(value).slice(0, 10) : '';
}

function centerDisplayName(center: ApiHealthCenter, isRtl: boolean) {
  return (isRtl ? center.name_ar : center.name_en) || center.name || center.name_en || center.name_ar || '-';
}

function asForm(employee: ApiEmployee): EmployeeForm {
  return {
    name: employee.name || '',
    email: employee.email || '',
    national_id: employee.national_id || '',
    employee_number: employee.employee_number || '',
    organization_unit: employee.organization_unit ? String(employee.organization_unit) : '',
    nationality: employee.nationality || '',
    current_job: employee.current_job || '',
    national_address: employee.national_address || '',
    mobile: employee.mobile || '',
    date_of_birth: normalizeDate(employee.date_of_birth),
    birth_place: employee.birth_place || '',
    gender: employee.gender || '',
    marital_status: employee.marital_status || '',
    health_center: String(employee.health_center || ''),
    job_title: employee.job_title || '',
    job_title_en: employee.job_title_en || '',
    moh_id: employee.moh_id || '',
    children_count: employee.children_count == null ? '' : String(employee.children_count),
    appointment_date: normalizeDate(employee.appointment_date),
    periodic_exam_status: employee.periodic_exam_status || 'unknown',
    vaccination_status: employee.vaccination_status || 'unknown',
    risk_level: employee.risk_level || 'unknown',
  };
}

function buildPayload(form: EmployeeForm) {
  return {
    name: form.name.trim(),
    email: form.email.trim().toLowerCase(),
    national_id: normalizeNationalId(form.national_id),
    employee_number: form.employee_number.trim(),
    organization_unit: form.organization_unit ? Number(form.organization_unit) : null,
    nationality: form.nationality,
    current_job: form.current_job.trim(),
    national_address: form.national_address.trim(),
    mobile: form.mobile.trim(),
    date_of_birth: form.date_of_birth || null,
    birth_place: form.birth_place.trim(),
    gender: form.gender,
    marital_status: form.marital_status,
    health_center: Number(form.health_center),
    job_title: form.job_title.trim(),
    job_title_en: form.job_title_en.trim(),
    moh_id: form.moh_id.trim(),
    children_count: form.children_count === '' ? null : Number(toWesternDigits(form.children_count)),
    appointment_date: form.appointment_date || null,
  };
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('لا يوجد رمز دخول من Django. أعد تسجيل الدخول بحساب Backend وليس الحساب التجريبي.');
  }

  if (!API_BASE_URL) throw new Error('الاتصال بقاعدة بيانات Staging غير مضبوط. تم إيقاف العملية لحماية Production.');
  const response = await authFetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body?.detail || body?.email || body?.national_id || body?.employee_number || body?.health_center ||
      body?.date_of_birth || body?.appointment_date || body?.nationality || body?.current_job ||
      body?.name || body?.mobile || body?.non_field_errors ||
      'Request failed';
    throw new Error(Array.isArray(message) ? message.join('، ') : String(message));
  }
  return body as T;
}

export function EmployeesPage() {
  const { t, i18n } = useTranslation();
  const { can, user } = useAuth();
  const navigate = useNavigate();
  const isRtl = i18n.language === 'ar';

  const [employees, setEmployees] = useState<ApiEmployee[]>([]);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [healthCenters, setHealthCenters] = useState<ApiHealthCenter[]>([]);
  const [approvedOrganizations, setApprovedOrganizations] = useState<ApprovedOrganizationUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [centerFilter, setCenterFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [completionFilter, setCompletionFilter] = useState('all');
  const [sortMode, setSortMode] = useState('newest');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [dialogMode, setDialogMode] = useState<'view' | 'add' | 'edit'>('view');
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<ApiEmployee | null>(null);
  const [form, setForm] = useState<EmployeeForm>(EMPTY_FORM);
  const [connectionError, setConnectionError] = useState('');
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetScope, setResetScope] = useState<ResetScope>('all_synthetic');
  const [resetPreview, setResetPreview] = useState<ResetPreview | null>(null);
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [resetAcknowledged, setResetAcknowledged] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [registryResetDialog, setRegistryResetDialog] = useState(false);
  const [registryResetBusy, setRegistryResetBusy] = useState(false);
  const [registryResetPreview, setRegistryResetPreview] = useState<RegistryBulkPreview | null>(null);
  const [registryResetReason, setRegistryResetReason] = useState('');
  const [registryResetPhrase, setRegistryResetPhrase] = useState('');
  const [registryResetConfirmed, setRegistryResetConfirmed] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<ApiEmployee | null>(null);
  const [archiveAction, setArchiveAction] = useState<'archive' | 'restore'>('archive');
  const [archiveReason, setArchiveReason] = useState('');
  const [archiveConfirmed, setArchiveConfirmed] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);

  const canArchive = can(PERMISSIONS.MANAGE_USERS);
  const canBulkReset = canArchive && user?.isSuperuser === true;
  const canWrite = can(PERMISSIONS.UPDATE_EMPLOYEE) || can(PERMISSIONS.UPDATE_EMPLOYEE_BASIC);
  const ageValue = calculateAgeFromIso(form.date_of_birth);
  const computedAge = ageValue === null ? '' : String(ageValue);
  const computedExperience = calculateExperience(form.appointment_date);
  const nationalityOptions = useMemo(() => getNationalityOptions(), []);
  const selectedNationality = nationalityOptions.find(option => option.code === form.nationality) || null;
  const availableOrgUnits = approvedOrganizations.filter(unit =>
    unit.is_approved && unit.is_active &&
    (unit.kind === 'center' || unit.kind === 'unit' || unit.kind === 'department') &&
    unit.health_center_id !== null && String(unit.health_center_id) === form.health_center);
  const selectedOrgUnit = approvedOrganizations.find(item => String(item.id) === form.organization_unit) || null;
  // Preserve a legacy/imported title in edit mode even when it is not in the 116-item reference file.
  const jobTitleOptions = form.job_title && !JOB_TITLES.includes(form.job_title)
    ? [form.job_title, ...JOB_TITLES] : [...JOB_TITLES];

  async function loadData() {
    setLoading(true);
    setConnectionError('');
    try {
      const query = new URLSearchParams({ page: String(page + 1) });
      if (showArchived && canArchive) query.set('archived', 'true');
      if (searchTerm.trim()) query.set('search', searchTerm.trim());
      if (centerFilter !== 'all') query.set('health_center_id', centerFilter);
      if (statusFilter !== 'all') query.set('employment_status', statusFilter);
      if (sourceFilter !== 'all') query.set('source_category', sourceFilter);
      if (completionFilter !== 'all') query.set('completion', completionFilter);
      query.set('sort', sortMode);
      const employeesPayload = await apiRequest<unknown>('/employees/?' + query.toString());
      const results = getList<ApiEmployee>(employeesPayload);
      const payload = employeesPayload && typeof employeesPayload === 'object'
        ? employeesPayload as { count?: number }
        : {};
      setEmployees(results);
      setTotalCount(typeof payload.count === 'number' ? payload.count : results.length);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load employees';
      setConnectionError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function loadCenters() {
    try {
      const centers: ApiHealthCenter[] = [];
      // DRF paginates centers too. Fetch all pages for the selector, not only 25.
      for (let centerPage = 1; centerPage <= 40; centerPage += 1) {
        const payload = await apiRequest<unknown>('/health-centers/?active=true&page=' + centerPage);
        centers.push(...getList<ApiHealthCenter>(payload));
        const next = payload && typeof payload === 'object'
          ? (payload as { next?: string | null }).next
          : null;
        if (!next) break;
      }
      setHealthCenters(centers);
      setForm(prev => prev.health_center || !centers[0]
        ? prev : { ...prev, health_center: String(centers[0].id) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load centers');
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void loadData(); }, searchTerm ? 350 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchTerm, centerFilter, statusFilter, sourceFilter, completionFilter, sortMode, showArchived, canArchive]);

  useEffect(() => { void loadCenters(); }, []);

  useEffect(() => {
    let mounted = true;
    void apiRequest<{ results: ApprovedOrganizationUnit[] }>('/organization-units/?approved=1')
      .then(result => { if (mounted) setApprovedOrganizations(result.results || []); })
      .catch(() => { if (mounted) setApprovedOrganizations([]); });
    return () => { mounted = false; };
  }, []);

  const centerNameById = useMemo(() => {
    const map = new Map<string, string>();
    healthCenters.forEach(center => map.set(String(center.id), centerDisplayName(center, isRtl)));
    return map;
  }, [healthCenters, isRtl]);

  // Search and center filtering are performed server-side across all employees.
  const filteredEmployees = employees;

  function getHealthCenterName(employee: ApiEmployee) {
    return centerNameById.get(String(employee.health_center)) || employee.health_center_name || '-';
  }

  function openAdd() {
    setSelectedEmployee(null);
    setForm({ ...EMPTY_FORM, health_center: healthCenters[0] ? String(healthCenters[0].id) : '' });
    setDialogMode('add');
    setOpenDialog(true);
  }

  function openEdit(employee: ApiEmployee) {
    setSelectedEmployee(employee);
    setForm(asForm(employee));
    setDialogMode('edit');
    setOpenDialog(true);
  }

  function openView(employee: ApiEmployee) {
    setSelectedEmployee(employee);
    setForm(asForm(employee));
    setDialogMode('view');
    setOpenDialog(true);
  }

  function updateForm<K extends keyof EmployeeForm>(key: K, value: EmployeeForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function findDuplicate(field: keyof Pick<ApiEmployee, 'email' | 'national_id' | 'employee_number'>, value: string) {
    if (!value) return undefined;
    return employees.find(emp =>
      String(emp[field] || '').toLowerCase() === value.toLowerCase() &&
      String(emp.id) !== String(selectedEmployee?.id || '')
    );
  }

  async function handleSave() {
    const required: Array<[keyof EmployeeForm, string]> = [
      ['name', isRtl ? 'اسم الموظف' : 'Name'],
      ['national_id', isRtl ? 'رقم الهوية الوطنية' : 'National ID'],
      ['health_center', isRtl ? 'المركز الصحي' : 'Health center'],
    ];

    const missing = required.find(([key]) => !String(form[key] || '').trim());
    if (missing) {
      toast.error(isRtl ? `يرجى تعبئة: ${missing[1]}` : `${missing[1]} is required`);
      return;
    }

    if (!isValidNationalId(form.national_id)) {
      toast.error(isRtl ? 'يجب أن يتكون رقم الهوية من 10 أرقام' : 'National ID must contain 10 digits');
      return;
    }
    if (!isValidChildrenCount(form.children_count)) {
      toast.error(isRtl ? 'عدد الأطفال يجب أن يكون عددًا صحيحًا' : 'Children count must be a whole number');
      return;
    }
    if (!isValidEmployeeEmail(form.email)) {
      toast.error(isRtl ? 'صيغة البريد الإلكتروني غير صحيحة' : 'Invalid email address');
      return;
    }
    if (form.date_of_birth && ageValue === null) {
      toast.error(isRtl ? 'تاريخ الميلاد غير صالح أو يقع في المستقبل' : 'Date of birth is invalid or in the future');
      return;
    }
    if (joinedPrecedesOrEqualsBirth(form.date_of_birth, form.appointment_date)) {
      toast.error(isRtl ? 'تاريخ الالتحاق يجب أن يكون بعد تاريخ الميلاد' : 'Joined date must be after birth date');
      return;
    }
    if (findDuplicate('email', form.email)) {
      toast.error(isRtl ? 'البريد الإلكتروني مسجل مسبقًا لموظف آخر' : 'Email already exists for another employee');
      return;
    }
    if (findDuplicate('national_id', normalizeNationalId(form.national_id))) {
      toast.error(isRtl ? 'رقم الهوية الوطنية مسجل مسبقًا لموظف آخر' : 'National ID already exists for another employee');
      return;
    }
    if (findDuplicate('employee_number', form.employee_number)) {
      toast.error(isRtl ? 'الرقم الوظيفي مسجل مسبقًا لموظف آخر' : 'Employee number already exists for another employee');
      return;
    }

    setSaving(true);
    try {
      if (dialogMode === 'add') {
        const created = await apiRequest<ApiEmployee>('/employees/', {
          method: 'POST',
          body: JSON.stringify(buildPayload(form)),
        });
        setEmployees(prev => [created, ...prev]);
        toast.success(isRtl ? 'تم إضافة الموظف وحفظه في PostgreSQL' : 'Employee saved in PostgreSQL');
      } else if (dialogMode === 'edit' && selectedEmployee) {
        const updated = await apiRequest<ApiEmployee>(`/employees/${selectedEmployee.id}/`, {
          method: 'PATCH',
          body: JSON.stringify(buildPayload(form)),
        });
        setEmployees(prev => prev.map(emp => String(emp.id) === String(updated.id) ? updated : emp));
        toast.success(isRtl ? 'تم تعديل بيانات الموظف وحفظها في Django/PostgreSQL' : 'Employee updated in Django/PostgreSQL');
      }
      setOpenDialog(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Save failed';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function prepareRegistryReset(action: 'preview' | 'restore_preview' = 'preview') {
    if (!canBulkReset || registryResetBusy) return;
    setRegistryResetDialog(true);
    setRegistryResetBusy(true);
    setRegistryResetPreview(null);
    setRegistryResetReason('');
    setRegistryResetPhrase('');
    setRegistryResetConfirmed(false);
    try {
      const preview = await apiRequest<RegistryBulkPreview>('/employee-registry-reset/', {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      setRegistryResetPreview(preview);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذرت معاينة التصفير.');
    } finally {
      setRegistryResetBusy(false);
    }
  }

  async function confirmRegistryReset() {
    const preview = registryResetPreview;
    if (!preview || !canBulkReset || registryResetBusy || !registryResetConfirmed ||
        registryResetReason.trim().length < 20 ||
        registryResetReason.trim().length > 500 ||
        registryResetPhrase !== preview.confirm_phrase) return;
    const count = preview.mode === 'preview' ? preview.will_archive : preview.restorable;
    if (!count) return;
    // Last native confirmation to guard against accidental button presses.
    if (!window.confirm(
      preview.mode === 'preview'
        ? `سيتم إخفاء ${count} سجل من قائمة الموظفين النشطين مع الاحتفاظ بالملفات الصحية والهوية. هل تؤكد تنفيذ التصفير القابل للاستعادة؟`
        : `ستتم استعادة ${count} موظفًا من آخر دفعة تصفير. هل تؤكد الاستعادة؟`,
    )) return;
    setRegistryResetBusy(true);
    try {
      const result = await apiRequest<RegistryBulkResult>('/employee-registry-reset/', {
        method: 'POST',
        body: JSON.stringify({
          action: preview.mode === 'preview' ? 'execute' : 'restore',
          preview_token: preview.preview_token,
          reason: registryResetReason.trim(),
          confirm_phrase: registryResetPhrase,
          confirmed: true,
        }),
      });
      setRegistryResetDialog(false);
      setRegistryResetPreview(null);
      setRegistryResetPhrase('');
      setRegistryResetReason('');
      setRegistryResetConfirmed(false);
      setPage(0);
      setShowArchived(false);
      await loadData();
      toast.success(result.mode === 'archived'
        ? `تم تصفير عرض ${result.archived_count} موظفًا بأرشفتهم دون حذف سجلاتهم أو ملفاتهم الصحية.`
        : `تمت استعادة ${result.restored_count} موظفًا من دفعة التصفير.`, { duration: 9000 });
    } catch (error) {
      setRegistryResetPreview(null);
      toast.error((error instanceof Error ? error.message : 'تعذّر تنفيذ الإجراء.') +
        ' أعد المعاينة قبل أي محاولة جديدة.', { duration: 10000 });
    } finally {
      setRegistryResetBusy(false);
    }
  }

  async function prepareTestCardReset(scope: ResetScope = resetScope) {
    setResetBusy(true);
    setResetScope(scope);
    setResetPreview(null);
    setResetConfirmation('');
    setResetAcknowledged(false);
    try {
      const preview = await apiRequest<ResetPreview>('/staging-employee-card-reset/', {
        method: 'POST',
        body: JSON.stringify({ action: 'preview', scope }),
      });
      setResetPreview(preview);
      setResetDialogOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر معاينة بطاقات الاختبار');
    } finally {
      setResetBusy(false);
    }
  }

  async function confirmTestCardReset() {
    if (!resetPreview || resetConfirmation !== RESET_CONFIRMATION_TEXT ||
        !resetAcknowledged || resetBusy) return;
    setResetBusy(true);
    try {
      const result = await apiRequest<ResetResult>('/staging-employee-card-reset/', {
        method: 'POST',
        body: JSON.stringify({
          action: 'reset', scope: resetPreview.scope,
          preview_token: resetPreview.preview_token,
          confirm_text: resetConfirmation,
          acknowledge_irreversible: true,
        }),
      });
      setResetDialogOpen(false);
      setResetPreview(null);
      setResetConfirmation('');
      setResetAcknowledged(false);
      setPage(0);
      await loadData();
      toast.success(`تم تصفير ${result.deleted_test_cards} بطاقة اختبار. السجلات المتبقية: ${result.remaining_employee_cards}.`);
    } catch (error) {
      setResetPreview(null);
      toast.error((error instanceof Error ? error.message : 'تعذر التصفير') +
        ' — أعد معاينة البيانات قبل إعادة المحاولة.');
    } finally {
      setResetBusy(false);
    }
  }

  function openArchiveDialog(employee: ApiEmployee, action: 'archive' | 'restore') {
    if (!canArchive) return;
    setArchiveTarget(employee);
    setArchiveAction(action);
    setArchiveReason('');
    setArchiveConfirmed(false);
  }

  async function confirmArchiveAction() {
    if (!archiveTarget || !canArchive || !archiveConfirmed || archiveBusy) return;
    const reason = archiveReason.trim();
    if (reason.length < 10 || reason.length > 500) {
      toast.error(isRtl ? 'يرجى كتابة سبب واضح من 10 إلى 500 حرف.' : 'Provide a 10–500 character reason.');
      return;
    }
    setArchiveBusy(true);
    try {
      await apiRequest(`/employees/${archiveTarget.id}/${archiveAction}/`, {
        method: 'POST',
        body: JSON.stringify({ reason, confirmed: true }),
      });
      setArchiveTarget(null);
      setArchiveReason('');
      setArchiveConfirmed(false);
      if (employees.length === 1 && page > 0) setPage(page - 1);
      else await loadData();
      toast.success(
        archiveAction === 'archive'
          ? (isRtl ? 'تم حذف الموظف من القائمة وحفظ سبب الحذف دون حذف ملفه الصحي.' : 'Employee archived; reason and health history preserved.')
          : (isRtl ? 'تمت استعادة الموظف إلى القائمة، مع توثيق السبب.' : 'Employee restored and action recorded.'),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (isRtl ? 'تعذر تنفيذ العملية.' : 'Action failed.'));
    } finally {
      setArchiveBusy(false);
    }
  }

  const activeOnPage = employees.filter(emp => emp.employment_status === 'active').length;
  const sourceOtherOnPage = employees.filter(emp =>
    Boolean(emp.roster_source_status) && emp.roster_source_status !== 'تعيين نشط'
  ).length;
  const isReadOnly = dialogMode === 'view';

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <PeopleIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">{t('employees')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {totalCount} {showArchived
                ? (isRtl ? 'سجلًا محذوفًا محفوظًا قابلًا للاستعادة' : 'archived employees available to restore')
                : (isRtl ? 'موظف — مرتبطة بياناتهم بقاعدة PostgreSQL' : 'employees in PostgreSQL')}
            </Typography>
          </Box>
        </Box>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" justifyContent="flex-end">
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => void loadData()} disabled={loading}>
            {isRtl ? 'تحديث' : 'Refresh'}
          </Button>
          {can(PERMISSIONS.EXPORT_REPORTS) && (
            <Button variant="contained" color="primary" startIcon={<EmployeeReportIcon />}
              onClick={() => {
                const filters = new URLSearchParams();
                if (searchTerm.trim()) filters.set('search', searchTerm.trim());
                if (centerFilter !== 'all') filters.set('health_center_id', centerFilter);
                if (statusFilter !== 'all') filters.set('employment_status', statusFilter);
                if (sourceFilter !== 'all') filters.set('source_category', sourceFilter);
                if (sortMode) filters.set('sort', sortMode);
                if (showArchived) filters.set('archived', 'true');
                navigate('/employees/report?' + filters.toString());
              }}>
              {isRtl ? 'تقرير الموظفين' : 'Employee Report'}
            </Button>
          )}
          {can(PERMISSIONS.MANAGE_USERS) && (
            <Button variant="outlined" startIcon={<WorkHistoryIcon />} onClick={() => navigate('/admin/employee-lifecycle')}>
              {isRtl ? 'الحالات الوظيفية والمتقاعدون' : 'Employment Lifecycle'}
            </Button>
          )}
          {can(PERMISSIONS.MANAGE_USERS) && (
            <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => navigate('/admin/workforce-roster-preview')}>
              {isRtl ? 'فحص الملف الجديد' : 'Preview Current Roster'}
            </Button>
          )}
          {can(PERMISSIONS.MANAGE_USERS) && (
            <Button variant="outlined" color="warning" startIcon={<UploadFileIcon />}
              onClick={() => navigate('/employees/pending-import')}>
              {isRtl ? 'بطاقات الموظفين قيد الاستكمال' : 'Pending employee review cards'}
            </Button>
          )}
          {can(PERMISSIONS.MANAGE_USERS) && (
            <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => navigate('/employees/import')}>
              {isRtl ? 'استيراد Excel' : 'Import Excel'}
            </Button>
          )}
          {canArchive && (
            <Button variant={showArchived ? 'contained' : 'outlined'} color={showArchived ? 'error' : 'inherit'}
              startIcon={showArchived ? <RestoreEmployeeIcon /> : <DeleteEmployeeIcon />}
              onClick={() => { setShowArchived(value => !value); setPage(0); }}>
              {showArchived
                ? (isRtl ? 'العودة إلى الموظفين' : 'Back to Employees')
                : (isRtl ? 'الموظفون المحذوفون' : 'Archived Employees')}
            </Button>
          )}
          {canBulkReset && !IS_STAGING_UI && (
            <Button variant="outlined" color="error" startIcon={<ResetTestCardsIcon />}
              disabled={registryResetBusy} onClick={() => void prepareRegistryReset('preview')}>
              {isRtl ? 'تصفير' : 'Reset'}
            </Button>
          )}
          {IS_STAGING_UI && can(PERMISSIONS.MANAGE_USERS) && (
            <Button variant="outlined" color="error" startIcon={<ResetTestCardsIcon />}
              disabled={resetBusy} onClick={() => void prepareTestCardReset('all_synthetic')}>
              {isRtl ? 'تصفير بطاقات الاختبار' : 'Clear QA test cards'}
            </Button>
          )}
          {can(PERMISSIONS.CREATE_EMPLOYEE) && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
              {t('addEmployee')}
            </Button>
          )}
        </Stack>
      </Box>

      {connectionError && <Alert severity="warning" sx={{ mb: 2 }}>{connectionError}</Alert>}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: isRtl ? 'إجمالي نتائج البحث والتصفية' : 'Total matched employees', value: totalCount, color: 'primary.main' },
          { label: isRtl ? 'المعروض في الصفحة' : 'Shown on this page', value: employees.length, color: 'info.main' },
          { label: isRtl ? 'على رأس العمل — هذه الصفحة' : 'Active — current page', value: activeOnPage, color: 'success.main' },
          { label: isRtl ? 'حالة مصدر مختلفة — هذه الصفحة' : 'Other source conditions — page', value: sourceOtherOnPage, color: 'warning.main' },
        ].map(item => (
          <Grid key={item.label} size={{ xs: 6, sm: 3 }}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4" fontWeight="bold" color={item.color}>{item.value}</Typography>
              <Typography variant="body2" color="text.secondary">{item.label}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 7 }}>
            <TextField
              fullWidth
              placeholder={(isRtl ? 'بحث بالاسم أو البريد أو الهوية أو الرقم الوظيفي أو الجوال' : 'Search name, email, ID, employee number, or mobile') + '...'}
              value={searchTerm}
              onChange={event => { setSearchTerm(event.target.value); setPage(0); }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <TextField fullWidth select label={isRtl ? 'المركز الصحي' : 'Health Center'} value={centerFilter}
              onChange={event => { setCenterFilter(event.target.value); setPage(0); }}>
              <MenuItem value="all">{isRtl ? 'جميع المراكز' : 'All Centers'}</MenuItem>
              {healthCenters.map(center => <MenuItem key={center.id} value={String(center.id)}>{centerDisplayName(center, isRtl)}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField fullWidth select label={isRtl ? 'الحالة الوظيفية' : 'Employment status'} value={statusFilter}
              onChange={event => { setStatusFilter(event.target.value); setPage(0); }}>
              <MenuItem value="all">{isRtl ? 'جميع الحالات' : 'All statuses'}</MenuItem>
              <MenuItem value="active">{isRtl ? 'على رأس العمل' : 'Active'}</MenuItem>
              <MenuItem value="retired">{isRtl ? 'متقاعد' : 'Retired'}</MenuItem>
              <MenuItem value="transferred">{isRtl ? 'منقول خارج الجهة' : 'Transferred out'}</MenuItem>
              <MenuItem value="separated">{isRtl ? 'منتهية خدمته' : 'Separated'}</MenuItem>
              <MenuItem value="under_review">{isRtl ? 'تحتاج مراجعة' : 'Under review'}</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField fullWidth select label={isRtl ? 'حالة ملف المصدر' : 'Source condition'} value={sourceFilter}
              onChange={event => { setSourceFilter(event.target.value); setPage(0); }}>
              <MenuItem value="all">{isRtl ? 'جميع حالات المصدر' : 'All source conditions'}</MenuItem>
              <MenuItem value="active">{isRtl ? 'تعيين نشط' : 'Source: active'}</MenuItem>
              <MenuItem value="other">{isRtl ? 'حالات إدارية أخرى' : 'Other administrative conditions'}</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField fullWidth select
              label={isRtl ? 'اكتمال بيانات الموظف' : 'Employee data completeness'}
              value={completionFilter}
              onChange={event => { setCompletionFilter(event.target.value); setPage(0); }}>
              <MenuItem value="all">{isRtl ? 'جميع السجلات' : 'All records'}</MenuItem>
              <MenuItem value="missing">{isRtl ? 'بيانات ناقصة — بطاقات صفراء' : 'Incomplete — yellow cards'}</MenuItem>
              <MenuItem value="complete">{isRtl ? 'بيانات مكتملة' : 'Complete records'}</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField fullWidth select label={isRtl ? 'الترتيب' : 'Sort by'} value={sortMode}
              onChange={event => { setSortMode(event.target.value); setPage(0); }}>
              <MenuItem value="newest">{isRtl ? 'الأحدث إضافة' : 'Newest first'}</MenuItem>
              <MenuItem value="oldest">{isRtl ? 'الأقدم إضافة' : 'Oldest first'}</MenuItem>
              <MenuItem value="name">{isRtl ? 'الاسم' : 'Name'}</MenuItem>
              <MenuItem value="employee_number">{isRtl ? 'الرقم الوظيفي' : 'Employee number'}</MenuItem>
            </TextField>
          </Grid>
        </Grid>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2 }}
          justifyContent="space-between" alignItems="center">
          <Typography sx={{ fontSize: 14, color: '#4C6177', fontWeight: 700 }}>
            {isRtl ? 'طريقة العرض' : 'Display mode'}
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button size="small" variant={viewMode === 'cards' ? 'contained' : 'outlined'}
              aria-pressed={viewMode === 'cards'} onClick={() => setViewMode('cards')}>
              {isRtl ? 'بطاقات' : 'Cards'}
            </Button>
            <Button size="small" variant={viewMode === 'table' ? 'contained' : 'outlined'}
              aria-pressed={viewMode === 'table'} onClick={() => setViewMode('table')}>
              {isRtl ? 'جدول' : 'Table'}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {loading ? (
        <Paper sx={{ p: 5, textAlign: 'center' }}>
          <CircularProgress />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            {isRtl ? 'جاري تحميل الموظفين من PostgreSQL...' : 'Loading employees from PostgreSQL...'}
          </Typography>
        </Paper>
      ) : (
        <>
          {viewMode === 'cards' ? (
            <Grid container spacing={2.5} sx={{ mb: 2 }}>
              {filteredEmployees.map(employee => (
                <Grid key={employee.id} size={{ xs: 12, md: 6, xl: 4 }}>
                  <EmployeeRegistryCard
                    employee={employee}
                    missingFields={missingEmployeeOptionalFields(employee)}
                    centerName={getHealthCenterName(employee)}
                    isRtl={isRtl}
                    canWrite={canWrite && !employee.is_archived}
                    canManage={can(PERMISSIONS.MANAGE_USERS)}
                    canArchive={canArchive}
                    onArchive={() => openArchiveDialog(employee, 'archive')}
                    onRestore={() => openArchiveDialog(employee, 'restore')}
                    onView={() => openView(employee)}
                    onEdit={() => openEdit(employee)}
                    onHealthCard={() => navigate(`/employees/${employee.id}/health-card`)}
                    onEmploymentHistory={() => navigate('/admin/employee-lifecycle')}
                  />
                </Grid>
              ))}
            </Grid>
          ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 3, border: '1px solid #D2E0EA' }}>
          <Table stickyHeader sx={{
            '& .MuiTableCell-head': { fontSize: 14, fontWeight: 800, color: '#143452', bgcolor: '#EAF2F9' },
            '& .MuiTableCell-body': { fontSize: 13.5, color: '#203D56', verticalAlign: 'top' },
          }}>
            <TableHead>
              <TableRow>
                <TableCell>{isRtl ? 'الرقم الوظيفي' : 'Employee No.'}</TableCell>
                <TableCell>{isRtl ? 'الاسم الكامل' : 'Full Name'}</TableCell>
                <TableCell>{isRtl ? 'الهوية الوطنية' : 'National ID'}</TableCell>
                <TableCell>{isRtl ? 'البريد الإلكتروني' : 'Email'}</TableCell>
                <TableCell>{isRtl ? 'المركز / المسمى' : 'Center / Job'}</TableCell>
                <TableCell>{isRtl ? 'الحالة الوظيفية' : 'Employment Status'}</TableCell>
                <TableCell>{isRtl ? 'حالة ملف المصدر' : 'Roster source condition'}</TableCell>
                <TableCell>{isRtl ? 'العمر / الخبرة' : 'Age / Experience'}</TableCell>
                <TableCell>{isRtl ? 'الجوال' : 'Mobile'}</TableCell>
                <TableCell align="center">{isRtl ? 'الإجراءات' : 'Actions'}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredEmployees.map(employee => (
                <TableRow key={employee.id} hover sx={missingEmployeeOptionalFields(employee).length && !employee.is_archived
                  ? { bgcolor: '#FFF4C7', '&:hover': { bgcolor: '#FFEBA3' } }
                  : undefined}>
                  <TableCell>{employee.employee_number || '-'}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">{employee.name}</Typography>
                    {employee.is_archived && (
                      <Typography variant="caption" color="error.main" sx={{ display: 'block', mt: 0.5 }}>
                        {isRtl ? 'سبب الحذف: ' : 'Deletion reason: '}{employee.archive_reason || '—'}
                      </Typography>
                    )}
                    {missingEmployeeOptionalFields(employee).length > 0 && (
                      <Chip size="small" color="warning" variant="outlined" sx={{ mt: 0.6 }}
                        title={missingEmployeeOptionalFields(employee).join('، ')}
                        label={isRtl
                          ? `بيانات ناقصة: ${missingEmployeeOptionalFields(employee).length}`
                          : `Optional gaps: ${missingEmployeeOptionalFields(employee).length}`} />
                    )}
                  </TableCell>
                  <TableCell>{maskNationalId(employee.national_id)}</TableCell>
                  <TableCell>{employee.email || '-'}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">{getHealthCenterName(employee)}</Typography>
                    <Typography variant="caption" color="text.secondary">{employee.job_title || '-'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip size="small"
                      color={employee.employment_status === 'under_review' ? 'warning' : employee.employment_status === 'active' || !employee.employment_status ? 'success' : 'default'}
                      label={({
                        active: isRtl ? 'على رأس العمل' : 'Active',
                        retired: isRtl ? 'متقاعد' : 'Retired',
                        separated: isRtl ? 'منتهية خدمته' : 'Separated',
                        transferred: isRtl ? 'منقول خارج الجهة' : 'Transferred Out',
                        under_review: isRtl ? 'تحتاج تحقق' : 'Under Review',
                      } as Record<string, string>)[employee.employment_status || 'active']}
                    />
                  </TableCell>
                  <TableCell sx={{ minWidth: 150 }}>
                    {employee.roster_source_status || (isRtl ? 'غير محددة' : 'Not specified')}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{isRtl ? 'العمر: ' : 'Age: '}{employee.age ?? '-'}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {isRtl ? 'الخبرة: ' : 'Experience: '}{employee.years_of_experience ?? '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>{employee.mobile || '-'}</TableCell>
                  <TableCell align="center" className="employee-registry-actions">
                    <Button size="small" variant="outlined" color="primary" startIcon={<HealthCardIcon />} onClick={() => navigate(`/employees/${employee.id}/health-card`)}>
                      {isRtl ? 'البطاقة الصحية' : 'Health Card'}
                    </Button>
                    <Button size="small" variant="outlined" startIcon={<VisibilityIcon />} onClick={() => openView(employee)}>
                      {isRtl ? 'عرض' : 'View'}
                    </Button>
                    {canWrite && !employee.is_archived && (
                      <Button size="small" variant="outlined" startIcon={<EditIcon />} onClick={() => openEdit(employee)}>
                        {isRtl ? 'تعديل' : 'Edit'}
                      </Button>
                    )}
                    {can(PERMISSIONS.MANAGE_USERS) && (
                      <Button size="small" variant="outlined" startIcon={<WorkHistoryIcon />}
                        onClick={() => navigate('/admin/employee-lifecycle')}>
                        {isRtl ? 'السجل الوظيفي' : 'Employment History'}
                      </Button>
                    )}
                    {canArchive && !employee.is_archived && (
                      <Button size="small" variant="contained" color="error"
                        startIcon={<DeleteEmployeeIcon />}
                        onClick={() => openArchiveDialog(employee, 'archive')}
                        sx={{ mx: 0.5 }}>
                        {isRtl ? 'حذف' : 'Delete'}
                      </Button>
                    )}
                    {canArchive && employee.is_archived && (
                      <Button size="small" variant="contained" color="success"
                        startIcon={<RestoreEmployeeIcon />}
                        onClick={() => openArchiveDialog(employee, 'restore')}
                        sx={{ mx: 0.5 }}>
                        {isRtl ? 'استعادة' : 'Restore'}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
          )}
          {filteredEmployees.length === 0 && (
            <Alert severity="info" sx={{ my: 2 }}>
              {isRtl ? 'لا توجد سجلات مطابقة. غيّر البحث أو التصفية لعرض نتائج أخرى.' :
                'No matching records. Adjust the search or filters.'}
            </Alert>
          )}
          <Paper elevation={0} sx={{ mt: 2, border: '1px solid #D2E0EA', borderRadius: 3 }}>
          <TablePagination
            component="div"
            count={totalCount}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={25}
            rowsPerPageOptions={[25]}
            labelDisplayedRows={({ from, to, count }) =>
              isRtl ? `${from}–${to} من ${count}` : `${from}–${to} of ${count}`}
            labelRowsPerPage={isRtl ? 'لكل صفحة:' : 'Rows per page:'}
          />
          </Paper>
        </>
      )}

      <Dialog open={Boolean(archiveTarget)}
        onClose={() => !archiveBusy && setArchiveTarget(null)}
        maxWidth="sm" fullWidth dir={isRtl ? 'rtl' : 'ltr'}
        PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 900, color: archiveAction === 'archive' ? '#B71C1C' : '#21673B' }}>
          {archiveAction === 'archive'
            ? (isRtl ? 'حذف موظف مع ذكر السبب' : 'Delete employee with reason')
            : (isRtl ? 'استعادة الموظف' : 'Restore employee')}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="body1" fontWeight={800}>
              {archiveTarget?.name || ''}
            </Typography>
            <Alert severity={archiveAction === 'archive' ? 'warning' : 'info'}>
              {archiveAction === 'archive'
                ? (isRtl
                  ? 'سيختفي الموظف من القائمة، لكن ستظل بيانات هويته وملفه الصحي وسجل الحذف محفوظة وقابلة للاستعادة. لن تُحذف التقارير أو الفحوص الطبية.'
                  : 'The employee will disappear from the active list, but their identity, health records and deletion audit history remain safely stored and restorable.')
                : (isRtl
                  ? 'سيعود الموظف إلى القائمة؛ ولن يتغير ملفه الصحي أو وضعه الوظيفي بسبب الاستعادة.'
                  : 'The employee will return to the list; health and employment records remain unchanged.')}
            </Alert>
            <TextField
              autoFocus fullWidth required multiline rows={3}
              label={archiveAction === 'archive'
                ? (isRtl ? 'سبب الحذف *' : 'Deletion reason *')
                : (isRtl ? 'سبب الاستعادة *' : 'Restoration reason *')}
              placeholder={isRtl
                ? 'مثال: إدخال السجل بالخطأ ويحتاج إلى إخفائه لحين التحقق من مصدره.'
                : 'Describe the documented administrative reason.'}
              value={archiveReason}
              onChange={event => setArchiveReason(event.target.value)}
              disabled={archiveBusy}
              inputProps={{ maxLength: 500 }}
              helperText={isRtl
                ? `سبب واضح من 10 إلى 500 حرف، دون ذكر بيانات طبية أو معلومات حساسة. (${archiveReason.trim().length}/500)`
                : `10–500 characters. Avoid medical or sensitive details. (${archiveReason.trim().length}/500)`}
            />
            <FormControlLabel
              control={<Checkbox checked={archiveConfirmed} disabled={archiveBusy}
                onChange={(_, checked) => setArchiveConfirmed(checked)} />}
              label={isRtl
                ? 'أؤكد صحة اختيار الموظف وسبب الإجراء، وأعلم أنه سيُسجل في سجل العمليات.'
                : 'I confirm the employee, the reason, and the audit record.'}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button disabled={archiveBusy} onClick={() => setArchiveTarget(null)}>
            {isRtl ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button variant="contained" color={archiveAction === 'archive' ? 'error' : 'success'}
            startIcon={archiveAction === 'archive' ? <DeleteEmployeeIcon /> : <RestoreEmployeeIcon />}
            disabled={archiveBusy || !archiveConfirmed ||
              archiveReason.trim().length < 10 || archiveReason.trim().length > 500}
            onClick={() => void confirmArchiveAction()}>
            {archiveBusy
              ? (isRtl ? 'جارٍ تنفيذ الإجراء...' : 'Processing...')
              : archiveAction === 'archive'
                ? (isRtl ? 'تأكيد الحذف الآمن' : 'Confirm deletion')
                : (isRtl ? 'تأكيد الاستعادة' : 'Confirm restore')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={registryResetDialog}
        onClose={() => !registryResetBusy && setRegistryResetDialog(false)}
        maxWidth="sm" fullWidth dir={isRtl ? 'rtl' : 'ltr'}
        PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#B71C1C' }}>
          {isRtl ? 'تصفير سجل الموظفين (قابل للاستعادة)' : 'Reversible employee registry reset'}
        </DialogTitle>
        <DialogContent dividers>
          <Stack gap={2}>
            <Alert severity="warning">
              <strong>تنبيه:</strong> هذا الإجراء لا يحذف الموظفين نهائيًا، بل ينقل سجلاتهم
              إلى «الموظفون المحذوفون». لا يمس ملفاتهم الصحية أو تاريخهم الوظيفي.
              وتبقى الهويات والرقم الوظيفي محفوظة، فلا يمكن إعادة استيراد السجلات
              على أنها موظفون جدد.
            </Alert>
            {registryResetBusy && <CircularProgress size={22} />}
            {registryResetPreview?.mode === 'preview' && (
              <>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 1.5 }}>
                  {[
                    ['بطاقات نشطة حاليًا', registryResetPreview.total_active],
                    ['سيجري تصفيرها', registryResetPreview.will_archive],
                    ['مؤرشفة مسبقًا', registryResetPreview.already_archived],
                    ['قابلة لاستعادة دفعة سابقة', registryResetPreview.restorable_from_last_batch],
                  ].map(([label, value]) => (
                    <Paper key={String(label)} variant="outlined"
                      sx={{ p: 1.7, textAlign: 'center', borderRadius: 2 }}>
                      <Typography fontSize={23} fontWeight={900}>{value}</Typography>
                      <Typography variant="caption">{label}</Typography>
                    </Paper>
                  ))}
                </Box>
                {registryResetPreview.restorable_from_last_batch > 0 && (
                  <Button variant="outlined" color="success"
                    disabled={registryResetBusy}
                    onClick={() => void prepareRegistryReset('restore_preview')}>
                    {isRtl ? 'استعادة آخر دفعة تصفير' : 'Restore the last reset batch'}
                  </Button>
                )}
              </>
            )}
            {registryResetPreview?.mode === 'restore_preview' && (
              <Alert severity="info">
                سيتم استعادة {registryResetPreview.restorable} موظفًا من أصل
                {registryResetPreview.previous_batch_total} موظفًا في آخر دفعة.
                لا تشمل العملية أي سجلات مؤرشفة يدويًا خارج تلك الدفعة.
              </Alert>
            )}
            {registryResetPreview && (
              <>
                <TextField fullWidth multiline required rows={3}
                  label={registryResetPreview.mode === 'preview' ? 'سبب التصفير *' : 'سبب الاستعادة *'}
                  placeholder="اكتب المبرر الإداري المعتمد دون بيانات صحية أو تفاصيل حساسة."
                  value={registryResetReason} disabled={registryResetBusy}
                  onChange={event => setRegistryResetReason(event.target.value)}
                  inputProps={{ maxLength: 500 }}
                  helperText={`20–500 حرف. (${registryResetReason.trim().length}/500)`} />
                <TextField fullWidth required disabled={registryResetBusy}
                  label="اكتب عبارة التأكيد كما تظهر أدناه"
                  value={registryResetPhrase}
                  onChange={event => setRegistryResetPhrase(event.target.value)}
                  helperText={registryResetPreview.confirm_phrase} />
                <FormControlLabel
                  control={<Checkbox checked={registryResetConfirmed}
                    disabled={registryResetBusy}
                    onChange={(_, checked) => setRegistryResetConfirmed(checked)}/>}
                  label="أؤكد صحة العدد وسبب الإجراء، وأعلم أنه سيُوثّق في سجل العمليات." />
              </>
            )}
            {!registryResetPreview && !registryResetBusy && (
              <Button variant="outlined" onClick={() => void prepareRegistryReset('preview')}>
                إعادة معاينة العدد
              </Button>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button disabled={registryResetBusy} onClick={() => setRegistryResetDialog(false)}>
            إلغاء
          </Button>
          {registryResetPreview && (
            <Button variant="contained"
              color={registryResetPreview.mode === 'preview' ? 'error' : 'success'}
              disabled={registryResetBusy || !registryResetConfirmed ||
                registryResetReason.trim().length < 20 ||
                registryResetReason.trim().length > 500 ||
                registryResetPhrase !== registryResetPreview.confirm_phrase ||
                (registryResetPreview.mode === 'preview'
                  ? registryResetPreview.will_archive === 0
                  : registryResetPreview.restorable === 0)}
              onClick={() => void confirmRegistryReset()}>
              {registryResetPreview.mode === 'preview'
                ? `تأكيد تصفير ${registryResetPreview.will_archive} موظفًا`
                : `تأكيد استعادة ${registryResetPreview.restorable} موظفًا`}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={resetDialogOpen} onClose={() => !resetBusy && setResetDialogOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontSize: 20, fontWeight: 900, color: '#802c26' }}>
          {isRtl ? 'تصفير بطاقات الموظفين التجريبية' : 'Reset synthetic employee test cards'}
        </DialogTitle>
        <DialogContent dividers>
          <Stack gap={2}>
            <Alert severity="warning" sx={{ fontWeight: 650 }}>
              يقتصر الإجراء على بيانات الاختبار الاصطناعية المؤكدة في Staging فقط.
              لا يشمل سجلات الموظفين الفعلية، أو السجلات التي لديها ملفات صحية أو تاريخ وظيفي مرتبط.
              الحذف نهائي بعد التأكيد.
            </Alert>
            <TextField select fullWidth label="نطاق التصفير" value={resetScope}
              disabled={resetBusy}
              onChange={event => {
                const next = event.target.value as ResetScope;
                setResetScope(next);
                setResetPreview(null);
                setResetAcknowledged(false);
                setResetConfirmation('');
              }}>
              <MenuItem value="all_synthetic">جميع البطاقات التجريبية المؤكدة</MenuItem>
              <MenuItem value="load_only">بطاقات اختبارات التحميل OHP-LOAD فقط</MenuItem>
              <MenuItem value="examples_only">بطاقات الاختبار الأساسية OHP-QA فقط</MenuItem>
            </TextField>
            <Button variant="outlined" disabled={resetBusy} onClick={() => void prepareTestCardReset(resetScope)}>
              معاينة العدد قبل التصفير
            </Button>
            {resetPreview && <>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 1.3 }}>
                {[
                  ['إجمالي بطاقات الموظفين', resetPreview.total_employees],
                  ['بطاقات مؤهلة للتصفير', resetPreview.eligible_count],
                  ['مستبعدة لوجود سجلات مرتبطة', resetPreview.excluded_with_related_records],
                  ['ستبقى محفوظة بعد التصفير', resetPreview.other_records_to_keep],
                ].map(([label, value]) => <Paper key={String(label)} variant="outlined" sx={{ p: 1.6, textAlign: 'center', borderRadius: 2 }}>
                  <Typography fontWeight={900} fontSize={23}>{value}</Typography>
                  <Typography fontSize={12.5} color="text.secondary">{label}</Typography>
                </Paper>)}
              </Box>
              <Typography variant="body2" color="text.secondary">
                من البطاقات المؤهلة: {resetPreview.eligible_load_count} اختبار تحميل،
                و{resetPreview.eligible_example_count} بطاقات QA أساسية.
                {resetPreview.excluded_unverified_markers > 0
                  ? ` وهناك ${resetPreview.excluded_unverified_markers} سجلات تحمل علامة اختبار غير موثقة ولن تُحذف.`
                  : ''}
              </Typography>
              <TextField fullWidth required
                label="اكتب عبارة التأكيد كما هي"
                placeholder={RESET_CONFIRMATION_TEXT}
                value={resetConfirmation}
                onChange={event => setResetConfirmation(event.target.value)}
                helperText={RESET_CONFIRMATION_TEXT}
                disabled={resetBusy || !resetPreview.eligible_count} />
              <FormControlLabel
                control={<Checkbox checked={resetAcknowledged}
                  onChange={(_, checked) => setResetAcknowledged(checked)}
                  disabled={resetBusy || !resetPreview.eligible_count}/>}
                label={<Typography fontSize={13.5} fontWeight={750}>
                  أؤكد حذف بطاقات الاختبار المؤهلة فقط، وأعلم أن هذا الإجراء لا يمكن التراجع عنه.
                </Typography>}/>
            </>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, py: 2, gap: 1 }}>
          <Button disabled={resetBusy} onClick={() => setResetDialogOpen(false)}>إلغاء</Button>
          <Button color="error" variant="contained"
            disabled={resetBusy || !resetPreview?.eligible_count || !resetAcknowledged ||
              resetConfirmation !== RESET_CONFIRMATION_TEXT}
            onClick={() => void confirmTestCardReset()}>
            {resetBusy ? 'جارٍ تنفيذ التصفير...' : `تأكيد تصفير ${resetPreview?.eligible_count || 0} بطاقة`}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle component="div">
          <Typography variant="h6" component="span" fontWeight="bold">
            {dialogMode === 'add'
              ? (isRtl ? 'إضافة موظف جديد' : 'Add Employee')
              : dialogMode === 'edit'
                ? (isRtl ? 'تعديل بيانات الموظف' : 'Edit Employee')
                : (isRtl ? 'بيانات الموظف' : 'Employee Details')}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <HealthCenterAutocomplete
                options={healthCenters} value={form.health_center}
                onChange={value => setForm(prev => ({ ...prev, health_center: value, organization_unit: '' }))}
                label={isRtl ? 'المركز الصحي' : 'Health center'}
                placeholder={isRtl ? 'اختر أو ابحث عن المركز' : 'Select or search for a center'}
                required disabled={isReadOnly}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Autocomplete
                options={availableOrgUnits}
                value={selectedOrgUnit}
                disabled={isReadOnly || availableOrgUnits.length === 0}
                onChange={(_, unit) => updateForm('organization_unit', unit ? String(unit.id) : '')}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                getOptionLabel={option => option.source_path || option.parent_name
                  ? `${option.name} — ${option.parent_name || option.source_path}`
                  : option.name}
                renderInput={params => <TextField {...params}
                  label={isRtl ? 'الجهة / الوحدة التنظيمية المعتمدة' : 'Approved organization unit'}
                  placeholder={isRtl ? 'ابحث عن الجهة أو الوحدة' : 'Search approved organization'}
                  helperText={isRtl
                    ? (approvedOrganizations.length
                      ? 'تُعرض الجهات المعتمدة والمتوافقة مع المركز فقط'
                      : 'بانتظار اعتماد الهيكل التنظيمي')
                    : 'Only officially approved organizational links are available'} />}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth required label={isRtl ? 'اسم الموظف' : 'Name'} value={form.name}
                onChange={event => updateForm('name', event.target.value)} disabled={isReadOnly} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth required label={isRtl ? 'رقم الهوية / الإقامة' : 'National ID / Iqama'} value={form.national_id}
                onChange={event => updateForm('national_id', normalizeNationalId(event.target.value).slice(0, 10))}
                slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 10 } }}
                disabled={isReadOnly} helperText={isRtl ? '10 أرقام، فريد ولا يقبل التكرار' : '10 digits, must be unique'} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Autocomplete
                options={nationalityOptions}
                value={selectedNationality}
                disabled={isReadOnly}
                onChange={(_, option) => updateForm('nationality', option?.code || '')}
                isOptionEqualToValue={(option, value) => option.code === value.code}
                getOptionLabel={option => isRtl ? option.countryAr : option.countryEn}
                filterOptions={(options, state) => {
                  const query = normalizeNationalitySearch(state.inputValue);
                  return query ? options.filter(option => option.searchText.includes(query)) : options;
                }}
                renderInput={params => <TextField {...params}
                  label={isRtl ? 'الجنسية' : 'Nationality'}
                  placeholder={isRtl ? 'ابحث باسم البلد أو الجنسية' : 'Search country or nationality'}
                  helperText={isRtl ? 'السعودية والدول العربية أولاً' : 'Saudi Arabia and Arab countries first'} />}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <CalendarDateField label={isRtl ? 'تاريخ الميلاد' : 'DOB'} value={form.date_of_birth}
                onChange={value => updateForm('date_of_birth', value)} disabled={isReadOnly} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label={isRtl ? 'رقم الجوال' : 'Mobile #'} value={form.mobile}
                onChange={event => updateForm('mobile', event.target.value)} disabled={isReadOnly} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label={isRtl ? 'الرقم الوظيفي' : 'Employee number'} value={form.employee_number}
                onChange={event => updateForm('employee_number', event.target.value)}
                disabled={isReadOnly} helperText={isRtl ? 'فريد ولا يقبل التكرار عند إدخاله' : 'Unique if provided'} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label={isRtl ? 'البريد الإلكتروني' : 'Email'} type="email" value={form.email}
                onChange={event => updateForm('email', event.target.value)} disabled={isReadOnly}
                helperText={isRtl ? 'اختياري، ويجب ألا يتكرر عند إدخاله' : 'Optional and unique if provided'} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Autocomplete
                options={jobTitleOptions}
                value={form.job_title || null}
                onChange={(_, title) => updateForm('job_title', title || '')}
                disabled={isReadOnly}
                renderInput={params => <TextField {...params}
                  label={isRtl ? 'المسمى الوظيفي' : 'Job title'}
                  placeholder={isRtl ? 'اختر أو ابحث عن المسمى الوظيفي' : 'Search job titles'}
                  helperText={isRtl ? '116 مسمى من القائمة المعتمدة' : '116 titles from the reference workbook'} />}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label={isRtl ? 'المسمى الوظيفي (بالإنجليزية)' : 'Job Title'} value={form.job_title_en}
                onChange={event => updateForm('job_title_en', event.target.value)} disabled={isReadOnly}
                helperText={isRtl ? 'ترجمة للمسمى نفسه' : 'Translation of the same title'} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label={isRtl ? 'الوظيفة الحالية' : 'Current role / position'}
                value={form.current_job}
                onChange={event => updateForm('current_job', event.target.value)}
                disabled={isReadOnly} helperText={isRtl ? 'حقل مستقل، يمكن إدخاله يدويًا' : 'Enter manually'} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField select fullWidth label={isRtl ? 'الجنس' : 'Gender'} value={form.gender}
                onChange={event => updateForm('gender', event.target.value as Gender | '')} disabled={isReadOnly}>
                <MenuItem value="">{isRtl ? 'غير محدد' : 'Not specified'}</MenuItem>
                <MenuItem value="male">{isRtl ? 'ذكر' : 'Male'}</MenuItem>
                <MenuItem value="female">{isRtl ? 'أنثى' : 'Female'}</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <CalendarDateField label={isRtl ? 'تاريخ الالتحاق' : 'Joined'} value={form.appointment_date}
                onChange={value => updateForm('appointment_date', value)} disabled={isReadOnly} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField select fullWidth label={isRtl ? 'الحالة الاجتماعية' : 'Marital Status'} value={form.marital_status}
                onChange={event => updateForm('marital_status', event.target.value as MaritalStatus)} disabled={isReadOnly}>
                <MenuItem value="">{isRtl ? 'غير محددة' : 'Not specified'}</MenuItem>
                <MenuItem value="single">{isRtl ? 'أعزب' : 'Single'}</MenuItem>
                <MenuItem value="married">{isRtl ? 'متزوج' : 'Married'}</MenuItem>
                <MenuItem value="divorced">{isRtl ? 'مطلق' : 'Divorced'}</MenuItem>
                <MenuItem value="widowed">{isRtl ? 'أرمل' : 'Widowed'}</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth type="number" label={isRtl ? 'عدد الأطفال' : '# of Child'}
                inputProps={{ min: 0, max: 100, step: 1 }}
                value={form.children_count}
                onChange={event => updateForm('children_count', event.target.value)}
                disabled={isReadOnly} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label={isRtl ? 'العمر (يُحسب تلقائيًا)' : 'Age'}
                value={computedAge}
                helperText={isRtl
                  ? (ageValue === 0 ? 'العمر أقل من سنة. تأكد من سنة الميلاد.' : 'العمر بالسنوات الميلادية المكتملة بعد اختيار تاريخ الميلاد')
                  : (ageValue === 0 ? 'Under one year old. Check birth year.' : 'Completed Gregorian years from date of birth')}
                disabled />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>{isRtl ? 'إغلاق' : 'Close'}</Button>
          {dialogMode !== 'view' && (
            <Button variant="contained" onClick={() => void handleSave()} disabled={saving}>
              {saving ? (isRtl ? 'جاري الحفظ...' : 'Saving...') : (isRtl ? 'حفظ في PostgreSQL' : 'Save to PostgreSQL')}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
