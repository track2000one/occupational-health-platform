import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, Grid, MenuItem, Paper, Stack, Tab, Tabs,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  Typography, CircularProgress, Divider,
} from '@mui/material';
import {
  ArrowBack as BackIcon, UploadFile as UploadIcon, FactCheck as ReviewIcon,
  AccountTree as StructureIcon, History as AuditIcon, Save as SaveIcon,
} from '@mui/icons-material';
import { toast } from 'sonner';
import { authFetch, getAccessToken, useAuth } from '../context/AuthContext';

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const CONFIRM = 'حفظ مرجع المراكز للمراجعة فقط';
type Proposal = {
  id: number; source_row: number; source_number: number; center_name: string;
  proposed_sector: string; provisional_code: string; source_approval_note: string;
  center_verification: string; sector_verification: string;
  employee_assignment_verification: string; mapped_center_id: number | null;
  center_approval_reference: string; sector_approval_reference: string;
};
type Case = {
  id: number; source_row: number; raw_source_label: string; source_row_count: number;
  invalid_identity_count: number; missing_employee_name_count: number;
  sample_source_rows: string; source_resolution_note: string; source_instruction: string;
  decision: string; mapped_reference_id: number | null;
  decision_reason: string; evidence_reference: string;
};
type EventItem = {
  id: number; action: string; entity_type: string; entity_id: number | null;
  evidence_reference: string; performed_by__username: string | null; created_at: string;
  prior_state: Record<string, unknown>; new_state: Record<string, unknown>;
};
type Batch = {
  batch_id: number; imported_at: string; imported_by: string;
  reference_count: number; review_count: number;
  unresolved_source_rows: number; references: Proposal[];
  review_cases: Case[]; audit_event_count: number; audit_events: EventItem[];
};
type Preview = {
  mode: 'preview'; reference_count: number; review_count: number;
  unresolved_source_rows: number; existing_batch_id: number | null;
  references: Array<Omit<Proposal, 'id'>>; review_cases: Array<Omit<Case, 'id'>>;
  preview_token: string;
};
type Center = { id: number; name: string; name_ar?: string; is_active?: boolean };
type Decision = 'pending' | 'alias' | 'branch' | 'admin_unit' | 'employment' | 'unknown' | 'new_proposal';
const decisions: Array<{ key: Decision; label: string }> = [
  { key: 'alias', label: 'اسم بديل لمركز موثق' },
  { key: 'branch', label: 'فرع أو وحدة تابعة' },
  { key: 'admin_unit', label: 'وحدة إدارية وليست مركزًا' },
  { key: 'employment', label: 'حالة وظيفية وليست مركزًا' },
  { key: 'unknown', label: 'غير محسوم — يحتاج مستند' },
  { key: 'new_proposal', label: 'مقترح مركز جديد مستقل' },
];
const labelForDecision = (value: string) =>
  decisions.find(item => item.key === value)?.label || 'بانتظار المراجعة';
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  if (!token) throw new Error('انتهت جلسة الدخول.');
  if (!API) throw new Error('لم يتم ضبط رابط API لهذه البيئة.');
  const response = await authFetch(API + path, {
    ...init,
    headers: { Authorization: 'Bearer ' + token, ...(init.headers || {}) },
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const message = json?.detail || json?.reason || 'تعذر إكمال العملية.';
    throw new Error(Array.isArray(message) ? String(message[0]) : String(message));
  }
  return json as T;
}

