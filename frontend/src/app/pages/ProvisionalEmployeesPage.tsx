import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem,
  Pagination, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { authFetch, useAuth } from '../context/AuthContext';
import { V4_PRIVATE_UI } from '../data/v4AffiliationHierarchy';

const API = (import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:8000/api'
    : 'https://occupational-health-platform-production.up.railway.app/api')).replace(/\/$/, '');

type Classification = 'name_match' | 'name_review' | 'identifier_review' | 'not_in_registry';
type EmployeeCard = {
  id: number;
  source_row: number;
  name: string;
  masked_id: string;
  center: string;
  job_title: string;
  source_organizational_hierarchy?: Record<string, string>;
  source_review_status?: string;
  source_review_required?: boolean;
  classification: Classification;
  missing_optional: string[];
  temporary_employee_number?: string | null;
  temporary_only: true;
};
type BatchInfo = {
  batch_id: number;
  total: number;
  created_at: string;
  counts: Partial<Record<Classification, number>>;
  temporary_only: true;
  clinical_activated: number;
};
type ListResponse = {
  batch: BatchInfo | null;
  total: number;
  page: number;
  page_size: number;
  items: EmployeeCard[];
};
type LookupResponse = {
  masked_id: string;
  original_record: 'archived' | 'active' | 'none';
  temporary_match: boolean;
  verification_required: boolean;
};
type ApprovalReadiness = {
  mode: 'provisional_final_approval_readiness_read_only';
  batch_id: number | null;
  rows_total: number;
  rows_scanned?: number;
  source_classification?: Partial<Record<Classification, number>>;
  original_registry?: {
    archived: number; active: number; no_original_record: number;
    non_active_employment_status: number;
  };
  archived_active_name_match_for_review?: number;
  approved_center_name_check?: {
    approved_exact_unique: number; missing_in_file: number;
    not_matched_to_approved: number; ambiguous: number;
  };
  cards_missing_any_optional_field?: number;
  optional_fields_missing?: Record<string, number>;
  historical_values_for_missing_source?: {
    same_name_review_only: Record<string, number>;
    different_name_unverified: Record<string, number>;
    blank_in_both_for_matching_name: Record<string, number>;
  };
  official_center_directory?: {
    active_approved_count: number;
    original_linked_center: number;
    original_linked_to_currently_approved_center: number;
    original_source_center_text_available: number;
  };
  source_headers_not_preserved?: boolean;
  approved_count: number;
  clinical_activation_enabled_from_this_report?: false;
  notice: string;
};
type ApprovalPlanStatus =
  | 'technical_review_candidate' | 'identifier_conflict' | 'name_difference'
  | 'missing_original' | 'original_not_archived' | 'not_active_employment'
  | 'archive_provenance_review';
type ApprovalPlan = {
  mode: 'employee_approval_preparation_read_only';
  batch_id: number | null;
  total_source_rows: number;
  total_scanned: number;
  counts: Record<ApprovalPlanStatus, number>;
  approved_employee_count: number;
  approval_technically_possible_to_review: number;
  needs_independent_hr_verification: boolean;
  requires_tested_backup_before_archive_restore: boolean;
  archive_restore_enabled: boolean;
  page: number;
  page_size: number;
  filtered_count: number;
  items: Array<{
    source_row: number; masked_id: string; name: string;
    status: ApprovalPlanStatus; missing_optional_count: number;
    is_approved_employee: false;
  }>;
  note: string;
};
type ConflictReason =
  | 'employee_number_used_by_different_registry_identity'
  | 'email_used_by_different_registry_identity'
  | 'employee_number_repeated_in_excel'
  | 'email_repeated_in_excel'
  | 'import_time_conflict_not_reproduced';
type ConflictDiagnostics = {
  mode: 'identifier_conflict_diagnostics_read_only';
  batch_id: number | null;
  flagged_rows: number;
  counts: Partial<Record<ConflictReason, number>>;
  items: Array<{
    roster_row_id: number;
    source_row: number; masked_id: string; name: string;
    reason_codes: ConflictReason[]; other_excel_rows: number[];
    requires_manual_verification: true; approved: false;
  }>;
  clinical_or_employee_modified: false;
  notice: string;
};
type EmployeeNumberEditSession = {
  source_row: number;
  name: string;
  masked_id: string;
  current_employee_number: string;
  revision: string;
  temporary_only: true;
};
type EmployeeNumberPreview = {
  status: 'preview_only';
  source_row: number;
  masked_new_number: string;
  next_classification: Classification;
  preview_token: string;
  temporary_only: true;
  notice: string;
};
const CONFLICT_REASON_LABELS: Record<ConflictReason, string> = {
  employee_number_used_by_different_registry_identity: 'الرقم الوظيفي مستخدم في السجل الأصلي لهوية مختلفة',
  email_used_by_different_registry_identity: 'البريد الإلكتروني مستخدم في السجل الأصلي لهوية مختلفة',
  employee_number_repeated_in_excel: 'الرقم الوظيفي مكرر بين صفوف Excel لهويات مختلفة',
  email_repeated_in_excel: 'البريد الإلكتروني مكرر بين صفوف Excel لهويات مختلفة',
  import_time_conflict_not_reproduced: 'تعارض مسجل عند الاستيراد؛ لم يعد السبب ظاهرًا بالفحص الحالي',
};
const PLAN_LABELS: Record<ApprovalPlanStatus, string> = {
  technical_review_candidate: 'مطابقة فنية مبدئية — تحتاج تحققًا رسميًا',
  identifier_conflict: 'تعارض معرّفات',
  name_difference: 'اختلاف اسم',
  missing_original: 'لا يوجد سجل أصلي',
  original_not_archived: 'السجل الأصلي غير مؤرشف',
  not_active_employment: 'حالة وظيفية غير نشطة',
  archive_provenance_review: 'دليل الأرشفة يحتاج مراجعة',
};
type NameReviewCategory =
  | 'format_variation' | 'token_order_variation' | 'genealogy_particle_variation'
  | 'incomplete_name' | 'minor_spelling_variation'
  | 'substantial_difference' | 'missing_original';
