import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl,
  Grid, InputLabel, LinearProgress, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import {
  AccountTree as TreeIcon, CloudUpload as UploadIcon, FactCheck as ApproveIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { authFetch, getAccessToken } from '../context/AuthContext';
import { exactCenterSuggestions } from '../utils/organizationMatching';

const API = (import.meta.env.VITE_API_URL || 'https://occupational-health-platform-production.up.railway.app/api').replace(/\/$/, '');
type OrgUnit = {
  id: number; code: string; name: string; kind: 'department' | 'sector' | 'center' | 'unit';
  parent_code: string; parent_name: string; health_center_id: number | null;
  health_center_name: string; source_path: string; source_rows: string;
  is_approved: boolean; approval_reference: string;
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

  async function review(item: OrgUnit, action: 'map-center' | 'approve'): Promise<boolean> {
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
                  <TableCell>
                    <Stack gap={0.5} alignItems="flex-start">
                      <Chip size="small" color={REVIEW_COLORS[unit.review_status] || 'default'}
                        label={REVIEW_LABELS[unit.review_status] || 'بانتظار المراجعة'}/>
                      {unit.health_center_name && <Typography variant="caption" color="text.secondary">↳ {unit.health_center_name}</Typography>}
                    </Stack>
                  </TableCell>
                  <TableCell sx={{minWidth:265}}>
                    {unit.is_approved ? <Typography variant="caption">{unit.approval_reference}</Typography> : (
                      <Stack gap={1} sx={{ minWidth: 255 }}>
                        {unit.kind==='center' && (
                          <Stack gap={0.6}>
                            {(() => {
                              const proposals = exactCenterSuggestions(unit.name, centers);
                              if (proposals.length === 1) return (
                                <Button size="small" variant="text" disabled={busy} sx={{ alignSelf: 'flex-start' }}
                                  onClick={() => setMappedCenters(prev => ({...prev, [unit.id]: String(proposals[0].id)}))}>
                                  اقتراح مطابق بالاسم: {proposals[0].name_ar || proposals[0].name}
                                </Button>
                              );
                              if (proposals.length > 1) return (
                                <Typography color="warning.main" variant="caption">أكثر من مركز بنفس الاسم؛ تحقّق من المركز الصحيح يدويًا.</Typography>
                              );
                              return <Typography color="text.secondary" variant="caption">لا توجد مطابقة اسمية تامة؛ يُرجى التحقق من المركز المسجل.</Typography>;
                            })()}
                            <Stack direction="row" gap={1}>
                              <TextField select size="small" fullWidth label="مطابقة مع مركز موجود"
                                value={mappedCenters[unit.id] || String(unit.health_center_id || '')}
                                onChange={e => setMappedCenters(prev=>({...prev,[unit.id]:String(e.target.value)}))}>
                                <MenuItem value="">اختر مركزًا</MenuItem>
                                {centers.map(c=><MenuItem key={c.id} value={String(c.id)}>{c.name_ar || c.name}</MenuItem>)}
                              </TextField>
                              <Button size="small" variant="outlined" disabled={
                                busy || !mappedCenters[unit.id] || mappedCenters[unit.id] === String(unit.health_center_id)
                              } onClick={()=>void review(unit,'map-center')}>حفظ المطابقة</Button>
                            </Stack>
                            <Typography color="text.secondary" variant="caption">الاقتراح لا يحفظ المطابقة ولا يعتمد المركز تلقائيًا.</Typography>
                          </Stack>
                        )}
                        <Stack direction="row" gap={1}>
                          <TextField size="small" label="مرجع الاعتماد الرسمي" fullWidth
                            value={approvalRefs[unit.id] || ''}
                            onChange={e=>setApprovalRefs(prev=>({...prev,[unit.id]:e.target.value}))}/>
                          <Button size="small" color="success" variant="contained" startIcon={<ApproveIcon/>}
                            disabled={busy || unit.review_status !== 'ready' || (approvalRefs[unit.id] || '').trim().length < 3}
                            onClick={() => setConfirmationUnit(unit)}>مراجعة الاعتماد</Button>
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
      <Dialog open={confirmationUnit !== null} onClose={() => !busy && setConfirmationUnit(null)} maxWidth="sm" fullWidth>
        <DialogTitle>تأكيد اعتماد جهة تنظيمية</DialogTitle>
        <DialogContent dividers>
          <Alert severity="warning" sx={{ mb: 2 }}>
            هذا الإجراء يجعل الجهة متاحة للربط ببيانات الموظفين عند استيفاء ضوابط المركز، ولا يمكن إلغاؤه من هذه الشاشة.
          </Alert>
          <Typography fontWeight={900}>{confirmationUnit?.name}</Typography>
          <Typography color="text.secondary" variant="body2">
            {confirmationUnit?.parent_name ? `تتبع: ${confirmationUnit.parent_name}` : 'جهة تنظيمية عليا'}
          </Typography>
          <Typography sx={{ mt: 2 }} variant="body2">
            مرجع الاعتماد: <strong>{confirmationUnit ? approvalRefs[confirmationUnit.id] : ''}</strong>
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setConfirmationUnit(null)}>إلغاء</Button>
          <Button disabled={busy || !confirmationUnit} variant="contained" color="success"
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
