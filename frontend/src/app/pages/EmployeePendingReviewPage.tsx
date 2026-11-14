import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Grid, MenuItem,
  Paper, Stack, TextField, Typography,
} from '@mui/material';
import {
  ArrowBack as BackIcon, Refresh as RefreshIcon,
  Edit as EditIcon, WarningAmber as WarningIcon,
} from '@mui/icons-material';
import { authFetch, getAccessToken } from '../context/AuthContext';

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

type ReconciliationSnapshot = {
  mode: 'read_only';
  review_cards: number;
  unique_valid_identities: number;
  invalid_identity_cards: number;
  repeated_review_cards: number;
  matched_active: number;
  matched_archived: number;
  identity_not_in_registry: number;
  different_or_missing_name: number;
  different_unique_fields: number;
  multiple_reviews_for_identity: number;
  archived_requires_verified_restore: number;
  active_possible_fill_only: number;
  active_no_empty_fields_to_fill: number;
  possible_fill_fields: Record<string, number>;
  notice_ar: string;
};

type ReviewRow = {
  id: number; source_row: number; source_file: string;
  status: 'pending' | 'conflict';
  issues: string[];
  employee_payload: Record<string, unknown>;
  conflict_employee_summary?: { name: string; id: number } | null;
};
const FIELD_NAMES: Record<string, string> = {
  employee_number: 'الرقم الوظيفي', date_of_birth: 'تاريخ الميلاد',
  gender: 'الجنس', nationality: 'الجنسية', birth_place: 'مكان الميلاد',
  marital_status: 'الحالة الاجتماعية', mobile: 'الجوال',
  email: 'البريد الإلكتروني', national_address: 'العنوان الوطني',
  job_title: 'المسمى الوظيفي', current_job: 'الوظيفة الحالية',
  appointment_date: 'تاريخ التعيين', health_center: 'المركز الصحي',
};
const DATA_FIELDS = Object.keys(FIELD_NAMES);

function label(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}
function maskedIdentity(value: unknown): string {
  const numbers = label(value).replace(/\D/g, '');
  return numbers.length >= 8 ? numbers.slice(0, 2) + '••••' + numbers.slice(-4) : 'غير مكتمل';
}
function missingFields(row: ReviewRow): string[] {
  const payload = row.employee_payload || {};
  const fields = DATA_FIELDS.filter(field => {
    if (field === 'health_center') {
      const center = payload.health_center;
      return center === null || center === undefined || center === '' || center === 0;
    }
    return !label(payload[field]).trim();
  });
  return fields.map(field => FIELD_NAMES[field]);
}

