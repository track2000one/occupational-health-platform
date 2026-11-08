import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  InputAdornment, MenuItem, Paper, Stack, Switch, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import {
  Add as AddIcon, Business as BusinessIcon, Edit as EditIcon, Refresh as RefreshIcon,
  UploadFile as UploadFileIcon, FactCheck as FoundationIcon, Apps as CardsViewIcon, TableRows as TableViewIcon,
  Search as SearchIcon, ToggleOff as ToggleOffIcon,
  DeleteOutline as DeleteIcon, DeleteSweep as ResetIcon, Restore as RestoreIcon,
  Inventory2 as ArchiveIcon,
} from '@mui/icons-material';
import { toast } from 'sonner';
import { authFetch, getAccessToken, useAuth } from '../context/AuthContext';
import { HealthCenterExcelImportDialog } from '../components/HealthCenterExcelImportDialog';
import { HealthCenterArchiveDialog, type CenterArchiveAction } from '../components/HealthCenterArchiveDialog';

// Never silently send Staging staff edits to the Production API.
const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

type Center = {
  id: number; name: string; name_ar?: string; name_en?: string; code?: string | null; region: string; city: string; district: string; manager_name?: string;
  building_type: 'unknown' | 'model' | 'rented' | 'owned' | 'other'; building_type_label?: string;
  is_active: boolean; is_archived?: boolean; notes?: string; employee_count?: number; user_count?: number;
};
type OrgCenter = {
  id: number; code: string; name: string; kind: 'department' | 'sector' | 'center' | 'unit';
  health_center_id: number | null; parent_code: string; parent_name: string;
  is_approved: boolean; review_status: string;
};
type CenterForm = { name_ar: string; name_en: string; code: string; region: string; city: string; district: string; manager_name: string; building_type: Center['building_type']; is_active: boolean; notes: string };
const EMPTY_FORM: CenterForm = { name_ar: '', name_en: '', code: '', region: '', city: '', district: '', manager_name: '', building_type: 'unknown', is_active: true, notes: '' };