export function CenterFoundationPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canVerify = user?.isSuperuser === true;
  const canReview = canVerify || user?.role === 'systemAdmin' || user?.role === 'ohManager';
  const [current, setCurrent] = useState<Batch | null>(null);
  const [batches, setBatches] = useState<Array<{ id: number; reference_count: number; review_count: number }>>([]);
  const [selectedBatch, setSelectedBatch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState(0);
  const [query, setQuery] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [ack, setAck] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [centers, setCenters] = useState<Center[]>([]);
  const [edit, setEdit] = useState<{ kind: 'classify' | 'verify_center' | 'verify_sector'; id: number; title: string } | null>(null);
  const [decision, setDecision] = useState<Decision>('unknown');
  const [referenceId, setReferenceId] = useState('');
  const [centerId, setCenterId] = useState('');
  const [evidence, setEvidence] = useState('');
  const [reason, setReason] = useState('');

  const load = useCallback(async (batchId?: string) => {
    setLoading(true);
    setLoadError('');
    try {
      const result = await request<{ batches: typeof batches; current: Batch | null }>(
        '/center-foundation/' + (batchId ? '?batch_id=' + encodeURIComponent(batchId) : ''),
      );
      setBatches(result.batches);
      setCurrent(result.current);
      setSelectedBatch(result.current ? String(result.current.batch_id) : '');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر تحميل المرجع.';
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!canReview) return;
    let cancelled = false;
    async function fetchCenters() {
      const items: Center[] = [];
      try {
        for (let page = 1; page <= 30; page += 1) {
          const response = await request<any>('/health-centers/?page=' + page);
          items.push(...(Array.isArray(response) ? response : response.results || []));
          if (Array.isArray(response) || !response.next) break;
        }
        if (!cancelled) setCenters(items.filter(item => item.is_active !== false));
      } catch {
        // Center verification must remain disabled until the official directory loads.
        if (!cancelled) setCenters([]);
      }
    }
    void fetchCenters();
    return () => { cancelled = true; };
  }, [canReview]);

  const filteredRefs = useMemo(() =>
    (current?.references || []).filter(r =>
      (r.center_name + ' ' + r.proposed_sector + ' ' + r.provisional_code)
        .toLocaleLowerCase().includes(query.toLocaleLowerCase())), [current, query]);
  const filteredCases = useMemo(() =>
    (current?.review_cases || []).filter(r =>
      (r.raw_source_label + ' ' + r.decision + ' ' + r.source_instruction)
        .toLocaleLowerCase().includes(query.toLocaleLowerCase())), [current, query]);

  async function submitFile(action: 'preview' | 'commit') {
    if (!file || busy || !canReview) return;
    if (action === 'commit' && (!preview || phrase !== CONFIRM || !ack || preview.existing_batch_id)) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('action', action);
      if (action === 'commit' && preview) {
        body.append('confirmed', 'true');
        body.append('confirm_text', phrase);
        body.append('preview_token', preview.preview_token);
      }
      const result = await request<any>('/center-foundation/import/', { method: 'POST', body });
      if (action === 'preview') {
        setPreview(result as Preview);
        setAck(false);
        setPhrase('');
      } else {
        setPreview(null); setFile(null); setAck(false); setPhrase('');
        await load(String(result.batch_id));
        toast.success('تم حفظ المرجع وحالات المراجعة كمسودات دون اعتماد أو تعديل موظفين.');
      }
    } catch (error) {
      if (action === 'commit') setPreview(null);
      toast.error(error instanceof Error ? error.message : 'تعذر استيراد المسودة.');
    } finally {
      setBusy(false);
    }
  }

  function openReview(kind: 'classify' | 'verify_center' | 'verify_sector', id: number, title: string, existing?: Case) {
    setEdit({ kind, id, title });
    setDecision(existing && existing.decision !== 'pending' ? existing.decision as Decision : 'unknown');
    setReferenceId(existing?.mapped_reference_id ? String(existing.mapped_reference_id) : '');
    setCenterId('');
    setReason('');
    setEvidence('');
  }

  async function saveDecision() {
    if (!edit || !current || busy || reason.trim().length < 10 || !canReview) return;
    const wantsLink = edit.kind === 'classify' && ['alias', 'branch'].includes(decision);
    if (wantsLink && (!referenceId || evidence.trim().length < 3)) return;
    if (edit.kind !== 'classify' && (!canVerify || evidence.trim().length < 3 ||
        (edit.kind === 'verify_center' && !centerId))) return;
    setBusy(true);
    try {
      await request('/center-foundation/decision/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: edit.kind,
          batch_id: current.batch_id,
          entry_id: edit.id,
          reason: reason.trim(),
          evidence_reference: evidence.trim(),
          ...(edit.kind === 'classify' ? {
            decision, ...(wantsLink ? { reference_id: Number(referenceId) } : {}),
          } : edit.kind === 'verify_center' ? { center_id: Number(centerId) } : {}),
        }),
      });
      setEdit(null);
      await load(String(current.batch_id));
      toast.success('حُفظ قرار المراجعة مع اسم المستخدم ومرجعه في سجل التدقيق.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر حفظ القرار.');
    } finally {
      setBusy(false);
    }
  }

  return <Box dir="rtl" sx={{ pb: 4 }}>
    <Stack direction={{ xs: 'column', md: 'row' }} alignItems="center"
      justifyContent="space-between" gap={2} sx={{ mb: 2 }}>
      <Box>
        <Typography variant="h4" color="#153D5D" fontWeight={900}>
          <StructureIcon sx={{ verticalAlign: 'middle', ml: 1 }}/>
          تأسيس السجل المرجعي للمراكز الصحية
        </Typography>
        <Typography color="text.secondary" variant="body2">
          مرجع_المراكز + مراجعة_المراكز — قرارات موثقة ومنفصلة عن اعتماد القطاعات وإسناد الموظفين
        </Typography>
      </Box>
      <Button variant="outlined" startIcon={<BackIcon />}
        onClick={() => navigate('/admin/health-centers')}>العودة لإدارة المراكز</Button>
    </Stack>
    <Alert severity="info" sx={{ mb: 2 }}>
      لا يتحول الرمز TMP إلى رمز رسمي، ولا يصبح المركز أو قطاعه معتمدًا بمجرد الاستيراد.
      لا تتغير بطاقات الموظفين أو المراكز الصحية النشطة هنا؛ تُحفظ مسودات مستقلة قابلة للتدقيق.
    </Alert>
    <Paper sx={{ p: 2.5, mb: 2.5, borderRadius: 3 }}>
      <Typography fontWeight={900} variant="h6" sx={{ mb: 1.5 }}>
        <UploadIcon sx={{ verticalAlign: 'middle', ml: 1 }}/> استيراد المرجع والمراجعات
      </Typography>
      {canReview ? <Stack gap={1.25}>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems="center">
          <Button variant="outlined" component="label" disabled={busy}>
            اختر ملف Excel
            <input hidden type="file" accept=".xlsx" onChange={event => {
              setFile(event.target.files?.[0] || null);
              setPreview(null); setAck(false); setPhrase(''); event.target.value = '';
            }}/>
          </Button>
          <Typography variant="body2" sx={{ flex: 1, overflowWrap: 'anywhere' }}>
            {file?.name || 'لم يتم اختيار ملف'}
          </Typography>
          <Button variant="contained" disabled={!file || busy}
            onClick={() => void submitFile('preview')}>معاينة فقط</Button>
        </Stack>
        {preview && <>
          <Grid container spacing={1.5} sx={{ my: 1 }}>
            {[
              ['مراكز مرجعية مقترحة', preview.reference_count],
              ['حالات تحتاج مراجعة', preview.review_count],
              ['صفوف مصدرية غير محسومة', preview.unresolved_source_rows],
            ].map(([title, value]) => <Grid size={{ xs: 12, sm: 4 }} key={String(title)}>
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, textAlign: 'center' }}>
                <Typography variant="h5" fontWeight={900}>{value}</Typography>
                <Typography variant="caption">{title}</Typography>
              </Paper>
            </Grid>)}
          </Grid>
          {preview.existing_batch_id
            ? <Alert severity="warning">هذا الملف مسجل سابقًا في الدفعة رقم {preview.existing_batch_id}.
              افتح الدفعة الموجودة بدل تكرار إدخالها.</Alert>
            : <>
              <Alert severity="warning">
                اعتماد هذه الخطوة يعني <b>حفظ المسودة للمراجعة فقط</b>، وليس اعتماد مركز
                أو قطاع أو إسناد موظفين. راجع العدد والرموز المؤقتة أولًا.
              </Alert>
              <FormControlLabel
                control={<Checkbox checked={ack} onChange={(_, value) => setAck(value)} />}
                label="أؤكد أن هذه سجلات مرجعية للمراجعة وليست مراكز معتمدة." />
              <TextField fullWidth size="small" label="عبارة التأكيد" value={phrase}
                helperText={'اكتب: ' + CONFIRM} onChange={e => setPhrase(e.target.value)}/>
              <Button variant="contained" color="success"
                disabled={!ack || phrase !== CONFIRM || busy}
                onClick={() => void submitFile('commit')}>
                <SaveIcon sx={{ ml: 1 }}/> حفظ {preview.reference_count} مركزًا و{preview.review_count} حالة للمراجعة
              </Button>
            </>}
        </>}
      </Stack> : <Alert severity="info">حسابك يسمح بالاطلاع فقط على سجلات التأسيس.</Alert>}
    </Paper>
    {loading ? <Paper sx={{ p: 6, textAlign: 'center' }}><CircularProgress/></Paper>
      : loadError ? <Alert severity="error">{loadError}
          <Button onClick={() => void load()}>إعادة المحاولة</Button></Alert>
      : !current ? <Alert severity="info">
          لا توجد دفعة تأسيس محفوظة بعد. اختر الملف، افحص الورقتين، ثم احفظهما كمسودة للمراجعة.
        </Alert>
      : <>
        <Paper sx={{ p: 2.5, borderRadius: 3, mb: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between"
            alignItems="center" gap={1.5} sx={{ mb: 2 }}>
            <Box>
              <Typography variant="h6" fontWeight={900}>
                سجل التأسيس — الدفعة {current.batch_id}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                استيراد: {new Date(current.imported_at).toLocaleString('ar-SA')} بواسطة {current.imported_by}
              </Typography>
            </Box>
            <TextField select size="small" label="دفعة التأسيس" value={selectedBatch}
              sx={{ minWidth: 190 }}
              onChange={e => void load(e.target.value)}>
              {batches.map(batch => <MenuItem key={batch.id} value={String(batch.id)}>
                دفعة {batch.id} — {batch.reference_count} مركزًا
              </MenuItem>)}
            </TextField>
          </Stack>
          <Grid container spacing={1.2}>
            {[
              ['المرجع المقترح', current.reference_count],
              ['قضايا المطابقة', current.review_count],
              ['صفوف المراجعة غير المحسومة', current.unresolved_source_rows],
              ['أحداث التدقيق', current.audit_event_count],
            ].map(([title, value]) => <Grid size={{ xs: 6, md: 3 }} key={String(title)}>
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, textAlign: 'center' }}>
                <Typography variant="h5" color="primary" fontWeight={900}>{value}</Typography>
                <Typography variant="caption">{title}</Typography>
              </Paper>
            </Grid>)}
          </Grid>
        </Paper>
        <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <Stack direction={{ xs: 'column', md: 'row' }} alignItems="center" gap={1}
            justifyContent="space-between" sx={{ p: 1.5 }}>
            <Tabs value={tab} onChange={(_, value: number) => { setTab(value); setQuery(''); }}>
              <Tab label="مرجع المراكز" icon={<StructureIcon/>} iconPosition="start"/>
              <Tab label="حالات المطابقة" icon={<ReviewIcon/>} iconPosition="start"/>
              <Tab label="سجل التدقيق" icon={<AuditIcon/>} iconPosition="start"/>
            </Tabs>
            {tab !== 2 && <TextField size="small" label="بحث وتصفية" value={query}
              onChange={e => setQuery(e.target.value)} sx={{ minWidth: 240 }}/>}
          </Stack>
          <Divider/>
          {tab === 0 ? <TableContainer sx={{ maxHeight: 560 }}>
            <Table size="small" stickyHeader>
              <TableHead><TableRow>
                <TableCell>الرقم المؤقت</TableCell><TableCell>اسم المركز</TableCell>
                <TableCell>القطاع المقترح</TableCell><TableCell>اعتماد المركز</TableCell>
                <TableCell>اعتماد القطاع</TableCell><TableCell>ربط الموظفين</TableCell>
                <TableCell>الإجراءات</TableCell>
              </TableRow></TableHead>
              <TableBody>{filteredRefs.map(row =>
                <TableRow key={row.id} hover>
                  <TableCell>{row.provisional_code}</TableCell>
                  <TableCell><Typography fontWeight={800}>{row.center_name}</Typography></TableCell>
                  <TableCell>{row.proposed_sector}</TableCell>
                  <TableCell><Chip size="small" color={row.center_verification === 'verified' ? 'success' : 'warning'}
                    label={row.center_verification === 'verified' ? 'موثق' : 'بانتظار التوثيق'} /></TableCell>
                  <TableCell><Chip size="small" color={row.sector_verification === 'verified' ? 'success' : 'warning'}
                    label={row.sector_verification === 'verified' ? 'موثق' : 'مقترح'} /></TableCell>
                  <TableCell><Chip size="small" label="لم يُعتمد" variant="outlined"/></TableCell>
                  <TableCell>
                    {canVerify ? <Stack direction="row" gap={0.7}>
                      <Button size="small" variant="outlined"
                        onClick={() => openReview('verify_center', row.id, row.center_name)}>
                        توثيق المركز
                      </Button>
                      <Button size="small" variant="outlined"
                        onClick={() => openReview('verify_sector', row.id, row.center_name)}>
                        توثيق القطاع
                      </Button>
                    </Stack> : <Typography variant="caption">للمراجعة</Typography>}
                  </TableCell>
                </TableRow>)}</TableBody>
            </Table>
          </TableContainer> : tab === 1 ? <TableContainer sx={{ maxHeight: 560 }}>
            <Table size="small" stickyHeader>
              <TableHead><TableRow>
                <TableCell>التسمية الواردة</TableCell><TableCell>الصفوف</TableCell>
                <TableCell>القرار</TableCell><TableCell>مركز مرتبط</TableCell>
                <TableCell>إجراء</TableCell>
              </TableRow></TableHead>
              <TableBody>{filteredCases.map(row =>
                <TableRow key={row.id} hover>
                  <TableCell><Typography fontWeight={800}>{row.raw_source_label}</Typography></TableCell>
                  <TableCell>{row.source_row_count}</TableCell>
                  <TableCell><Chip size="small"
                    color={row.decision === 'pending' ? 'warning' : 'success'}
                    label={labelForDecision(row.decision)} /></TableCell>
                  <TableCell>{current.references.find(x => x.id === row.mapped_reference_id)?.center_name || '—'}</TableCell>
                  <TableCell>{canReview && <Button size="small" variant="outlined"
                    onClick={() => openReview('classify', row.id, row.raw_source_label, row)}>
                    مراجعة وتصنيف
                  </Button>}</TableCell>
                </TableRow>)}</TableBody>
            </Table>
          </TableContainer> : <TableContainer sx={{ maxHeight: 520 }}>
            <Table size="small" stickyHeader>
              <TableHead><TableRow><TableCell>التوقيت</TableCell><TableCell>المستخدم</TableCell>
                <TableCell>الإجراء</TableCell><TableCell>السجل</TableCell>
                <TableCell>مرجع الإثبات</TableCell></TableRow></TableHead>
              <TableBody>{current.audit_events.map(item => <TableRow key={item.id}>
                <TableCell>{new Date(item.created_at).toLocaleString('ar-SA')}</TableCell>
                <TableCell>{item.performed_by__username || '—'}</TableCell>
                <TableCell>{item.action}</TableCell>
                <TableCell>{item.entity_type} / {item.entity_id || '—'}</TableCell>
                <TableCell>{item.evidence_reference || '—'}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </TableContainer>}
        </Paper>
      </>}
    <Dialog open={!!edit} onClose={() => !busy && setEdit(null)} maxWidth="sm" fullWidth dir="rtl">
      <DialogTitle fontWeight={900}>
        {edit?.kind === 'classify' ? 'تسجيل قرار مطابقة' :
          edit?.kind === 'verify_center' ? 'التحقق من اعتماد المركز' : 'التحقق من تبعية القطاع'}
      </DialogTitle>
      <DialogContent dividers>
        <Stack gap={2}>
          <Typography fontWeight={800}>{edit?.title}</Typography>
          <Alert severity="warning">
            يجب إسناد القرار إلى مستند رسمي. لا يُعد هذا الإجراء موافقة تلقائية على
            نقل الموظفين، ولا يعدّل سجل المراكز أو القطاعات في قاعدة التشغيل.
          </Alert>
          {edit?.kind === 'classify' && <>
            <TextField select label="نوع الحالة" value={decision}
              onChange={e => setDecision(e.target.value as Decision)}>
              {decisions.map(item => <MenuItem key={item.key} value={item.key}>{item.label}</MenuItem>)}
            </TextField>
            {(decision === 'alias' || decision === 'branch') && <TextField select
              label="المرجع الذي تم التحقق منه" value={referenceId}
              onChange={e => setReferenceId(e.target.value)}>
              <MenuItem value="">اختر المركز</MenuItem>
              {(current?.references || []).map(item => <MenuItem key={item.id} value={String(item.id)}>
                {item.center_name} — {item.provisional_code}
              </MenuItem>)}
            </TextField>}
          </>}
          {edit?.kind === 'verify_center' && <TextField select label="المركز الموجود في سجل المنصة"
            value={centerId} onChange={e => setCenterId(e.target.value)}>
            <MenuItem value="">اختر مركزًا قائمًا</MenuItem>
            {centers.map(center => <MenuItem key={center.id} value={String(center.id)}>
              {center.name_ar || center.name}
            </MenuItem>)}
          </TextField>}
          <TextField fullWidth label="رقم المرجع أو مستند الاعتماد" value={evidence}
            onChange={e => setEvidence(e.target.value)} inputProps={{ maxLength: 250 }}
            helperText="إلزامي عند اعتماد المركز أو القطاع أو مطابقة الاسم والفرع."/>
          <TextField fullWidth required multiline rows={3} value={reason}
            onChange={e => setReason(e.target.value)}
            label="مبرر القرار (10 أحرف على الأقل)" inputProps={{ maxLength: 1000 }}/>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button disabled={busy} onClick={() => setEdit(null)}>إلغاء</Button>
        <Button variant="contained" disabled={busy || reason.trim().length < 10 ||
          ((edit?.kind === 'verify_center' || edit?.kind === 'verify_sector') &&
            (!canVerify || evidence.trim().length < 3)) ||
          (edit?.kind === 'verify_center' && !centerId) ||
          (edit?.kind === 'classify' && ['alias', 'branch'].includes(decision) &&
            (!referenceId || evidence.trim().length < 3))}
          onClick={() => void saveDecision()}>
          حفظ القرار في سجل التدقيق
        </Button>
      </DialogActions>
    </Dialog>
  </Box>;
}
