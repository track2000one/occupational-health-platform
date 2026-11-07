import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Alert, Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, FormControlLabel,
  Grid, InputLabel, LinearProgress, MenuItem, Paper, Select, Stack, TextField, Typography,
} from '@mui/material';
import {
  AccountTree as TreeIcon, CloudUpload as UploadIcon, FactCheck as ApproveIcon,
  Refresh as RefreshIcon, VisibilityOutlined as ViewIcon, EditOutlined as EditIcon,
  DescriptionOutlined as ReferenceIcon, ChecklistOutlined as BulkIcon,
  ApartmentOutlined as DepartmentIcon, AccountBalanceOutlined as SectorIcon,
  LocalHospitalOutlined as CenterIcon, GroupsOutlined as UnitIcon,
} from '@mui/icons-material';
import { authFetch, getAccessToken } from '../context/AuthContext';
import { exactCenterSuggestions } from '../utils/organizationMatching';

const API = (import.meta.env.VITE_API_URL || 'https://occupational-health-platform-production.up.railway.app/api').replace(/\/$/, '');
type OrgUnit = {
  id: number; code: string; name: string; kind: 'department' | 'sector' | 'center' | 'unit';
  parent_code: string; parent_name: string; health_center_id: number | null;
  health_center_name: string; source_path: string; source_rows: string;
  is_approved: boolean; is_active: boolean; approval_reference: string;
  review_status: 'approved' | 'ready' | 'await_parent' | 'needs_center_mapping';
};
type OrgSummary = {
  total: number; pending: number; approved: number; by_kind: Record<string, number>;
  by_review_status?: Record<string, number>; mapped_centers?: number;
};
type Center = { id: number; name: string; name_ar?: string; name_en?: string };
type Preview = {
  total: number; kinds: Record<string, number>; mode: string; created: number;
  notice?: string; preview?: Array<{code: string; name: string; kind: string}>;
};
type BulkBlocked = {
  id: number; code: string; name: string; kind: OrgUnit['kind']; reason: string;
};
type BulkPreview = {
  mode: 'preview'; selected_count: number; eligible_count: number; blocked_count: number;
  already_approved_count: number; eligible_by_kind: Record<string, number>;
  eligible_ids: number[]; blocked: BulkBlocked[]; preview_token: string;
};
type BulkResult = {
  mode: 'approved'; approved_count: number; approved_ids: number[];
  blocked_count: number; blocked: BulkBlocked[]; approval_reference: string;
};
const BLOCK_REASON_LABELS: Record<string, string> = {
  inactive: 'جهة غير نشطة', parent_not_approved_or_selected: 'الجهة الأعلى لم تعتمد ولم تُحدد',
  center_mapping_required: 'يلزم ربط المركز بمركز صحي نشط',
  duplicate_center_mapping: 'المركز مسجل لجهة أخرى',
  invalid_parent_center: 'الجهة الأعلى ليست مركزًا صحيًا',
  parent_center_mapping_required: 'المركز الأعلى يحتاج مطابقة',
  unexpected_root_parent: 'وجود ارتباط أعلى غير متوقع',
  invalid_kind: 'تصنيف غير صالح للاعتماد',
};
const REVIEW_LABELS: Record<OrgUnit['review_status'], string> = {
  approved: 'معتمد', ready: 'جاهز للمراجعة', await_parent: 'ينتظر اعتماد الجهة الأعلى',
  needs_center_mapping: 'بانتظار مطابقة المركز',
};
const REVIEW_COLORS: Record<OrgUnit['review_status'], 'success' | 'warning' | 'default' | 'info'> = {
  approved: 'success', ready: 'info', await_parent: 'default', needs_center_mapping: 'warning',
};
const KINDS: Record<OrgUnit['kind'], string> = {
  department: 'جهة / إدارة مركزية', sector: 'قطاع استشاري',
  center: 'مركز صحي', unit: 'قسم / وحدة',
};
async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  if (!token) throw new Error('يلزم تسجيل الدخول بحساب مسؤول Staging.');
  const response = await authFetch(API + path, {
    ...init, headers: { Authorization: 'Bearer ' + token, ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(body.detail || 'تعذّر تنفيذ الإجراء'));
  return body as T;
}
function localizedError(err: unknown) {
  return err instanceof Error ? err.message : 'تعذّر تنفيذ الطلب';
}
export function OrganizationStructurePage() {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';
  const [items, setItems] = useState<OrgUnit[]>([]);
  const [stats, setStats] = useState<OrgSummary>({ total: 0, approved: 0, pending: 0, by_kind: {} });
  const [centers, setCenters] = useState<Center[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const [kindFilter, setKindFilter] = useState('all');
  const [sectorFilter, setSectorFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [mappedCenters, setMappedCenters] = useState<Record<number, string>>({});
  const [approvalRefs, setApprovalRefs] = useState<Record<number, string>>({});
  const [confirmationUnit, setConfirmationUnit] = useState<OrgUnit | null>(null);
  const [detailUnit, setDetailUnit] = useState<OrgUnit | null>(null);
  const [editUnit, setEditUnit] = useState<OrgUnit | null>(null);
  const [referenceUnit, setReferenceUnit] = useState<OrgUnit | null>(null);
  const [editName, setEditName] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkPreview, setBulkPreview] = useState<BulkPreview | null>(null);
  const [bulkReference, setBulkReference] = useState('');
  const [bulkRequestIds, setBulkRequestIds] = useState<number[]>([]);
  const [bulkConsent, setBulkConsent] = useState(false);

  async function reload() {
    const [directory, centerList] = await Promise.all([
      apiRequest<{results: OrgUnit[]; summary: OrgSummary}>('/organization-units/'),
      apiRequest<{results: Center[]; next: string | null} | Center[]>('/health-centers/?active=true&page=1'),
    ]);
    setItems(directory.results);
    setSelectedIds(current => current.filter(id =>
      directory.results.some(unit => unit.id === id && !unit.is_approved && unit.is_active)));
    setStats(directory.summary);
    const allCenters = Array.isArray(centerList) ? centerList : centerList.results;
    if (!Array.isArray(centerList) && centerList.next) {
      for (let page = 2; page <= 40; page += 1) {
        const response = await apiRequest<{results: Center[]; next: string | null}>('/health-centers/?active=true&page=' + page);
        allCenters.push(...response.results);
        if (!response.next) break;
      }
    }
    setCenters(allCenters);
  }
  useEffect(() => { void reload().catch(e => toast.error(localizedError(e))); }, []);

  const sectorSummaries = useMemo(() =>
    items.filter(item => item.kind === 'sector').map(sector => {
      const directCenters = items.filter(item => item.kind === 'center' && item.parent_code === sector.code);
      const centerCodes = new Set(directCenters.map(item => item.code));
      const linkedUnits = items.filter(item => item.kind === 'unit' && centerCodes.has(item.parent_code));
      return { sector, centers: directCenters, units: linkedUnits, approved: [sector, ...directCenters, ...linkedUnits].filter(x => x.is_approved).length };
    }), [items]);

  const filtered = useMemo(() => items.filter(item => {
    if (sectorFilter === 'central' && item.kind !== 'department') return false;
    if (sectorFilter !== 'all' && sectorFilter !== 'central') {
      const centerCodes = new Set(items.filter(unit => unit.kind === 'center' && unit.parent_code === sectorFilter).map(unit => unit.code));
      if (item.code !== sectorFilter && item.parent_code !== sectorFilter && !centerCodes.has(item.parent_code)) return false;
    }
    if (filter === 'pending' && item.is_approved) return false;
    if (filter === 'approved' && !item.is_approved) return false;
    if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
    return [item.name, item.code, item.parent_name, item.source_path].join(' ')
      .toLocaleLowerCase().includes(search.toLocaleLowerCase().trim());
  }).sort((a, b) => {
    const byCode = new Map(items.map(item => [item.code, item]));
    const key = (item: OrgUnit) => {
      const parent = byCode.get(item.parent_code);
      const sector = item.kind === 'unit' ? byCode.get(parent?.parent_code || '') : parent;
      return (item.kind === 'department' ? '~~~~' : sector?.kind === 'sector' ? sector.code : item.kind === 'sector' ? item.code : '~~~')
        + '/' + (parent?.kind === 'center' ? parent.name : '')
        + '/' + ({ sector: 0, center: 1, unit: 2, department: 3 }[item.kind])
        + '/' + item.name;
    };
    return key(a).localeCompare(key(b), 'ar');
  }), [items, filter, kindFilter, sectorFilter, search]);

  function selectPendingScope(scope: 'visible' | 'all' | 'ready') {
    const candidates = scope === 'visible' ? filtered : items;
    setSelectedIds(candidates
      .filter(unit => !unit.is_approved && unit.is_active &&
        (scope !== 'ready' || unit.review_status === 'ready'))
      .map(unit => unit.id));
  }

  async function openBulkReview(unitIds: number[]) {
    if (!unitIds.length) {
      toast.error('اختر سجلًا واحدًا على الأقل للمراجعة الجماعية.');
      return;
    }
    setBusy(true);
    setBulkPreview(null);
    setBulkRequestIds([...unitIds]);
    setBulkReference('');
    setBulkConsent(false);
    try {
      const data = await apiRequest<BulkPreview>('/organization-units/bulk-approval/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', unit_ids: unitIds }),
      });
      setBulkPreview(data);
    } catch (error) {
      toast.error(localizedError(error));
    } finally {
      setBusy(false);
    }
  }

  async function confirmBulkReview() {
    if (!bulkPreview || bulkReference.trim().length < 3 || !bulkConsent) return;
    setBusy(true);
    try {
      const result = await apiRequest<BulkResult>('/organization-units/bulk-approval/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          unit_ids: bulkRequestIds,
          preview_token: bulkPreview.preview_token,
          approval_reference: bulkReference.trim(),
          reference_covers_all: true,
        }),
      });
      setBulkPreview(null);
      setSelectedIds([]);
      await reload();
      toast.success(`تم اعتماد ${result.approved_count} سجلًا. بقي ${result.blocked_count} سجلًا يحتاج استكمال المتطلبات.`);
    } catch (error) {
      toast.error(localizedError(error) + ' — أعد المعاينة قبل المحاولة مجددًا.');
      setBulkPreview(null);
    } finally {
      setBusy(false);
    }
  }

    async function upload(commit: boolean) {
    if (!selectedFile) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', selectedFile);
      if (commit) body.append('confirm', 'IMPORT_ORGANIZATION_DRAFTS_ONLY');
      const data = await apiRequest<Preview>('/organization-units/import/', {
        method: 'POST', body,
      });
      setPreview(data);
      if (commit) {
        await reload();
        toast.success(`تم إنشاء ${data.created} سجل تنظيمي كمسودة فقط دون اعتماد أو تعديل موظفين`);
      } else toast.success('اكتملت معاينة المطابقة؛ لم يُحفظ أي سجل.');
    } catch (e) { toast.error(localizedError(e)); }
    finally { setBusy(false); }
  }

  async function review(item: OrgUnit, action: 'map-center' | 'approve' | 'edit-draft', editedName?: string): Promise<boolean> {
    setBusy(true);
    try {
      await apiRequest('/organization-units/' + item.id + '/review/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          ...(action === 'map-center' ? { center_id: mappedCenters[item.id] }
            : action === 'edit-draft' ? { name: editedName || '' }
              : { approval_reference: approvalRefs[item.id] || '' }),
        }),
      });
      await reload();
      toast.success(action === 'approve' ? 'تم اعتماد السجل وربط مرجع الاعتماد'
        : action === 'map-center' ? 'تمت مطابقة المركز بنجاح' : 'تم حفظ تعديل الاسم مع الاحتفاظ بالمصدر الأصلي');
      return true;
    } catch (e) {
      toast.error(localizedError(e));
      return false;
    } finally { setBusy(false); }
  }

  return (
    <Box sx={{ direction: isRtl ? 'rtl' : 'ltr', pb: 5 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={900}>
            {isRtl ? 'الهيكل التنظيمي والجهات التابعة' : 'Organization Structure'}
          </Typography>
          <Typography color="text.secondary">
            {isRtl ? 'توحيد الجهات والقطاعات والمراكز والوحدات وربطها بالسجلات بعد الاعتماد'
              : 'Approve the hierarchy before linking employees or centers'}
          </Typography>
        </Box>
        <Button startIcon={<RefreshIcon />} onClick={() => void reload().catch(e => toast.error(localizedError(e)))} disabled={busy} variant="outlined">
          {isRtl ? 'تحديث البيانات' : 'Refresh'}
        </Button>
      </Stack>

      <Alert severity="warning" sx={{ mb: 3 }}>
        أسماء ومسارات الجهات المقترحة تحتاج إلى مراجعة واعتماد رسمي. المطابقة مع مركز قائم لا تعني الاعتماد، ولا تغيّر سجلات الموظفين أو المراكز.
      </Alert>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          ['السجلات التنظيمية', stats.total], ['بانتظار الاعتماد', stats.pending],
          ['معتمدة', stats.approved], ['المراكز', stats.by_kind.center || 0],
          ['الوحدات', stats.by_kind.unit || 0], ['القطاعات', stats.by_kind.sector || 0],
        ].map(([label, value]) => (
          <Grid key={String(label)} size={{ xs: 6, md: 2 }}>
            <Card sx={{ borderRadius: 3, height: '100%' }}>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="h4" fontWeight={800}>{value}</Typography>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} gap={1} sx={{ mb: 1.5 }}>
          <Typography fontWeight={900} variant="h6">مراجعة الهيكل حسب القطاع</Typography>
          <Chip color="info" label={`${stats.approved} معتمد من ${stats.total} سجل`} />
        </Stack>
        <LinearProgress variant="determinate" value={stats.total ? Math.round(100 * stats.approved / stats.total) : 0}
          sx={{ height: 8, borderRadius: 4, mb: 2 }} />
        <Stack direction="row" useFlexGap flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
          <Button variant={sectorFilter === 'all' ? 'contained' : 'outlined'} size="small" onClick={() => setSectorFilter('all')}>جميع الجهات ({stats.total})</Button>
          {sectorSummaries.map(({ sector, centers: sectorCenters, units, approved }) => (
            <Button key={sector.code} variant={sectorFilter === sector.code ? 'contained' : 'outlined'} size="small"
              onClick={() => setSectorFilter(sector.code)}>
              {sector.name} · {sectorCenters.length} مراكز · {units.length} وحدات · {approved} معتمد
            </Button>
          ))}
          <Button variant={sectorFilter === 'central' ? 'contained' : 'outlined'} color="secondary" size="small"
            onClick={() => setSectorFilter('central')}>الجهات المركزية ({stats.by_kind.department || 0})</Button>
        </Stack>
        <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
          <Chip color="success" variant="outlined" label={`جاهز للاعتماد: ${stats.by_review_status?.ready || 0}`}/>
          <Chip color="warning" variant="outlined" label={`بانتظار مطابقة المركز: ${stats.by_review_status?.needs_center_mapping || 0}`}/>
          <Chip variant="outlined" label={`ينتظر اعتماد الجهة الأعلى: ${stats.by_review_status?.await_parent || 0}`}/>
          <Chip color="info" variant="outlined" label={`مطابق للمراكز القائمة: ${stats.mapped_centers || 0} من ${stats.by_kind.center || 0}`}/>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          الترتيب: اعتماد القطاعات أولًا، ثم مطابقة المراكز المسجلة واعتمادها، ثم اعتماد الوحدات التابعة لها. الجهات المركزية تراجع منفصلة.
        </Typography>
      </Paper>

      <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
        <Stack direction="row" gap={1} alignItems="center" sx={{ mb: 2 }}>
          <TreeIcon color="primary"/><Typography variant="h6" fontWeight={900}>استيراد ملف المطابقة التنظيمية</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          استخدم الملف المُراجع الذي يحتوي على أوراق «المراكز المقترحة»، و«وحدات المراكز»، و«جهات مركزية».
          لا تُضاف أي جهة إلى قوائم الموظفين قبل اعتمادها فرديًا مع مرجعها الرسمي.
        </Typography>
        <Stack direction={{xs:'column',md:'row'}} gap={1.5} alignItems={{md:'center'}}>
          <Button component="label" variant="outlined" startIcon={<UploadIcon/>} disabled={busy}>
            {selectedFile?.name || 'اختيار ملف Excel (.xlsx)'}
            <input hidden type="file" accept=".xlsx" onChange={e => { setSelectedFile(e.target.files?.[0] || null); setPreview(null); }}/>
          </Button>
          <Button variant="contained" disabled={!selectedFile || busy} onClick={() => void upload(false)}>
            معاينة وتدقيق فقط
          </Button>
          <Button variant="outlined" color="warning" disabled={!selectedFile || !preview || preview.mode !== 'preview' || busy}
            onClick={() => void upload(true)}>
            حفظ كمسودات للمراجعة
          </Button>
          {busy && <CircularProgress size={22}/>}
        </Stack>
        {preview && (
          <Alert severity={preview.mode === 'preview' ? 'info' : 'success'} sx={{ mt: 2 }}>
            إجمالي الكيانات: {preview.total} | القطاعات: {preview.kinds.sector || 0} |
            المراكز: {preview.kinds.center || 0} | الوحدات: {preview.kinds.unit || 0} |
            الجهات المركزية: {preview.kinds.department || 0}
            {preview.mode === 'draft' ? ` | مسودات جديدة: ${preview.created}` : ' | المعاينة فقط دون حفظ'}
          </Alert>
        )}
      </Paper>

      <Paper sx={{ p: 2.5, borderRadius: 3 }}>
        <Stack direction={{xs:'column',md:'row'}} gap={2} sx={{ mb: 2 }} alignItems={{md:'center'}}>
          <Typography variant="h6" fontWeight={900} sx={{ flex: 1 }}>
            مراجعة واعتماد الجهات <Typography component="span" variant="body2" color="text.secondary">({filtered.length} سجل)</Typography>
          </Typography>
          <TextField size="small" value={search} onChange={e => setSearch(e.target.value)} label="بحث بالاسم أو المسار" sx={{ minWidth: 240 }} />
          <FormControl size="small" sx={{minWidth:160}}>
            <InputLabel>التصنيف</InputLabel>
            <Select label="التصنيف" value={kindFilter} onChange={e => setKindFilter(e.target.value)}>
              <MenuItem value="all">كل التصنيفات</MenuItem>
              {Object.entries(KINDS).map(([value,label])=><MenuItem key={value} value={value}>{label}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{minWidth:160}}>
            <InputLabel>الاعتماد</InputLabel>
            <Select label="الاعتماد" value={filter} onChange={e => setFilter(e.target.value as typeof filter)}>
              <MenuItem value="all">الكل</MenuItem><MenuItem value="pending">بانتظار الاعتماد</MenuItem>
              <MenuItem value="approved">معتمد</MenuItem>
            </Select>
          </FormControl>
        </Stack>
        <Paper variant="outlined" sx={{ mb: 2.5, px: 2, py: 1.5, borderRadius: 2.5, bgcolor: '#f0f7fd', borderColor: '#c6ddeb' }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} alignItems={{ lg: 'center' }} gap={1.25} justifyContent="space-between">
            <Stack direction="row" useFlexGap flexWrap="wrap" gap={0.75} alignItems="center">
              <Chip label={`المحدد: ${selectedIds.length}`} color={selectedIds.length ? 'primary' : 'default'} sx={{ fontWeight: 900 }} />
              <Button size="small" variant="outlined" disabled={busy} onClick={() => selectPendingScope('all')}>تحديد الكل</Button>
              <Button size="small" variant="outlined" disabled={busy} onClick={() => selectPendingScope('visible')}>تحديد المعروض</Button>
              <Button size="small" variant="text" disabled={busy} onClick={() => selectPendingScope('ready')}>تحديد الجاهز</Button>
              <Button size="small" color="inherit" disabled={!selectedIds.length || busy} onClick={() => setSelectedIds([])}>إلغاء التحديد</Button>
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
              <Button variant="outlined" disabled={busy || !selectedIds.length} startIcon={<BulkIcon />}
                onClick={() => void openBulkReview(selectedIds)}>
                اعتماد المحدد ({selectedIds.length})
              </Button>
              <Button variant="contained" color="success" disabled={busy || !items.some(unit => !unit.is_approved && unit.is_active)}
                startIcon={<ApproveIcon />}
                onClick={() => void openBulkReview(items.filter(unit => !unit.is_approved && unit.is_active).map(unit => unit.id))}>
                اعتماد جميع السجلات المؤهلة
              </Button>
            </Stack>
          </Stack>
          <Typography sx={{ color: '#536c80', fontSize: '13px', mt: 1, lineHeight: 1.6 }}>
            قبل الاعتماد ستظهر معاينة توضح السجلات المؤهلة والمعلّقة، ولا يُعتمد أي سجل دون مرجع رسمي وتأكيد صريح.
            يمكن اعتماد القطاع ثم المركز ثم الوحدة في دفعة واحدة إذا اكتملت مطابقة المركز.
          </Typography>
        </Paper>
        <Divider sx={{mb:2}}/>

        <Grid container spacing={{ xs: 2, md: 2.25 }} sx={{ pt: 0.5 }}>
          {filtered.map(unit => {
            const kindIcon = unit.kind === 'center' ? <CenterIcon fontSize="small" />
              : unit.kind === 'sector' ? <SectorIcon fontSize="small" />
              : unit.kind === 'unit' ? <UnitIcon fontSize="small" />
              : <DepartmentIcon fontSize="small" />;
            const needsReview = unit.review_status !== 'ready' && !unit.is_approved;
            return (
              <Grid key={unit.id} size={{ xs: 12, sm: 6, lg: 4, xl: 3 }} sx={{ display: 'flex', minWidth: 0 }}>
                <Card sx={{
                  width: '100%', display: 'flex', flexDirection: 'column', minWidth: 0,
                  background: 'linear-gradient(155deg, #ffffff 0%, #f5faff 100%)',
                  border: '1px solid #bdd3e4', borderTop: '4px solid #155d86',
                  borderRadius: '15px', boxShadow: '0 7px 17px rgba(22, 65, 98, 0.12)',
                  transition: 'transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease',
                  '&:hover': { transform: 'translateY(-3px)', boxShadow: '0 15px 28px rgba(22, 65, 98, 0.18)', borderColor: '#69a0c4' },
                }}>
                  <CardContent sx={{ p: 2.25, pb: '18px !important', display: 'flex', flexDirection: 'column', flexGrow: 1, gap: 1.3, minWidth: 0 }}>
                    <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1} sx={{ minHeight: 38 }}>
                      {!unit.is_approved && <Checkbox
                        size="small" disabled={busy || !unit.is_active}
                        checked={selectedIds.includes(unit.id)}
                        onChange={(_, checked) => setSelectedIds(current =>
                          checked ? Array.from(new Set([...current, unit.id])) : current.filter(id => id !== unit.id))}
                        inputProps={{ 'aria-label': `تحديد ${unit.name} للاعتماد الجماعي` }}
                        sx={{ flexShrink: 0, p: 0.3, color: '#155d86' }}
                      />}
                      <Chip size="small" color={unit.is_active ? 'success' : 'default'}
                        label={unit.is_active ? 'نشط' : 'غير نشط'}
                        variant="outlined" sx={{ flexShrink: 0, fontWeight: 800, fontSize: '12px', height: 29 }} />
                      <Typography component="h3" sx={{
                        fontWeight: 900, color: '#143f61', fontSize: '17px', textAlign: 'right',
                        lineHeight: 1.5, overflowWrap: 'anywhere', minWidth: 0, wordBreak: 'break-word',
                      }}>{unit.name}</Typography>
                    </Stack>

                    <Box title={unit.source_path || unit.name} sx={{ minHeight: 40, minWidth: 0 }}>
                      <Typography sx={{
                        textAlign: 'right', fontSize: '13.5px', fontWeight: 600, lineHeight: 1.6,
                        color: '#4d6880', overflowWrap: 'anywhere',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}>{unit.source_path || unit.parent_name || 'جهة تنظيمية رئيسية'}</Typography>
                    </Box>

                    <Box sx={{
                      borderRadius: 2, px: 1.5, py: 1.1,
                      bgcolor: '#ecf4fa', display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between', gap: 1, minWidth: 0,
                    }}>
                      <Stack direction="row" alignItems="center" gap={0.5} sx={{ minWidth: 0 }}>
                        <Box sx={{ color: '#17638c', display: 'flex' }}>{kindIcon}</Box>
                        <Typography sx={{ fontSize: '12.5px', fontWeight: 800, color: '#34576c', overflowWrap: 'anywhere' }}>{KINDS[unit.kind]}</Typography>
                      </Stack>
                      <Typography sx={{ fontSize: '12px', color: '#174364', fontWeight: 850, flexShrink: 0 }} dir="ltr">{unit.code}</Typography>
                    </Box>

                    <Box sx={{
                      display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)',
                      columnGap: 1.4, rowGap: 1.15, minWidth: 0,
                      '& .org-label': { fontSize: '12px', fontWeight: 750, color: '#627d91', mb: 0.4 },
                      '& .org-value': { fontSize: '13.5px', fontWeight: 800, color: '#25445c', lineHeight: 1.5, overflowWrap: 'anywhere' },
                    }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography className="org-label">الجهة الأعلى</Typography>
                        <Typography className="org-value">{unit.parent_name || 'جهة / إدارة مركزية'}</Typography>
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography className="org-label">المركز المرتبط</Typography>
                        <Typography className="org-value">{unit.health_center_name || '—'}</Typography>
                      </Box>
                    </Box>

                    <Box sx={{ mt: 'auto', pt: 0.8 }}>
                      <Chip size="small" color={REVIEW_COLORS[unit.review_status] || 'default'}
                        label={REVIEW_LABELS[unit.review_status] || 'بانتظار المراجعة'}
                        sx={{ maxWidth: '100%', height: 28, fontSize: '12px', fontWeight: 800, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }} />
                      {needsReview && <Typography sx={{ fontSize: '12px', lineHeight: 1.6, color: '#607a90', mt: 0.5 }}>
                        {unit.review_status === 'await_parent' ? 'يجب اعتماد الجهة الأعلى أولًا' : 'يلزم التحقق من مطابقة المركز'}
                      </Typography>}
                    </Box>

                    <Divider sx={{ borderColor: '#d6e4ec' }} />

                    <Box sx={{
                      display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))',
                      gap: 0.7, minWidth: 0, '& .MuiButton-root': {
                        minWidth: 0, minHeight: 54, padding: '7px 4px',
                        fontSize: '12.5px', fontWeight: 850, lineHeight: 1.3,
                        borderRadius: 2, whiteSpace: 'normal', textAlign: 'center',
                        flexDirection: 'column', gap: 0.3,
                      },
                      '& .MuiButton-startIcon': { margin: 0, '& svg': { fontSize: 20 } },
                    }}>
                      <Button variant="contained" size="small" startIcon={<ViewIcon />}
                        sx={{ bgcolor: '#14527e', '&:hover': { bgcolor: '#093c60' } }}
                        onClick={() => setDetailUnit(unit)}>مراجعة</Button>
                      <Button variant="outlined" size="small" color="success" startIcon={<ApproveIcon />}
                        disabled={busy || unit.review_status !== 'ready'}
                        title={unit.review_status === 'ready' ? 'الاعتماد بعد إدخال المرجع الرسمي' : (REVIEW_LABELS[unit.review_status] || 'متطلبات الاعتماد غير مكتملة')}
                        onClick={() => setConfirmationUnit(unit)}>اعتماد</Button>
                      <Button variant="outlined" size="small" color="primary" startIcon={<EditIcon />}
                        disabled={busy || unit.is_approved}
                        onClick={() => { setEditUnit(unit); setEditName(unit.name); }}>تعديل</Button>
                      <Button variant="outlined" size="small" color="inherit" startIcon={<ReferenceIcon />}
                        onClick={() => setReferenceUnit(unit)}>مرجع الاعتماد</Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
          {!filtered.length && (
            <Grid size={{ xs: 12 }}>
              <Alert severity="info">لا توجد جهات مطابقة للتصفية الحالية. جرّب تغيير القطاع أو حالة الاعتماد.</Alert>
            </Grid>
          )}
        </Grid>
        <Typography variant="caption" color="text.secondary">{filtered.length} سجل معروض — لا يظهر غير المعتمد في سجل الموظفين.</Typography>
      </Paper>

      <Dialog open={detailUnit !== null} onClose={() => !busy && setDetailUnit(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 900 }}>مراجعة بيانات الجهة التنظيمية</DialogTitle>
        <DialogContent dividers>
          {detailUnit && <Stack spacing={2}>
            <Typography variant="h6" sx={{ fontWeight: 900, overflowWrap: 'anywhere' }}>{detailUnit.name}</Typography>
            <Chip color={REVIEW_COLORS[detailUnit.review_status]} label={REVIEW_LABELS[detailUnit.review_status]} sx={{ alignSelf: 'flex-start' }} />
            <Box sx={{ display: 'grid', gridTemplateColumns: '110px minmax(0,1fr)', gap: 1.2, '& > *': { overflowWrap: 'anywhere' } }}>
              <Typography color="text.secondary">رمز السجل</Typography><Typography fontWeight={750}>{detailUnit.code}</Typography>
              <Typography color="text.secondary">التصنيف</Typography><Typography>{KINDS[detailUnit.kind]}</Typography>
              <Typography color="text.secondary">الجهة الأعلى</Typography><Typography>{detailUnit.parent_name || '—'}</Typography>
              <Typography color="text.secondary">المركز المرتبط</Typography><Typography>{detailUnit.health_center_name || 'غير مرتبط'}</Typography>
              <Typography color="text.secondary">المسار المصدر</Typography><Typography>{detailUnit.source_path || '—'}</Typography>
              <Typography color="text.secondary">صفوف المصدر</Typography><Typography>{detailUnit.source_rows || '—'}</Typography>
            </Box>
            {detailUnit.kind === 'center' && !detailUnit.is_approved && <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#edf6fc' }}>
              <Typography fontWeight={850} sx={{ mb: 1 }}>مطابقة مع مركز صحي قائم</Typography>
              {(() => {
                const proposals = exactCenterSuggestions(detailUnit.name, centers);
                return proposals.length === 1
                  ? <Alert severity="info" sx={{ mb: 1 }}>اقتراح بالاسم: {proposals[0].name_ar || proposals[0].name} — يلزم تأكيد الاختيار يدويًا.</Alert>
                  : proposals.length > 1 ? <Alert severity="warning" sx={{ mb: 1 }}>توجد أسماء متشابهة؛ اختر المركز بعد التحقق.</Alert> : null;
              })()}
              <TextField select fullWidth size="small" label="المركز المسجل" sx={{ mb: 1.5 }}
                value={mappedCenters[detailUnit.id] || String(detailUnit.health_center_id || '')}
                onChange={event => setMappedCenters(prev => ({...prev, [detailUnit.id]: String(event.target.value)}))}>
                <MenuItem value="">اختر المركز</MenuItem>
                {centers.map(center => <MenuItem key={center.id} value={String(center.id)}>{center.name_ar || center.name}</MenuItem>)}
              </TextField>
              <Button variant="contained" disabled={busy || !mappedCenters[detailUnit.id] || mappedCenters[detailUnit.id] === String(detailUnit.health_center_id)}
                onClick={async () => { if (await review(detailUnit, 'map-center')) setDetailUnit(null); }}>حفظ مطابقة المركز</Button>
            </Box>}
            {detailUnit.is_approved && <Alert severity="success">مرجع الاعتماد: {detailUnit.approval_reference || '—'}</Alert>}
          </Stack>}
        </DialogContent>
        <DialogActions><Button onClick={() => setDetailUnit(null)} disabled={busy}>إغلاق</Button></DialogActions>
      </Dialog>

      <Dialog open={editUnit !== null} onClose={() => !busy && setEditUnit(null)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}>
        <DialogTitle sx={{ fontWeight: 900, fontSize: '20px', color: '#143f61', py: 2.2 }}>تعديل اسم الجهة قبل الاعتماد</DialogTitle>
        <DialogContent dividers sx={{ py: 2.5 }}>
          <Alert severity="info" sx={{ mb: 2.5, '& .MuiAlert-message': { fontSize: '14px', lineHeight: 1.8 } }}>
            يُسمح بتصحيح الاسم المعروض فقط. تبقى رموز الجهات والمسارات المصدرية والارتباطات الأصلية محفوظة.
          </Alert>
          <TextField fullWidth required label="اسم الجهة / الوحدة" value={editName} onChange={event => setEditName(event.target.value)}
            sx={{ '& .MuiInputBase-input': { fontSize: '16px', py: 1.7 }, '& .MuiInputLabel-root': { fontSize: '14px' } }}
            slotProps={{ htmlInput: { maxLength: 220 } }} />
          <Typography sx={{ color: '#647c90', mt: 1.1, fontSize: '13px' }}>
            التعديل يقتصر على الاسم الظاهر، دون اعتماد الجهة أو تغيير ارتباطاتها.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1, '& .MuiButton-root': { fontSize: '14px', fontWeight: 800, minHeight: 39 } }}>
          <Button onClick={() => setEditUnit(null)} disabled={busy}>إلغاء</Button>
          <Button variant="contained" disabled={busy || !editName.trim() || editName.trim() === editUnit?.name}
            onClick={async () => { if (editUnit && await review(editUnit, 'edit-draft', editName)) setEditUnit(null); }}>حفظ التعديل</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={referenceUnit !== null} onClose={() => setReferenceUnit(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 900 }}>مرجع الاعتماد الرسمي</DialogTitle>
        <DialogContent dividers>
          <Typography fontWeight={800} sx={{ mb: 1 }}>{referenceUnit?.name}</Typography>
          {referenceUnit?.is_approved
            ? <Alert severity="success">المرجع المعتمد: {referenceUnit.approval_reference}</Alert>
            : <>
                <TextField label="الرقم / المرجع الرسمي" fullWidth value={referenceUnit ? approvalRefs[referenceUnit.id] || '' : ''}
                  onChange={e => { if (referenceUnit) setApprovalRefs(prev => ({ ...prev, [referenceUnit.id]: e.target.value })); }}
                  helperText="يُستخدم المرجع عند الاعتماد النهائي، ولا يُحفظ في قاعدة البيانات قبل الاعتماد."
                  slotProps={{ htmlInput: { maxLength: 255 } }} />
                <Alert severity="info" sx={{ mt: 2 }}>المرجع مُعد للإدخال فقط. لا يُعتمد السجل دون التأكيد من زر «اعتماد».</Alert>
              </>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReferenceUnit(null)}>إغلاق</Button>
          {referenceUnit && !referenceUnit.is_approved && referenceUnit.review_status === 'ready' && (
            <Button color="success" variant="contained" disabled={(approvalRefs[referenceUnit.id] || '').trim().length < 3}
              onClick={() => { setConfirmationUnit(referenceUnit); setReferenceUnit(null); }}>متابعة الاعتماد</Button>
          )}
        </DialogActions>
      </Dialog>
      <Dialog open={bulkPreview !== null} onClose={() => !busy && setBulkPreview(null)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 900 }}>اعتماد جماعي — معاينة قبل التنفيذ</DialogTitle>
        <DialogContent dividers>
          {bulkPreview && <Stack spacing={2}>
            <Alert severity={bulkPreview.blocked_count ? 'warning' : 'info'}>
              لن يعتمد النظام جميع السجلات دون استيفاء الشروط. المعاينة تحدد السجلات التي سيُعتمد وضعها فقط.
            </Alert>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 1 }}>
              {[
                ['المحددة', bulkPreview.selected_count],
                ['مؤهلة للاعتماد', bulkPreview.eligible_count],
                ['تحتاج معالجة', bulkPreview.blocked_count],
              ].map(([label, number]) => <Box key={label} sx={{ border: '1px solid #c7ddea', borderRadius: 2, p: 1.5, textAlign: 'center' }}>
                <Typography sx={{ fontSize: 23, fontWeight: 900 }}>{number}</Typography>
                <Typography sx={{ fontSize: 12, fontWeight: 750, color: 'text.secondary' }}>{label}</Typography>
              </Box>)}
            </Box>
            <Typography fontWeight={800}>سيُعتمد من هذه الدفعة:</Typography>
            <Typography variant="body2">
              {[
                ['القطاعات', bulkPreview.eligible_by_kind.sector || 0],
                ['المراكز', bulkPreview.eligible_by_kind.center || 0],
                ['الوحدات', bulkPreview.eligible_by_kind.unit || 0],
                ['الجهات المركزية', bulkPreview.eligible_by_kind.department || 0],
              ].map(([name, total]) => `${name}: ${total}`).join(' | ')}
            </Typography>
            {bulkPreview.blocked_count > 0 && <Box sx={{ maxHeight: 175, overflowY: 'auto', bgcolor: '#fff7eb', borderRadius: 2, p: 1.5 }}>
              <Typography fontWeight={900} sx={{ mb: 1 }}>السجلات التي ستبقى معلّقة:</Typography>
              {bulkPreview.blocked.map(item => <Typography key={item.id} variant="body2" sx={{ mb: 0.6 }}>
                {item.name} — {BLOCK_REASON_LABELS[item.reason] || item.reason}
              </Typography>)}
            </Box>}
            <TextField fullWidth required label="مرجع الاعتماد الرسمي للدفعة" value={bulkReference}
              onChange={event => setBulkReference(event.target.value)}
              helperText="أدخل مرجعًا معتمدًا يغطي جميع السجلات المؤهلة في هذه الدفعة."
              slotProps={{ htmlInput: { maxLength: 255 } }} />
            <FormControlLabel
              control={<Checkbox checked={bulkConsent} onChange={(_, checked) => setBulkConsent(checked)} />}
              label={<Typography variant="body2" fontWeight={750}>
                أقر بأن مرجع الاعتماد يغطي جميع السجلات التي ستُعتمد، وأنني راجعت القائمة المؤهلة والمعلّقة.
              </Typography>}
            />
            <Alert severity="info">سيتم توثيق الاعتماد باسم المستخدم ومرجعه. لن تتغير بيانات الموظفين أو سجلات المراكز الصحية.</Alert>
          </Stack>}
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button disabled={busy} onClick={() => setBulkPreview(null)}>إلغاء</Button>
          <Button variant="contained" color="success" disabled={
            busy || !bulkPreview || !bulkPreview.eligible_count ||
            bulkReference.trim().length < 3 || !bulkConsent
          } onClick={() => void confirmBulkReview()}>
            {busy ? 'جارٍ الاعتماد...' : `تأكيد اعتماد ${bulkPreview?.eligible_count || 0} سجل`}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={confirmationUnit !== null} onClose={() => !busy && setConfirmationUnit(null)} maxWidth="sm" fullWidth>
        <DialogTitle>تأكيد اعتماد جهة تنظيمية</DialogTitle>
        <DialogContent dividers>
          <Alert severity="warning" sx={{ mb: 2 }}>
            يرجى التحقق من المرجع الرسمي قبل الاعتماد. يصبح السجل متاحًا للربط حسب ضوابط المركز، ولا يمكن التراجع من هذه الشاشة.
          </Alert>
          <Typography fontWeight={900}>{confirmationUnit?.name}</Typography>
          <Typography color="text.secondary" variant="body2">
            {confirmationUnit?.parent_name ? `تتبع: ${confirmationUnit.parent_name}` : 'جهة تنظيمية عليا'}
          </Typography>
          <Box sx={{ mt: 2 }}>
            <TextField fullWidth label="مرجع الاعتماد الرسمي" size="small" required
              value={confirmationUnit ? approvalRefs[confirmationUnit.id] || '' : ''}
              onChange={event => { if (confirmationUnit) setApprovalRefs(prev => ({ ...prev, [confirmationUnit.id]: event.target.value })); }}
              slotProps={{ htmlInput: { maxLength: 255 } }} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setConfirmationUnit(null)}>إلغاء</Button>
          <Button disabled={busy || !confirmationUnit || confirmationUnit.review_status !== 'ready' || (confirmationUnit && (approvalRefs[confirmationUnit.id] || '').trim().length < 3)} variant="contained" color="success"
            onClick={async () => {
              if (!confirmationUnit) return;
              if (await review(confirmationUnit, 'approve')) setConfirmationUnit(null);
            }}>
            تأكيد الاعتماد
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