type NameReviewResponse = {
  mode: 'provisional_employee_name_review_read_only';
  batch_id: number | null;
  total_name_review_rows: number;
  category_counts: Record<NameReviewCategory, number>;
  filtered_count: number;
  page: number;
  page_size: number;
  items: Array<{
    source_row: number; masked_id: string; excel_name: string; original_name: string;
    category: NameReviewCategory;
    requires_human_verification: true; is_approved: false;
    original_employee_modified: false;
  }>;
  auto_approved: 0;
  original_employee_modified: false; clinical_records_modified: false;
  notice: string;
};
const NAME_REVIEW_LABELS: Record<NameReviewCategory, string> = {
  format_variation: 'اختلاف تنسيق أو مسافات',
  token_order_variation: 'اختلاف ترتيب أجزاء الاسم',
  genealogy_particle_variation: 'اختلاف بن / ابن / بنت',
  incomplete_name: 'اسم ناقص أو مختصر',
  minor_spelling_variation: 'اختلاف إملائي بسيط محتمل',
  substantial_difference: 'اختلاف جوهري يحتاج تدقيقًا',
  missing_original: 'الاسم الأصلي غير متاح',
};
type EmployeeTemplatePreflight = {
  mode: 'canonical_employee_excel_preflight_read_only';
  ready: true;
  schema_version: string;
  valid_rows: number;
  organizational_source_levels_preserved?: number;
  source_review_required_count?: number;
  recognized_count: number;
  unrecognized_column_count: number;
  missing_known_headers: string[];
  classification_counts: Partial<Record<Classification, number>>;
  optional_missing_counts: Record<string, number>;
  same_file_already_imported: boolean;
  overlap_with_latest_import: number;
  requires_explicit_new_batch_confirmation: boolean;
  will_create_separate_batch: boolean;
  note: string;
};
const STATUS: Record<Classification, { label: string; color: 'warning' | 'error' | 'info' | 'default' }> = {
  name_match: { label: 'مطابقة أولية — ليست اعتمادًا', color: 'info' },
  name_review: { label: 'اسم مختلف — يحتاج مراجعة', color: 'warning' },
  identifier_review: { label: 'تعارض معرّفات', color: 'error' },
  not_in_registry: { label: 'غير موجود بالسجل الأصلي', color: 'default' },
};
const FIELD_LABELS: Record<string, string> = {
  employee_number: 'الرقم الوظيفي', email: 'البريد الإلكتروني', mobile: 'الجوال',
  national_address: 'العنوان الوطني', date_of_birth: 'تاريخ الميلاد',
  birth_place: 'مكان الميلاد', gender: 'الجنس', marital_status: 'الحالة الاجتماعية',
  nationality: 'الجنسية', job_title: 'المسمى الوظيفي', current_job: 'الوظيفة الحالية',
  appointment_date: 'تاريخ التعيين', job_title_en: 'المسمى الوظيفي بالإنجليزية',
  health_center: 'المركز الصحي (مؤقت)', organization_unit: 'الوحدة التنظيمية (مؤقت)',
};
const errorMessage = async (response: Response) => {
  const payload = await response.json().catch(() => ({}));
  return payload?.detail || payload?.message || 'تعذر تنفيذ العملية.';
};

