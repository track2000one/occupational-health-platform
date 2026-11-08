import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Divider,
  FormControlLabel, MenuItem, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import {
  ArrowBack as BackIcon, FactCheck as CheckIcon,
  UploadFile as UploadIcon, Refresh as RefreshIcon,
  Save as SaveIcon, History as HistoryIcon,
} from '@mui/icons-material';
import { toast } from 'sonner';
import { authFetch, getAccessToken, useAuth } from '../context/AuthContext';

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
type CenterInfo = {
  id: number; name: string; code?: string | null; proposed_sector?: string;
};
type Match = {
  ref: string; name: string; sector: string; parent: string;
  source_rows: string; sheet_row: number;
  match_status: 'exact' | 'alias' | 'ambiguous' | 'unmatched';
  candidate_ids: number[];
  chosen_center_id: number | null; chosen_center_name: string;
  selection_method: 'automatic' | 'manual' | 'unmatched';
  readiness: 'ready' | 'blocked' | 'unmatched';
  reason: string; evidence_reference: string;
};
type Unit = {
  ref: string; name: string; center_ref: string;
  state: 'skipped' | 'unmapped' | 'existing' | 'draft_create';
  sheet_row: number; center_id: number | null;
};
type Summary = {
  source_centers: number; source_units: number; database_centers: number;
  ready_centers: number; blocked_centers: number; unmapped_centers: number;
  units_to_create_as_drafts: number; existing_units: number; units_not_mapped: number;
  draft_fields_updated?: number; draft_units_created?: number;
};
type Preview = {
  mode: 'preview'; filename: string; summary: Summary;
  matches: Match[]; units: Unit[]; database_centers: CenterInfo[];
  include_units: boolean; confirmation_phrase: string; preview_token: string;
};
type History = {
  id: number; created_at: string; performed_by: string;
  source_hash: string; summary: Summary;
};
const statusDetails: Record<string, { label: string; color: 'success' | 'warning' | 'error' | 'default' }> = {
  exact: { label: 'اسم مطابق', color: 'success' },
  alias: { label: 'اسم تاريخي موثق', color: 'success' },
  ambiguous: { label: 'أكثر من احتمال', color: 'warning' },
  unmatched: { label: 'لم تُحسم المطابقة', color: 'warning' },
};
const unitDetails: Record<Unit['state'], string> = {
  skipped: 'مستبعدة من هذه المعاينة',
  unmapped: 'المركز لم يُطابق بعد',
  existing: 'موجودة في قاعدة المنصة',
  draft_create: 'جاهزة للإضافة كمسودة',
};