function list<T>(payload: any): T[] { return Array.isArray(payload) ? payload : Array.isArray(payload?.results) ? payload.results : []; }
async function request<T>(path: string, init: RequestInit = {}) {
  const token = getAccessToken();
  if (!token) throw new Error('Authentication required');
  if (!API_BASE_URL) throw new Error('لم يتم ضبط VITE_API_URL؛ تم إيقاف الطلب لحماية بيانات Production.');
  const response = await authFetch(`${API_BASE_URL}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) } });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const first = body && typeof body === 'object' ? Object.values(body)[0] : null;
    throw new Error(typeof body?.detail === 'string' ? body.detail : Array.isArray(first) ? String(first[0]) : String(first || 'Request failed'));
  }
  return body as T;
}

export function HealthCentersPage() {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';
  const { user } = useAuth();
  const canImport = user?.isSuperuser === true || user?.role === 'systemAdmin' || user?.role === 'ohManager';
  const canArchiveCenters = user?.isSuperuser === true;
  const [archiveAction, setArchiveAction] = useState<CenterArchiveAction | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Center | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedCenters, setArchivedCenters] = useState<Center[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [centers, setCenters] = useState<Center[]>([]);
  const [organizationUnits, setOrganizationUnits] = useState<OrgCenter[]>([]);
  // Default to all records: the source-reference subset may contain none.
  const [sourceFilter, setSourceFilter] = useState<'reference' | 'all' | 'qa' | 'other'>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [loadError, setLoadError] = useState('');
  const [sectorFilter, setSectorFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Center | null>(null);
  const [form, setForm] = useState<CenterForm>(EMPTY_FORM);

  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      const first = await request<Center[] | { results: Center[]; next: string | null }>('/health-centers/?page=1');
      const all = list<Center>(first);
      if (!Array.isArray(first) && first.next) {
        for (let page = 2; page <= 40; page++) {
          const data = await request<{results: Center[]; next: string | null}>(`/health-centers/?page=${page}`);
          all.push(...data.results);
          if (!data.next) break;
        }
      }
      setCenters(all);
      if (canArchiveCenters) {
        const archived = await request<Center[] | { results: Center[]; next: string | null }>('/health-centers/?archived=true&page=1');
        const archivedList = list<Center>(archived);
        if (!Array.isArray(archived) && archived.next) {
          for (let page = 2; page <= 40; page++) {
            const next = await request<{ results: Center[]; next: string | null }>(
              `/health-centers/?archived=true&page=${page}`);
            archivedList.push(...next.results);
            if (!next.next) break;
          }
        }
        setArchivedCenters(archivedList);
      }
      // The organizational directory is a non-destructive proposal: not an approval.
      try {
        const directory = await request<{results: OrgCenter[]}>('/organization-units/');
        setOrganizationUnits(directory.results || []);
      } catch {
        setOrganizationUnits([]);
        toast.warning('تعذر تحميل روابط الهيكل التنظيمي؛ أسماء المراكز ستظل متاحة.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load health centers';
      setLoadError(message);
      toast.error(message);
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const centerOrg = useMemo(() => {
    const byId = new Map<number, OrgCenter>();
    organizationUnits.filter(u => u.kind === 'center' && u.health_center_id !== null)
      .forEach(unit => byId.set(unit.health_center_id as number, unit));
    return byId;
  }, [organizationUnits]);

  const isQA = (center: Center) =>
    /^QA[-_]/i.test(center.code || '') ||
    /^QA Synthetic/i.test(center.name) ||
    /مركز صحي تجريبي/.test(center.name_ar || '');

  const isFromSource = (center: Center) =>
    centerOrg.has(center.id) || /^OHP-REF-C\d{3}$/.test(center.code || '');

  const visibleCenters = showArchived ? archivedCenters : centers;
  const sourceCenters = useMemo(() => visibleCenters.filter(isFromSource), [visibleCenters, centerOrg]);
  const qaCenters = useMemo(() => visibleCenters.filter(isQA), [visibleCenters]);
  const sectorNames = useMemo(() => [...new Set(
    organizationUnits.filter(unit => unit.kind === 'sector').map(unit => unit.name),
  )].sort((a, b) => a.localeCompare(b, 'ar')), [organizationUnits]);
  const regions = useMemo(() => [...new Set(visibleCenters.map(c => c.region).filter(Boolean))].sort(), [visibleCenters]);
  const cities = useMemo(() => [...new Set(visibleCenters.filter(c => regionFilter === 'all' || c.region === regionFilter).map(c => c.city).filter(Boolean))].sort(), [visibleCenters, regionFilter]);
  const filtered = useMemo(() => visibleCenters.filter(center => {
    const q = search.trim().toLowerCase();
    const org = centerOrg.get(center.id);
    const matchesSearch = !q || [
      center.name_ar, center.name_en, center.name, center.code, center.region,
      center.city, center.district, center.manager_name, org?.parent_name,
    ].filter(Boolean).join(' ').toLowerCase().includes(q);
    const matchesSource = sourceFilter === 'all'
      || (sourceFilter === 'reference' && isFromSource(center))
      || (sourceFilter === 'qa' && isQA(center))
      || (sourceFilter === 'other' && !isFromSource(center) && !isQA(center));
    return matchesSearch && matchesSource
      && (sectorFilter === 'all' || org?.parent_name === sectorFilter)
      && (regionFilter === 'all' || center.region === regionFilter)
      && (cityFilter === 'all' || center.city === cityFilter)
      && (statusFilter === 'all' || (statusFilter === 'active' ? center.is_active : !center.is_active));
  }).sort((a, b) =>
    (centerOrg.get(a.id)?.parent_name || '').localeCompare(centerOrg.get(b.id)?.parent_name || '', 'ar')
    || (a.name_ar || a.name).localeCompare(b.name_ar || b.name, 'ar')
  ), [visibleCenters, centerOrg, sourceFilter, sectorFilter, search, regionFilter, cityFilter, statusFilter]);

  const buildingLabel = (type: Center['building_type']) => ({ unknown: isRtl ? 'غير محدد' : 'Unspecified', model: isRtl ? 'نموذجي' : 'Model', rented: isRtl ? 'مستأجر' : 'Rented', owned: isRtl ? 'مملوك' : 'Owned', other: isRtl ? 'أخرى' : 'Other' }[type]);
  const displayName = (center: Center) => (isRtl ? center.name_ar : center.name_en) || center.name || center.name_en || center.name_ar || '—';
  const secondaryName = (center: Center) => { const value = isRtl ? center.name_en : center.name_ar; return value && value !== displayName(center) ? value : ''; };
  function openCenterArchive(action: CenterArchiveAction, center?: Center) {
    setArchiveTarget(center || null);
    setArchiveAction(action);
  }
  function toggleArchiveView() {
    setShowArchived(prev => !prev);
    resetFilters();
  }
  function openAdd() { setEditing(null); setForm(EMPTY_FORM); setOpen(true); }
  function openEdit(center: Center) { setEditing(center); setForm({ name_ar: center.name_ar || '', name_en: center.name_en || center.name || '', code: center.code || '', region: center.region || '', city: center.city || '', district: center.district || '', manager_name: center.manager_name || '', building_type: center.building_type || 'unknown', is_active: center.is_active, notes: center.notes || '' }); setOpen(true); }
  function update<K extends keyof CenterForm>(key: K, value: CenterForm[K]) { setForm(current => ({ ...current, [key]: value })); }
  function resetFilters() {
    setSourceFilter('all');
    setSectorFilter('all');
    setRegionFilter('all');
    setCityFilter('all');
    setStatusFilter('all');
    setSearch('');
  }

  async function save() {
    if (!form.name_ar.trim()) return toast.error(isRtl ? 'اسم المركز الصحي بالعربية مطلوب' : 'Arabic health center name is required');
    // Original source does not supply English translations or building type.
    // Preserve 'unknown' instead of inventing administrative facts.
    setSaving(true);
    try {
      const payload = { ...form, name: form.name_en.trim() || form.name_ar.trim(), name_ar: form.name_ar.trim(), name_en: form.name_en.trim(), code: form.code?.trim() || null, region: form.region.trim(), city: form.city.trim(), district: form.district.trim(), manager_name: form.manager_name.trim(), notes: form.notes?.trim() || '' };
      const saved = editing
        ? await request<Center>(`/health-centers/${editing.id}/`, { method: 'PATCH', body: JSON.stringify(payload) })
        : await request<Center>('/health-centers/', { method: 'POST', body: JSON.stringify(payload) });
      setCenters(current => editing
        ? current.map(center => center.id === saved.id ? saved : center)
        : [saved, ...current]);
      toast.success(isRtl ? 'تم حفظ بيانات المركز الصحي' : 'Health center saved');
      setOpen(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  async function toggleCenter(center: Center) {
    try {
      const updated = await request<Center>(`/health-centers/${center.id}/`, { method: 'PATCH', body: JSON.stringify({ is_active: !center.is_active }) });
      setCenters(current => current.map(item => item.id === updated.id ? updated : item));
      toast.success(center.is_active ? (isRtl ? 'تم تعطيل المركز مع الاحتفاظ بالسجلات السابقة' : 'Center deactivated; historical records kept') : (isRtl ? 'تم تفعيل المركز' : 'Center activated'));
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Update failed'); }
  }

  return <Box dir={isRtl ? 'rtl' : 'ltr'}>
    {canImport && <HealthCenterExcelImportDialog
      open={importOpen} onClose={() => setImportOpen(false)}
      onImported={() => load()} />}
    {canArchiveCenters && <HealthCenterArchiveDialog
      open={archiveAction !== null}
      action={archiveAction}
      center={archiveTarget ? { id: archiveTarget.id, name: displayName(archiveTarget) } : null}
      onClose={() => { setArchiveAction(null); setArchiveTarget(null); }}
      onComplete={async () => { await load(); resetFilters(); }} />}
    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={2} sx={{ mb: 3 }}>
      <Stack direction="row" spacing={1.5} alignItems="center"><BusinessIcon sx={{ fontSize: 38, color: 'primary.main' }} /><Box><Typography variant="h4" fontWeight={950}>{isRtl ? 'إدارة المراكز الصحية' : 'Health Centers Management'}</Typography><Typography variant="body2" color="text.secondary">{isRtl ? 'قاعدة البيانات المركزية المعتمدة لأسماء المراكز ومواقعها ونوع المبنى' : 'Central master data for health centers, locations, and building type'}</Typography></Box></Stack>
      <Stack direction="row" spacing={1} flexWrap="wrap">
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => void load()}>
          {isRtl ? 'تحديث' : 'Refresh'}
        </Button>
        {canImport && <Button variant="outlined" color="primary" startIcon={<FoundationIcon />}
          onClick={() => navigate('/admin/center-foundation')}>
          {isRtl ? 'تأسيس المرجع ومراجعة المراكز' : 'Center Reference & Review'}
        </Button>}
        {canImport && <Button variant="outlined" startIcon={<UploadFileIcon />}
          onClick={() => setImportOpen(true)}>
          {isRtl ? 'استيراد المراكز من Excel' : 'Import centers from Excel'}
        </Button>}
        {canArchiveCenters && <>
          <Button variant={showArchived ? 'contained' : 'outlined'} color="secondary"
            startIcon={showArchived ? <RestoreIcon /> : <ArchiveIcon />}
            onClick={toggleArchiveView}>
            {showArchived ? 'العودة للمراكز المسجلة' : `المراكز المحذوفة (${archivedCenters.length})`}
          </Button>
          <Button variant="outlined" color="error" startIcon={<ResetIcon />}
            disabled={loading || centers.length === 0}
            onClick={() => openCenterArchive('reset')}>
            تصفير
          </Button>
          {archivedCenters.length > 0 && <Button variant="outlined" color="success"
            startIcon={<RestoreIcon />}
            onClick={() => openCenterArchive('restore_batch')}>
            استعادة آخر دفعة
          </Button>}
        </>}
        <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
          {isRtl ? 'إضافة مركز صحي' : 'Add Health Center'}
        </Button>
      </Stack>
    </Stack>

    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4,1fr)' }, gap: 2, mb: 2.5 }}>
      {[
        [isRtl ? 'إجمالي المراكز المعروضة' : 'All visible centers', visibleCenters.length],
        [isRtl ? 'المراكز النشطة' : 'Active centers', centers.filter(c => c.is_active).length],
        [isRtl ? 'مراكز ملف الجهات' : 'Reference centers', sourceCenters.length],
        [isRtl ? 'مراكز اختبار QA' : 'QA centers', qaCenters.length],
      ].map(([label, value]) => <Paper key={String(label)} sx={{ p: 2, textAlign: 'center' }}><Typography variant="h4" fontWeight={950} color="primary.main">{value}</Typography><Typography variant="body2" color="text.secondary">{label}</Typography></Paper>)}
    </Box>

    <Alert severity="info" sx={{ mb: 2, fontSize: 14 }}>
      تعرض الصفحة جميع المراكز غير المؤرشفة افتراضيًا، بما فيها غير المرتبطة بملف الجهات.
      يمكنك تصفيتها حسب المصدر والقطاع والحالة. مراكز ملف الجهات مقترحة ولا تعني اعتمادًا تنظيميًا.
      تظل المعلومات غير المتحققة فارغة لحين مراجعتها.
    </Alert>
    <Paper sx={{ p: 2, mb: 2.5 }}><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr 1fr 1fr 1fr' }, gap: 1.5 }}>
      <TextField value={search} onChange={e => setSearch(e.target.value)} placeholder={isRtl ? 'بحث بالاسم العربي أو الإنجليزي أو الكود أو الموقع...' : 'Search Arabic/English name, code, or location...'} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }} />
      <TextField select label={isRtl ? 'المنطقة' : 'Region'} value={regionFilter} onChange={e => { setRegionFilter(e.target.value); setCityFilter('all'); }}><MenuItem value="all">{isRtl ? 'كل المناطق' : 'All regions'}</MenuItem>{regions.map(item => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField>
      <TextField select label={isRtl ? 'المدينة' : 'City'} value={cityFilter} onChange={e => setCityFilter(e.target.value)}><MenuItem value="all">{isRtl ? 'كل المدن' : 'All cities'}</MenuItem>{cities.map(item => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField>
      <TextField select label={isRtl ? 'مصدر السجل' : 'Data source'} value={sourceFilter}
        onChange={e => { setSourceFilter(e.target.value as typeof sourceFilter); setSectorFilter('all'); }}>
        <MenuItem value="all">جميع السجلات ({visibleCenters.length})</MenuItem>
        <MenuItem value="reference">مراكز ملف الجهات ({sourceCenters.length})</MenuItem>
        <MenuItem value="qa">المراكز التجريبية ({qaCenters.length})</MenuItem>
        <MenuItem value="other">سجلات أخرى</MenuItem>
      </TextField>
      <TextField select label={isRtl ? 'القطاع' : 'Sector'} value={sectorFilter} onChange={e => setSectorFilter(e.target.value)}>
        <MenuItem value="all">كل القطاعات</MenuItem>
        {sectorNames.map(sector => <MenuItem key={sector} value={sector}>{sector}</MenuItem>)}
      </TextField>
      <TextField select label={isRtl ? 'الحالة' : 'Status'} value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}><MenuItem value="all">{isRtl ? 'الكل' : 'All'}</MenuItem><MenuItem value="active">{isRtl ? 'نشط' : 'Active'}</MenuItem><MenuItem value="inactive">{isRtl ? 'غير نشط' : 'Inactive'}</MenuItem></TextField>
    </Box></Paper>

    <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}
      justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} sx={{ mb: 1.5 }}>
      <Box>
        <Typography fontWeight={900} color="text.secondary">
          عرض {filtered.length} مركزًا من إجمالي {visibleCenters.length} مركز {showArchived ? 'مؤرشف' : 'مسجل'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          مصدر السجل يحدد طريقة العرض فقط ولا يغيّر بيانات المراكز أو الموظفين.
        </Typography>
      </Box>
      <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
        <Button size="small" variant="outlined" onClick={resetFilters}>
          {isRtl ? 'إظهار جميع المراكز' : 'Show All Centers'}
        </Button>
        <Button size="small" variant={viewMode === 'cards' ? 'contained' : 'outlined'}
          startIcon={<CardsViewIcon />} onClick={() => setViewMode('cards')}>
          {isRtl ? 'بطاقات' : 'Cards'}
        </Button>
        <Button size="small" variant={viewMode === 'table' ? 'contained' : 'outlined'}
          startIcon={<TableViewIcon />} onClick={() => setViewMode('table')}>
          {isRtl ? 'جدول' : 'Table'}
        </Button>
      </Stack>
    </Stack>
    {loading ? <Paper sx={{ p: 6, textAlign: 'center' }}><CircularProgress /></Paper>
      : loadError ? <Alert severity="error" action={
        <Button size="small" onClick={() => void load()}>إعادة المحاولة</Button>
      }>تعذر تحميل دليل المراكز الصحية: {loadError}</Alert>
      : visibleCenters.length === 0 ? <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 3 }}>
          <Typography fontWeight={900} sx={{ mb: 1 }}>
            {showArchived ? 'لا توجد مراكز في الأرشيف.' : 'لا توجد مراكز صحية غير مؤرشفة في القائمة الحالية.'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            يمكنك إضافة مركز صحي أو استيراد المراكز من Excel بعد التأكد من البيئة المتصلة.
          </Typography>
          <Stack direction="row" gap={1} justifyContent="center" flexWrap="wrap">
            <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>إضافة مركز صحي</Button>
            {canImport && <Button variant="outlined" startIcon={<UploadFileIcon />}
              onClick={() => setImportOpen(true)}>استيراد المراكز من Excel</Button>}
          </Stack>
        </Paper>
      : !filtered.length ? <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 3 }}>
          <Typography fontWeight={900} sx={{ mb: 1 }}>
            لا توجد مراكز تطابق التصفية الحالية.
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            يوجد {visibleCenters.length} مركزًا بالفعل؛ غيّر المرشحات أو أظهر جميع المراكز.
          </Typography>
          <Button variant="contained" onClick={resetFilters}>إظهار جميع المراكز</Button>
        </Paper>
      : viewMode === 'cards' ? (
        <Box sx={{ display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,minmax(0,1fr))',
            lg: 'repeat(3,minmax(0,1fr))' }, gap: 2 }}>
          {filtered.map(center => {
            const org = centerOrg.get(center.id);
            const isReference = isFromSource(center);
            const location = [center.region, center.city, center.district].filter(Boolean).join(' / ');
            return <Paper key={center.id} elevation={2}
              sx={{ p: 2.25, borderRadius: 3, minWidth: 0,
                border: '1px solid #DAE5EF',
                borderTop: '3px solid #1B5A82',
                display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography fontWeight={900} fontSize={16} sx={{ overflowWrap: 'anywhere' }}>
                    {displayName(center)}
                  </Typography>
                  {secondaryName(center) && <Typography variant="body2" color="text.secondary">
                    {secondaryName(center)}
                  </Typography>}
                  <Typography variant="caption" color="text.secondary" dir="ltr"
                    sx={{ display: 'block', textAlign: 'start' }}>
                    {center.code || '—'}
                  </Typography>
                </Box>
                <Chip size="small" color={center.is_active ? 'success' : 'default'}
                  label={center.is_active ? 'نشط' : 'غير نشط'} />
              </Stack>
              <Stack direction="row" gap={0.75} flexWrap="wrap">
                <Chip size="small" variant="outlined" color={isReference ? 'info' : 'default'}
                  label={isReference ? 'من ملف الجهات' : isQA(center) ? 'اختباري QA' : 'سجل آخر'} />
                {org && <Chip size="small" variant="outlined"
                  color={org.is_approved ? 'success' : 'warning'}
                  label={org.is_approved ? 'ارتباط تنظيمي معتمد' : 'ارتباط قيد المراجعة'} />}
              </Stack>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, flex: 1 }}>
                {[
                  ['القطاع', org?.parent_name || 'غير مرتبط'],
                  ['مدير المركز', center.manager_name || 'بانتظار التحقق'],
                  ['الموقع', location || 'غير متوفر'],
                  ['نوع المبنى', buildingLabel(center.building_type)],
                  ['الموظفون', String(center.employee_count || 0)],
                  ['المستخدمون', String(center.user_count || 0)],
                ].map(([label, value]) => (
                  <Box key={label} sx={{ minWidth: 0 }}>
                    <Typography color="text.secondary" fontSize={11.5}>{label}</Typography>
                    <Typography fontSize={13.5} fontWeight={750} sx={{ overflowWrap: 'anywhere' }}>
                      {value}
                    </Typography>
                  </Box>
                ))}
              </Box>
              <Stack direction="row" gap={1} justifyContent="flex-end"
                sx={{ pt: 1.5, borderTop: '1px solid #E5EDF4' }}>
                <Button size="small" variant="outlined" startIcon={<EditIcon />}
                  onClick={() => openEdit(center)}>تعديل</Button>
                <Button size="small" variant="outlined" color={center.is_active ? 'warning' : 'success'}
                  startIcon={<ToggleOffIcon />} onClick={() => void toggleCenter(center)}>
                  {center.is_active ? 'تعطيل' : 'تفعيل'}
                </Button>
              </Stack>
            </Paper>;
          })}
        </Box>
      ) : <TableContainer component={Paper} sx={{ borderRadius: 3, overflowX: 'auto' }}>
        <Table sx={{ minWidth: 1030 }}>
          <TableHead><TableRow sx={{ '& .MuiTableCell-root': { fontWeight: 900, fontSize: 14 } }}>
            <TableCell>اسم المركز الصحي</TableCell>
            <TableCell>القطاع والوحدات</TableCell>
            <TableCell>مدير المركز</TableCell>
            <TableCell>الموقع</TableCell>
            <TableCell>نوع المبنى</TableCell>
            <TableCell>الارتباط / الحالة</TableCell>
            <TableCell align="center">الإجراءات</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {filtered.map(center => {
              const org = centerOrg.get(center.id);
              const childUnits = org ? organizationUnits.filter(unit => unit.kind === 'unit' && unit.parent_code === org.code).length : 0;
              const isReference = isFromSource(center);
              return <TableRow key={center.id} hover sx={{ '& .MuiTableCell-root': { verticalAlign: 'middle', py: 1.6 } }}>
                <TableCell sx={{ minWidth: 185 }}>
                  <Typography fontWeight={900} fontSize={15}>{displayName(center)}</Typography>
                  {secondaryName(center) && <Typography variant="caption" display="block" color="text.secondary">{secondaryName(center)}</Typography>}
                  <Typography variant="caption" sx={{ fontWeight: 750, color: '#547188' }} dir="ltr">{center.code || '—'}</Typography>
                  <Box sx={{ mt: 0.6 }}>
                    <Chip size="small" label={isReference ? 'من ملف الجهات' : isQA(center) ? 'اختباري QA' : 'سجل آخر'}
                      color={isReference ? 'info' : 'default'} variant="outlined" />
                  </Box>
                </TableCell>
                <TableCell sx={{ minWidth: 180 }}>
                  <Typography fontWeight={800} fontSize={13.5}>{org?.parent_name || 'لم تُربط بقطاع'}</Typography>
                  {org && <Typography variant="caption" color="text.secondary" display="block">{childUnits} وحدات مدرجة في الهيكل</Typography>}
                </TableCell>
                <TableCell>{center.manager_name || <Typography variant="body2" color="text.secondary">بانتظار التحقق</Typography>}</TableCell>
                <TableCell sx={{ minWidth: 150 }}>
                  {[center.region, center.city, center.district].filter(Boolean).join(' / ') || <Typography color="text.secondary" variant="body2">غير متوفر في المصدر</Typography>}
                </TableCell>
                <TableCell><Chip size="small" label={buildingLabel(center.building_type)} /></TableCell>
                <TableCell>
                  <Stack spacing={0.6} alignItems="flex-start">
                    <Chip size="small" color={center.is_active ? 'success' : 'default'}
                      label={center.is_active ? 'نشط' : 'غير نشط'} />
                    {org && <Chip size="small" variant="outlined"
                      color={org.is_approved ? 'success' : 'warning'}
                      label={org.is_approved ? 'ارتباط تنظيمي معتمد' : 'ارتباط قيد الاعتماد'} />}
                    {(center.employee_count || center.user_count) ? <Typography variant="caption" color="text.secondary">
                      موظفون: {center.employee_count || 0} · مستخدمون: {center.user_count || 0}
                    </Typography> : null}
                  </Stack>
                </TableCell>
                <TableCell align="center">
                  <Stack direction="row" gap={0.75} justifyContent="center" flexWrap="wrap">
                    <Button variant="outlined" size="small" startIcon={<EditIcon />} onClick={() => openEdit(center)}>تعديل</Button>
                    <Button variant="outlined" size="small" color={center.is_active ? 'warning' : 'success'}
                      startIcon={<ToggleOffIcon />} onClick={() => void toggleCenter(center)}>
                      {center.is_active ? 'تعطيل' : 'تفعيل'}
                    </Button>
                  </Stack>
                </TableCell>
              </TableRow>;
            })}

          </TableBody>
        </Table>
      </TableContainer>}

    <Dialog open={open} onClose={() => !saving && setOpen(false)} maxWidth="md" fullWidth><DialogTitle>{editing ? (isRtl ? 'تعديل المركز الصحي' : 'Edit Health Center') : (isRtl ? 'إضافة مركز صحي' : 'Add Health Center')}</DialogTitle><DialogContent dividers><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2,1fr)' }, gap: 2 }}>
      <TextField required label={isRtl ? 'اسم المركز الصحي بالعربية' : 'Health Center Name (Arabic)'} value={form.name_ar} onChange={e => update('name_ar', e.target.value)} inputProps={{ dir: 'rtl' }} />
      <TextField label={isRtl ? 'اسم المركز الصحي بالإنجليزية (اختياري)' : 'Health Center Name (English, optional)'} value={form.name_en} onChange={e => update('name_en', e.target.value)} inputProps={{ dir: 'ltr' }} />
      <TextField label={isRtl ? 'كود المركز' : 'Center Code'} value={form.code || ''} onChange={e => update('code', e.target.value.toUpperCase())} helperText={isRtl ? 'اختياري، ويجب أن يكون فريدًا' : 'Optional and unique'} />
      <TextField label={isRtl ? 'المنطقة' : 'Region'} value={form.region} onChange={e => update('region', e.target.value)} />
      <TextField label={isRtl ? 'المدينة' : 'City'} value={form.city} onChange={e => update('city', e.target.value)} />
      <TextField label={isRtl ? 'الحي' : 'District'} value={form.district} onChange={e => update('district', e.target.value)} />
      <TextField label={isRtl ? 'مدير المركز (بعد التحقق من الاسم)' : 'Verified center manager'} value={form.manager_name} onChange={e => update('manager_name', e.target.value)} helperText={isRtl ? 'حقل مرجعي إداري؛ اتركه فارغًا إذا لم تُعتمد بيانات المدير' : 'Administrative reference; leave blank until verified'} />
      <TextField select label={isRtl ? 'نوع المبنى' : 'Building Type'} value={form.building_type} onChange={e => update('building_type', e.target.value as CenterForm['building_type'])}><MenuItem value="unknown">{isRtl ? 'غير محدد بعد' : 'Unspecified'}</MenuItem><MenuItem value="model">{isRtl ? 'مبنى نموذجي' : 'Model building'}</MenuItem><MenuItem value="rented">{isRtl ? 'مبنى مستأجر' : 'Rented building'}</MenuItem><MenuItem value="owned">{isRtl ? 'مبنى مملوك' : 'Owned building'}</MenuItem><MenuItem value="other">{isRtl ? 'أخرى' : 'Other'}</MenuItem></TextField>
      <TextField multiline minRows={3} label={isRtl ? 'ملاحظات' : 'Notes'} value={form.notes || ''} onChange={e => update('notes', e.target.value)} sx={{ gridColumn: { md: '1 / -1' } }} />
      <Stack direction="row" alignItems="center" spacing={1}><Switch checked={form.is_active} onChange={e => update('is_active', e.target.checked)} /><Typography>{isRtl ? 'المركز نشط ومتاح في القوائم المنسدلة' : 'Center is active and available in dropdowns'}</Typography></Stack>
    </Box></DialogContent><DialogActions><Button onClick={() => setOpen(false)} disabled={saving}>{isRtl ? 'إلغاء' : 'Cancel'}</Button><Button variant="contained" onClick={() => void save()} disabled={saving}>{saving ? (isRtl ? 'جاري الحفظ...' : 'Saving...') : (isRtl ? 'حفظ' : 'Save')}</Button></DialogActions></Dialog>
  </Box>;
}
