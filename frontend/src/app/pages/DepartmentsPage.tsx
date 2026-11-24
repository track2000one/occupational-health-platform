import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, Grid, MenuItem, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import {
  Add as AddIcon, Apartment as DepartmentIcon, Refresh as RefreshIcon,
  FactCheck as ApproveIcon, Edit as EditIcon, ToggleOn as ActivateIcon,
  ToggleOff as DeactivateIcon, ViewModule as CardsIcon, TableRows as TableIcon,
  AccountTree as StructureIcon, LocalHospital as CenterIcon,
} from '@mui/icons-material';
import { authFetch, getAccessToken, useAuth } from '../context/AuthContext';
import { V4DepartmentImport } from '../components/V4DepartmentImport';
import { V4DepartmentFoundationAuditPanel } from '../components/V4DepartmentFoundationAuditPanel';
import { departmentReviewGuidance } from '../data/v4DepartmentReviewGuidance';
import { V4_PRIVATE_UI } from '../data/v4AffiliationHierarchy';
import {
  V4_FOUNDATION_CONTEXT, V4_LEVEL_LABELS, v4MainDepartmentChoices,
  v4DepartmentChoices,
} from '../data/v4FoundationHierarchyReference';
import { pendingV4DepartmentIds } from '../data/v4DepartmentBulkSelection';
import { auditDepartmentPaths, knownDepartmentPaths, V4_DEPARTMENT_LABELS,
} from '../data/v4DepartmentSourceAudit';

// Never silently use Production API for an unconfigured Staging instance.
const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

type Department = {
  id: number; name: string; code: string; is_active: boolean; is_approved: boolean;
  health_center_id: number | null; parent_id: number | null;
  approval_reference: string; employee_count: number;
  created_at: string; updated_at: string;
};
type Summary = {
  total: number; active: number; approved: number; pending: number;
  inactive: number; employees: number;
};
type Registry = { results: Department[]; summary: Summary };
type BulkDepartmentPreview = {
  selected_count: number;
  eligible_count: number;
  blocked_count: number;
  already_approved_count: number;
  eligible_by_kind?: Record<string, number>;
  preview_token: string;
  commit_enabled: boolean;
  blocked: Array<{ id: number; name: string; code: string; reason: string }>;
};
type BulkDepartmentResult = {
  approved_count: number; blocked_count: number;
};
const BULK_BLOCKED_LABELS: Record<string, string> = {
  inactive: 'القسم غير نشط',
  parent_not_approved_or_selected: 'الجهة الأعلى ليست مفعّلة أو غير مشمولة في المعاينة',
  invalid_department_hierarchy: 'التسلسل الهرمي يحتاج مراجعة',
  unexpected_root_parent: 'ارتباط الجهة الأعلى غير صحيح',
  invalid_kind: 'نوع السجل غير مؤهل للتفعيل',
};

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  if (!token) throw new Error('انتهت صلاحية الجلسة؛ أعد تسجيل الدخول.');
  if (!API) throw new Error('رابط واجهة API غير مضبوط لهذه البيئة؛ لم يتم إجراء أي تعديل.');
  const response = await authFetch(API + path, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + token,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const first = result && typeof result === 'object' ? Object.values(result)[0] : null;
    const message = result.detail || (Array.isArray(first) ? first[0] : first) || 'تعذر تنفيذ العملية.';
    throw new Error(String(message));
  }
  return result as T;
}
function message(error: unknown) {
  return error instanceof Error ? error.message : 'تعذر إتمام العملية.';
}

const EMPTY_SUMMARY: Summary = { total: 0, active: 0, approved: 0, pending: 0, inactive: 0, employees: 0 };
type Filter = 'all' | 'approved' | 'pending' | 'inactive';
type FoundationLevel = 'main_administration' | 'sub_administration' | 'department' | 'sub_unit';
const FOUNDATION_LEVELS: FoundationLevel[] = [
  'main_administration', 'sub_administration', 'department', 'sub_unit',
];
type Mode = 'cards' | 'table';

