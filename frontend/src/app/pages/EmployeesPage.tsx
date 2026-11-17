import { useEffect, useMemo, useRef, useState } from 'react';
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
  Tab,
  Tabs,
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
import { ImportedEmployeeCardsTab } from '../components/ImportedEmployeeCardsTab';
import { JOB_TITLES, getNationalityOptions, normalizeNationalitySearch } from '../data/employeeFormOptions';
import { isExcludedEmployeeCenter, selectableEmployeeCenters } from '../data/employeeCenterOptions';
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

type ArchivedVisibilityPreview = {
  mode: 'archived_employee_list_visibility_preview';
  operation: 'hide' | 'show';
  scope: 'selected' | 'all';
  count: number;
  confirm_phrase: string;
  preview_token: string;
  permanent_deleted: 0;
  notice: string;
};


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
  organization_unit_name?: string;
  organization_unit_kind?: 'department' | 'sector' | 'center' | 'unit' | '';
  nationality?: string;
  current_job?: string;
  national_address?: string;
  mobile?: string;
  date_of_birth?: string | null;
  birth_place?: string;
  age?: number;
  gender: Gender;
  marital_status?: MaritalStatus;
  health_center: number | string | null;
  source_center_name?: string;
  registration_status?: 'verified' | 'provisional';
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
  ['health_center', 'المركز الصحي أو القسم'],
];
function missingEmployeeOptionalFields(employee: ApiEmployee): string[] {
  return OPTIONAL_EMPLOYEE_FIELDS.filter(([field]) =>
    (field !== 'health_center' || !employee.organization_unit || employee.organization_unit_kind !== 'department') &&
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
    health_center: form.health_center ? Number(form.health_center) : null,
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
  const [completionTarget, setCompletionTarget] = useState<ApiEmployee | null>(null);
  const [completionValues, setCompletionValues] = useState<Record<string, string>>({});
  const [completionReason, setCompletionReason] = useState('');
  const [completionIdentityChecked, setCompletionIdentityChecked] = useState(false);
  const [completionSaving, setCompletionSaving] = useState(false);
  const [form, setForm] = useState<EmployeeForm>(EMPTY_FORM);
  const [affiliationKind, setAffiliationKind] = useState<'center' | 'department'>('center');
  const [completionAffiliationKind, setCompletionAffiliationKind] = useState<'center' | 'department'>('center');
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
  const [registryTab, setRegistryTab] = useState<'approved' | 'imported'>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'imported'
      ? 'imported' : 'approved');
  // Ref avoids a pending initial API fetch overriding a tab explicitly chosen by the user.
  const registryTabSelected = useRef(
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('tab'),
  );
  const [importedTotal, setImportedTotal] = useState<number | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ApiEmployee | null>(null);
  const [archiveAction, setArchiveAction] = useState<'archive' | 'restore'>('archive');
  const [archiveReason, setArchiveReason] = useState('');
  const [archiveConfirmed, setArchiveConfirmed] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [showHiddenArchived, setShowHiddenArchived] = useState(false);
  const [selectedArchivedIds, setSelectedArchivedIds] = useState<number[]>([]);
  const [visibilityPreview, setVisibilityPreview] = useState<ArchivedVisibilityPreview | null>(null);
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [visibilityReason, setVisibilityReason] = useState('');
  const [visibilityTypedPhrase, setVisibilityTypedPhrase] = useState('');
  const [visibilityConfirmed, setVisibilityConfirmed] = useState(false);

  // Keep archived clinical records and the imported administrative roster in separate views.
  // The backend also enforces superuser/dataEntry access to provisional records.
  const canViewImported = Boolean(user?.isSuperuser || user?.role === 'dataEntry');
  const canArchive = can(PERMISSIONS.MANAGE_USERS);
  const canBulkReset = canArchive && user?.isSuperuser === true;
  const archivedFiltersClear = !searchTerm.trim() && centerFilter === 'all' &&
    statusFilter === 'all' && sourceFilter === 'all' && completionFilter === 'all';
  // 'employee' is a beneficiary role, not an operator for other staff records.
  // 'dataEntry' may complete missing demographic fields, but cannot use the
  // broad administrative PATCH action (which correctly requires Django staff).
  const canCompleteMissing = user?.role === 'dataEntry';
  const canWrite = user?.role !== 'employee' && !canCompleteMissing &&
    (can(PERMISSIONS.UPDATE_EMPLOYEE) || can(PERMISSIONS.UPDATE_EMPLOYEE_BASIC));
  const canEditRecord = (employee: ApiEmployee) => !employee.is_archived &&
    (canWrite || (canCompleteMissing &&
      missingEmployeeOptionalFields(employee).length > 0));
  const ageValue = calculateAgeFromIso(form.date_of_birth);
  const computedAge = ageValue === null ? '' : String(ageValue);
  const computedExperience = calculateExperience(form.appointment_date);
  const nationalityOptions = useMemo(() => getNationalityOptions(), []);
  const selectedNationality = nationalityOptions.find(option => option.code === form.nationality) || null;
  // Keep historical center records available for viewing/editing; exclude these labels only from new selections.
  const selectableCenters = useMemo(() => selectableEmployeeCenters(healthCenters), [healthCenters]);
  // An excluded center already assigned to an employee stays visible only for that existing record.
  const legacySelectedCenter = healthCenters.find(center =>
    String(center.id) === form.health_center && isExcludedEmployeeCenter(center));
  const employeeFormCenters = legacySelectedCenter && dialogMode !== 'add'
    ? [...selectableCenters, legacySelectedCenter] : selectableCenters;
  const availableOrgUnits = approvedOrganizations.filter(unit =>
    unit.is_approved && unit.is_active &&
    (unit.kind === 'center' || unit.kind === 'unit') &&
    unit.health_center_id !== null && String(unit.health_center_id) === form.health_center);
  const approvedDepartments = approvedOrganizations.filter(unit =>
    unit.is_approved && unit.is_active && unit.kind === 'department' &&
    unit.health_center_id === null);
  const selectedOrgUnit = approvedOrganizations.find(item => String(item.id) === form.organization_unit) || null;
  // Preserve a legacy/imported title in edit mode even when it is not in the 116-item reference file.
  const jobTitleOptions = form.job_title && !JOB_TITLES.includes(form.job_title)
    ? [form.job_title, ...JOB_TITLES] : [...JOB_TITLES];

  async function loadData() {
    setLoading(true);
    setConnectionError('');
    try {
      const query = new URLSearchParams({ page: String(page + 1) });
      if (showArchived && canArchive) {
        query.set('archived', 'true');
        if (showHiddenArchived && canBulkReset) query.set('hidden', 'true');
      }
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
      const activeTotal = typeof payload.count === 'number' ? payload.count : results.length;
      setTotalCount(activeTotal);
      // When Production has no active employees, open the already-imported roster
      // rather than leaving the administrator on an empty screen. Never switch
      // automatically after an explicit tab choice or during archived searches.
      if (!IS_STAGING_UI && canViewImported && !registryTabSelected.current && !showArchived &&
          archivedFiltersClear && activeTotal === 0 && page === 0) {
        setRegistryTab('imported');
      }
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
      const firstSelectableCenter = selectableEmployeeCenters(centers)[0];
      setHealthCenters(centers);
      setForm(prev => prev.health_center || !firstSelectableCenter
        ? prev : { ...prev, health_center: String(firstSelectableCenter.id) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load centers');
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void loadData(); }, searchTerm ? 350 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchTerm, centerFilter, statusFilter, sourceFilter, completionFilter,
      sortMode, showArchived, showHiddenArchived, canArchive, canBulkReset]);

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
    if (!employee.health_center && employee.organization_unit_kind === 'department') {
      return employee.organization_unit_name || 'قسم معتمد';
    }
    return centerNameById.get(String(employee.health_center)) || employee.health_center_name ||
      (employee.source_center_name ? `بانتظار مطابقة: ${employee.source_center_name}` : 'تبعية غير محددة');
  }

  function openAdd() {
    setSelectedEmployee(null);
    setAffiliationKind('center');
    setForm({ ...EMPTY_FORM, health_center: selectableCenters[0] ? String(selectableCenters[0].id) : '' });
    setDialogMode('add');
    setOpenDialog(true);
  }

  function openEdit(employee: ApiEmployee) {
    if (employee.is_archived) return;
    if (canCompleteMissing) {
      if (missingEmployeeOptionalFields(employee).length === 0) {
        toast.info('بيانات هذا الموظف مكتملة؛ التصحيح يتطلب صلاحية وإجراء منفصلًا.');
        return;
      }
      setCompletionTarget(employee);
      setCompletionValues({});
      setCompletionReason('');
      setCompletionIdentityChecked(false);
      return;
    }
    if (!canWrite) return;
    setSelectedEmployee(employee);
    setAffiliationKind(!employee.health_center && employee.organization_unit_kind === 'department' ? 'department' : 'center');
    setForm(asForm(employee));
    setDialogMode('edit');
    setOpenDialog(true);
  }

  async function saveMissingEmployeeFields() {
    const target = completionTarget;
    if (!canCompleteMissing || !target || target.is_archived || completionSaving ||
        !completionIdentityChecked || completionReason.trim().length < 10 ||
        completionReason.trim().length > 500) return;
    const missingKeys = new Set(
      OPTIONAL_EMPLOYEE_FIELDS.filter(([field]) =>
        !String(target[field] ?? '').trim()
      ).map(([field]) => String(field))
    );
    const fields: Record<string, string | number> = {};
    for (const [field, raw] of Object.entries(completionValues)) {
      const value = raw.trim();
      if (!value) continue;
      if (!missingKeys.has(field)) {
        toast.error('لا يجوز تعديل حقل مسجل مسبقًا من نافذة استكمال البيانات.');
        return;
      }
      fields[field] = field === 'health_center' ? Number(value) : value;
    }
    if (!Object.keys(fields).length) {
      toast.error('أدخل قيمة لحقل ناقص واحد على الأقل.');
      return;
    }
    if (fields.email && !isValidEmployeeEmail(String(fields.email))) {
      toast.error('صيغة البريد الإلكتروني غير صحيحة.');
      return;
    }
    if (fields.date_of_birth && calculateAgeFromIso(String(fields.date_of_birth)) === null) {
      toast.error('تاريخ الميلاد غير صالح.');
      return;
    }
    setCompletionSaving(true);
    try {
      const data = await apiRequest<{ employee: ApiEmployee; completed_fields: string[] }>(
        `/employees/${target.id}/complete-profile/`, {
          method: 'POST',
          body: JSON.stringify({
            identity_checked: true,
            reason: completionReason.trim(),
            fields,
          }),
        },
      );
      setEmployees(old => old.map(item =>
        String(item.id) === String(target.id) ? data.employee : item));
      setCompletionTarget(null);
      setCompletionValues({});
      setCompletionReason('');
      setCompletionIdentityChecked(false);
      toast.success(`تم استكمال ${data.completed_fields.length} حقلًا وتوثيق العملية.`);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر استكمال بيانات الموظف.');
    } finally {
      setCompletionSaving(false);
    }
  }

  function openView(employee: ApiEmployee) {
    setSelectedEmployee(employee);
    setAffiliationKind(!employee.health_center && employee.organization_unit_kind === 'department' ? 'department' : 'center');
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
      [affiliationKind === 'center' ? 'health_center' : 'organization_unit',
       affiliationKind === 'center' ? (isRtl ? 'المركز الصحي' : 'Health center')
         : (isRtl ? 'القسم' : 'Department')],
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

  function resetArchiveVisibilitySelection() {
    setSelectedArchivedIds([]);
    setVisibilityPreview(null);
    setVisibilityReason('');
    setVisibilityTypedPhrase('');
    setVisibilityConfirmed(false);
  }

  async function prepareArchivedVisibility(scope: 'selected' | 'all') {
    if (!showArchived || !canBulkReset || visibilityBusy) return;
    if (scope === 'all' && !archivedFiltersClear) {
      toast.error('لتحديد كل السجلات، أزل فلاتر البحث أولًا حتى لا يُشمل نطاق غير مقصود.');
      return;
    }
    if (scope === 'selected' && selectedArchivedIds.length === 0) return;
    setVisibilityBusy(true);
    setVisibilityPreview(null);
    setVisibilityReason('');
    setVisibilityTypedPhrase('');
    setVisibilityConfirmed(false);
    try {
      const result = await apiRequest<ArchivedVisibilityPreview>(
        '/employees/archived-list-visibility/', {
          method: 'POST',
          body: JSON.stringify({
            action: 'preview',
            mode: showHiddenArchived ? 'show' : 'hide',
            scope,
            ids: scope === 'selected' ? selectedArchivedIds : [],
          }),
        },
      );
      setVisibilityPreview(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذرت معاينة السجلات.');
    } finally {
      setVisibilityBusy(false);
    }
  }

  async function confirmArchivedVisibility() {
    const offer = visibilityPreview;
    if (!offer || !canBulkReset || visibilityBusy || offer.count === 0 ||
        visibilityTypedPhrase !== offer.confirm_phrase || !visibilityConfirmed ||
        visibilityReason.trim().length < 10 || visibilityReason.trim().length > 80) return;
    if (!window.confirm(
      'تأكيد إزالة أو إظهار البطاقات في القائمة الإدارية فقط؟ لا تُحذف بيانات الموظفين نهائيًا.'
    )) return;
    setVisibilityBusy(true);
    try {
      const result = await apiRequest<{ changed: number; permanent_deleted: 0 }>(
        '/employees/archived-list-visibility/', {
          method: 'POST',
          body: JSON.stringify({
            action: 'execute',
            mode: offer.operation,
            scope: offer.scope,
            ids: offer.scope === 'selected' ? selectedArchivedIds : [],
            preview_token: offer.preview_token,
            confirm_phrase: visibilityTypedPhrase,
            reason: visibilityReason.trim(),
            confirmed: true,
          }),
        },
      );
      resetArchiveVisibilitySelection();
      setPage(0);
      await loadData();
      toast.success(
        `تم ${offer.operation === 'hide' ? 'حذف' : 'إظهار'} ${result.changed} سجلًا من العرض فقط. لا توجد بيانات محذوفة نهائيًا.`,
        { duration: 9000 },
      );
    } catch (error) {
      setVisibilityPreview(null);
      toast.error(error instanceof Error ? error.message : 'تعذر تحديث ظهور البطاقات.');
    } finally {
      setVisibilityBusy(false);
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
      {canViewImported && (
        <Paper variant="outlined" sx={{ p: 1, mb: 2, borderRadius: 3, borderColor: '#C4D8E7' }}>
          <Tabs value={registryTab}
            onChange={(_, next: 'approved' | 'imported') => {
              setRegistryTab(next);
              registryTabSelected.current = true;
            }}
            variant="scrollable" scrollButtons="auto"
            aria-label="نوع سجل الموظفين"
            sx={{ '& .MuiTab-root': { fontWeight: 800, minHeight: 46 } }}>
            <Tab value="approved"
              label={isRtl ? `الموظفون في السجل الرئيسي (غير المؤرشفين: ${totalCount})`
                : `Main registry employees (not archived: ${totalCount})`} />
            <Tab value="imported"
              label={isRtl
                ? `الموظفون المستوردون — بطاقات مؤقتة${importedTotal !== null ? ` (${importedTotal})` : ''}`
                : `Imported employees — temporary${importedTotal !== null ? ` (${importedTotal})` : ''}`} />
          </Tabs>
        </Paper>
      )}
      {canViewImported && registryTab === 'imported' ? (
        <ImportedEmployeeCardsTab onCountChange={setImportedTotal} />
      ) : (
        <>
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
            <>
              <Button variant="contained" color="primary" startIcon={<UploadFileIcon />}
                onClick={() => navigate('/employees/provisional')}>
                {isRtl ? 'استيراد Excel المبسّط' : 'Simple Excel Import'}
              </Button>
              <Button variant="outlined" color="inherit"
                onClick={() => navigate('/employees/import')}>
                {isRtl ? 'المراجعة والمطابقة V2' : 'Advanced V2 Review'}
              </Button>
            </>
          )}
          {canArchive && (
            <Button variant={showArchived ? 'contained' : 'outlined'} color={showArchived ? 'error' : 'inherit'}
              startIcon={showArchived ? <RestoreEmployeeIcon /> : <DeleteEmployeeIcon />}
              onClick={() => {
                setShowArchived(value => !value);
                setShowHiddenArchived(false);
                setPage(0);
                resetArchiveVisibilitySelection();
              }}>
              {showArchived
                ? (isRtl ? 'العودة إلى الموظفين' : 'Back to Employees')
                : (isRtl ? 'الموظفون المحذوفون' : 'Archived Employees')}
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
      {can(PERMISSIONS.MANAGE_USERS) && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {isRtl
            ? 'الاستيراد المبسّط يعرض البيانات المستوردة كبطاقات إدارية مؤقتة مستقلة عن السجلات الطبية. يمكنك استكمال النواقص دون إعادة إضافة هوية موجودة؛ للمطابقة النهائية استخدم المراجعة V2.'
            : 'Simple Excel import creates a separate temporary administrative roster, not medical employee records. Complete missing fields there; use V2 review for final reconciliation.'}
        </Alert>
      )}

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

      {showArchived && canBulkReset && <Paper variant="outlined"
        sx={{ p: 2, mb: 2, borderRadius: 2, borderColor: '#ADC7DB' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} gap={1}
          alignItems={{ md: 'center' }} flexWrap="wrap">
          <Typography variant="body2" fontWeight={900}>
            إدارة البطاقات المؤرشفة — {selectedArchivedIds.length} محددة من الصفحة
          </Typography>
          <Button variant="outlined" size="small" disabled={loading || visibilityBusy || !employees.length}
            onClick={() => {
              setSelectedArchivedIds(employees.map(emp => Number(emp.id)));
              setVisibilityPreview(null);
            }}>
            تحديد الكل (هذه الصفحة: {employees.length})
          </Button>
          <Button variant="outlined" size="small" disabled={!selectedArchivedIds.length}
            onClick={() => resetArchiveVisibilitySelection()}>
            إلغاء التحديد
          </Button>
          <Button variant="contained" color={showHiddenArchived ? 'success' : 'error'}
            size="small" disabled={visibilityBusy || !selectedArchivedIds.length}
            onClick={() => void prepareArchivedVisibility('selected')}>
            {showHiddenArchived ? 'إظهار المحدد' : 'حذف المحدد من القائمة'}
          </Button>
          <Button variant="outlined" color={showHiddenArchived ? 'success' : 'error'}
            size="small" disabled={!archivedFiltersClear || !totalCount || visibilityBusy}
            onClick={() => void prepareArchivedVisibility('all')}>
            {showHiddenArchived ? 'إظهار كل السجلات المخفية' :
              `تحديد الكل وحذف من العرض (${totalCount} سجلًا)`}
          </Button>
          <Button variant="outlined" size="small" onClick={() => {
            setShowHiddenArchived(value => !value);
            setPage(0);
            resetArchiveVisibilitySelection();
          }}>
            {showHiddenArchived ? 'عرض الأرشيف الظاهر' : 'عرض المحذوف من القائمة'}
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          الحذف هنا من قائمة العرض فقط، وليس من قاعدة PostgreSQL؛
          جميع الملفات الصحية وسجلات الهوية والأرشفة محفوظة ويمكن إظهارها مجددًا.
          تحديد كل النتائج يتطلب إزالة فلاتر البحث.
        </Typography>
      </Paper>}

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
                  <Box sx={{ position: 'relative' }}>
                    {showArchived && canBulkReset &&
                      <Box sx={{
                        position: 'absolute', top: 5, left: 6, zIndex: 2,
                        borderRadius: 2, bgcolor: 'background.paper',
                        boxShadow: 1,
                      }}>
                        <Checkbox size="small" aria-label="تحديد موظف من الأرشيف"
                          checked={selectedArchivedIds.includes(Number(employee.id))}
                          disabled={visibilityBusy}
                          onChange={(_, checked) => {
                            setVisibilityPreview(null);
                            setSelectedArchivedIds(old => checked
                              ? [...old, Number(employee.id)]
                              : old.filter(id => id !== Number(employee.id)));
                          }}/>
                      </Box>}
                  <EmployeeRegistryCard
                    employee={employee}
                    missingFields={missingEmployeeOptionalFields(employee)}
                    provisional={employee.registration_status === 'provisional'}
                    centerName={getHealthCenterName(employee)}
                    isRtl={isRtl}
                    canWrite={canEditRecord(employee)}
                    canManage={can(PERMISSIONS.MANAGE_USERS)}
                    canArchive={canArchive}
                    onArchive={() => openArchiveDialog(employee, 'archive')}
                    onRestore={() => openArchiveDialog(employee, 'restore')}
                    onView={() => openView(employee)}
                    onEdit={() => openEdit(employee)}
                    onHealthCard={() => navigate(`/employees/${employee.id}/health-card`)}
                    onEmploymentHistory={() => navigate('/admin/employee-lifecycle')}
                  />
                  </Box>
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
                {showArchived && canBulkReset && <TableCell>تحديد</TableCell>}
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
                  {showArchived && canBulkReset && <TableCell>
                    <Checkbox size="small" checked={selectedArchivedIds.includes(Number(employee.id))}
                      onChange={(_, checked) => {
                        setVisibilityPreview(null);
                        setSelectedArchivedIds(old => checked
                          ? [...old, Number(employee.id)]
                          : old.filter(id => id !== Number(employee.id)));
                      }} />
                  </TableCell>}
                  <TableCell>{employee.employee_number || '-'}{employee.registration_status === 'provisional' && (
                    <Chip size="small" color="warning" variant="filled"
                      label={isRtl ? 'تسجيل أولي' : 'Provisional'} sx={{ display: 'flex', mt: 0.5, width: 'fit-content' }} />
                  )}</TableCell>
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
                    {canEditRecord(employee) && (
                      <Button size="small" variant="outlined" startIcon={<EditIcon />}
                        onClick={() => openEdit(employee)}>
                        {canCompleteMissing ? 'استكمال البيانات' :
                          (isRtl ? 'تعديل' : 'Edit')}
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

      <Dialog open={Boolean(visibilityPreview)}
        onClose={() => !visibilityBusy && resetArchiveVisibilitySelection()}
        maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={900}>
          {visibilityPreview?.operation === 'hide'
            ? 'حذف مؤرشفين من قائمة العرض' : 'إعادة إظهار سجلات مؤرشفة'}
        </DialogTitle>
        <DialogContent dividers>
          <Stack gap={1.5}>
            <Alert severity="warning">
              {visibilityPreview?.notice} لا يُسمح بالحذف النهائي للهوية أو الملف الصحي.
            </Alert>
            <Typography fontWeight={900}>
              العدد المشمول: {visibilityPreview?.count || 0}
            </Typography>
            <TextField fullWidth label="سبب الإجراء الإداري (10 إلى 80 حرفًا)"
              value={visibilityReason} onChange={event => setVisibilityReason(event.target.value)}
              inputProps={{ maxLength: 80 }} />
            <TextField fullWidth label="اكتب عبارة التأكيد كما هي"
              value={visibilityTypedPhrase} helperText={visibilityPreview?.confirm_phrase}
              onChange={event => setVisibilityTypedPhrase(event.target.value)} />
            <FormControlLabel
              control={<Checkbox checked={visibilityConfirmed}
                onChange={(_, checked) => setVisibilityConfirmed(checked)} />}
              label="أعلم أن الإجراء يغير قائمة العرض فقط ويحافظ على جميع بيانات الموظفين وسجلاتهم الطبية." />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={visibilityBusy} onClick={resetArchiveVisibilitySelection}>
            إلغاء
          </Button>
          <Button variant="contained" color={visibilityPreview?.operation === 'hide' ? 'error' : 'success'}
            disabled={visibilityBusy || !visibilityPreview?.count || !visibilityConfirmed ||
              visibilityReason.trim().length < 10 ||
              visibilityTypedPhrase !== visibilityPreview?.confirm_phrase}
            onClick={() => void confirmArchivedVisibility()}>
            تأكيد الإجراء
          </Button>
        </DialogActions>
      </Dialog>

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
      <Dialog open={Boolean(completionTarget)}
        onClose={() => !completionSaving && setCompletionTarget(null)}
        maxWidth="md" fullWidth>
        <DialogTitle fontWeight={900}>
          استكمال بيانات الموظف الناقصة
        </DialogTitle>
        <DialogContent dividers>
          {completionTarget && <Stack spacing={2}>
            <Alert severity="info">
              هذه المهمة مخصصة لمستخدم «مدخل بيانات». تحقق من هوية الموظف
              قبل الحفظ. لا يمكن تعديل الاسم أو رقم الهوية أو الحقول المسجلة
              سابقًا، ولا تُعرض البيانات الطبية في هذه النافذة.
            </Alert>
            <Typography fontWeight={800}>
              {completionTarget.name} — {maskNationalId(completionTarget.national_id)}
            </Typography>
            <Grid container spacing={2}>
              {OPTIONAL_EMPLOYEE_FIELDS.filter(([field]) =>
                !String(completionTarget[field] ?? '').trim()
              ).map(([field, label]) => {
                const key = String(field);
                const value = completionValues[key] || '';
                const onChange = (next: string) =>
                  setCompletionValues(old => ({ ...old, [key]: next }));
                return <Grid key={key} size={{ xs: 12, md: 6 }}>
                  {key === 'health_center' ? (
                    <TextField fullWidth select label={label} value={value}
                      disabled={completionSaving}
                      onChange={event => onChange(event.target.value)}>
                      <MenuItem value="">اختر المركز الصحي</MenuItem>
                      {selectableCenters.filter(center => center.is_active !== false).map(center =>
                        <MenuItem key={center.id} value={String(center.id)}>
                          {centerDisplayName(center, isRtl)}
                        </MenuItem>
                      )}
                    </TextField>
                  ) : key === 'gender' ? (
                    <TextField fullWidth select label={label} value={value}
                      disabled={completionSaving}
                      onChange={event => onChange(event.target.value)}>
                      <MenuItem value="">غير محدد</MenuItem>
                      <MenuItem value="male">ذكر</MenuItem>
                      <MenuItem value="female">أنثى</MenuItem>
                    </TextField>
                  ) : key === 'marital_status' ? (
                    <TextField fullWidth select label={label} value={value}
                      disabled={completionSaving}
                      onChange={event => onChange(event.target.value)}>
                      <MenuItem value="">غير محددة</MenuItem>
                      <MenuItem value="single">أعزب</MenuItem>
                      <MenuItem value="married">متزوج</MenuItem>
                      <MenuItem value="divorced">مطلق</MenuItem>
                      <MenuItem value="widowed">أرمل</MenuItem>
                    </TextField>
                  ) : key === 'nationality' ? (
                    <Autocomplete options={nationalityOptions}
                      value={nationalityOptions.find(item => item.code === value) || null}
                      disabled={completionSaving}
                      isOptionEqualToValue={(item, selected) => item.code === selected.code}
                      getOptionLabel={item => isRtl ? item.countryAr : item.countryEn}
                      onChange={(_, item) => onChange(item?.code || '')}
                      renderInput={params => <TextField {...params} label={label} />} />
                  ) : (
                    <TextField fullWidth label={label} disabled={completionSaving}
                      type={key === 'date_of_birth' || key === 'appointment_date'
                        ? 'date' : key === 'email' ? 'email' : 'text'}
                      slotProps={
                        key === 'date_of_birth' || key === 'appointment_date'
                          ? { inputLabel: { shrink: true } } : undefined
                      }
                      value={value}
                      onChange={event => onChange(event.target.value)} />
                  )}
                </Grid>;
              })}
            </Grid>
            <TextField fullWidth multiline minRows={2}
              label="سبب استكمال البيانات والتوثيق"
              placeholder="مثال: تم التحقق من هوية الموظف ومراجعة بياناته من مستند معتمد"
              value={completionReason} disabled={completionSaving}
              onChange={event => setCompletionReason(event.target.value)}
              inputProps={{ maxLength: 500 }}
              helperText="يجب كتابة سبب من 10 إلى 500 حرف، دون بيانات طبية."/>
            <FormControlLabel
              control={<Checkbox checked={completionIdentityChecked}
                disabled={completionSaving}
                onChange={(_, checked) => setCompletionIdentityChecked(checked)}/>}
              label="تحققت من هوية الموظف وصحة الحقول المضافة، وأقر أن البيانات المثبتة سابقًا لن تتغير." />
          </Stack>}
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button disabled={completionSaving} onClick={() => setCompletionTarget(null)}>
            إلغاء
          </Button>
          <Button variant="contained" color="success"
            disabled={completionSaving || !completionIdentityChecked ||
              completionReason.trim().length < 10 ||
              !Object.values(completionValues).some(value => value.trim())}
            onClick={() => void saveMissingEmployeeFields()}>
            {completionSaving ? 'جارٍ الحفظ...' : 'حفظ الحقول الناقصة'}
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
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth select label={isRtl ? 'نوع التبعية الوظيفية *' : 'Employee affiliation *'}
                value={affiliationKind} disabled={isReadOnly || (dialogMode === 'edit' &&
                  Boolean(selectedEmployee?.health_center || selectedEmployee?.organization_unit))}
                onChange={event => {
                  const kind = event.target.value as 'center' | 'department';
                  setAffiliationKind(kind);
                  setForm(prev => ({
                    ...prev, health_center: kind === 'center' ? String(selectableCenters[0]?.id || '') : '',
                    organization_unit: '',
                  }));
                }}
                helperText={isRtl ? 'اختر المركز الصحي أو القسم المركزي المعتمد؛ تغيير التبعية المثبتة يتطلب إجراء نقل معتمدًا' :
                  'Choose a health center or approved department. Existing assignments require a transfer workflow.'}>
                <MenuItem value="center">{isRtl ? 'مركز صحي' : 'Health center'}</MenuItem>
                <MenuItem value="department">{isRtl ? 'قسم' : 'Department'}</MenuItem>
              </TextField>
            </Grid>
            {affiliationKind === 'center' ? <>
              <Grid size={{ xs: 12, md: 6 }}>
                <HealthCenterAutocomplete
                  options={employeeFormCenters} value={form.health_center}
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
                    label={isRtl ? 'الوحدة التابعة للمركز (اختياري)' : 'Center unit (optional)'}
                    placeholder={isRtl ? 'ابحث عن الوحدة' : 'Search for a unit'}
                    helperText={isRtl ? 'تظهر الوحدات المعتمدة التابعة للمركز المختار' : 'Approved units linked to this center'} />}
                />
              </Grid>
            </> : <>
              <Grid size={{ xs: 12 }}>
                <Autocomplete
                  options={approvedDepartments}
                  value={selectedOrgUnit}
                  disabled={isReadOnly || approvedDepartments.length === 0}
                  onChange={(_, unit) => setForm(prev => ({
                    ...prev, organization_unit: unit ? String(unit.id) : '', health_center: '',
                  }))}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  getOptionLabel={option => option.source_path || option.parent_name
                    ? `${option.name} — ${option.parent_name || option.source_path}` : option.name}
                  renderInput={params => <TextField {...params}
                    required label={isRtl ? 'القسم *' : 'Department *'}
                    placeholder={isRtl ? 'اختر القسم المعتمد' : 'Select approved department'}
                    helperText={isRtl ? (approvedDepartments.length
                      ? 'الأقسام المعتمدة فقط؛ لا يلزم اختيار مركز صحي'
                      : 'لا توجد أقسام معتمدة حاليًا؛ اعتمدها من صفحة الهيكل التنظيمي أولًا')
                      : 'Only approved departments are available'} />}
                />
              </Grid>
            </>}
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
        </>
      )}
    </Box>
  );
}
