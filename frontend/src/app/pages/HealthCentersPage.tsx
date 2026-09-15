import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  InputAdornment, MenuItem, Paper, Stack, Switch, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import {
  Add as AddIcon, Business as BusinessIcon, Edit as EditIcon, Refresh as RefreshIcon,
  Search as SearchIcon, ToggleOff as ToggleOffIcon,
} from '@mui/icons-material';
import { toast } from 'sonner';
import { authFetch, getAccessToken } from '../context/AuthContext';

const PRODUCTION_API_BASE_URL = 'https://occupational-health-platform-production.up.railway.app/api';
const API_BASE_URL = (import.meta.env.VITE_API_URL || PRODUCTION_API_BASE_URL).replace(/\/$/, '');

type Center = {
  id: number; name: string; code?: string | null; region: string; city: string; district: string;
  building_type: 'unknown' | 'model' | 'rented' | 'owned' | 'other'; building_type_label?: string;
  is_active: boolean; notes?: string; employee_count?: number; user_count?: number;
};
type CenterForm = Omit<Center, 'id' | 'building_type_label' | 'employee_count' | 'user_count'>;
const EMPTY_FORM: CenterForm = { name: '', code: '', region: '', city: '', district: '', building_type: 'unknown', is_active: true, notes: '' };

function list<T>(payload: any): T[] { return Array.isArray(payload) ? payload : Array.isArray(payload?.results) ? payload.results : []; }
async function request<T>(path: string, init: RequestInit = {}) {
  const token = getAccessToken();
  if (!token) throw new Error('Authentication required');
  const response = await authFetch(`${API_BASE_URL}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) } });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const first = body && typeof body === 'object' ? Object.values(body)[0] : null;
    throw new Error(typeof body?.detail === 'string' ? body.detail : Array.isArray(first) ? String(first[0]) : String(first || 'Request failed'));
  }
  return body as T;
}

export function HealthCentersPage() {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';
  const [centers, setCenters] = useState<Center[]>([]);
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
    try { setCenters(list<Center>(await request('/health-centers/'))); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Failed to load health centers'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const regions = useMemo(() => [...new Set(centers.map(c => c.region).filter(Boolean))].sort(), [centers]);
  const cities = useMemo(() => [...new Set(centers.filter(c => regionFilter === 'all' || c.region === regionFilter).map(c => c.city).filter(Boolean))].sort(), [centers, regionFilter]);
  const filtered = useMemo(() => centers.filter(center => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || [center.name, center.code, center.region, center.city, center.district].filter(Boolean).join(' ').toLowerCase().includes(q);
    const matchesRegion = regionFilter === 'all' || center.region === regionFilter;
    const matchesCity = cityFilter === 'all' || center.city === cityFilter;
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? center.is_active : !center.is_active);
    return matchesSearch && matchesRegion && matchesCity && matchesStatus;
  }), [centers, search, regionFilter, cityFilter, statusFilter]);

  const buildingLabel = (type: Center['building_type']) => ({ unknown: isRtl ? 'غير محدد' : 'Unspecified', model: isRtl ? 'نموذجي' : 'Model', rented: isRtl ? 'مستأجر' : 'Rented', owned: isRtl ? 'مملوك' : 'Owned', other: isRtl ? 'أخرى' : 'Other' }[type]);
  function openAdd() { setEditing(null); setForm(EMPTY_FORM); setOpen(true); }
  function openEdit(center: Center) { setEditing(center); setForm({ name: center.name, code: center.code || '', region: center.region || '', city: center.city || '', district: center.district || '', building_type: center.building_type || 'unknown', is_active: center.is_active, notes: center.notes || '' }); setOpen(true); }
  function update<K extends keyof CenterForm>(key: K, value: CenterForm[K]) { setForm(current => ({ ...current, [key]: value })); }

  async function save() {
    if (!form.name.trim()) return toast.error(isRtl ? 'اسم المركز الصحي مطلوب' : 'Health center name is required');
    if (form.building_type === 'unknown') return toast.error(isRtl ? 'حدد نوع المبنى قبل الحفظ' : 'Select the building type before saving');
    setSaving(true);
    try {
      const payload = { ...form, name: form.name.trim(), code: form.code?.trim() || null, region: form.region.trim(), city: form.city.trim(), district: form.district.trim(), notes: form.notes?.trim() || '' };
      if (editing) await request(`/health-centers/${editing.id}/`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await request('/health-centers/', { method: 'POST', body: JSON.stringify(payload) });
      toast.success(isRtl ? 'تم حفظ بيانات المركز الصحي' : 'Health center saved');
      setOpen(false); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  async function toggleCenter(center: Center) {
    try {
      await request(`/health-centers/${center.id}/`, { method: 'PATCH', body: JSON.stringify({ is_active: !center.is_active }) });
      toast.success(center.is_active ? (isRtl ? 'تم تعطيل المركز مع الاحتفاظ بالسجلات السابقة' : 'Center deactivated; historical records kept') : (isRtl ? 'تم تفعيل المركز' : 'Center activated'));
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Update failed'); }
  }

  return <Box dir={isRtl ? 'rtl' : 'ltr'}>
    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={2} sx={{ mb: 3 }}>
      <Stack direction="row" spacing={1.5} alignItems="center"><BusinessIcon sx={{ fontSize: 38, color: 'primary.main' }} /><Box><Typography variant="h4" fontWeight={950}>{isRtl ? 'إدارة المراكز الصحية' : 'Health Centers Management'}</Typography><Typography variant="body2" color="text.secondary">{isRtl ? 'قاعدة البيانات المركزية المعتمدة لأسماء المراكز ومواقعها ونوع المبنى' : 'Central master data for health centers, locations, and building type'}</Typography></Box></Stack>
      <Stack direction="row" spacing={1}><Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => void load()}>{isRtl ? 'تحديث' : 'Refresh'}</Button><Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>{isRtl ? 'إضافة مركز صحي' : 'Add Health Center'}</Button></Stack>
    </Stack>

    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4,1fr)' }, gap: 2, mb: 2.5 }}>
      {[
        [isRtl ? 'إجمالي المراكز' : 'Total centers', centers.length],
        [isRtl ? 'المراكز النشطة' : 'Active centers', centers.filter(c => c.is_active).length],
        [isRtl ? 'المباني النموذجية' : 'Model buildings', centers.filter(c => c.building_type === 'model').length],
        [isRtl ? 'المباني المستأجرة' : 'Rented buildings', centers.filter(c => c.building_type === 'rented').length],
      ].map(([label, value]) => <Paper key={String(label)} sx={{ p: 2, textAlign: 'center' }}><Typography variant="h4" fontWeight={950} color="primary.main">{value}</Typography><Typography variant="body2" color="text.secondary">{label}</Typography></Paper>)}
    </Box>

    <Paper sx={{ p: 2, mb: 2.5 }}><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr 1fr' }, gap: 1.5 }}>
      <TextField value={search} onChange={e => setSearch(e.target.value)} placeholder={isRtl ? 'بحث باسم المركز أو الكود أو الموقع...' : 'Search center, code, or location...'} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }} />
      <TextField select label={isRtl ? 'المنطقة' : 'Region'} value={regionFilter} onChange={e => { setRegionFilter(e.target.value); setCityFilter('all'); }}><MenuItem value="all">{isRtl ? 'كل المناطق' : 'All regions'}</MenuItem>{regions.map(item => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField>
      <TextField select label={isRtl ? 'المدينة' : 'City'} value={cityFilter} onChange={e => setCityFilter(e.target.value)}><MenuItem value="all">{isRtl ? 'كل المدن' : 'All cities'}</MenuItem>{cities.map(item => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField>
      <TextField select label={isRtl ? 'الحالة' : 'Status'} value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}><MenuItem value="all">{isRtl ? 'الكل' : 'All'}</MenuItem><MenuItem value="active">{isRtl ? 'نشط' : 'Active'}</MenuItem><MenuItem value="inactive">{isRtl ? 'غير نشط' : 'Inactive'}</MenuItem></TextField>
    </Box></Paper>

    {loading ? <Paper sx={{ p: 6, textAlign: 'center' }}><CircularProgress /></Paper> : <TableContainer component={Paper}><Table><TableHead><TableRow>
      <TableCell>{isRtl ? 'اسم المركز الصحي' : 'Health Center'}</TableCell><TableCell>{isRtl ? 'الكود' : 'Code'}</TableCell><TableCell>{isRtl ? 'المنطقة' : 'Region'}</TableCell><TableCell>{isRtl ? 'المدينة' : 'City'}</TableCell><TableCell>{isRtl ? 'الحي' : 'District'}</TableCell><TableCell>{isRtl ? 'نوع المبنى' : 'Building'}</TableCell><TableCell>{isRtl ? 'الحالة' : 'Status'}</TableCell><TableCell align="center">{isRtl ? 'الإجراءات' : 'Actions'}</TableCell>
    </TableRow></TableHead><TableBody>{filtered.map(center => <TableRow key={center.id} hover>
      <TableCell><Typography fontWeight={900}>{center.name}</Typography>{(center.employee_count || center.user_count) ? <Typography variant="caption" color="text.secondary">{isRtl ? 'مرتبط' : 'Linked'}: {center.employee_count || 0} / {center.user_count || 0}</Typography> : null}</TableCell><TableCell>{center.code || '—'}</TableCell><TableCell>{center.region || '—'}</TableCell><TableCell>{center.city || '—'}</TableCell><TableCell>{center.district || '—'}</TableCell><TableCell><Chip size="small" label={buildingLabel(center.building_type)} /></TableCell><TableCell><Chip size="small" color={center.is_active ? 'success' : 'default'} label={center.is_active ? (isRtl ? 'نشط' : 'Active') : (isRtl ? 'غير نشط' : 'Inactive')} /></TableCell><TableCell align="center"><Button size="small" startIcon={<EditIcon />} onClick={() => openEdit(center)}>{isRtl ? 'تعديل' : 'Edit'}</Button><Button size="small" color={center.is_active ? 'warning' : 'success'} startIcon={<ToggleOffIcon />} onClick={() => void toggleCenter(center)}>{center.is_active ? (isRtl ? 'تعطيل' : 'Deactivate') : (isRtl ? 'تفعيل' : 'Activate')}</Button></TableCell>
    </TableRow>)}{!filtered.length && <TableRow><TableCell colSpan={8}><Alert severity="info">{isRtl ? 'لا توجد مراكز مطابقة.' : 'No matching health centers.'}</Alert></TableCell></TableRow>}</TableBody></Table></TableContainer>}

    <Dialog open={open} onClose={() => !saving && setOpen(false)} maxWidth="md" fullWidth><DialogTitle>{editing ? (isRtl ? 'تعديل المركز الصحي' : 'Edit Health Center') : (isRtl ? 'إضافة مركز صحي' : 'Add Health Center')}</DialogTitle><DialogContent dividers><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2,1fr)' }, gap: 2 }}>
      <TextField required label={isRtl ? 'اسم المركز الصحي' : 'Health Center Name'} value={form.name} onChange={e => update('name', e.target.value)} />
      <TextField label={isRtl ? 'كود المركز' : 'Center Code'} value={form.code || ''} onChange={e => update('code', e.target.value.toUpperCase())} helperText={isRtl ? 'اختياري، ويجب أن يكون فريدًا' : 'Optional and unique'} />
      <TextField label={isRtl ? 'المنطقة' : 'Region'} value={form.region} onChange={e => update('region', e.target.value)} />
      <TextField label={isRtl ? 'المدينة' : 'City'} value={form.city} onChange={e => update('city', e.target.value)} />
      <TextField label={isRtl ? 'الحي' : 'District'} value={form.district} onChange={e => update('district', e.target.value)} />
      <TextField required select label={isRtl ? 'نوع المبنى' : 'Building Type'} value={form.building_type} onChange={e => update('building_type', e.target.value as CenterForm['building_type'])}><MenuItem value="unknown" disabled>{isRtl ? 'اختر نوع المبنى' : 'Select building type'}</MenuItem><MenuItem value="model">{isRtl ? 'مبنى نموذجي' : 'Model building'}</MenuItem><MenuItem value="rented">{isRtl ? 'مبنى مستأجر' : 'Rented building'}</MenuItem><MenuItem value="owned">{isRtl ? 'مبنى مملوك' : 'Owned building'}</MenuItem><MenuItem value="other">{isRtl ? 'أخرى' : 'Other'}</MenuItem></TextField>
      <TextField multiline minRows={3} label={isRtl ? 'ملاحظات' : 'Notes'} value={form.notes || ''} onChange={e => update('notes', e.target.value)} sx={{ gridColumn: { md: '1 / -1' } }} />
      <Stack direction="row" alignItems="center" spacing={1}><Switch checked={form.is_active} onChange={e => update('is_active', e.target.checked)} /><Typography>{isRtl ? 'المركز نشط ومتاح في القوائم المنسدلة' : 'Center is active and available in dropdowns'}</Typography></Stack>
    </Box></DialogContent><DialogActions><Button onClick={() => setOpen(false)} disabled={saving}>{isRtl ? 'إلغاء' : 'Cancel'}</Button><Button variant="contained" onClick={() => void save()} disabled={saving}>{saving ? (isRtl ? 'جاري الحفظ...' : 'Saving...') : (isRtl ? 'حفظ' : 'Save')}</Button></DialogActions></Dialog>
  </Box>;
}