export function EmployeePendingReviewPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<'pending' | 'conflict'>('pending');
  const [missingCenterOnly, setMissingCenterOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<ReviewRow[]>([]);
  const [count, setCount] = useState(0);
  const [next, setNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [reconciliation, setReconciliation] = useState<ReconciliationSnapshot | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconciliationError, setReconciliationError] = useState('');

  const inspectIdentityMatches = async () => {
    const token = getAccessToken();
    if (!token || !API) {
      setReconciliationError('تعذر الاتصال بالمنصة؛ تحقق من الجلسة.');
      return;
    }
    setReconciling(true);
    setReconciliation(null);
    setReconciliationError('');
    try {
      const response = await authFetch(API + '/employee-import-reviews/reconciliation-preview/', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'تعذر فحص الهويات.');
      setReconciliation(data as ReconciliationSnapshot);
    } catch (err) {
      setReconciliationError(err instanceof Error ? err.message : 'تعذر إتمام الفحص.');
    } finally {
      setReconciling(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const token = getAccessToken();
        if (!token || !API) throw new Error('تعذر الوصول إلى واجهة المنصة؛ تحقق من تسجيل الدخول.');
        const query = new URLSearchParams({
          status: statusFilter, page: String(page),
        });
        if (search.trim()) query.set('search', search.trim());
        if (missingCenterOnly) query.set('missing_center', 'true');
        const response = await authFetch(API + '/employee-import-reviews/?' + query.toString(), {
          headers: { Authorization: 'Bearer ' + token },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || 'تعذر قراءة بطاقات المراجعة.');
        if (!cancelled) {
          const rows: ReviewRow[] = Array.isArray(data) ? data : (data.results || []);
          setResults(rows);
          setCount(typeof data.count === 'number' ? data.count : rows.length);
          setNext(!!data.next);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'تعذر تحميل البطاقات.');
      } finally { if (!cancelled) setLoading(false); }
    }, search ? 300 : 0);
    return () => { cancelled = true; window.clearTimeout(handle); };
  }, [statusFilter, missingCenterOnly, search, page, reload]);

  return <Box dir="rtl" sx={{ pb: 5 }}>
    <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5}
      justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} sx={{ mb: 2 }}>
      <Box>
        <Typography variant="h4" fontWeight={900} color="#153C5E">
          <WarningIcon sx={{ color: '#BE8A00', verticalAlign: 'middle', ml: 1 }}/>
          بطاقات الموظفين قيد الاستكمال
        </Typography>
        <Typography variant="body2" color="text.secondary">
          مراجعة السجلات المستوردة غير المكتملة قبل ربطها بالمراكز وتفعيلها
        </Typography>
      </Box>
      <Stack direction="row" gap={1}>
        <Button variant="outlined" startIcon={<BackIcon />} onClick={() => navigate('/employees')}>
          الموظفون
        </Button>
        <Button variant="outlined" disabled={reconciling}
          onClick={() => void inspectIdentityMatches()}>
          {reconciling ? 'جاري مطابقة السجل...' : 'فحص مطابقة الهويات (قراءة فقط)'}
        </Button>
        <Button variant="contained" onClick={() => navigate('/employees/import')}>
          استيراد ملف Excel
        </Button>
      </Stack>
    </Stack>

    <Alert severity="warning" sx={{ mb: 2 }}>
      هذه بطاقات مراجعة مصدرها استيراد Excel، وليست بالضرورة بطاقات موظفين جدد.
      قد تكون بعض الهويات مرتبطة بموظفين نشطين أو مؤرشفين؛ لا تعِد إنشاء الموظف
      بسبب ظهور هذه البطاقة. استخدم «فحص مطابقة الهويات» لتمييز الحالات دون تعديل البيانات.
      لا تُنشأ مراكز وهمية، ولا تُغيّر بيانات الموظفين أو سجلاتهم الطبية أثناء الفحص.
    </Alert>

    {reconciliationError && <Alert severity="error" sx={{ mb: 2 }}>{reconciliationError}</Alert>}
    {reconciliation && (
      <Paper variant="outlined" sx={{ p: 2.5, mb: 2, borderRadius: 3 }}>
        <Typography fontWeight={900} variant="h6" sx={{ mb: 1.5 }}>
          مطابقة بطاقات المراجعة مع سجل الموظفين
        </Typography>
        <Grid container spacing={1.5}>
          {([
            ['بطاقات مراجعة محفوظة', reconciliation.review_cards],
            ['هويات فريدة صالحة', reconciliation.unique_valid_identities],
            ['مطابقة لسجلات مؤرشفة', reconciliation.matched_archived],
            ['مطابقة لسجلات نشطة', reconciliation.matched_active],
            ['هويات غير موجودة في السجل', reconciliation.identity_not_in_registry],
            ['هويات ذات عدة بطاقات مراجعة', reconciliation.multiple_reviews_for_identity],
            ['اختلاف في الاسم أو غيابه', reconciliation.different_or_missing_name],
            ['اختلاف رقم وظيفي أو بريد قائم', reconciliation.different_unique_fields],
            ['سجلات نشطة محتمل استكمال نواقصها', reconciliation.active_possible_fill_only],
            ['هويات غير صحيحة في البطاقات', reconciliation.invalid_identity_cards],
          ] as const).map(([label, number]) => (
            <Grid key={label} size={{ xs: 12, sm: 6, md: 4 }}>
              <Box sx={{ p: 1.5, border: '1px solid #D5E0EC', borderRadius: 2 }}>
                <Typography color="text.secondary" fontSize={12}>{label}</Typography>
                <Typography fontWeight={900} fontSize={22}>{number}</Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
        <Alert severity="info" sx={{ mt: 2 }}>
          {reconciliation.notice_ar} لا تعني المطابقة بالمصدر إذنًا باستعادة الموظف
          أو استبدال قيم موجودة؛ يلزم تدقيق الهوية والمركز واعتماد إجراء منفصل.
        </Alert>
      </Paper>
    )}
    <Paper sx={{ p: 2, borderRadius: 3, mb: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5} alignItems="center">
        <TextField size="small" fullWidth label="البحث باسم الموظف" value={search}
          onChange={event => { setSearch(event.target.value); setPage(1); }}/>
        <TextField select size="small" label="حالة المراجعة" value={statusFilter}
          onChange={event => { setStatusFilter(event.target.value as 'pending' | 'conflict'); setPage(1); }}
          sx={{ minWidth: 190 }}>
          <MenuItem value="pending">بيانات ناقصة للمراجعة</MenuItem>
          <MenuItem value="conflict">تعارض يحتاج تحقق</MenuItem>
        </TextField>
        <Button variant={missingCenterOnly ? 'contained' : 'outlined'}
          color="warning" onClick={() => {
            setMissingCenterOnly(v => !v); setPage(1);
          }}>
          {missingCenterOnly ? 'إظهار جميع الحالات' : 'مركز غير محدد فقط'}
        </Button>
        <Button variant="outlined" startIcon={<RefreshIcon />}
          onClick={() => setReload(v => v + 1)}>تحديث</Button>
      </Stack>
    </Paper>

    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {loading ? <Paper sx={{ p: 5, textAlign: 'center' }}><CircularProgress/></Paper> : <>
      <Typography sx={{ mb: 1.5, fontWeight: 800 }} color="text.secondary">
        {count} سجلًا قيد المراجعة مطابقًا للتصفية — الصفحة {page}
      </Typography>
      {results.length === 0 && !error && <Alert severity="info">
        لا توجد بطاقات مطابقة؛ غيّر التصفية أو ابحث باسم آخر.
      </Alert>}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {results.map(row => {
          const missing = missingFields(row);
          const conflict = row.status === 'conflict' ||
            row.employee_payload?._import_classification === 'existing' ||
            row.employee_payload?._import_classification === 'conflict' ||
            !!row.conflict_employee_summary;
          return <Grid key={row.id} size={{ xs: 12, md: 6, xl: 4 }}>
            <Card sx={{
              height: '100%', borderRadius: 3, border: '2px solid',
              borderColor: conflict ? '#E5A8A8' : '#E2B13C',
              borderTop: '5px solid',
              borderTopColor: conflict ? '#BE4444' : '#D99B00',
              background: conflict
                ? 'linear-gradient(155deg,#FFF7F7 0%,#FFE9E9 100%)'
                : 'linear-gradient(155deg,#FFFDF1 0%,#FFF0BA 100%)',
            }}>
              <CardContent>
                <Stack gap={1.25}>
                  <Stack direction="row" gap={1} alignItems="center"
                    justifyContent="space-between" flexWrap="wrap">
                    <Typography fontWeight={900} fontSize={17}>
                      {label(row.employee_payload?.name) || 'اسم الموظف يحتاج مراجعة'}
                    </Typography>
                    <Chip color={conflict ? 'error' : 'warning'} size="small"
                      label={conflict ? 'تعارض / موجود مسبقًا' : 'بيانات ناقصة'}/>
                  </Stack>
                  <Typography color="text.secondary" fontSize={12.5}>
                    صف المصدر {row.source_row} — رقم بطاقة المراجعة {row.id}
                  </Typography>
                  <Typography fontWeight={700} fontSize={13}>
                    رقم الهوية (مخفي): {maskedIdentity(row.employee_payload?.national_id)}
                  </Typography>
                  <Typography fontSize={13}>
                    المركز الوارد: {label(row.employee_payload?.health_center_name) || 'غير محدد'}
                  </Typography>
                  {!!missing.length && <Box sx={{ bgcolor: '#FFEBAC', borderRadius: 2, p: 1.25 }}>
                    <Typography fontWeight={850} fontSize={13} sx={{ mb: 0.5 }}>
                      بيانات تحتاج استكمالًا: {missing.length}
                    </Typography>
                    <Typography fontSize={12.5}>{missing.join('، ')}</Typography>
                  </Box>}
                  {!!row.issues?.length && <Typography fontSize={12}
                    color={conflict ? 'error.main' : '#815B19'}>
                    ملاحظات الاستيراد: {row.issues.slice(0, 3).join(' • ')}
                  </Typography>}
                  <Button variant="contained" color={conflict ? 'error' : 'warning'}
                    startIcon={<EditIcon />}
                    onClick={() => navigate('/employees/import?review_id=' + row.id)}>
                    فتح بطاقة المراجعة
                  </Button>
                  <Typography fontSize={11.5} color="text.secondary">
                    الموظف الموجود لا يُفعّل مرة أخرى؛ استكماله أو استعادته إجراء منفصل بعد التحقق.
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>;
        })}
      </Grid>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Button variant="outlined" disabled={page <= 1 || loading}
          onClick={() => setPage(p => Math.max(1, p - 1))}>السابق</Button>
        <Typography variant="caption">الصفحة {page}</Typography>
        <Button variant="outlined" disabled={!next || loading}
          onClick={() => setPage(p => p + 1)}>التالي</Button>
      </Stack>
    </>}
  </Box>;
}
