import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Divider, FormControl,
  Grid, InputLabel, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import {
  AccountTree as TreeIcon, CloudUpload as UploadIcon, FactCheck as ApproveIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { authFetch, getAccessToken } from '../context/AuthContext';

const API = (import.meta.env.VITE_API_URL || 'https://occupational-health-platform-production.up.railway.app/api').replace(/\/$/, '');
type OrgUnit = {
  id: number; code: string; name: string; kind: 'department' | 'sector' | 'center' | 'unit';
  parent_code: string; parent_name: string; health_center_id: number | null;
  health_center_name: string; source_path: string; source_rows: string;
  is_approved: boolean; approval_reference: string;
};
type OrgSummary = {
  total: number; pending: number; approved: number; by_kind: Record<string, number>;
};
type Center = { id: number; name: string; name_ar?: string; name_en?: string };
type Preview = {
  total: number; kinds: Record<string, number>; mode: string; created: number;
  notice?: string; preview?: Array<{code: string; name: string; kind: string}>;
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
  const [search, setSearch] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [mappedCenters, setMappedCenters] = useState<Record<number, string>>({});
  const [approvalRefs, setApprovalRefs] = useState<Record<number, string>>({});

  async function reload() {
    const [directory, centerList] = await Promise.all([
      apiRequest<{results: OrgUnit[]; summary: OrgSummary}>('/organization-units/'),
      apiRequest<{results: Center[]; next: string | null} | Center[]>('/health-centers/?active=true&page=1'),
    ]);
    setItems(directory.results);
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

  const filtered = useMemo(() => items.filter(item => {
    if (filter === 'pending' && item.is_approved) return false;
    if (filter === 'approved' && !item.is_approved) return false;
    if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
    return [item.name, item.code, item.parent_name, item.source_path].join(' ')
      .toLocaleLowerCase().includes(search.toLocaleLowerCase().trim());
  }), [items, filter, kindFilter, search]);

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

  async function review(item: OrgUnit, action: 'map-center' | 'approve') {
    setBusy(true);
    try {
      await apiRequest('/organization-units/' + item.id + '/review/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          ...(action === 'map-center' ? { center_id: mappedCenters[item.id] }
            : { approval_reference: approvalRefs[item.id] || '' }),
        }),
      });
      await reload();
      toast.success(action === 'approve' ? 'تم اعتماد السجل وربط مرجع الاعتماد' : 'تمت مطابقة المركز بنجاح');
    } catch (e) { toast.error(localizedError(e)); }
    finally { setBusy(false); }
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
        جميع مسارات ملف المطابقة مقترحة حتى اعتمادها. الاستيراد يضيف مسودات للمراجعة فقط، ولا ينقل موظفين ولا ينشئ مراكز فعلية.
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
          <Typography variant="h6" fontWeight={900} sx={{ flex: 1 }}>مراجعة واعتماد الجهات</Typography>
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
        <Divider sx={{mb:2}}/>
        <TableContainer sx={{ maxHeight: 650 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                {['الرمز','اسم الجهة / الوحدة','التصنيف','الجهة الأعلى','الاعتماد','الإجراء'].map(x=><TableCell key={x} sx={{fontWeight:900}}>{x}</TableCell>)}
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map(unit=>(
                <TableRow key={unit.id} hover>
                  <TableCell sx={{whiteSpace:'nowrap',fontSize:12}}>{unit.code}</TableCell>
                  <TableCell sx={{minWidth:180}}>
                    <Typography fontWeight={700} variant="body2">{unit.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{unit.source_path}</Typography>
                  </TableCell>
                  <TableCell>{KINDS[unit.kind]}</TableCell>
                  <TableCell>{unit.parent_name || '—'}</TableCell>
                  <TableCell><Chip size="small" color={unit.is_approved ? 'success' : 'warning'}
                     label={unit.is_approved ? 'معتمد' : 'مسودة'} /></TableCell>
                  <TableCell sx={{minWidth:265}}>
                    {unit.is_approved ? <Typography variant="caption">{unit.approval_reference}</Typography> : (
                      <Stack gap={1} sx={{ minWidth: 255 }}>
                        {unit.kind==='center' && (
                          <Stack direction="row" gap={1}>
                            <TextField select size="small" fullWidth label="مطابقة مع مركز موجود"
                              value={mappedCenters[unit.id] || unit.health_center_id || ''}
                              onChange={e => setMappedCenters(prev=>({...prev,[unit.id]:String(e.target.value)}))}>
                              <MenuItem value="">اختر مركزًا</MenuItem>
                              {centers.map(c=><MenuItem key={c.id} value={String(c.id)}>{c.name_ar || c.name}</MenuItem>)}
                            </TextField>
                            <Button size="small" variant="outlined" disabled={busy || !mappedCenters[unit.id]}
                              onClick={()=>void review(unit,'map-center')}>ربط</Button>
                          </Stack>
                        )}
                        <Stack direction="row" gap={1}>
                          <TextField size="small" label="مرجع الاعتماد الرسمي" fullWidth
                            value={approvalRefs[unit.id] || ''}
                            onChange={e=>setApprovalRefs(prev=>({...prev,[unit.id]:e.target.value}))}/>
                          <Button size="small" color="success" variant="contained" startIcon={<ApproveIcon/>}
                            disabled={busy || (approvalRefs[unit.id] || '').trim().length < 3}
                            onClick={()=>void review(unit,'approve')}>اعتماد</Button>
                        </Stack>
                      </Stack>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!filtered.length && <TableRow><TableCell colSpan={6} align="center">
                لا توجد بيانات ضمن هذا التصنيف. ارفع ملف المطابقة للمعاينة ثم حفظ المسودات.
              </TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
        <Typography variant="caption" color="text.secondary">{filtered.length} سجل معروض — لا يظهر غير المعتمد في سجل الموظفين.</Typography>
      </Paper>
    </Box>
  );
}
