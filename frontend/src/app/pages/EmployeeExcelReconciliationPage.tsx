import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel,
  Grid, MenuItem, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import {
  ArrowBack as BackIcon, UploadFile as UploadIcon,
  FactCheck as PreviewIcon, ManageAccounts as SaveIcon,
} from '@mui/icons-material';
import { authFetch, getAccessToken, useAuth } from '../context/AuthContext';

const API = (import.meta.env.VITE_API_URL ||
  'https://occupational-health-platform-production.up.railway.app/api').replace(/\/$/, '');

type Preview = {
  mode: 'preview';
  total_rows: number;
  eligible_count: number;
  breakdown: Record<string, number>;
  fill_field_counts: Record<string, number>;
  examples_masked: Array<{ status: string; row: number; national_id_masked: string }>;
  preview_token: string;
  confirm_phrase: string;
  warning: string;
  notice: string;
};
type ComparisonRow = {
  row: number;
  status: string;
  employee_pk: number;
  national_id_masked: string;
  source_name: string;
  registry_name: string;
  source_employee_number: string;
  registry_employee_number: string;
  source_email_present: boolean;
  registry_email_present: boolean;
  email_mismatch: boolean;
  source_center: string;
  registry_center: string;
  archived: boolean;
  employment_status: string;
  decision_status: 'pending' | 'stale' | 'verified' | 'not_verified';
  decision_token: string;
};
type Comparison = {
  mode: 'review';
  total: number;
  offset: number;
  page_size: number;
  review_filter: string;
  rows: ComparisonRow[];
  notice: string;
};
const REVIEW_FILTERS = [
  ['all', 'جميع الحالات المختلف عليها'],
  ['name_mismatch', 'اختلاف أسماء الموظفين'],
  ['individually_archived_requires_review', 'أرشفة فردية مستقلة'],
  ['unique_field_mismatch', 'اختلاف رقم وظيفي أو بريد'],
  ['unique_value_owned_by_other', 'الرقم أو البريد يخص موظفًا آخر'],
] as const;
const REVIEW_LABELS: Record<string,string> = {
  pending: 'لم تُراجع',
  stale: 'قرار قديم يستلزم إعادة التحقق',
  verified: 'تم توثيق التحقق (دون تعديل)',
  not_verified: 'تحتاج تصحيحًا / لم يثبت التطابق',
};
type Done = {
  mode: 'committed';
  processed: number;
  matched_and_updated: number;
  restored: number;
  changed_fields_total: number;
  not_modified: number;
  notice: string;
};
const CATEGORIES: Record<string, string> = {
  restore_and_fill: 'استعادة موظف مؤرشف واستكمال بياناته الناقصة',
  restore_only: 'استعادة موظف مؤرشف دون تعديل حقوله',
  fill_only: 'استكمال بيانات موظف نشط',
  no_change: 'مسجل ولا توجد حقول ناقصة قابلة للاستكمال',
  invalid_identity_or_name: 'هوية أو اسم غير صالح',
  duplicate_identity_in_file: 'هوية مكررة داخل Excel',
  duplicate_email_in_file: 'بريد إلكتروني مكرر داخل Excel',
  duplicate_employee_number_in_file: 'رقم وظيفي مكرر داخل Excel',
  new_identity_requires_normal_import: 'هوية جديدة (تحتاج مسار إضافة الموظفين)',
  name_mismatch: 'اختلاف اسم الموظف عن السجل الأصلي',
  invalid_source_value: 'قيمة في المصدر تحتاج تحققًا',
  unique_value_owned_by_other: 'رقم وظيفي أو بريد يخص موظفًا آخر',
  unique_field_mismatch: 'اختلاف الرقم الوظيفي أو البريد الحالي',
  individually_archived_requires_review: 'مؤرشف بإجراء مستقل ويتطلب استعادة فردية',
  date_inconsistency: 'عدم اتساق تاريخ الميلاد والتعيين',
};
const FIELD_NAMES: Record<string, string> = {
  employee_number: 'الرقم الوظيفي', email: 'البريد الإلكتروني',
  mobile: 'الجوال', national_address: 'العنوان الوطني',
  date_of_birth: 'تاريخ الميلاد', birth_place: 'مكان الميلاد',
  gender: 'الجنس', marital_status: 'الحالة الاجتماعية',
  job_title: 'المسمى الوظيفي', job_title_en: 'المسمى بالإنجليزية',
  current_job: 'الوظيفة الحالية', nationality: 'الجنسية',
  appointment_date: 'تاريخ التعيين',
};

export function EmployeeExcelReconciliationPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState('Employees');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Done | null>(null);
  const [reason, setReason] = useState('');
  const [phrase, setPhrase] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [comparisonFilter, setComparisonFilter] = useState('name_mismatch');
  const [comparisonBusy, setComparisonBusy] = useState(false);
  const [decisionTarget, setDecisionTarget] = useState<ComparisonRow | null>(null);
  const [decisionAction, setDecisionAction] = useState('not_verified');
  const [decisionReference, setDecisionReference] = useState('');
  const [decisionReason, setDecisionReason] = useState('');
  const [decisionConfirmed, setDecisionConfirmed] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [reviewNotice, setReviewNotice] = useState('');

  const fetchComparison = async (filter = comparisonFilter, offset = 0) => {
    if (!file || comparisonBusy || busy || !user?.isSuperuser) return;
    setComparisonBusy(true);
    setError('');
    try {
      const token = getAccessToken();
      if (!token) throw new Error('انتهت جلسة المسؤول؛ أعد تسجيل الدخول.');
      const form = new FormData();
      form.append('action', 'review');
      form.append('file', file);
      form.append('sheet_name', sheet || 'Employees');
      form.append('review_filter', filter);
      form.append('review_offset', String(offset));
      const response = await authFetch(API + '/employee-roster/reconcile/', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'تعذرت قراءة تفاصيل المقارنة.');
      setComparison(data as Comparison);
      setComparisonFilter(filter);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل حالات التعارض.');
    } finally {
      setComparisonBusy(false);
    }
  };

  const recordDecision = async () => {
    if (!decisionTarget || !file || decisionBusy || !decisionConfirmed ||
        decisionReference.trim().length < 6 || decisionReference.trim().length > 255 ||
        decisionReason.trim().length < 20 || decisionReason.trim().length > 500) return;
    if (!window.confirm('توثيق القرار لا يستعيد أو يغيّر أي موظف. هل تؤكد أن المستند المرجعي تحقق منه المسؤول؟')) return;
    setDecisionBusy(true);
    setError('');
    try {
      const token = getAccessToken();
      if (!token) throw new Error('انتهت جلسة المسؤول؛ أعد تسجيل الدخول.');
      const form = new FormData();
      form.append('action', 'review_decision');
      form.append('file', file);
      form.append('sheet_name', sheet || 'Employees');
      form.append('decision_token', decisionTarget.decision_token);
      form.append('decision', decisionAction);
      form.append('evidence_reference', decisionReference.trim());
      form.append('reason', decisionReason.trim());
      form.append('confirmed', 'true');
      const response = await authFetch(API + '/employee-roster/reconcile/', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'تعذر توثيق المراجعة.');
      setReviewNotice('سُجّل القرار للمراجعة فقط، ولم يتغير سجل الموظف أو أي بيانات صحية.');
      setDecisionTarget(null);
      setDecisionReference('');
      setDecisionReason('');
      setDecisionConfirmed(false);
      setComparison(prev => prev ? {
        ...prev,
        rows: prev.rows.map(r => r.row === decisionTarget.row
          ? { ...r, decision_status: decisionAction as ComparisonRow['decision_status'] }
          : r),
      } : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حفظ قرار المراجعة.');
    } finally {
      setDecisionBusy(false);
    }
  };


  const process = async (action: 'preview' | 'commit') => {
    if (busy || !file || !user?.isSuperuser) return;
    if (action === 'commit') {
      if (!preview || preview.eligible_count <= 0 || preview.eligible_count > 500 ||
          phrase !== preview.confirm_phrase || !acknowledged ||
          reason.trim().length < 20 || reason.trim().length > 500) return;
      if (!window.confirm(
        `هل تؤكد استعادة/استكمال ${preview.eligible_count} موظفًا مطابقًا فقط، مع الإبقاء على جميع البيانات الحالية والملفات الصحية دون استبدال؟`
      )) return;
    }
    setBusy(true);
    setError('');
    if (action === 'preview') {
      setPreview(null);
      setResult(null);
      setComparison(null);
      setReviewNotice('');
      setAcknowledged(false);
      setReason('');
      setPhrase('');
    }
    try {
      const token = getAccessToken();
      if (!token) throw new Error('انتهت جلسة المسؤول؛ أعد تسجيل الدخول.');
      const form = new FormData();
      form.append('action', action);
      form.append('file', file);
      form.append('sheet_name', sheet || 'Employees');
      if (action === 'commit' && preview) {
        form.append('preview_token', preview.preview_token);
        form.append('confirmed', 'true');
        form.append('identity_checked', 'true');
        form.append('confirm_phrase', phrase);
        form.append('reason', reason.trim());
      }
      const response = await authFetch(API + '/employee-roster/reconcile/', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'تعذرت معالجة ملف الموظفين.');
      if (action === 'preview') setPreview(data as Preview);
      else {
        setResult(data as Done);
        setPreview(null);
        setPhrase('');
        setReason('');
        setAcknowledged(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إكمال العملية.');
      if (action === 'commit') setPreview(null); // Stale token; force a new preview.
    } finally {
      setBusy(false);
    }
  };

  if (!user?.isSuperuser) {
    return <Alert severity="warning">هذه الصفحة مخصصة للمسؤول الأعلى فقط.</Alert>;
  }

  return <Box dir="rtl" sx={{ pb: 5 }}>
    <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5}
      alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
      <Box>
        <Typography variant="h4" fontWeight={900}>مطابقة واستكمال الموظفين من Excel</Typography>
        <Typography color="text.secondary" variant="body2">
          استعادة السجلات المؤرشفة من دفعة التصفير بعد التحقق، وتعبئة الحقول الفارغة فقط
        </Typography>
      </Box>
      <Button variant="outlined" startIcon={<BackIcon />}
        onClick={() => navigate('/employees/import')}>
        العودة إلى الاستيراد
      </Button>
    </Stack>

    <Alert severity="info" sx={{ mb: 2 }}>
      هذا المسار مختلف عن «إضافة موظفين جدد». لا ينشئ أي هوية مكررة،
      ولا يستبدل اسمًا أو رقمًا وظيفيًا أو بريدًا موجودًا،
      ولا يغير المركز الصحي أو الجهة التنظيمية أو الملفات الطبية.
      اختلاف الاسم أو المعرفات يعزل السجل للمراجعة.
    </Alert>

    <Paper sx={{ p: 3, mb: 2 }}>
      <Stack gap={2}>
        <Button component="label" variant="contained" startIcon={<UploadIcon />}
          sx={{ alignSelf: 'start' }} disabled={busy}>
          {file ? file.name : 'اختيار ملف الموظفين Excel'}
          <input type="file" accept=".xlsx" hidden onChange={e => {
            const candidate = e.target.files?.[0] || null;
            setFile(candidate);
            setPreview(null); setResult(null); setComparison(null); setError('');
          }}/>
        </Button>
        <TextField label="اسم ورقة الموظفين" value={sheet} sx={{ maxWidth: 300 }}
          onChange={e => { setSheet(e.target.value); setPreview(null); setComparison(null); }} />
        <Button variant="contained" color="primary" startIcon={<PreviewIcon />}
          disabled={!file || busy} onClick={() => void process('preview')}>
          فحص مطابقة الملف (قراءة فقط)
        </Button>
        {busy && <Stack direction="row" alignItems="center" gap={2}>
          <CircularProgress size={24}/>
          <Typography>جارٍ التحقق من الملف والسجلات الموجودة...</Typography>
        </Stack>}
      </Stack>
    </Paper>

    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

    {preview && <>
      <Paper sx={{ p: 3, mb: 2 }}>
        <Typography fontWeight={900} variant="h6" sx={{ mb: 1.5 }}>
          نتائج المطابقة — دون إجراء أي تعديل
        </Typography>
        <Grid container spacing={1.5}>
          {[
            ['إجمالي الموظفين في الملف', preview.total_rows],
            ['المؤهلون للاستعادة أو الاستكمال', preview.eligible_count],
            ['يحتاجون مراجعة أو مسارًا منفصلًا', preview.total_rows - preview.eligible_count],
          ].map(([caption, n]) => <Grid key={String(caption)} size={{ xs: 12, md: 4 }}>
            <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
              <Typography fontSize={28} fontWeight={900}>{n}</Typography>
              <Typography fontSize={12}>{caption}</Typography>
            </Paper>
          </Grid>)}
        </Grid>
        <Divider sx={{ my: 2 }}/>
        <Typography fontWeight={900} sx={{ mb: 1 }}>تصنيف السجلات</Typography>
        <Grid container spacing={1}>
          {Object.entries(preview.breakdown).map(([key, n]) => <Grid key={key}
            size={{ xs: 12, md: 6 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between"
              sx={{ p: 1.2, borderBottom: '1px solid #CBD5E1' }}>
              <Typography fontSize={13}>{CATEGORIES[key] || key}</Typography>
              <Chip label={n} color={key.includes('mismatch') ? 'error' : 'default'}/>
            </Stack>
          </Grid>)}
        </Grid>
        {!!Object.keys(preview.fill_field_counts).length && <>
          <Typography fontWeight={900} sx={{ my: 2 }}>الحقول المتوقع استكمالها</Typography>
          <Stack direction="row" gap={1} flexWrap="wrap">
            {Object.entries(preview.fill_field_counts).map(([key, n]) =>
              <Chip key={key} variant="outlined" label={`${FIELD_NAMES[key] || key}: ${n}`}/>)}
          </Stack>
        </>}
        <Alert severity="info" sx={{ mt: 2 }}>{preview.notice}</Alert>
        {preview.warning && <Alert severity="warning" sx={{ mt: 1.5 }}>{preview.warning}</Alert>}
      </Paper>

      <Paper sx={{ p: 3, mb: 2 }}>
        <Typography variant="h6" fontWeight={900} sx={{ mb: 1 }}>
          مقارنة بيانات Excel مع سجلات الموظفين الأصلية
        </Typography>
        <Alert severity="warning" sx={{ mb: 2 }}>
          التصنيفات المتعارضة لا تسمح باستعادة الموظف تلقائيًا. يمكن مقارنة الأسماء
          والأرقام الوظيفية والمراكز هنا، وتوثيق تحقق إداري من مصدر مستقل.
          تسجيل قرار المراجعة لا يغيّر اسم الموظف أو رقمه أو حالته أو بياناته الصحية.
        </Alert>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} alignItems="center" sx={{ mb: 2 }}>
          <TextField select label="نوع الحالة" size="small" sx={{ minWidth: 290 }}
            value={comparisonFilter} onChange={e => {
              setComparisonFilter(e.target.value);
              setComparison(null);
            }}>
            {REVIEW_FILTERS.map(([value, label]) =>
              <MenuItem key={value} value={value}>{label}</MenuItem>)}
          </TextField>
          <Button variant="outlined" disabled={comparisonBusy || busy}
            onClick={() => void fetchComparison(comparisonFilter, 0)}>
            {comparisonBusy ? 'جاري فحص المقارنة...' : 'عرض جدول المقارنة التفصيلي'}
          </Button>
        </Stack>
        {reviewNotice && <Alert severity="success" sx={{ mb: 2 }}
          onClose={() => setReviewNotice('')}>{reviewNotice}</Alert>}
        {comparison && <>
          <Typography fontSize={13} sx={{ mb: 1 }}>
            عدد الحالات المطابقة للتصفية: <strong>{comparison.total}</strong>،
            المعروضة: {comparison.rows.length} سجلًا — الصفحة {Math.floor(comparison.offset / comparison.page_size) + 1}
          </Typography>
          <TableContainer sx={{ overflowX: 'auto', maxHeight: 550, border: '1px solid', borderColor: 'divider' }}>
            <Table stickyHeader size="small" sx={{ minWidth: 1240 }}>
              <TableHead><TableRow>
                {['صف Excel', 'الهوية (مخفية)', 'اسم السجل الأصلي', 'اسم Excel',
                  'الرقم الوظيفي الحالي', 'الرقم الوظيفي في Excel',
                  'المركز الحالي', 'المركز في Excel (مرجعي)',
                  'حالة السجل', 'سبب التعارض', 'قرار المراجعة'].map(h =>
                    <TableCell key={h} sx={{ fontWeight: 900, whiteSpace: 'nowrap' }}>{h}</TableCell>)}
              </TableRow></TableHead>
              <TableBody>
                {comparison.rows.map(row => <TableRow key={row.row} hover>
                  <TableCell>{row.row}</TableCell>
                  <TableCell>{row.national_id_masked}</TableCell>
                  <TableCell sx={{ minWidth: 170 }}>{row.registry_name}</TableCell>
                  <TableCell sx={{ minWidth: 170 }}>{row.source_name}</TableCell>
                  <TableCell>{row.registry_employee_number || '—'}</TableCell>
                  <TableCell>{row.source_employee_number || '—'}</TableCell>
                  <TableCell>{row.registry_center || 'غير محدد'}</TableCell>
                  <TableCell>{row.source_center || 'غير محدد'}</TableCell>
                  <TableCell>
                    <Chip size="small" color={row.archived ? 'warning' : 'success'}
                      label={row.archived ? 'مؤرشف' : 'نشط'} />
                  </TableCell>
                  <TableCell sx={{ minWidth: 180 }}>
                    {CATEGORIES[row.status] || row.status}
                    {row.email_mismatch && <Typography fontSize={11} color="error">
                      يوجد اختلاف في البريد الإلكتروني (القيمة مخفية)
                    </Typography>}
                  </TableCell>
                  <TableCell sx={{ minWidth: 210 }}>
                    <Stack gap={1}>
                      <Typography fontSize={11}>
                        {REVIEW_LABELS[row.decision_status] || row.decision_status}
                      </Typography>
                      <Button variant="outlined" size="small"
                        disabled={row.decision_status !== 'pending' || comparisonBusy}
                        onClick={() => {
                          setDecisionTarget(row);
                          setDecisionAction('not_verified');
                          setDecisionReference('');
                          setDecisionReason('');
                          setDecisionConfirmed(false);
                        }}>
                        توثيق قرار المطابقة
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>)}
              </TableBody>
            </Table>
          </TableContainer>
          <Stack direction="row" gap={1} justifyContent="center" sx={{ mt: 2 }}>
            <Button variant="outlined" disabled={comparisonBusy || comparison.offset === 0}
              onClick={() => void fetchComparison(comparisonFilter, Math.max(0, comparison.offset - comparison.page_size))}>
              السابق
            </Button>
            <Button variant="outlined" disabled={comparisonBusy ||
              comparison.offset + comparison.page_size >= comparison.total}
              onClick={() => void fetchComparison(comparisonFilter, comparison.offset + comparison.page_size)}>
              التالي
            </Button>
          </Stack>
        </>}
      </Paper>

      {preview.eligible_count > 0 && preview.eligible_count <= 500 && (
        <Paper sx={{ p: 3, mb: 2, border: '1px solid #94A3B8' }}>
          <Typography fontWeight={900} variant="h6" sx={{ mb: 1 }}>
            اعتماد الاستعادة والاستكمال للسجلات المطابقة فقط
          </Typography>
          <Alert severity="warning" sx={{ mb: 2 }}>
            الإجراء سيحدّث بيانات الموظفين في Production.
            يتطلب مطابقة الهوية والاسم والمصدر إداريًا؛ تبقى الحالات المتعارضة
            والمؤرشفة يدويًا خارج هذا الاعتماد، ولا تتغير الزيارات والملفات الصحية.
          </Alert>
          <Stack gap={2}>
            <TextField label="المبرر الإداري المعتمد" multiline minRows={3}
              value={reason} onChange={e => setReason(e.target.value)}
              helperText="20–500 حرف، دون بيانات شخصية أو طبية"
              inputProps={{ maxLength: 500 }}/>
            <TextField label="اكتب عبارة التأكيد كما تظهر"
              value={phrase} onChange={e => setPhrase(e.target.value)}
              helperText={preview.confirm_phrase}/>
            <FormControlLabel
              control={<Checkbox checked={acknowledged}
                onChange={(_, checked) => setAcknowledged(checked)}/>}
              label="تحققت من أن الملف المعتمد يخص الموظفين المطلوبين، وأوافق على استعادة المطابقين وتعبئة حقولهم الناقصة فقط دون استبدال بيانات قائمة."/>
            <Button variant="contained" color="warning" startIcon={<SaveIcon />}
              disabled={busy || !acknowledged || phrase !== preview.confirm_phrase ||
                reason.trim().length < 20 || reason.trim().length > 500}
              onClick={() => void process('commit')}>
              تأكيد استعادة واستكمال {preview.eligible_count} موظفًا مطابقًا
            </Button>
          </Stack>
        </Paper>
      )}
    </>}

    <Dialog open={Boolean(decisionTarget)} onClose={() => {
      if (!decisionBusy) setDecisionTarget(null);
    }} maxWidth="sm" fullWidth dir="rtl">
      <DialogTitle fontWeight={900}>توثيق مراجعة اختلاف بيانات الموظف</DialogTitle>
      <DialogContent dividers>
        <Stack gap={2}>
          <Alert severity="warning">
            يجب التحقق من مصدر رسمي مستقل. هذا القرار يوثّق المراجعة فقط ولا
            يعتمد اختلاف الاسم أو يسمح باستعادة الموظف تلقائيًا.
          </Alert>
          {decisionTarget && <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="body2">اسم السجل الأصلي: <strong>{decisionTarget.registry_name}</strong></Typography>
            <Typography variant="body2">اسم Excel: <strong>{decisionTarget.source_name}</strong></Typography>
            <Typography variant="body2">الهوية المخفية: {decisionTarget.national_id_masked}</Typography>
            <Typography variant="body2">رقم الموظف الحالي: {decisionTarget.registry_employee_number || '—'}</Typography>
            <Typography variant="body2">رقم الموظف في Excel: {decisionTarget.source_employee_number || '—'}</Typography>
          </Paper>}
          <TextField select label="نتيجة التحقق الإداري" value={decisionAction}
            disabled={decisionBusy} onChange={e => setDecisionAction(e.target.value)}>
            <MenuItem value="not_verified">لم يثبت التطابق — يلزم تصحيح المصدر</MenuItem>
            <MenuItem value="verified">تم التحقق من صاحب الهوية بمصدر مستقل (دون تعديل)</MenuItem>
          </TextField>
          <TextField label="المرجع الرسمي للمطابقة" required
            value={decisionReference} onChange={e => setDecisionReference(e.target.value)}
            helperText="مثال: رقم معاملة/قرار تحقق رسمي، دون نسخ بيانات هوية أو تقارير طبية"
            inputProps={{ maxLength: 255 }} disabled={decisionBusy}/>
          <TextField label="المبرر وملاحظات التحقق" multiline minRows={3} required
            value={decisionReason} onChange={e => setDecisionReason(e.target.value)}
            helperText="20–500 حرف؛ لا تكتب معلومات طبية أو بيانات شخصية"
            inputProps={{ maxLength: 500 }} disabled={decisionBusy}/>
          <FormControlLabel control={<Checkbox checked={decisionConfirmed}
            disabled={decisionBusy} onChange={(_, checked) => setDecisionConfirmed(checked)}/>}
            label="راجعت المستند الرسمي وتأكدت أن توثيق القرار لا يغير أي سجل موظف."/>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={decisionBusy} onClick={() => setDecisionTarget(null)}>إلغاء</Button>
        <Button variant="contained" disabled={decisionBusy || !decisionConfirmed ||
          decisionReference.trim().length < 6 || decisionReason.trim().length < 20 ||
          decisionReason.trim().length > 500} onClick={() => void recordDecision()}>
          {decisionBusy ? 'جاري تسجيل القرار...' : 'حفظ قرار المراجعة فقط'}
        </Button>
      </DialogActions>
    </Dialog>

    {result && <Alert severity="success" sx={{ mb: 2 }}>
      <Typography fontWeight={900}>تمت العملية وفق المعاينة المعتمدة</Typography>
      <Typography>السجلات المستعادة: {result.restored}،
        السجلات التي عولجت: {result.matched_and_updated}،
        الحقول المستكملة: {result.changed_fields_total}،
        السجلات غير المعدلة: {result.not_modified}.</Typography>
      <Typography>{result.notice}</Typography>
      <Button variant="outlined" sx={{ mt: 1 }} onClick={() => navigate('/employees')}>
        عرض سجل الموظفين
      </Button>
    </Alert>}
  </Box>;
}