async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  if (!token || !API) throw new Error('تأكد من تسجيل الدخول وضبط رابط API.');
  const res = await authFetch(API + path, {
    ...init, headers: { Authorization: 'Bearer ' + token, ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(data.detail || 'تعذر تنفيذ العملية.'));
  return data as T;
}

export function CenterDirectoryMatchingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canCommit = user?.isSuperuser === true;
  const [file, setFile] = useState<File | null>(null);
  const [includeUnits, setIncludeUnits] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [choices, setChoices] = useState<Record<string, number | null>>({});
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'ready' | 'unmatched' | 'blocked'>('all');
  const [reason, setReason] = useState('');
  const [phrase, setPhrase] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [history, setHistory] = useState<History[]>([]);
  const [historyError, setHistoryError] = useState('');

  const loadHistory = useCallback(async () => {
    try {
      const data = await apiJson<{ results: History[] }>('/center-directory/match-history/');
      setHistory(data.results);
      setHistoryError('');
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'تعذر قراءة سجل المطابقات.');
    }
  }, []);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  function resetSource(next: File | null) {
    setFile(next); setPreview(null); setChoices({}); setEvidence({});
    setDirty(false); setPhrase(''); setReason(''); setConfirmed(false);
    setSearch(''); setFilter('all');
  }

  async function requestPreview(action: 'preview' | 'commit') {
    if (!file || busy) return;
    if (action === 'commit' && (
      !canCommit || !preview || dirty || !confirmed ||
      phrase !== preview.confirmation_phrase || reason.trim().length < 15 ||
      preview.summary.blocked_centers > 0 || !preview.summary.ready_centers
    )) return;

    setBusy(true);
    try {
      const data = new FormData();
      data.append('file', file);
      data.append('action', action);
      data.append('include_units', String(includeUnits));
      if (preview) {
        data.append('selections', JSON.stringify(choices));
        data.append('manual_evidence', JSON.stringify(evidence));
      } else {
        data.append('selections', JSON.stringify({}));
        data.append('manual_evidence', JSON.stringify({}));
      }
      if (action === 'commit' && preview) {
        data.append('confirmed', 'true');
        data.append('confirmation_phrase', phrase);
        data.append('preview_token', preview.preview_token);
        data.append('reason', reason.trim());
      }
      const result = await apiJson<any>('/center-directory/match/', {
        method: 'POST', body: data,
      });
      if (action === 'preview') {
        const next = result as Preview;
        setPreview(next);
        setChoices(Object.fromEntries(
          next.matches.map(item => [item.ref, item.chosen_center_id]),
        ));
        setEvidence(Object.fromEntries(
          next.matches.filter(item => item.evidence_reference)
            .map(item => [item.ref, item.evidence_reference]),
        ));
        setDirty(false); setConfirmed(false); setPhrase('');
        toast.success('اكتملت المعاينة دون تعديل المراكز أو الموظفين.');
      } else {
        toast.success(
          'حُفظت ' + result.summary.ready_centers +
          ' مطابقة، وأُضيفت ' + result.summary.draft_units_created +
          ' وحدة للمراجعة؛ لم يتم أي اعتماد رسمي.',
        );
        resetSource(null);
        await loadHistory();
      }
    } catch (error) {
      if (action === 'commit') { setDirty(true); setConfirmed(false); }
      toast.error(error instanceof Error ? error.message : 'تعذر الفحص.');
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(() => (preview?.matches || []).filter(item => {
    const q = search.trim().toLocaleLowerCase();
    const text = [
      item.ref, item.name, item.sector, item.chosen_center_name, item.reason,
    ].join(' ').toLocaleLowerCase();
    return (!q || text.includes(q)) && (filter === 'all' || item.readiness === filter);
  }), [preview, search, filter]);

  const selectedLookup = useMemo(
    () => new Map(preview?.database_centers.map(center => [center.id, center]) || []),
    [preview],
  );

  return <Box dir="rtl" sx={{ pb: 5 }}>
    <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5}
      alignItems={{ xs: 'stretch', md: 'center' }}
      justifyContent="space-between" sx={{ mb: 2 }}>
      <Box>
        <Typography variant="h4" fontWeight={900} color="#123B5E">
          <CheckIcon sx={{ verticalAlign: 'middle', ml: 1 }} />
          مطابقة الدليل التنظيمي مع المراكز الصحية
        </Typography>
        <Typography color="text.secondary" fontSize={13}>
          المراكز والوحدات من Excel مقابل السجل الحالي في PostgreSQL، مع توثيق الاختيارات
        </Typography>
      </Box>
      <Button variant="outlined" startIcon={<BackIcon />}
        onClick={() => navigate('/admin/health-centers')}>
        العودة إلى إدارة المراكز
      </Button>
    </Stack>

    <Alert severity="info" sx={{ mb: 2 }}>
      تقرأ الشاشة ورقتي «المراكز_الصحية» و«وحدات_المراكز» فقط.
      لا تنشئ مراكز جديدة أو تعيد تسمية مركز قائم أو تعتمد قطاعًا أو تنقل موظفًا.
      الأسماء المتشابهة تُعرض كاقتراحات تحتاج قرارًا يدويًا موثقًا.
    </Alert>

    <Paper sx={{ p: 2.5, borderRadius: 3, mb: 2 }}>
      <Typography variant="h6" fontWeight={900} sx={{ mb: 2 }}>
        <UploadIcon sx={{ verticalAlign: 'middle', ml: 1 }}/>
        1. اختيار ملف Excel ومعاينة المطابقة
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} alignItems="center">
        <Button component="label" variant="outlined" disabled={busy}>
          اختيار الدليل المنقح (.xlsx)
          <input type="file" hidden accept=".xlsx"
            onChange={event => {
              resetSource(event.target.files?.[0] || null);
              event.target.value = '';
            }} />
        </Button>
        <Typography variant="body2" sx={{ flex: 1, overflowWrap: 'anywhere' }}>
          {file?.name || 'لم يتم اختيار ملف بعد'}
        </Typography>
        <Button variant="contained" startIcon={<RefreshIcon />}
          disabled={!file || busy} onClick={() => void requestPreview('preview')}>
          {busy ? 'جارٍ التحقق...' : preview ? 'إعادة فحص المطابقة' : 'معاينة فقط'}
        </Button>
      </Stack>
      <FormControlLabel sx={{ mt: 1 }}
        control={<Checkbox checked={includeUnits} disabled={busy}
          onChange={(_, value) => {
            setIncludeUnits(value);
            setDirty(true); setConfirmed(false); setPhrase('');
          }} />}
        label="إدراج الوحدات غير الموجودة كمسودات بعد توثيق المطابقة" />
      <Typography variant="caption" display="block" color="text.secondary">
        لا حاجة لتنزيل ملفات TSV أو إدخال معرفات المراكز يدويًا في Excel؛
        يمكن اختيار السجل الصحيح من القائمة أدناه.
      </Typography>
    </Paper>

    {preview && <>
      <Paper sx={{ p: 2.5, mb: 2.5, borderRadius: 3 }}>
        <Typography variant="h6" fontWeight={900} sx={{ mb: 2 }}>
          2. نتيجة المطابقة والمراجعة
        </Typography>
        <Box sx={{ display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2,minmax(0,1fr))',
            md: 'repeat(4,minmax(0,1fr))' }, gap: 1.5 }}>
          {[
            ['مراكز Excel', preview.summary.source_centers],
            ['مراكز PostgreSQL', preview.summary.database_centers],
            ['مطابقات جاهزة', preview.summary.ready_centers],
            ['تحتاج مراجعة', preview.summary.unmapped_centers + preview.summary.blocked_centers],
            ['وحدات Excel', preview.summary.source_units],
            ['وحدات مسودة للإضافة', preview.summary.units_to_create_as_drafts],
            ['وحدات موجودة', preview.summary.existing_units],
            ['وحدات غير مرتبطة', preview.summary.units_not_mapped],
          ].map(([label, value]) =>
            <Paper variant="outlined" key={String(label)} sx={{ p: 1.5, borderRadius: 2 }}>
              <Typography color="primary" variant="h5" fontWeight={900}>{value}</Typography>
              <Typography color="text.secondary" variant="caption">{label}</Typography>
            </Paper>)}
        </Box>

        <Alert severity={dirty ? 'warning' : 'success'} sx={{ my: 2 }}>
          {dirty ? 'تغير أحد الاختيارات؛ اضغط «إعادة فحص المطابقة» قبل الحفظ.'
            : 'نتيجة هذه المعاينة صالحة حتى تتغير الاختيارات أو البيانات في المنصة، وبحد أقصى 10 دقائق.'}
        </Alert>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}
          alignItems="center" sx={{ my: 1.5 }}>
          <TextField fullWidth size="small" value={search} label="بحث في أسماء المراكز أو القطاعات"
            onChange={e => setSearch(e.target.value)} />
          <TextField select size="small" label="التصفية" value={filter}
            onChange={e => setFilter(e.target.value as typeof filter)}
            sx={{ minWidth: 180 }}>
            <MenuItem value="all">جميع الحالات</MenuItem>
            <MenuItem value="ready">جاهزة</MenuItem>
            <MenuItem value="unmatched">لم تُطابق</MenuItem>
            <MenuItem value="blocked">محظورة أو متعارضة</MenuItem>
          </TextField>
        </Stack>

        <TableContainer sx={{ maxHeight: 620, border: '1px solid #DFE8F0', borderRadius: 2 }}>
          <Table size="small" stickyHeader sx={{ minWidth: 1020 }}>
            <TableHead>
              <TableRow>
                <TableCell>مرجع Excel / اسم المركز</TableCell>
                <TableCell>القطاع المقترح</TableCell>
                <TableCell>نتيجة البحث</TableCell>
                <TableCell sx={{ minWidth: 260 }}>اختر بطاقة المركز القائمة</TableCell>
                <TableCell>حالة الاعتماد</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map(row => {
                const choice = choices[row.ref] ?? null;
                const status = statusDetails[row.match_status];
                const needsEvidence = !!choice && row.selection_method === 'manual';
                return <TableRow key={row.ref} hover>
                  <TableCell sx={{ minWidth: 190 }}>
                    <Typography fontWeight={900}>{row.name}</Typography>
                    <Typography variant="caption" display="block" color="text.secondary">
                      {row.ref} — صفوف المصدر: {row.source_rows}
                    </Typography>
                    {row.candidate_ids.length > 0 && <Typography
                      color="text.secondary" fontSize={11} sx={{ mt: 0.5 }}>
                      اقتراحات: {row.candidate_ids.map(id =>
                        selectedLookup.get(id)?.name || String(id)).join('، ')}
                    </Typography>}
                  </TableCell>
                  <TableCell>{row.sector}</TableCell>
                  <TableCell>
                    <Chip color={status.color} size="small" label={status.label}/>
                  </TableCell>
                  <TableCell>
                    <TextField size="small" select fullWidth
                      label="معرف مركز موجود" value={choice === null ? '' : String(choice)}
                      onChange={e => {
                        setChoices(old => ({
                          ...old, [row.ref]: e.target.value ? Number(e.target.value) : null,
                        }));
                        setDirty(true); setConfirmed(false); setPhrase('');
                      }}>
                      <MenuItem value="">بدون ربط — يحتاج مراجعة</MenuItem>
                      {preview.database_centers.map(item =>
                        <MenuItem key={item.id} value={String(item.id)}>
                          {item.name} (ID {item.id})
                        </MenuItem>)}
                    </TextField>
                    {!!choice && row.match_status !== 'exact' &&
                      row.match_status !== 'alias' &&
                      <TextField fullWidth size="small" sx={{ mt: 1 }}
                        label="مرجع المطابقة اليدوية (إلزامي)"
                        value={evidence[row.ref] || ''}
                        onChange={e => {
                          setEvidence(old => ({ ...old, [row.ref]: e.target.value }));
                          setDirty(true); setConfirmed(false); setPhrase('');
                        }}
                        helperText="اسم المستند أو رقمه؛ لا يُكتفى بالتشابه." />}
                  </TableCell>
                  <TableCell sx={{ minWidth: 180 }}>
                    <Chip size="small"
                      color={row.readiness === 'ready' ? 'success'
                        : row.readiness === 'blocked' ? 'error' : 'warning'}
                      label={row.readiness === 'ready' ? 'جاهز كمسودة'
                        : row.readiness === 'blocked' ? 'موقوف' : 'غير مرتبط'}/>
                    <Typography fontSize={11.5} sx={{ mt: 0.75, maxWidth: 230 }}>
                      {row.reason}
                    </Typography>
                  </TableCell>
                </TableRow>;
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper sx={{ p: 2.5, mb: 2, borderRadius: 3 }}>
        <Typography variant="h6" fontWeight={900} sx={{ mb: 1 }}>
          3. مراجعة الوحدات التابعة
        </Typography>
        <Typography color="text.secondary" variant="body2" sx={{ mb: 1 }}>
          كل وحدة تُربط بمركزها الموجود بعد حسم المطابقة، وتُحفظ بصفة مسودة فقط.
          لا يُعاد إنشاء الوحدات التي تحمل الاسم نفسه داخل المركز.
        </Typography>
        <TableContainer sx={{ maxHeight: 300 }}>
          <Table size="small" stickyHeader>
            <TableHead><TableRow>
              <TableCell>وحدة Excel</TableCell><TableCell>المركز المرجعي</TableCell>
              <TableCell>نتيجة المعاينة</TableCell>
            </TableRow></TableHead>
            <TableBody>{preview.units.map(unit => <TableRow key={unit.ref}>
              <TableCell>{unit.name}</TableCell>
              <TableCell>{unit.center_ref}</TableCell>
              <TableCell><Chip size="small" variant="outlined"
                color={unit.state === 'draft_create' ? 'warning'
                  : unit.state === 'existing' ? 'success' : 'default'}
                label={unitDetails[unit.state]}/></TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
        <Typography variant="h6" fontWeight={900} sx={{ mb: 1.5 }}>
          4. توثيق قرار حفظ المسودات
        </Typography>
        <Alert severity="warning" sx={{ mb: 2 }}>
          هذا الإجراء لا يعتمد مرجع المركز أو القطاع، ولا يغير اسم المركز أو
          رمزه الرسمي أو أي سجل موظف. يحفظ فقط التبعية المقترحة والوحدات الجديدة
          كمقترحات قابلة للمراجعة. الحالات غير المطابقة تُترك دون تعديل.
        </Alert>
        {canCommit ? <Stack gap={1.5}>
          <TextField fullWidth multiline minRows={2} label="مبرر المطابقة (إلزامي)"
            value={reason} onChange={e => setReason(e.target.value)}
            inputProps={{ maxLength: 500 }} helperText="15 حرفًا على الأقل، ويُحفظ في سجل التدقيق." />
          <TextField fullWidth label="عبارة التأكيد" value={phrase}
            onChange={e => setPhrase(e.target.value)}
            helperText={preview.confirmation_phrase} />
          <FormControlLabel
            control={<Checkbox checked={confirmed}
              onChange={(_, checked) => setConfirmed(checked)}/>}
            label="راجعت نتائج المعاينة، والمطابقات اليدوية موثقة، وأوافق على حفظ المسودات فقط." />
          <Button variant="contained" color="primary" startIcon={<SaveIcon />}
            disabled={busy || dirty || preview.summary.blocked_centers > 0 ||
              !preview.summary.ready_centers || !confirmed ||
              reason.trim().length < 15 || phrase !== preview.confirmation_phrase}
            onClick={() => void requestPreview('commit')}>
            حفظ المطابقات والوحدات كمسودات للمراجعة
          </Button>
        </Stack> : <Alert severity="info">
          يستطيع حسابك معاينة المطابقة واختيار المراكز. أما تنفيذ الحفظ الجماعي
          فيتطلب صلاحية مدير النظام الأعلى.
        </Alert>}
      </Paper>
    </>}

    <Paper sx={{ p: 2.5, borderRadius: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h6" fontWeight={900}>
          <HistoryIcon sx={{ verticalAlign: 'middle', ml: 1 }}/>
          سجل المطابقات السابقة
        </Typography>
        <Button variant="outlined" size="small" onClick={() => void loadHistory()}>
          تحديث
        </Button>
      </Stack>
      <Divider sx={{ my: 1.5 }}/>
      {historyError && <Alert severity="warning" sx={{ mb: 1 }}>{historyError}</Alert>}
      {history.length ? <TableContainer sx={{ maxHeight: 260 }}>
        <Table size="small" stickyHeader>
          <TableHead><TableRow>
            <TableCell>رقم الدفعة</TableCell><TableCell>التاريخ</TableCell>
            <TableCell>المنفذ</TableCell><TableCell>المراكز المطابقة</TableCell>
            <TableCell>وحدات أُنشئت للمراجعة</TableCell>
          </TableRow></TableHead>
          <TableBody>{history.map(row => <TableRow key={row.id}>
            <TableCell>{row.id}</TableCell>
            <TableCell>{new Date(row.created_at).toLocaleString('ar-SA')}</TableCell>
            <TableCell>{row.performed_by || '—'}</TableCell>
            <TableCell>{row.summary.ready_centers}</TableCell>
            <TableCell>{row.summary.draft_units_created || 0}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </TableContainer> : <Typography color="text.secondary">
        لا توجد دفعات مطابقة محفوظة حتى الآن.
      </Typography>}
    </Paper>
  </Box>;
}