export function ProvisionalEmployeesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canUse = Boolean(user?.isSuperuser || user?.role === 'dataEntry');
  const isAdmin = Boolean(user?.isSuperuser);
  const [file, setFile] = useState<File | null>(null);
  const [templatePreview, setTemplatePreview] = useState<EmployeeTemplatePreflight | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [templateDownloadBusy, setTemplateDownloadBusy] = useState(false);
  const [confirmSeparateBatch, setConfirmSeparateBatch] = useState(false);
  const [batch, setBatch] = useState<BatchInfo | null>(null);
  const [items, setItems] = useState<EmployeeCard[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  // Keep report and list transport errors separate. A stale page-load failure
  // must not obscure a successful readiness report from the same V4 batch.
  const [listError, setListError] = useState('');
  const [readinessError, setReadinessError] = useState('');
  const [readinessCheckedAt, setReadinessCheckedAt] = useState('');
  const listRequestSequence = useRef(0);
  const readinessInFlight = useRef(false);
  const [editRow, setEditRow] = useState<EmployeeCard | null>(null);
  const [field, setField] = useState('');
  const [fieldValue, setFieldValue] = useState('');
  const [reason, setReason] = useState('');
  const [identityChecked, setIdentityChecked] = useState(false);
  const [lookupId, setLookupId] = useState('');
  const [lookupResult, setLookupResult] = useState<LookupResponse | null>(null);
  const [readiness, setReadiness] = useState<ApprovalReadiness | null>(null);
  const [readinessBusy, setReadinessBusy] = useState(false);
  const [approvalPlan, setApprovalPlan] = useState<ApprovalPlan | null>(null);
  const [approvalPlanBusy, setApprovalPlanBusy] = useState(false);
  const [approvalPlanStatus, setApprovalPlanStatus] = useState('');
  const [nameReview, setNameReview] = useState<NameReviewResponse | null>(null);
  const [nameReviewCategory, setNameReviewCategory] = useState('');
  const [nameReviewBusy, setNameReviewBusy] = useState(false);
  const [conflictDiagnostics, setConflictDiagnostics] = useState<ConflictDiagnostics | null>(null);
  const [conflictDiagnosticsBusy, setConflictDiagnosticsBusy] = useState(false);
  const [editingConflictId, setEditingConflictId] = useState<number | null>(null);
  const [editSession, setEditSession] = useState<EmployeeNumberEditSession | null>(null);
  const [editedEmployeeNumber, setEditedEmployeeNumber] = useState('');
  const [showEditedNumber, setShowEditedNumber] = useState(false);
  const [numberEditPreview, setNumberEditPreview] = useState<EmployeeNumberPreview | null>(null);
  const [numberEditEvidence, setNumberEditEvidence] = useState('');
  const [numberEditReason, setNumberEditReason] = useState('');
  const [numberEditVerified, setNumberEditVerified] = useState(false);
  const [numberEditorBusy, setNumberEditorBusy] = useState(false);
  const [numberEditorError, setNumberEditorError] = useState('');




  const load = async (current = page, query = search, status = category) => {
    if (!canUse) return;
    const requestSequence = ++listRequestSequence.current;
    try {
      setBusy(true);
      const params = new URLSearchParams({ page: String(current) });
      if (query.trim()) params.set('search', query.trim());
      if (status) params.set('classification', status);
      const response = await authFetch(API + '/provisional-employees/?' + params.toString());
      if (!response.ok) throw new Error(await errorMessage(response));
      const data: ListResponse = await response.json();
      if (requestSequence !== listRequestSequence.current) return;
      setItems(data.items);
      setTotal(data.total);
      if (readiness && readiness.batch_id !== data.batch?.batch_id) setReadiness(null);
      if (approvalPlan && approvalPlan.batch_id !== data.batch?.batch_id) setApprovalPlan(null);
      if (conflictDiagnostics && conflictDiagnostics.batch_id !== data.batch?.batch_id) setConflictDiagnostics(null);
      if (nameReview && nameReview.batch_id !== data.batch?.batch_id) setNameReview(null);
      setBatch(data.batch);
      setListError('');
    } catch (caught) {
      if (requestSequence === listRequestSequence.current) {
        setListError(caught instanceof Error ? caught.message : 'تعذر تحميل قائمة البطاقات.');
      }
    } finally {
      if (requestSequence === listRequestSequence.current) setBusy(false);
    }
  };

  useEffect(() => { void load(1, '', ''); }, [canUse]);

  const downloadApprovedTemplate = async () => {
    if (!isAdmin || templateDownloadBusy) return;
    setTemplateDownloadBusy(true);
    setError('');
    try {
      const response = await authFetch(API + '/employee-roster-template/');
      if (!response.ok) throw new Error(await errorMessage(response));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = 'OHP_Employee_Approved_Template_V3.xlsx';
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تنزيل القالب المعتمد.');
    } finally {
      setTemplateDownloadBusy(false);
    }
  };

  const previewApprovedWorkbook = async () => {
    if (!file || !isAdmin || previewBusy || busy) return;
    setPreviewBusy(true);
    setError('');
    setTemplatePreview(null);
    setConfirmSeparateBatch(false);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await authFetch(
        API + '/provisional-employees/template-preflight/',
        { method: 'POST', body },
      );
      if (!response.ok) throw new Error(await errorMessage(response));
      const result: EmployeeTemplatePreflight = await response.json();
      if (!result.ready) throw new Error('الملف غير جاهز للاستيراد.');
      setTemplatePreview(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر فحص ملف Excel.');
    } finally {
      setPreviewBusy(false);
    }
  };

  const importFile = async () => {
    if (!file || !isAdmin || busy || !templatePreview?.ready ||
        templatePreview.same_file_already_imported ||
        (templatePreview.requires_explicit_new_batch_confirmation && !confirmSeparateBatch)) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const body = new FormData();
      body.append('file', file);
      if (templatePreview.requires_explicit_new_batch_confirmation && confirmSeparateBatch) {
        body.append('confirm_new_batch', 'true');
      }
      const response = await authFetch(API + '/provisional-employees/import/', { method: 'POST', body });
      if (!response.ok) throw new Error(await errorMessage(response));
      const result = await response.json();
      setMessage(result.message || 'تم استيراد القائمة الإدارية المؤقتة.');
      setFile(null);
      setTemplatePreview(null);
      setConfirmSeparateBatch(false);
      setPage(1);
      setSearch('');
      setCategory('');
      await load(1, '', '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'فشل استيراد الملف.');
    } finally {
      setBusy(false);
    }
  };

  const applySearch = async () => {
    if (/\d/.test(search) || /[٠-٩]/.test(search)) {
      setError('ابحث بالاسم فقط؛ استخدم الاستعلام الآمن أدناه للهوية.');
      return;
    }
    setPage(1);
    await load(1, search, category);
  };

  const lookup = async () => {
    const value = lookupId.trim();
    if (!/^[0-9٠-٩]{10}$/.test(value)) {
      setError('أدخل رقم هوية من 10 أرقام.');
      return;
    }
    setBusy(true);
    try {
      const response = await authFetch(API + '/provisional-employees/lookup/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ national_id: value }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      setLookupResult(await response.json());
      setLookupId('');
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر الاستعلام.');
    } finally {
      setBusy(false);
    }
  };

  const checkReadiness = async () => {
    if (!isAdmin || readinessInFlight.current) return;
    readinessInFlight.current = true;
    setReadinessBusy(true);
    setReadinessError('');
    try {
      const response = await authFetch(API + '/provisional-employees/readiness/');
      if (!response.ok) throw new Error(await errorMessage(response));
      const result: ApprovalReadiness = await response.json();
      if (batch && result.batch_id !== batch.batch_id) {
        setReadiness(null);
        setReadinessError('تغيرت دفعة الموظفين أثناء الفحص؛ أعد فتح القائمة قبل الاعتماد على التقرير.');
      } else {
        setReadiness(result);
        setReadinessError('');
        setReadinessCheckedAt(new Date().toLocaleTimeString('ar-SA'));
      }
    } catch (caught) {
      // A failed browser request does not imply that the server failed or that
      // imported cards disappeared. Leave any previous successful report visible.
      setReadinessError('تعذر عرض نتيجة فحص الجاهزية: ' +
        (caught instanceof Error ? caught.message : 'انقطع اتصال المتصفح بالخادم.') +
        ' البطاقات محفوظة؛ لا تُعد استيراد Excel.');
    } finally {
      readinessInFlight.current = false;
      setReadinessBusy(false);
    }
  };

  const loadApprovalPlan = async (nextPage = 1, nextStatus = approvalPlanStatus) => {
    if (!isAdmin || approvalPlanBusy) return;
    setApprovalPlanBusy(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(nextPage) });
      if (nextStatus) params.set('status', nextStatus);
      const response = await authFetch(API + '/provisional-employees/approval-plan/?' + params.toString());
      if (!response.ok) throw new Error(await errorMessage(response));
      const result: ApprovalPlan = await response.json();
      setApprovalPlan(result);
      setApprovalPlanStatus(nextStatus);
      if (batch && result.batch_id !== batch.batch_id) {
        setError('تغيرت الدفعة الحالية؛ أعد تحميل الصفحة قبل متابعة كشف الاعتماد.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر إعداد كشف المرشحين للمراجعة.');
      setApprovalPlan(null);
    } finally {
      setApprovalPlanBusy(false);
    }
  };

  const loadNameReview = async (nextPage = 1, nextCategory = nameReviewCategory) => {
    if (!isAdmin || nameReviewBusy) return;
    setNameReviewBusy(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(nextPage) });
      if (nextCategory) params.set('category', nextCategory);
      const response = await authFetch(API + '/provisional-employees/name-review/?' + params.toString());
      if (!response.ok) throw new Error(await errorMessage(response));
      const result: NameReviewResponse = await response.json();
      setNameReview(result);
      setNameReviewCategory(nextCategory);
      if (batch && result.batch_id !== batch.batch_id) {
        setNameReview(null);
        setError('تغيرت دفعة الموظفين الحالية؛ حدّث الصفحة قبل مقارنة الأسماء.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر مقارنة الأسماء.');
      setNameReview(null);
    } finally {
      setNameReviewBusy(false);
    }
  };

  const diagnoseConflicts = async () => {
    if (!isAdmin || conflictDiagnosticsBusy) return;
    setConflictDiagnosticsBusy(true);
    setError('');
    try {
      const response = await authFetch(API + '/provisional-employees/conflict-diagnostics/');
      if (!response.ok) throw new Error(await errorMessage(response));
      const result: ConflictDiagnostics = await response.json();
      setConflictDiagnostics(result);
      if (batch && result.batch_id !== batch.batch_id) {
        setError('تغيرت دفعة الموظفين؛ أعد فتح الصفحة قبل الاعتماد على نتيجة التشخيص.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تشخيص تعارض المعرّفات.');
      setConflictDiagnostics(null);
    } finally {
      setConflictDiagnosticsBusy(false);
    }
  };

  const closeNumberEditor = () => {
    setEditingConflictId(null);
    setEditSession(null);
    setEditedEmployeeNumber('');
    setShowEditedNumber(false);
    setNumberEditPreview(null);
    setNumberEditEvidence('');
    setNumberEditReason('');
    setNumberEditVerified(false);
    setNumberEditorError('');
  };

  const openNumberEditor = async (rowId: number) => {
    if (!isAdmin || numberEditorBusy) return;
    setNumberEditorBusy(true);
    setNumberEditorError('');
    try {
      const response = await authFetch(API + '/provisional-employees/' + rowId + '/employee-number-edit/');
      if (!response.ok) throw new Error(await errorMessage(response));
      const details: EmployeeNumberEditSession = await response.json();
      setEditSession(details);
      setEditingConflictId(rowId);
      setEditedEmployeeNumber(details.current_employee_number || '');
      setNumberEditPreview(null);
      setNumberEditEvidence('');
      setNumberEditReason('');
      setNumberEditVerified(false);
      setShowEditedNumber(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر فتح محرر الرقم الوظيفي.');
    } finally {
      setNumberEditorBusy(false);
    }
  };

  const previewNumberEdit = async () => {
    if (!editingConflictId || !editSession || numberEditorBusy ||
        !editedEmployeeNumber.trim()) return;
    setNumberEditorBusy(true);
    setNumberEditorError('');
    setNumberEditPreview(null);
    try {
      const response = await authFetch(
        API + '/provisional-employees/' + editingConflictId + '/employee-number-edit/',
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'preview', employee_number: editedEmployeeNumber.trim() }) },
      );
      if (!response.ok) throw new Error(await errorMessage(response));
      const preview: EmployeeNumberPreview = await response.json();
      setNumberEditPreview(preview);
    } catch (caught) {
      setNumberEditorError(caught instanceof Error ? caught.message : 'تعذر معاينة التصحيح.');
    } finally {
      setNumberEditorBusy(false);
    }
  };

  const saveNumberEdit = async () => {
    if (!editingConflictId || !editSession || !numberEditPreview ||
        !numberEditVerified || numberEditEvidence.trim().length < 8 ||
        numberEditReason.trim().length < 10 || numberEditorBusy) return;
    setNumberEditorBusy(true);
    setNumberEditorError('');
    try {
      const response = await authFetch(
        API + '/provisional-employees/' + editingConflictId + '/employee-number-edit/',
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'commit', employee_number: editedEmployeeNumber.trim(),
            preview_token: numberEditPreview.preview_token,
            verified_hr_document: true, confirmed: true,
            evidence_reference: numberEditEvidence.trim(), reason: numberEditReason.trim(),
          }) },
      );
      if (!response.ok) throw new Error(await errorMessage(response));
      const saved = await response.json();
      closeNumberEditor();
      setMessage(saved.notice || 'تم تعديل الرقم الوظيفي في البطاقة المؤقتة.');
      setReadiness(null);
      setApprovalPlan(null);
      setConflictDiagnostics(null);
      await load(1, search, category);
    } catch (caught) {
      setNumberEditorError(caught instanceof Error ? caught.message : 'تعذر حفظ التصحيح.');
    } finally {
      setNumberEditorBusy(false);
    }
  };

  const openCompletion = (row: EmployeeCard) => {
    setEditRow(row);
    setField(row.missing_optional[0] || '');
    setFieldValue('');
    setReason('');
    setIdentityChecked(false);
  };
  const complete = async () => {
    if (!editRow || !field || !fieldValue.trim() || reason.trim().length < 10 ||
        !identityChecked || busy) return;
    setBusy(true);
    try {
      const response = await authFetch(API + '/provisional-employees/' + editRow.id + '/complete/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identity_checked: true, reason: reason.trim(), fields: { [field]: fieldValue.trim() },
        }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      setEditRow(null);
      setMessage('تم استكمال الحقل في البطاقة الإدارية المؤقتة فقط.');
      setError('');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر استكمال البطاقة.');
    } finally {
      setBusy(false);
    }
  };

  const pages = useMemo(() => Math.max(1, Math.ceil(total / 24)), [total]);
  if (!canUse) {
    return <Alert severity="warning">هذه القائمة الإدارية المؤقتة متاحة للمسؤول الأعلى ومدخل البيانات فقط.</Alert>;
  }
  return <Box dir="rtl" sx={{ maxWidth: 1280, mx: 'auto', pb: 7 }}>
    <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }}
      justifyContent="space-between" gap={2} sx={{ mb: 2 }}>
      <Box>
        <Typography variant="h4" fontWeight={900}>استيراد مبسّط للموظفين</Typography>
        <Typography color="text.secondary" variant="body2">قائمة إدارية مؤقتة مستقلة عن ملفات المرضى والسجل الأصلي</Typography>
      </Box>
      <Stack direction="row" spacing={1} flexWrap="wrap">
        <Button variant="outlined" onClick={() => navigate('/employees')}>العودة إلى الموظفين</Button>
        <Button variant="text" onClick={() => navigate('/employees/import')}>مراجعة ومطابقة V2</Button>
      </Stack>
    </Stack>

    <Alert severity="warning" sx={{ mb: 2 }}>
      هذه بطاقات إدارية مؤقتة بانتظار المطابقة، وليست موظفين مفعلين أو ملفات صحية معتمدة.
      لا تُستخدم نتائجها لفتح سجل طبي أو نقل موظف أو فك الأرشفة.
    </Alert>

    {isAdmin && <Paper sx={{ p: 3, mb: 2, borderRadius: 3 }}>
      <Stack direction={{ xs: 'column', md: 'row' }}
        gap={1} alignItems={{ md: 'center' }} justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Typography variant="h6" fontWeight={800}>{V4_PRIVATE_UI ? 'إدراج دفعة الموظفين الموحدة — هيكلة V4' : 'استيراد موظفين باستخدام القالب المعتمد V3'}</Typography>
        <Button variant="outlined" color="success" disabled={templateDownloadBusy}
          onClick={() => void downloadApprovedTemplate()}>
          {templateDownloadBusy ? 'جارٍ تنزيل القالب...' : 'تنزيل قالب الموظفين المعتمد V3'}
        </Button>
      </Stack>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={2} alignItems={{ md: 'center' }}>
        <Button component="label" variant="outlined">
          {file ? file.name : 'اختيار ملف Excel'}
          <input type="file" hidden accept=".xlsx" onChange={event => {
            setFile(event.target.files?.[0] || null);
            setTemplatePreview(null);
            setConfirmSeparateBatch(false);
          }} />
        </Button>
        <Button variant="outlined" disabled={!file || busy || previewBusy}
          onClick={() => void previewApprovedWorkbook()}>
          {previewBusy ? 'جارٍ فحص الملف...' : 'فحص الملف قبل الاستيراد'}
        </Button>
        <Button variant="contained" disabled={!file || busy || previewBusy ||
          !templatePreview?.ready || templatePreview.same_file_already_imported ||
          (templatePreview.requires_explicit_new_batch_confirmation && !confirmSeparateBatch)}
          onClick={importFile}>
          {V4_PRIVATE_UI && templatePreview?.schema_version === 'OHP-EMPLOYEE-ORGANIZATIONAL-V4'
            ? `إدراج ${templatePreview.valid_rows} بطاقة إدارية مؤقتة` : 'استيراد البطاقات الإدارية'}
        </Button>
      </Stack>
      {templatePreview && <Stack gap={1.2} sx={{ mt: 2 }}>
        <Alert severity={templatePreview.unrecognized_column_count ? 'warning' : 'success'}>
          تمت قراءة {templatePreview.valid_rows} موظفًا، والتعرف على {templatePreview.recognized_count} عمودًا.
          {templatePreview.schema_version === 'OHP-EMPLOYEE-ORGANIZATIONAL-V4'
            ? ' ملف V4 مطابق: تحفظ الهيكلة التنظيمية في 13 حقلًا مستقلًا دون اعتماد تلقائي.'
            : templatePreview.schema_version === 'OHP-EMPLOYEE-TEMPLATE-V3'
              ? ' الملف مطابق للقالب المعتمد V3.'
              : ' الملف بتنسيق سابق متوافق؛ يفضل استعمال القالب المعتمد V3.'}
          {templatePreview.unrecognized_column_count > 0
            ? ' توجد أعمدة غير معروفة لن تُستورد: ' + templatePreview.unrecognized_column_count + '.'
            : ''}
        </Alert>
        {V4_PRIVATE_UI && templatePreview.schema_version === 'OHP-EMPLOYEE-ORGANIZATIONAL-V4' && (
          <Alert severity="warning">
            سيُحفظ {templatePreview.valid_rows} سجلًا إداريًا مؤقتًا مع {templatePreview.organizational_source_levels_preserved || 0} مستوى تنظيمي.
            {templatePreview.source_review_required_count || 0} سجلات عليها ملاحظات تصنيفية ستبقى ظاهرة للمراجعة؛
            لن تُعتمد تبعية أي موظف أو تُنشأ بطاقة طبية تلقائيًا.
          </Alert>
        )}
        <Stack direction="row" gap={1} flexWrap="wrap">
          <Chip size="small" color="info"
            label={'مطابقة أولية: ' + (templatePreview.classification_counts.name_match || 0)} />
          <Chip size="small" color="warning"
            label={'اختلاف أسماء: ' + (templatePreview.classification_counts.name_review || 0)} />
          <Chip size="small" color="error"
            label={'تعارض معرّفات: ' + (templatePreview.classification_counts.identifier_review || 0)} />
          <Chip size="small" variant="outlined"
            label={'حقول معروفة لكنها غير موجودة في الملف: ' + templatePreview.missing_known_headers.length} />
        </Stack>
        {templatePreview.same_file_already_imported && <Alert severity="info">
          سبق استيراد الملف نفسه. لن ننشئ نسخة مكررة منه.
        </Alert>}
        {templatePreview.requires_explicit_new_batch_confirmation && <Alert severity="warning">
          يوجد {templatePreview.overlap_with_latest_import} رقم هوية من الملف موجودًا في
          الدفعة المؤقتة الحالية. الرفع الجديد ينشئ دفعة مستقلة ولا يدمج تصحيحات
          البطاقات القديمة تلقائيًا. تأكد أن هذا الإجراء مقصود.
          <FormControlLabel control={<Checkbox checked={confirmSeparateBatch}
            onChange={(_, checked) => setConfirmSeparateBatch(checked)} />}
            label="أُقر بأنني أرفع دفعة جديدة مستقلة، وأن بيانات الدفعة الحالية ستبقى محفوظة دون دمج تلقائي." />
        </Alert>}
      </Stack>}
      <Typography variant="caption" color="text.secondary">
        قد تظهر البطاقات المؤقتة هنا دون ظهورها في جدول السجل الطبي المعتمد.
        لا ينشئ هذا الإجراء موظفين جددًا ولا يستعيد السجلات المؤرشفة؛ الملف الأصلي لا يُستبدل.
      </Typography>
    </Paper>}

    {message && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage('')}>{message}</Alert>}
    {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
    {listError && <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setListError('')}>
      تحديث قائمة البطاقات: {listError} لا يعني ذلك حذف البطاقات الموجودة.
    </Alert>}
    {batch && <Paper sx={{ p: 2, mb: 2, borderRadius: 3 }}>
      <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
        <Chip color="primary" label={'إجمالي الملف: ' + batch.total} />
        <Chip color="info" label={'مطابقة أولية: ' + (batch.counts.name_match || 0)} />
        <Chip color="warning" label={'اختلاف أسماء: ' + (batch.counts.name_review || 0)} />
        <Chip color="error" label={'تعارض معرّفات: ' + (batch.counts.identifier_review || 0)} />
        <Chip label={'غير موجود: ' + (batch.counts.not_in_registry || 0)} />
        <Chip variant="outlined" label="مؤقت — بانتظار المطابقة" />
      </Stack>
    </Paper>}

    {isAdmin && batch && <Paper sx={{ p: 2, mb: 2, borderRadius: 3 }}>
      <Stack gap={1.5}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1}>
          <Box>
            <Typography variant="h6" fontWeight={800}>فحص جاهزية الاعتماد النهائي</Typography>
            <Typography variant="body2" color="text.secondary">
              قراءة السجلات المؤقتة ومقارنتها بالدليل المعتمد دون إعادة رفع Excel أو تغيير سجلات الموظفين.
            </Typography>
          </Box>
          <Button variant="contained" color="secondary" disabled={readinessBusy} onClick={checkReadiness}>
            {readinessBusy ? 'جارٍ فحص الجاهزية...' : 'فحص الجاهزية الآن'}
          </Button>
        </Stack>
        {readinessBusy && <Alert severity="info">
          يجري فحص البطاقات المشفرة ومقارنتها بالبيانات المعتمدة؛ لا تضغط الزر مجددًا.
          هذه عملية قراءة فقط، ولا تنشئ موظفين أو تعتمد سجلات.
        </Alert>}
        {readinessError && <Alert severity="error" onClose={() => setReadinessError('')}>
          {readinessError}
        </Alert>}
        {readiness && !readinessBusy && !readinessError && <Alert severity="success">
          اكتمل فحص الجاهزية للدفعة رقم {readiness.batch_id} عند الساعة {readinessCheckedAt}.
          عدد البطاقات المفحوصة: {readiness.rows_scanned ?? readiness.rows_total}. التقرير للقراءة فقط، ولا يعني اعتماد الموظفين.
        </Alert>}
        {readiness && <Stack gap={1.5}>
          <Alert severity="warning">
            {readiness.notice} المطابقة الأولية ليست تحققًا من هوية الموظف أو حالته الوظيفية.
            لا يمكن الاعتماد النهائي أو استعادة الأرشيف قبل إثبات الهوية والحالة الوظيفية
            والتحقق من نسخة احتياطية قابلة للاسترجاع.
          </Alert>
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Chip color="primary" label={'سجلات مفحوصة: ' + (readiness.rows_scanned ?? 0)} />
            <Chip color="info" label={'الأصل المؤرشف: ' + (readiness.original_registry?.archived ?? 0)} />
            <Chip label={'الأصل النشط: ' + (readiness.original_registry?.active ?? 0)} />
            <Chip color="warning" label={'حالة وظيفية غير نشطة: ' + (readiness.original_registry?.non_active_employment_status ?? 0)} />
            <Chip color="error" label={'بطاقات ناقصة: ' + (readiness.cards_missing_any_optional_field ?? 0)} />
          </Stack>
          <Typography variant="subtitle2" fontWeight={800}>مطابقة مسميات المراكز الصحية المعتمدة</Typography>
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Chip color="success" variant="outlined" label={'تطابق فريد: ' + (readiness.approved_center_name_check?.approved_exact_unique ?? 0)} />
            <Chip color="warning" label={'اسم المركز مفقود في الملف: ' + (readiness.approved_center_name_check?.missing_in_file ?? 0)} />
            <Chip label={'غير مطابق للدليل: ' + (readiness.approved_center_name_check?.not_matched_to_approved ?? 0)} />
            <Chip color="error" label={'أسماء ملتبسة: ' + (readiness.approved_center_name_check?.ambiguous ?? 0)} />
          </Stack>
          <Typography variant="subtitle2" fontWeight={800}>التغطية في دليل المراكز والسجلات الأصلية</Typography>
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Chip color={(readiness.official_center_directory?.active_approved_count ?? 0) ? 'info' : 'warning'}
              label={'مراكز معتمدة في الدليل: ' + (readiness.official_center_directory?.active_approved_count ?? 0)} />
            <Chip variant="outlined" label={'ارتباط مركز في الأصل المؤرشف: ' + (readiness.official_center_directory?.original_linked_center ?? 0)} />
            <Chip variant="outlined" label={'ارتباط أصلي بمركز معتمد حاليًا: ' + (readiness.official_center_directory?.original_linked_to_currently_approved_center ?? 0)} />
            <Chip variant="outlined" label={'مسمى مركز تاريخي في الأصل: ' + (readiness.official_center_directory?.original_source_center_text_available ?? 0)} />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            ارتباط المركز بالسجل الأصلي معلومة تاريخية للمقارنة، وليس تصريحًا بإسناد الموظف إليه حاليًا.
          </Typography>
          <Typography variant="subtitle2" fontWeight={800}>قيم محفوظة في الأصل مقابل نواقص القائمة المؤقتة</Typography>
          <Stack direction="row" gap={1} flexWrap="wrap">
            {Object.entries(readiness.historical_values_for_missing_source?.same_name_review_only || {})
              .filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1])
              .slice(0, 8).map(([key, count]) =>
                <Chip key={key} color="info" variant="outlined"
                  label={(FIELD_LABELS[key] || key) + ' — متاح بالأصل عند تطابق الاسم: ' + count} />)}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            وجود قيمة بالسجل الأصلي لا يعني صلاحيتها للنقل أو الاعتماد. اختلافات الأسماء لا تستفيد
            من القيم القديمة إلا بعد إثبات تطابق الهوية بصورة مستقلة.
          </Typography>
          <Stack direction="row" gap={1} flexWrap="wrap">
            {Object.entries(readiness.historical_values_for_missing_source?.different_name_unverified || {})
              .filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1])
              .slice(0, 5).map(([key, count]) =>
                <Chip key={key} color="warning" variant="outlined"
                  label={(FIELD_LABELS[key] || key) + ' — أصل باسم مختلف: ' + count} />)}
          </Stack>
          {readiness.source_headers_not_preserved && <Alert severity="info">
            الأرقام الخاصة بالنواقص مأخوذة من الحقول التي حُفظت أثناء الاستيراد المؤقت،
            وليست دليلًا على أن أعمدة ملف Excel الأصلي كانت خالية. أسماء أعمدة المصدر
            لم تُحفظ مع الدفعة الحالية؛ يلزم فحص الملف المرجعي الأصلي قبل تصحيح الربط.
          </Alert>}
          <Typography variant="subtitle2" fontWeight={800}>أكثر الحقول الاختيارية نقصًا</Typography>
          <Stack direction="row" gap={1} flexWrap="wrap">
            {Object.entries(readiness.optional_fields_missing || {})
              .filter(([, count]) => count > 0)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8).map(([key, count]) =>
                <Chip key={key} color="warning" variant="outlined"
                  label={(FIELD_LABELS[key] || key) + ': ' + count} />)}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            هذا تقرير قراءة فقط ولا يحتوي زر اعتماد فعلي. تُعالَج المطابقة
            والمستندات المطلوبة قبل أي إجراء على بيانات الموظفين الأصلية.
          </Typography>
        </Stack>}
      </Stack>
    </Paper>}

    {isAdmin && batch && <Paper sx={{ p: 2, mb: 2, borderRadius: 3 }}>
      <Stack gap={1.5}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between"
          gap={1} alignItems={{ sm: 'center' }}>
          <Box>
            <Typography variant="h6" fontWeight={800}>كشف تجهيز اعتماد الموظفين المؤهلين</Typography>
            <Typography variant="body2" color="text.secondary">
              تصنيف الموظفين حسب تطابق السجلات الأصلية ودليل أرشفتها، دون إعادة استيراد ملف Excel.
            </Typography>
          </Box>
          <Button variant="contained" onClick={() => void loadApprovalPlan(1, '')}
            disabled={approvalPlanBusy}>
            {approvalPlanBusy ? 'جارٍ إعداد الكشف...' : 'تجهيز كشف الاعتماد'}
          </Button>
        </Stack>
        {approvalPlan && <Stack gap={1.5}>
          <Alert severity="warning">
            {approvalPlan.note} العدد المؤهل فنيًا ليس عدد الموظفين المعتمدين.
            يلزم التحقق من الهوية والحالة الوظيفية وتوفر نسخة احتياطية مختبرة قبل أي استعادة.
          </Alert>
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Chip color="primary" label={'تم فحص: ' + approvalPlan.total_scanned} />
            <Chip color="info" label={'مرشحون للمراجعة الفنية: ' + (approvalPlan.counts.technical_review_candidate || 0)} />
            <Chip color="warning" label={'اختلاف أسماء: ' + (approvalPlan.counts.name_difference || 0)} />
            <Chip color="error" label={'تعارض معرّفات: ' + (approvalPlan.counts.identifier_conflict || 0)} />
            <Chip label={'تدقيق أرشفة: ' + (approvalPlan.counts.archive_provenance_review || 0)} />
            <Chip label={'حالة وظيفية غير نشطة: ' + (approvalPlan.counts.not_active_employment || 0)} />
            <Chip variant="outlined" label="المعتمدون فعليًا من هذا الكشف: 0" />
          </Stack>
          <TextField select label="عرض حسب سبب المراجعة" size="small"
            value={approvalPlanStatus} sx={{ maxWidth: 380 }}
            disabled={approvalPlanBusy}
            onChange={event => void loadApprovalPlan(1, event.target.value)}>
            <MenuItem value="">جميع الحالات</MenuItem>
            {Object.entries(PLAN_LABELS).map(([key, label]) =>
              <MenuItem key={key} value={key}>{label}</MenuItem>)}
          </TextField>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 1 }}>
            {approvalPlan.items.map(row => <Paper key={row.source_row} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
              <Typography fontWeight={800} variant="body2">{row.name}</Typography>
              <Typography variant="caption" display="block">
                الهوية: <b dir="ltr">{row.masked_id}</b> — صف Excel {row.source_row}
              </Typography>
              <Chip size="small" variant="outlined"
                color={row.status === 'identifier_conflict' ? 'error'
                  : row.status === 'technical_review_candidate' ? 'info' : 'warning'}
                label={PLAN_LABELS[row.status]} sx={{ mt: 1 }} />
              {row.missing_optional_count > 0 &&
                <Typography display="block" variant="caption" color="text.secondary">
                  بيانات اختيارية ناقصة: {row.missing_optional_count}
                </Typography>}
            </Paper>)}
          </Box>
          {approvalPlan.filtered_count > approvalPlan.page_size &&
            <Stack alignItems="center" sx={{ mt: 1 }}>
              <Pagination count={Math.ceil(approvalPlan.filtered_count / approvalPlan.page_size)}
                page={approvalPlan.page} color="primary"
                disabled={approvalPlanBusy}
                onChange={(_, newPage) => void loadApprovalPlan(newPage, approvalPlanStatus)} />
            </Stack>}
          <Typography variant="caption" color="text.secondary">
            هذا كشف تحضيري للمتابعة والمراجعة. لا يُنقل أي موظف إلى السجل الرئيسي بهذه الخطوة،
            ولا تُفتح السجلات الصحية حتى اكتمال الاعتماد وفق الإجراءات المعتمدة.
          </Typography>
        </Stack>}
      </Stack>
    </Paper>}

    {isAdmin && batch && <Paper sx={{ p: 2, mb: 2, borderRadius: 3 }}>
      <Stack gap={1.5}>
        <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }}
          justifyContent="space-between" gap={1}>
          <Box>
            <Typography variant="h6" fontWeight={800}>مطابقة أسماء الموظفين الذكية</Typography>
            <Typography variant="body2" color="text.secondary">
              قارن الاسم الوارد في Excel بالاسم في السجل الأصلي بالهوية نفسها، وصنّف الاختلافات
              دفعةً واحدة دون استعادة السجلات أو تعديل الأسماء.
            </Typography>
          </Box>
          <Button variant="contained" color="secondary" disabled={nameReviewBusy}
            onClick={() => void loadNameReview(1, '')}>
            {nameReviewBusy ? 'جارٍ تحليل الأسماء...' : 'تحليل اختلافات الأسماء'}
          </Button>
        </Stack>
        {nameReview && <Stack gap={1.5}>
          <Alert severity="warning">
            {nameReview.notice} لا يعني التشابه الإملائي أو ترتيب الاسم أن الموظف قد اعتُمد
            أو أن البيانات الصحية يمكن ربطها أو تفعيلها.
          </Alert>
          <Stack direction="row" flexWrap="wrap" gap={1}>
            <Chip color="primary" label={'أسماء مختلفة مفحوصة: ' + nameReview.total_name_review_rows} />
            {Object.entries(NAME_REVIEW_LABELS).map(([key, label]) =>
              <Chip key={key} variant="outlined"
                color={key === 'substantial_difference' ? 'warning' : 'default'}
                label={label + ': ' + (nameReview.category_counts[key as NameReviewCategory] ?? 0)} />)}
            <Chip label="المعتمدون آليًا: صفر" />
          </Stack>
          <TextField select label="تصفية حسب نوع اختلاف الاسم" size="small"
            value={nameReviewCategory} disabled={nameReviewBusy} sx={{ maxWidth: 390 }}
            onChange={event => void loadNameReview(1, event.target.value)}>
            <MenuItem value="">جميع اختلافات الأسماء</MenuItem>
            {Object.entries(NAME_REVIEW_LABELS).map(([key, label]) =>
              <MenuItem key={key} value={key}>{label}</MenuItem>)}
          </TextField>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 2 }}>
            {nameReview.items.map(item =>
              <Paper key={item.source_row} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Stack gap={1}>
                  <Typography variant="caption" color="text.secondary">
                    صف Excel: {item.source_row} — الهوية: <b dir="ltr">{item.masked_id}</b>
                  </Typography>
                  <Typography variant="caption" color="text.secondary">الاسم في Excel</Typography>
                  <Typography fontWeight={700}>{item.excel_name}</Typography>
                  <Typography variant="caption" color="text.secondary">الاسم في السجل الأصلي</Typography>
                  <Typography fontWeight={700}>{item.original_name || 'غير متوفر'}</Typography>
                  <Chip sx={{ alignSelf: 'flex-start', height: 'auto',
                    '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 } }}
                    size="small" color={item.category === 'substantial_difference' ? 'warning' : 'info'}
                    label={NAME_REVIEW_LABELS[item.category]} />
                  <Typography variant="caption" color="text.secondary">
                    للمراجعة فقط — لم يُعتمد الاسم أو يُعدّل السجل الأصلي.
                  </Typography>
                </Stack>
              </Paper>)}
          </Box>
          {nameReview.filtered_count > nameReview.page_size &&
            <Stack alignItems="center">
              <Pagination count={Math.ceil(nameReview.filtered_count / nameReview.page_size)}
                page={nameReview.page} disabled={nameReviewBusy}
                onChange={(_, newPage) => void loadNameReview(newPage, nameReviewCategory)} />
            </Stack>}
          {nameReview.filtered_count === 0 &&
            <Alert severity="info">لا توجد حالات في التصنيف المحدد.</Alert>}
        </Stack>}
      </Stack>
    </Paper>}

    {isAdmin && batch && <Paper sx={{ p: 2, mb: 2, borderRadius: 3 }}>
      <Stack gap={1.5}>
        <Stack direction={{ xs: 'column', md: 'row' }} gap={1} alignItems={{ md: 'center' }}
          justifyContent="space-between">
          <Box>
            <Typography variant="h6" fontWeight={800}>تشخيص تعارض المعرّفات</Typography>
            <Typography variant="body2" color="text.secondary">
              حدد سبب كل تعارض بين الرقم الوظيفي أو البريد الإلكتروني في الملف والسجل الأصلي،
              دون إعادة رفع Excel أو تعديل أي بيانات.
            </Typography>
          </Box>
          <Button variant="outlined" color="error" disabled={conflictDiagnosticsBusy}
            onClick={() => void diagnoseConflicts()}>
            {conflictDiagnosticsBusy ? 'جارٍ فحص التعارضات...' : 'فحص سبب التعارض'}
          </Button>
        </Stack>
        {conflictDiagnostics && <Stack gap={1}>
          <Alert severity="info">
            {conflictDiagnostics.notice} لا تعرض هذه الشاشة أرقامًا وظيفية أو عناوين بريد أو
            هويات أشخاص آخرين؛ وتبقى الحالات معلّقة حتى التحقق من المصدر الصحيح.
          </Alert>
          <Chip color="error" variant="outlined" sx={{ alignSelf: 'flex-start' }}
            label={'بطاقات موسومة بالتعارض: ' + conflictDiagnostics.flagged_rows} />
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(275px,1fr))', gap: 2 }}>
            {conflictDiagnostics.items.map(item =>
              <Paper key={item.source_row} variant="outlined"
                sx={{ borderColor: 'error.light', borderRadius: 2, p: 2 }}>
                <Stack gap={1}>
                  <Typography variant="subtitle2" fontWeight={800}>{item.name}</Typography>
                  <Typography variant="caption">
                    صف Excel: {item.source_row} — الهوية: <b dir="ltr">{item.masked_id}</b>
                  </Typography>
                  {item.reason_codes.map(code =>
                    <Chip key={code} variant="outlined"
                      color={code === 'import_time_conflict_not_reproduced' ? 'warning' : 'error'}
                      label={CONFLICT_REASON_LABELS[code]} sx={{ maxWidth: '100%', height: 'auto',
                        '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 } }} />)}
                  {item.other_excel_rows.length > 0 &&
                    <Typography variant="caption" color="text.secondary">
                      صفوف أخرى لها القيمة نفسها: {item.other_excel_rows.join('، ')}
                    </Typography>}
                  <Button variant="contained" size="small"
                    disabled={numberEditorBusy} onClick={() => void openNumberEditor(item.roster_row_id)}>
                    تحرير الرقم الوظيفي
                  </Button>
                </Stack>
              </Paper>)}
          </Box>
        </Stack>}
      </Stack>
    </Paper>}

    <Paper sx={{ p: 2, mb: 2, borderRadius: 3 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
        <TextField label="البحث باسم الموظف" value={search}
          onChange={event => setSearch(event.target.value)} size="small" sx={{ flex: 1 }}
          onKeyDown={event => { if (event.key === 'Enter') void applySearch(); }} />
        <TextField select label="حالة المطابقة" value={category} size="small" sx={{ minWidth: 245 }}
          onChange={event => {
            setCategory(event.target.value);
            setPage(1);
            void load(1, search, event.target.value);
          }}>
          <MenuItem value="">جميع الحالات</MenuItem>
          {Object.entries(STATUS).map(([key, config]) =>
            <MenuItem key={key} value={key}>{config.label}</MenuItem>)}
        </TextField>
        <Button variant="outlined" onClick={applySearch} disabled={busy}>بحث</Button>
      </Stack>
    </Paper>

    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(275px,1fr))', gap: 2 }}>
      {items.map(row => <Paper key={row.id} elevation={1} sx={{
        p: 2, borderRadius: 3, border: '1px solid',
        borderColor: row.classification === 'identifier_review' ? 'error.main'
          : row.classification === 'name_review' ? 'warning.main'
          : row.missing_optional.length ? 'warning.light' : 'divider',
        bgcolor: row.missing_optional.length ? 'rgba(255,193,7,0.06)' : 'background.paper',
      }}>
        <Stack gap={1.5}>
          <Typography variant="subtitle1" fontWeight={800}>{row.name}</Typography>
          <Chip size="small" color={STATUS[row.classification].color}
            label={STATUS[row.classification].label} sx={{ alignSelf: 'flex-start' }} />
          <Typography variant="body2">الهوية: <b dir="ltr">{row.masked_id}</b></Typography>
          {row.temporary_employee_number &&
            <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
              رمز وظيفي مؤقت <b dir="ltr">{row.temporary_employee_number}</b>
            </Typography>}
          <Typography variant="body2">المركز: {row.center || 'غير متوفر'}</Typography>
          <Typography variant="body2">المسمى: {row.job_title || 'غير متوفر'}</Typography>
          {V4_PRIVATE_UI && row.source_organizational_hierarchy && Object.keys(row.source_organizational_hierarchy).length > 0 && (
            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 1.2 }}>
              <Typography variant="caption" fontWeight={800}>التبعية التنظيمية من Excel — غير معتمدة</Typography>
              <Typography variant="body2">
                {[
                  'main_administration','sub_administration','department','sub_unit',
                  'consultative_sector','health_center',
                ].map(key => row.source_organizational_hierarchy?.[key]).filter(v =>
                  v && !['لا ينطبق','غير محدد في المصدر'].includes(v)).join(' / ') || 'بانتظار استكمال الهيكلة'}
              </Typography>
              {row.source_review_required && <Chip size="small" color="warning" sx={{ mt: 1 }}
                label={row.source_review_status || 'تحتاج مراجعة تصنيفية'} />}
            </Box>
          )}
          <Typography variant="caption" color="text.secondary">صف Excel: {row.source_row}</Typography>
          {row.missing_optional.length > 0
            ? <Chip size="small" color="warning" label={'بيانات ناقصة: ' + row.missing_optional.length} />
            : <Chip size="small" color="success" variant="outlined" label="الحقول الاختيارية المستوردة مكتملة" />}
          {row.missing_optional.length > 0 &&
            <Button size="small" variant="outlined" onClick={() => openCompletion(row)}>استكمال البيانات</Button>}
        </Stack>
      </Paper>)}
    </Box>
    {!busy && total === 0 && <Alert severity="info" sx={{ my: 2 }}>لا توجد بطاقات في القائمة المؤقتة الحالية.</Alert>}
    {busy && <Box sx={{ textAlign: 'center', my: 2 }}><CircularProgress size={28} /></Box>}
    {total > 24 && <Stack alignItems="center" sx={{ mt: 3 }}>
      <Pagination count={pages} page={page} onChange={(_, next) => {
        setPage(next); void load(next);
      }} color="primary" />
    </Stack>}

    <Paper sx={{ p: 2, mt: 3, borderRadius: 3 }}>
      <Typography fontWeight={800} sx={{ mb: 1 }}>الاستعلام الآمن برقم الهوية</Typography>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
        <TextField label="رقم الهوية / الإقامة" type="password" value={lookupId}
          onChange={event => setLookupId(event.target.value)} size="small" inputProps={{ maxLength: 10 }} />
        <Button variant="outlined" disabled={busy || !lookupId} onClick={lookup}>استعلام</Button>
      </Stack>
      {lookupResult && <Alert severity="info" sx={{ mt: 2 }}>
        الرقم: {lookupResult.masked_id} — السجل الأصلي: {lookupResult.original_record === 'active'
          ? 'نشط' : lookupResult.original_record === 'archived' ? 'مؤرشف' : 'غير موجود'}
        ، البطاقة المؤقتة: {lookupResult.temporary_match ? 'موجودة' : 'غير موجودة'}.
        يلزم التحقق من الهوية قبل أي ربط سريري.
      </Alert>}
    </Paper>

    <Dialog open={Boolean(editingConflictId)} onClose={() => {
      if (!numberEditorBusy) closeNumberEditor();
    }} fullWidth maxWidth="sm">
      <DialogTitle>تحرير الرقم الوظيفي — بطاقة إدارية مؤقتة</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ pt: 1 }}>
          <Alert severity="warning">
            هذا التحرير لا يغيّر رقم الهوية أو السجل الأصلي أو الملف الصحي.
            لا تُدخل رقمًا جديدًا إلا بعد التحقق من مستند رسمي لدى الموارد البشرية.
          </Alert>
          <Typography fontWeight={800}>{editSession?.name}</Typography>
          <Typography variant="body2">
            صف Excel {editSession?.source_row} — الهوية: <b dir="ltr">{editSession?.masked_id}</b>
          </Typography>
          <TextField label="الرقم الوظيفي الصحيح" type={showEditedNumber ? 'text' : 'password'}
            value={editedEmployeeNumber} inputProps={{ maxLength: 40 }} autoComplete="off"
            onChange={event => {
              setEditedEmployeeNumber(event.target.value);
              setNumberEditPreview(null);
              setNumberEditorError('');
            }} />
          <Button variant="text" size="small" sx={{ alignSelf: 'flex-start' }}
            onClick={() => setShowEditedNumber(value => !value)}>
            {showEditedNumber ? 'إخفاء الرقم' : 'إظهار الرقم للتحرير'}
          </Button>
          <Button variant="outlined" disabled={numberEditorBusy ||
            !editedEmployeeNumber.trim() ||
            editedEmployeeNumber.trim() === (editSession?.current_employee_number || '').trim()}
            onClick={() => void previewNumberEdit()}>
            فحص الرقم الجديد قبل الحفظ
          </Button>
          {numberEditorError && <Alert severity="error">{numberEditorError}</Alert>}
          {numberEditPreview && <>
            <Alert severity="info">
              لا يوجد تعارض معرّفات جديد للرقم المدخل. الحالة المتوقعة بعد التحرير:
              {STATUS[numberEditPreview.next_classification].label}.
              هذه معاينة فقط وليست اعتمادًا نهائيًا.
            </Alert>
            <TextField label="مرجع المستند المعتمد لدى الموارد البشرية"
              placeholder="رقم خطاب أو مستند تحقق" value={numberEditEvidence}
              onChange={event => setNumberEditEvidence(event.target.value)}
              inputProps={{ maxLength: 150 }} />
            <TextField label="سبب تصحيح الرقم الوظيفي (10 أحرف فأكثر)"
              multiline minRows={2} value={numberEditReason}
              onChange={event => setNumberEditReason(event.target.value)}
              inputProps={{ maxLength: 500 }} />
            <FormControlLabel control={<Checkbox checked={numberEditVerified}
              onChange={event => setNumberEditVerified(event.target.checked)} />}
              label="تحققت من الرقم الصحيح في مصدر رسمي لدى الموارد البشرية" />
          </>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={closeNumberEditor} disabled={numberEditorBusy}>إلغاء</Button>
        <Button color="primary" variant="contained"
          disabled={!numberEditPreview || !numberEditVerified ||
            numberEditEvidence.trim().length < 8 || numberEditReason.trim().length < 10 ||
            numberEditorBusy} onClick={() => void saveNumberEdit()}>
          حفظ تصحيح البطاقة المؤقتة
        </Button>
      </DialogActions>
    </Dialog>

    <Dialog open={Boolean(editRow)} onClose={() => setEditRow(null)} fullWidth maxWidth="sm">
      <DialogTitle>استكمال بيانات بطاقة مؤقتة</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ pt: 1 }}>
          <Alert severity="warning">التعديل على البطاقة الإدارية المؤقتة فقط؛ لن يعدّل السجل الصحي.</Alert>
          <Typography fontWeight={700}>{editRow?.name}</Typography>
          <TextField select label="الحقل الناقص" value={field}
            onChange={event => setField(event.target.value)}>
            {(editRow?.missing_optional || []).map(key =>
              <MenuItem key={key} value={key}>{FIELD_LABELS[key] || key}</MenuItem>)}
          </TextField>
          <TextField label="القيمة الجديدة" value={fieldValue}
            onChange={event => setFieldValue(event.target.value)} />
          <TextField label="سبب الاستكمال (10 أحرف على الأقل)" value={reason} multiline
            onChange={event => setReason(event.target.value)} />
          <FormControlLabel control={<Checkbox checked={identityChecked}
            onChange={event => setIdentityChecked(event.target.checked)} />}
            label="تحققت من هوية صاحب البيانات من مصدر موثوق" />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setEditRow(null)}>إلغاء</Button>
        <Button variant="contained" disabled={busy || !field || !fieldValue.trim() ||
          reason.trim().length < 10 || !identityChecked} onClick={complete}>حفظ الاستكمال المؤقت</Button>
      </DialogActions>
    </Dialog>
  </Box>;
}