export function DepartmentsPage() {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';
  const { user } = useAuth();
  const canManage = user?.isSuperuser === true;
  const [departments, setDepartments] = useState<Department[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [mode, setMode] = useState<Mode>('cards');
  const [edit, setEdit] = useState<Department | 'new' | null>(null);
  const [name, setName] = useState('');
  const [newLevel, setNewLevel] = useState<FoundationLevel>('department');
  const [foundationMain, setFoundationMain] = useState('');
  const [foundationSub, setFoundationSub] = useState('');
  const [foundationSection, setFoundationSection] = useState('');
  const [code, setCode] = useState('');
  const [approval, setApproval] = useState<Department | null>(null);
  const [approvalReference, setApprovalReference] = useState('');
  const [statusTarget, setStatusTarget] = useState<Department | null>(null);
  const [statusReason, setStatusReason] = useState('');
  const [detail, setDetail] = useState<Department | null>(null);
  const [bulkPreview, setBulkPreview] = useState<BulkDepartmentPreview | null>(null);
  const [bulkIds, setBulkIds] = useState<number[]>([]);
  const [bulkConsent, setBulkConsent] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api<Registry>('/departments/');
      setDepartments(result.results);
      setSummary(result.summary);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const filtered = useMemo(() => departments.filter(item => {
    if (filter === 'approved' && (!item.is_approved || !item.is_active)) return false;
    if (filter === 'pending' && item.is_approved) return false;
    if (filter === 'inactive' && item.is_active) return false;
    const needle = search.trim().toLocaleLowerCase();
    return !needle || [item.name, item.code, item.approval_reference].some(value =>
      String(value || '').toLocaleLowerCase().includes(needle));
  }), [departments, search, filter]);

  const pendingV4Ids = useMemo(() => pendingV4DepartmentIds(departments), [departments]);
  const hierarchyAudit = useMemo(() => auditDepartmentPaths(departments), [departments]);
  const orgPaths = useMemo(() => knownDepartmentPaths(departments), [departments]);
  // The V4 directory currently mixes structural parents and actual departments.
  // Do not bulk-activate all cards while registered/source paths are inconsistent.
  const bulkAuditIncomplete = hierarchyAudit.missing.length>0 ||
    hierarchyAudit.broken.length>0;
  const levelFor = (item: Department) => {
    const path = orgPaths.get(item.id);
    if(!path || path.status!=='valid') return 'تبعية غير مكتملة';
    return V4_DEPARTMENT_LABELS[Math.min(path.path.length-1,3)] || 'جهة تنظيمية';
  };

  async function previewBulkDepartmentActivation() {
    if (!V4_PRIVATE_UI || !canManage || bulkBusy || busy || loading || error ||
        !pendingV4Ids.length) return;
    const ids = [...pendingV4Ids];
    setBulkIds(ids);
    setBulkConsent(false);
    setBulkBusy(true);
    try {
      const preview = await api<BulkDepartmentPreview>('/organization-units/bulk-approval/', {
        method: 'POST',
        body: JSON.stringify({ action: 'preview', unit_ids: ids }),
      });
      setBulkPreview(preview);
    } catch (caught) {
      setBulkPreview(null);
      toast.error('تعذرت معاينة الأقسام: ' + message(caught));
    } finally { setBulkBusy(false); }
  }

  async function activateBulkDepartments() {
    if (!V4_PRIVATE_UI || !canManage || bulkBusy || !bulkPreview ||
        !bulkPreview.commit_enabled || !bulkPreview.eligible_count || !bulkConsent) return;
    setBulkBusy(true);
    try {
      const result = await api<BulkDepartmentResult>('/organization-units/bulk-approval/', {
        method: 'POST',
        body: JSON.stringify({
          action: 'activate', unit_ids: bulkIds,
          preview_token: bulkPreview.preview_token,
          confirmed: true, confirm_text: 'تفعيل تشغيلي',
        }),
      });
      setBulkPreview(null);
      setBulkIds([]);
      setBulkConsent(false);
      await refresh();
      toast.success('تم التفعيل التشغيلي لعدد ' + result.approved_count +
        ' جهة تنظيمية. لم تتغير بيانات الموظفين.');
      if (result.blocked_count > 0)
        toast.warning(result.blocked_count + ' جهة بقيت للمراجعة؛ راجع التسلسل التنظيمي.');
    } catch (caught) {
      setBulkPreview(null);
      setBulkConsent(false);
      toast.error(message(caught) + ' — أعد المعاينة قبل المحاولة التالية.');
    } finally { setBulkBusy(false); }
  }

  function openCreate() {
    setName(''); setCode('');
    setNewLevel('department');
    setFoundationMain(''); setFoundationSub(''); setFoundationSection('');
    setEdit('new');
  }

  function openSourcePathForReview(path: string[]) {
    if (!canManage || path.length<1 || path.length>4) return;
    setCode('');
    setNewLevel(FOUNDATION_LEVELS[path.length-1]);
    setFoundationMain(path.length>1 ? path[0] : '');
    setFoundationSub(path.length>2 ? path[1] : '');
    setFoundationSection(path.length>3 ? path[2] : '');
    setName(path[path.length-1]);
    setEdit('new');
  }
  function openEdit(item: Department) {
    setName(item.name); setCode(item.code); setEdit(item);
  }
  const canSaveFoundation = !V4_PRIVATE_UI || edit !== 'new' ||
    (newLevel === 'main_administration' ||
      (Boolean(foundationMain) && (newLevel === 'sub_administration' ||
        (Boolean(foundationSub) && (newLevel === 'department' || Boolean(foundationSection))))));

  const foundationHierarchy = () => ({
    main_administration: newLevel === 'main_administration' ? name.trim() : foundationMain,
    sub_administration: newLevel === 'sub_administration' ? name.trim()
      : newLevel === 'main_administration' ? '' : foundationSub,
    department: newLevel === 'department' ? name.trim()
      : newLevel === 'sub_unit' ? foundationSection : '',
    sub_unit: newLevel === 'sub_unit' ? name.trim() : '',
  });

  async function save() {
    if (!edit || !canManage || !name.trim() || !canSaveFoundation) return;
    setBusy(true);
    try {
      if (edit === 'new') {
        await api('/departments/', {
          method: 'POST', body: JSON.stringify(V4_PRIVATE_UI
            ? { hierarchy: foundationHierarchy() }
            : { name: name.trim(), code: code.trim() }),
        });
        toast.success(V4_PRIVATE_UI
          ? 'تم تأسيس التسلسل التنظيمي كمسودة. يجب تفعيل المستويات قبل ربط الموظفين.'
          : 'تم تأسيس القسم كمسودة. يلزم الاعتماد الرسمي قبل إتاحته للموظفين.');
      } else {
        await api('/organization-units/' + edit.id + '/review/', {
          method: 'POST', body: JSON.stringify({ action: 'edit-draft', name: name.trim() }),
        });
        toast.success('تم تعديل اسم القسم في مرحلة المراجعة، مع الاحتفاظ بسجل المصدر.');
      }
      setEdit(null);
      await refresh();
    } catch (e) {
      toast.error(message(e));
    } finally { setBusy(false); }
  }
  async function approve() {
    if (!canManage || !approval || (!V4_PRIVATE_UI && approvalReference.trim().length < 3)) return;
    setBusy(true);
    try {
      await api('/organization-units/' + approval.id + '/review/', {
        method: 'POST', body: JSON.stringify({
          ...(V4_PRIVATE_UI
            ? { action: 'activate', confirmed: true }
            : { action: 'approve', approval_reference: approvalReference.trim() }),
        }),
      });
      setApproval(null); setApprovalReference('');
      await refresh();
      toast.success(V4_PRIVATE_UI
        ? 'تم تفعيل القسم للتشغيل الداخلي وأصبح متاحًا لاختيار تبعية الموظف.'
        : 'تم اعتماد القسم وأصبح متاحًا لاختيار تبعية الموظف.');
    } catch (e) { toast.error(message(e)); }
    finally { setBusy(false); }
  }
  async function saveStatus() {
    if (!canManage || !statusTarget || statusReason.trim().length < 10) return;
    setBusy(true);
    try {
      await api('/departments/' + statusTarget.id + '/status/', {
        method: 'POST',
        body: JSON.stringify({
          is_active: !statusTarget.is_active, reason: statusReason.trim(),
        }),
      });
      setStatusTarget(null); setStatusReason('');
      await refresh();
      toast.success('تم تحديث حالة القسم مع توثيق الإجراء.');
    } catch (e) { toast.error(message(e)); }
    finally { setBusy(false); }
  }

  const actions = (item: Department) => (
    <Stack direction="row" gap={0.75} flexWrap="wrap">
      <Button size="small" variant="outlined" startIcon={<StructureIcon />}
        onClick={() => setDetail(item)}>عرض</Button>
      {canManage && !item.is_approved && (
        <Button size="small" variant="outlined" startIcon={<EditIcon />}
          disabled={busy} onClick={() => openEdit(item)}>تعديل</Button>
      )}
      {canManage && !item.is_approved && item.is_active && (
        <Button size="small" variant="contained" startIcon={<ApproveIcon />}
          disabled={busy || !departmentReviewGuidance(item, departments).canApprove}
          onClick={() => { setApproval(item); setApprovalReference(''); }}>اعتماد</Button>
      )}
      {canManage && <Button size="small" color={item.is_active ? 'warning' : 'success'}
        variant="outlined" disabled={busy || (item.is_active && item.employee_count > 0)}
        startIcon={item.is_active ? <DeactivateIcon /> : <ActivateIcon />}
        onClick={() => { setStatusTarget(item); setStatusReason(''); }}>
        {item.is_active ? 'إيقاف' : 'تفعيل'}
      </Button>}
    </Stack>
  );

  const isEditingName = edit !== null && edit !== 'new';
  const reviewGuidance = (department: Department) => departmentReviewGuidance(department, departments);
  return (
    <Box dir={isRtl ? 'rtl' : 'ltr'} sx={{ pb: 4 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between"
        alignItems={{ xs: 'stretch', md: 'center' }} gap={2} sx={{ mb: 2.5 }}>
        <Stack direction="row" alignItems="center" spacing={1.2}>
          <DepartmentIcon sx={{ fontSize: 38, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" fontWeight={950}>
              إدارة الهيكل التنظيمي والأقسام
            </Typography>
            <Typography variant="body2" color="text.secondary">
              مراجعة الإدارات الرئيسية والفرعية والأقسام والوحدات وربطها بتسلسل Excel
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" gap={1} flexWrap="wrap">
          <Button variant="outlined" startIcon={<RefreshIcon />}
            disabled={loading || busy} onClick={() => void refresh()}>تحديث</Button>
          <Button variant="outlined" startIcon={<CenterIcon />}
            onClick={() => navigate('/admin/health-centers')}>المراكز الصحية</Button>
          <Button variant="outlined" startIcon={<StructureIcon />}
            onClick={() => navigate('/admin/organization-structure')}>الهيكل التنظيمي</Button>
          {V4_PRIVATE_UI && canManage && <Button
            color="success" variant="contained" startIcon={<ApproveIcon />}
            disabled={busy || bulkBusy || loading || Boolean(error) ||
              !pendingV4Ids.length || bulkAuditIncomplete}
            onClick={() => void previewBulkDepartmentActivation()}>
            معاينة التفعيل الجماعي ({pendingV4Ids.length})
          </Button>}
          <V4DepartmentImport onImported={refresh} />
          {canManage && <Button variant="contained" startIcon={<AddIcon />}
            onClick={openCreate}>تأسيس جهة تنظيمية</Button>}
        </Stack>
      </Stack>

      <Alert severity="info" sx={{ mb: 2 }}>
        هذه القائمة تشمل الإدارات الرئيسية والفرعية والأقسام والوحدات، وليست جميعها أقسامًا.
        تُراجع كل جهة بمسارها الكامل قبل التفعيل. ولا يتغير أي موظف أو سجل صحي خلال المطابقة.
      </Alert>
      {V4_PRIVATE_UI && bulkAuditIncomplete && <Alert severity="warning" sx={{ mb: 2 }}>
        التفعيل الجماعي معلّق مؤقتًا لأن هناك مسارات تنظيمية تحتاج مطابقة أو روابط غير مكتملة.
        راجع نتائج مطابقة Excel أدناه؛ هذا الإيقاف لا يحذف أو يعطّل أي سجل حالي.
      </Alert>}
      {!canManage && <Alert severity="warning" sx={{ mb: 2 }}>
        حسابك مخوّل بالاطلاع فقط؛ يتطلب التأسيس والاعتماد وإيقاف الأقسام صلاحية المسؤول الأعلى.
      </Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        {([
          ['إجمالي الجهات التنظيمية', summary.total],
          ['الجهات المفعّلة والنشطة', summary.approved],
          ['بانتظار التفعيل', summary.pending],
          ['الجهات غير النشطة', summary.inactive],
          ['الموظفون المرتبطون بالجهات', summary.employees],
        ] as Array<[string, number]>).map(([label, value]) => (
          <Grid key={label} size={{ xs: 6, sm: 4, lg: 2.4 }}>
            <Paper sx={{ p: 2, borderRadius: 3, border: '1px solid #d7e5ef', textAlign: 'center' }}>
              <Typography variant="h4" fontWeight={950}>{value}</Typography>
              <Typography variant="body2">{label}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {V4_PRIVATE_UI && !loading && !error &&
        <V4DepartmentFoundationAuditPanel units={departments}
          canManage={canManage} onOpenPath={openSourcePathForReview} />}

      <Paper sx={{ p: 2, mb: 2, borderRadius: 3, border: '1px solid #d7e5ef' }}>
        <Grid container spacing={1.4} alignItems="center">
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField fullWidth label="البحث باسم الجهة التنظيمية أو الرمز"
              value={search} onChange={e => setSearch(e.target.value)} />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <TextField select fullWidth label="حالة القسم" value={filter}
              onChange={e => setFilter(e.target.value as Filter)}>
              <MenuItem value="all">جميع الأقسام</MenuItem>
              <MenuItem value="approved">معتمد ونشط</MenuItem>
              <MenuItem value="pending">بانتظار الاعتماد</MenuItem>
              <MenuItem value="inactive">غير نشط</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <Stack direction="row" gap={1} justifyContent="flex-end">
              <Button variant={mode === 'cards' ? 'contained' : 'outlined'}
                startIcon={<CardsIcon />} onClick={() => setMode('cards')}>بطاقات</Button>
              <Button variant={mode === 'table' ? 'contained' : 'outlined'}
                startIcon={<TableIcon />} onClick={() => setMode('table')}>جدول</Button>
            </Stack>
          </Grid>
        </Grid>
      </Paper>
      {loading ? <Box sx={{ textAlign: 'center', my: 5 }}><CircularProgress /></Box> : <>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          عرض {filtered.length} جهة تنظيمية من أصل {departments.length}
        </Typography>
        {!filtered.length && <Alert severity="info">
          {departments.length ? 'لا توجد أقسام مطابقة للتصفية الحالية.' :
            'لا توجد أقسام مسجلة بعد. ابدأ من «إضافة قسم جديد» لتأسيس أول قسم.'}
        </Alert>}
        {mode === 'cards' && <Grid container spacing={2}>
          {filtered.map(item => <Grid key={item.id} size={{ xs: 12, sm: 6, lg: 4 }}>
            <Paper sx={{
              p: 2.2, height: '100%', borderRadius: 3,
              border: '1px solid #cbddeb', borderTop: '4px solid #145c88',
              background: 'linear-gradient(160deg,#fff 0%,#f5f9fd 100%)',
              boxShadow: '0 7px 15px rgba(16,58,93,.08)',
              display: 'flex', flexDirection: 'column', gap: 1.3,
            }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
                <Typography variant="h6" fontWeight={900} sx={{ overflowWrap: 'anywhere' }}>{item.name}</Typography>
                <Chip size="small" color={!item.is_active ? 'default' : item.is_approved ? 'success' : 'warning'}
                  label={!item.is_active ? 'غير نشط' : item.is_approved ? 'معتمد' : 'مسودة'} />
              </Stack>
              <Typography variant="caption" color="text.secondary" dir="ltr" textAlign="right">
                {item.code}
              </Typography>
              {V4_PRIVATE_UI && <>
                <Chip size="small" variant="outlined" color="info" label={levelFor(item)} />
                <Typography variant="caption" color="text.secondary">
                  {orgPaths.get(item.id)?.path.join(' ← ') || 'لا يوجد مسار مكتمل'}
                </Typography>
              </>}
              <Divider />
              <Grid container spacing={1}>
                <Grid size={6}>
                  <Typography color="text.secondary" variant="caption">عدد الموظفين</Typography>
                  <Typography fontWeight={850}>{item.employee_count}</Typography>
                </Grid>
                <Grid size={6}>
                  <Typography color="text.secondary" variant="caption">مرجع الاعتماد</Typography>
                  <Typography fontWeight={750} sx={{ overflowWrap: 'anywhere' }}>{item.approval_reference || 'بانتظار الاعتماد'}</Typography>
                </Grid>
              </Grid>
              {reviewGuidance(item).kind !== 'none' && <Alert severity={reviewGuidance(item).kind === 'warning' ? 'warning' : 'info'} sx={{ py: 0.3 }}>
                {reviewGuidance(item).label}
              </Alert>}
              <Box sx={{ mt: 'auto', pt: 1 }}>{actions(item)}</Box>
            </Paper>
          </Grid>)}
        </Grid>}
        {mode === 'table' && <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>الجهة</TableCell><TableCell>المستوى التنظيمي</TableCell><TableCell>الرمز</TableCell>
              <TableCell>الاعتماد</TableCell><TableCell>الجهة الأعلى</TableCell><TableCell>الحالة</TableCell>
              <TableCell>الموظفون</TableCell><TableCell>الإجراءات</TableCell>
            </TableRow></TableHead>
            <TableBody>{filtered.map(item => <TableRow key={item.id} hover>
              <TableCell>{item.name}</TableCell>
              <TableCell>{levelFor(item)}</TableCell>
              <TableCell dir="ltr">{item.code}</TableCell>
              <TableCell>{item.is_approved ? 'معتمد' : 'مسودة'}</TableCell>
              <TableCell>{reviewGuidance(item).parentName || '—'}</TableCell>
              <TableCell>{item.is_active ? 'نشط' : 'غير نشط'}</TableCell>
              <TableCell>{item.employee_count}</TableCell>
              <TableCell>{actions(item)}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </TableContainer>}
      </>}

      <Dialog open={Boolean(bulkPreview)}
        onClose={() => { if (!bulkBusy) { setBulkPreview(null); setBulkConsent(false); } }}
        maxWidth="sm" fullWidth dir="rtl">
        <DialogTitle fontWeight={900}>معاينة التفعيل التشغيلي للأقسام</DialogTitle>
        <DialogContent dividers>
          {bulkPreview && <Stack gap={1.5}>
            <Alert severity="info">
              المعاينة لا تحفظ أي تغييرات. عند التأكيد، يفعّل النظام الأقسام المؤهلة
              بالترتيب الهرمي بدءًا من الإدارات الأعلى، دون رقم قرار رسمي.
              لن تتغير بيانات الموظفين أو المراكز الصحية.
            </Alert>
            <Stack direction="row" flexWrap="wrap" gap={1}>
              <Chip label={`المحددة: ${bulkPreview.selected_count}`} />
              <Chip color="success" variant="outlined"
                label={`المؤهلة: ${bulkPreview.eligible_count}`} />
              <Chip color="info" variant="outlined"
                label={`مفعّلة سابقًا: ${bulkPreview.already_approved_count}`} />
              <Chip color={bulkPreview.blocked_count ? 'warning' : 'default'}
                label={`تحتاج مراجعة: ${bulkPreview.blocked_count}`} />
            </Stack>
            {bulkPreview.blocked_count > 0 && <Box sx={{ maxHeight: 220, overflowY: 'auto' }}>
              {bulkPreview.blocked.map(item =>
                <Typography key={item.id} variant="body2" sx={{ py: 0.4 }}>
                  {item.name} — {BULK_BLOCKED_LABELS[item.reason] || item.reason}
                </Typography>)}
            </Box>}
            {!bulkPreview.commit_enabled && <Alert severity="warning">
              خدمة V4 لا تسمح بالحفظ الجماعي حاليًا. المعاينة فقط متاحة.
            </Alert>}
            {bulkPreview.eligible_count === 0 && <Alert severity="info">
              لا توجد أقسام مؤهلة للتفعيل ضمن الدفعة الحالية؛ لا يوجد إجراء حفظ.
            </Alert>}
            {bulkPreview.commit_enabled && bulkPreview.eligible_count > 0 &&
              <Stack direction="row" gap={1} alignItems="center">
                <Checkbox checked={bulkConsent}
                  disabled={bulkBusy}
                  onChange={(_, checked) => setBulkConsent(checked)}
                  inputProps={{ 'aria-label': 'تأكيد مراجعة الأقسام المؤهلة' }} />
                <Typography variant="body2">
                  راجعت الأقسام المؤهلة وأوافق على تفعيلها تشغيليًا داخل المنصة.
                </Typography>
              </Stack>}
          </Stack>}
        </DialogContent>
        <DialogActions>
          <Button disabled={bulkBusy}
            onClick={() => { setBulkPreview(null); setBulkConsent(false); }}>
            {bulkPreview?.eligible_count ? 'إلغاء' : 'إغلاق'}
          </Button>
          {Boolean(bulkPreview?.eligible_count && bulkPreview?.commit_enabled) &&
            <Button color="success" variant="contained"
              disabled={bulkBusy || !bulkConsent}
              onClick={() => void activateBulkDepartments()}>
              {bulkBusy ? 'جارٍ التفعيل...' : `تأكيد تفعيل ${bulkPreview?.eligible_count} قسم/إدارة`}
            </Button>}
        </DialogActions>
      </Dialog>

      <Dialog open={edit !== null} onClose={() => !busy && setEdit(null)} maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={900}>{isEditingName ? 'تعديل جهة تنظيمية' : 'تأسيس جهة تنظيمية بمسارها الكامل'}</DialogTitle>
        <DialogContent dividers>
          <Stack gap={2} sx={{ mt: 1 }}>
            {V4_PRIVATE_UI && edit === 'new' && <>
              <Alert severity="info">
                اتبع التسلسل التنظيمي الوارد في ملف الأقسام: تجمع الشرقية الصحي ← شبكة الدمام الصحية
                ← الإدارة الرئيسية ← الإدارة الفرعية ← القسم ← الوحدة الفرعية عند وجودها.
                لا ننشئ مركزًا صحيًا داخل هذا المسار، ولا نحتاج رقم قرار رسمي.
              </Alert>
              <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
                <TextField fullWidth label="التجمع الصحي" disabled
                  value={V4_FOUNDATION_CONTEXT.health_cluster} />
                <TextField fullWidth label="الشبكة الصحية" disabled
                  value={V4_FOUNDATION_CONTEXT.health_network} />
              </Stack>
              <TextField fullWidth select label="المستوى المراد تأسيسه *"
                value={newLevel}
                onChange={event => {
                  setNewLevel(event.target.value as FoundationLevel);
                  setName('');
                }}>
                {FOUNDATION_LEVELS.map((level, i) =>
                  <MenuItem key={level} value={level}>{V4_LEVEL_LABELS[i]}</MenuItem>)}
              </TextField>
              {newLevel !== 'main_administration' && <TextField fullWidth select required
                label="الإدارة الرئيسية *" value={foundationMain}
                onChange={event => {
                  setFoundationMain(event.target.value); setFoundationSub(''); setFoundationSection('');
                }}>
                <MenuItem value="">اختر الإدارة الرئيسية</MenuItem>
                {v4MainDepartmentChoices().map(value =>
                  <MenuItem key={value} value={value}>{value}</MenuItem>)}
              </TextField>}
              {['department','sub_unit'].includes(newLevel) && <TextField
                fullWidth required select label="الإدارة الفرعية *"
                value={foundationSub} disabled={!foundationMain}
                onChange={event => {
                  setFoundationSub(event.target.value); setFoundationSection('');
                }}>
                <MenuItem value="">اختر الإدارة الفرعية</MenuItem>
                {v4DepartmentChoices([foundationMain],1).map(value =>
                  <MenuItem key={value} value={value}>{value}</MenuItem>)}
              </TextField>}
              {newLevel === 'sub_unit' && <TextField fullWidth select required
                label="القسم الأعلى *" value={foundationSection}
                disabled={!foundationSub} onChange={event => setFoundationSection(event.target.value)}>
                <MenuItem value="">اختر القسم الأعلى</MenuItem>
                {v4DepartmentChoices([foundationMain,foundationSub],2).map(value =>
                  <MenuItem key={value} value={value}>{value}</MenuItem>)}
              </TextField>}
              <Alert severity="warning">
                وردت «التشغيل» ضمن بيانات المصدر، لكنها مستبعدة من قوائم تأسيس الهيكل حسب
                التعديل السابق. تبقى سجلاتها الأصلية للمراجعة دون حذفها.
              </Alert>
            </>}
            {V4_PRIVATE_UI && edit !== 'new' && <Alert severity="info">
              تعديل اسم مسودة قائمة لا يغيّر مكانها في التسلسل التنظيمي.
            </Alert>}
            {!V4_PRIVATE_UI && <Alert severity="info">
              هذا القسم مستقل عن المراكز الصحية. لن يتاح في نموذج الموظف حتى اكتمال الاعتماد.
            </Alert>}
            <TextField fullWidth required
              label={V4_PRIVATE_UI && edit === 'new'
                ? `اسم ${V4_LEVEL_LABELS[FOUNDATION_LEVELS.indexOf(newLevel)]} الجديد بالعربية *`
                : 'اسم القسم بالعربية *'}
              value={name} onChange={e => setName(e.target.value)}
              slotProps={{ htmlInput: { maxLength: 220 } }} />
            {(!V4_PRIVATE_UI || edit !== 'new') && <TextField fullWidth label="رمز القسم (اختياري)"
              value={code} disabled={isEditingName}
              onChange={e => setCode(e.target.value.toUpperCase())}
              helperText={isEditingName
                ? 'الرمز ثابت بعد الإنشاء لحماية الربط التاريخي'
                : 'اكتب رمزًا رسميًا إن توفر، أو اتركه فارغًا لتوليد رمز داخلي فريد يبدأ DEP-'}
              slotProps={{ htmlInput: { maxLength: 40 } }} />}
            {V4_PRIVATE_UI && edit === 'new' && <Typography variant="caption" color="text.secondary">
              يُولّد النظام رمزًا تنظيميًا ثابتًا من المسار الكامل، ويعيد استخدام المستويات
              الموجودة دون إنشاء نسخ مكررة. تظل المسودة غير مفعّلة حتى المراجعة.
            </Typography>}
            <Typography variant="body2" color="text.secondary">
              لا نُنشئ مركزًا صحيًا بديلًا للقسم، ولا نعتمد أي تبعية دون مراجعة موثقة.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEdit(null)} disabled={busy}>إلغاء</Button>
          <Button variant="contained" disabled={busy || name.trim().length < 3 ||
            !canSaveFoundation ||
            (isEditingName && name.trim() === (edit as Department).name)}
            onClick={() => void save()}>
            {busy ? 'جارٍ الحفظ...' : 'حفظ القسم كمسودة'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={approval !== null} onClose={() => !busy && setApproval(null)} fullWidth maxWidth="sm">
        <DialogTitle fontWeight={900}>{V4_PRIVATE_UI ? 'تفعيل القسم للتشغيل الداخلي' : 'اعتماد القسم رسميًا'}</DialogTitle>
        <DialogContent dividers>
          <Stack gap={2}>
            <Alert severity="warning">
              {V4_PRIVATE_UI
                ? 'تحقق من الاسم والتسلسل قبل التفعيل. لا يلزم رقم قرار، ولا يتم التفعيل تلقائيًا أثناء الاستيراد.'
                : 'تحقق من التسلسل والاسم والرمز والقرار الرسمي. يجب اعتماد الإدارة الأعلى قبل الأقسام التابعة.'}
            </Alert>
            <Typography fontWeight={850}>{approval?.name}</Typography>
            {!V4_PRIVATE_UI && <TextField fullWidth required label="رقم القرار / مرجع الاعتماد *"
              value={approvalReference} onChange={e => setApprovalReference(e.target.value)}
              slotProps={{ htmlInput: { maxLength: 255 } }}
              helperText="مرجع رسمي لا يقل عن 3 أحرف، يُحفظ في سجل الاعتماد." />}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setApproval(null)}>إلغاء</Button>
          <Button variant="contained" color="success"
            disabled={busy || (!V4_PRIVATE_UI && approvalReference.trim().length < 3)}
            onClick={() => void approve()}>{V4_PRIVATE_UI ? 'تأكيد التفعيل' : 'تأكيد الاعتماد'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={statusTarget !== null} onClose={() => !busy && setStatusTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle fontWeight={900}>
          {statusTarget?.is_active ? 'إيقاف القسم دون حذف' : 'إعادة تفعيل القسم'}
        </DialogTitle>
        <DialogContent dividers>
          <Stack gap={2}>
            <Alert severity="warning">
              {statusTarget?.is_active
                ? 'لا يمكن إيقاف قسم مرتبط بموظفين أو وحدات تنظيمية. لن تُحذف أي بيانات.'
                : 'ستعود إتاحة القسم في القوائم إذا كان معتمدًا مسبقًا.'}
            </Alert>
            <Typography fontWeight={850}>{statusTarget?.name}</Typography>
            <TextField fullWidth multiline minRows={2} required label="سبب الإجراء التوثيقي *"
              value={statusReason} onChange={e => setStatusReason(e.target.value)}
              slotProps={{ htmlInput: { maxLength: 255 } }}
              helperText="10 أحرف على الأقل؛ يُحفظ مع سجل الإجراءات." />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusTarget(null)} disabled={busy}>إلغاء</Button>
          <Button variant="contained" disabled={busy || statusReason.trim().length < 10}
            onClick={() => void saveStatus()}>تأكيد وحفظ</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={detail !== null} onClose={() => setDetail(null)} fullWidth maxWidth="sm">
        <DialogTitle fontWeight={900}>بيانات القسم وسجل اعتماده</DialogTitle>
        <DialogContent dividers>
          <Stack gap={1.4}>
            <Typography variant="h6" fontWeight={900}>{detail?.name}</Typography>
            <Typography>الرمز: {detail?.code}</Typography>
            {detail && reviewGuidance(detail).parentName && <Typography>الجهة الأعلى: {reviewGuidance(detail).parentName}</Typography>}
            <Typography>الحالة: {detail?.is_active ? 'نشط' : 'غير نشط'}</Typography>
            <Typography>الاعتماد: {detail?.is_approved ? 'معتمد' : 'بانتظار الاعتماد'}</Typography>
            <Typography>المرجع: {detail?.approval_reference || '—'}</Typography>
            <Typography>الموظفون المرتبطون: {detail?.employee_count ?? 0}</Typography>
            <Typography>تاريخ التأسيس: {detail?.created_at ? new Date(detail.created_at).toLocaleDateString('ar-SA') : '—'}</Typography>
            <Alert severity="info">
              يبقى القسم في قاعدة البيانات وسجل الاعتماد حتى عند إيقافه؛ لا يُحذف ارتباط موظف محفوظ.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setDetail(null)}>إغلاق</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
