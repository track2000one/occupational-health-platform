import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Divider, FormControlLabel,
  MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TablePagination, TableRow, TextField, Typography,
} from '@mui/material';
import { Grid } from '@mui/material';
import {
  ArrowBack as BackIcon,
  Assessment as ReportIcon,
  FilterAlt as FilterIcon,
  PictureAsPdf as PdfIcon,
  Print as PrintIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { authFetch } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../data/roles';
import {
  exportFlexibleEmployeeReport,
  FLEXIBLE_EMPLOYEE_COLUMNS,
  type FlexibleEmployeeReportRow,
} from '../utils/professionalPdfExport';

// Never route Staging requests to Production if its API configuration is absent.
const API_BASE_URL = (import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:8000/api' : '')).replace(/\/$/, '');

type ReportFilters = {
  search: string;
  health_center_id: string;
  employment_status: string;
  source_category: string;
  job_title: string;
  gender: string;
  sort: string;
  created_from: string;
  created_to: string;
  archived: boolean;
};

type CenterItem = {
  id: number | string;
  name: string;
  name_ar?: string;
  is_active?: boolean;
};

type ReportPayload = {
  count: number;
  results: FlexibleEmployeeReportRow[];
  generated_at: string;
  generated_by: string;
  identity_mode: 'masked' | 'full';
  scope: 'active' | 'archived';
};

const DEFAULT_COLUMNS: Array<keyof FlexibleEmployeeReportRow> = [
  'name', 'employee_number', 'health_center', 'job_title', 'employment_status',
];

const STATUS_LABELS: Record<string, string> = {
  active: 'على رأس العمل',
  retired: 'متقاعد',
  separated: 'منتهية الخدمة',
  transferred: 'منقول خارج الجهة',
  under_review: 'تحت المراجعة',
};

function initialFilters(q: URLSearchParams): ReportFilters {
  return {
    search: q.get('search') || '',
    health_center_id: q.get('health_center_id') || '',
    employment_status: q.get('employment_status') || '',
    source_category: q.get('source_category') || '',
    job_title: '',
    gender: '',
    sort: q.get('sort') || 'name',
    created_from: '',
    created_to: '',
    archived: q.get('archived') === 'true',
  };
}

function toQuery(filters: ReportFilters): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (key === 'archived') {
      if (value) query.set('archived', 'true');
    } else if (typeof value === 'string' && value.trim()) {
      query.set(key, value.trim());
    }
  }
  return query.toString();
}

const REPORT_SORT_OPTIONS = [
  { value: 'name', label: 'الاسم (أ–ي)' },
  { value: 'employee_number', label: 'الرقم الوظيفي' },
  { value: 'center', label: 'المركز الصحي' },
  { value: 'job_title', label: 'المسمى الوظيفي' },
  { value: 'newest', label: 'الأحدث إضافة' },
  { value: 'oldest', label: 'الأقدم إضافة' },
  { value: 'age_asc', label: 'العمر تصاعديًا' },
  { value: 'age_desc', label: 'العمر تنازليًا' },
];

export function EmployeeRegistryReportPage() {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [filters, setFilters] = useState<ReportFilters>(() => initialFilters(params));
  const [columns, setColumns] = useState<Array<keyof FlexibleEmployeeReportRow>>(
    DEFAULT_COLUMNS,
  );
  const [title, setTitle] = useState('تقرير بيانات الموظفين');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('landscape');
  const [identityVisibility, setIdentityVisibility] = useState<'masked' | 'full'>('masked');
  const [centers, setCenters] = useState<CenterItem[]>([]);
  const [centersError, setCentersError] = useState('');
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [loadedQuery, setLoadedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewPage, setPreviewPage] = useState(0);
  const [previewPerPage, setPreviewPerPage] = useState(25);
  const canViewArchived = can(PERMISSIONS.MANAGE_USERS);
  const canShowFullIdentity = can(PERMISSIONS.VIEW_SENSITIVE_DATA) &&
    can(PERMISSIONS.EXPORT_REPORTS);

  const updateFilter = <K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) => {
    setFilters(previous => ({ ...previous, [key]: value }));
  };
  const currentQuery = toQuery(filters) +
    (identityVisibility === 'full' ? '&include_full_national_id=true' : '');
  const needsRefresh = !report || currentQuery !== loadedQuery ||
    report.identity_mode !== identityVisibility;

  function changeIdentityVisibility(next: 'masked' | 'full') {
    if (next === identityVisibility || loading) return;
    if (next === 'full') {
      if (!canShowFullIdentity) {
        toast.error('حسابك غير مخول لإظهار أرقام الهوية كاملة في التقارير.');
        return;
      }
      const approved = window.confirm(
        'تنبيه سرية البيانات: سيعرض هذا التقرير أرقام الهوية كاملة. ' +
        'يجب استخدامه لأغراض رسمية مصرح بها وحفظه ومشاركته بطريقة آمنة. ' +
        'هل تؤكد الحاجة إلى عرض الأرقام كاملة؟',
      );
      if (!approved) return;
    }
    // Clear previously fetched full identities when switching to masked mode.
    setReport(null);
    setLoadedQuery('');
    setPreviewPage(0);
    setIdentityVisibility(next);
    if (next === 'full') {
      setColumns(previous => previous.includes('national_id_masked')
        ? previous : [...previous, 'national_id_masked']);
    }
  }
  const visibleColumns = useMemo(
    () => FLEXIBLE_EMPLOYEE_COLUMNS.filter(item => columns.includes(item.key)),
    [columns],
  );

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const items: CenterItem[] = [];
      try {
        if (!API_BASE_URL) throw new Error('رابط API غير مضبوط لهذه البيئة.');
        for (let page = 1; page <= 40; page += 1) {
          const response = await authFetch(`${API_BASE_URL}/health-centers/?active=true&page=${page}`);
          if (!response.ok) throw new Error('تعذر قراءة سجل المراكز الصحية.');
          const payload = await response.json();
          items.push(...(Array.isArray(payload) ? payload : payload.results || []));
          if (Array.isArray(payload) || !payload.next) break;
        }
        if (mounted) setCenters(items.filter(center => center.is_active !== false));
      } catch (error) {
        if (mounted) setCentersError(error instanceof Error ? error.message : 'تعذر قراءة المراكز.');
      }
    };
    void load();
    return () => { mounted = false; };
  }, []);

  const generate = useCallback(async () => {
    const qs = toQuery(filters) +
      (identityVisibility === 'full' ? '&include_full_national_id=true' : '');
    if (identityVisibility === 'full' && !canShowFullIdentity) {
      toast.error('لا توجد صلاحية لعرض أرقام الهوية كاملة.');
      return;
    }
    if (filters.created_from && filters.created_to &&
        filters.created_from > filters.created_to) {
      toast.error('تاريخ البداية يجب ألا يكون بعد تاريخ النهاية.');
      return;
    }
    setLoading(true);
    try {
      if (!API_BASE_URL) throw new Error('رابط API غير مضبوط لهذه البيئة.');
      const response = await authFetch(`${API_BASE_URL}/employees/report/?${qs}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.detail || 'تعذر إنشاء تقرير الموظفين.');
      }
      if (!data || !Array.isArray(data.results) || data.count !== data.results.length) {
        throw new Error('البيانات التي أعادها التقرير غير مكتملة. لم يتم السماح بالطباعة.');
      }
      if (data.identity_mode !== identityVisibility ||
          (identityVisibility === 'full' && data.results.some(
            (row: FlexibleEmployeeReportRow) => !row.national_id_full,
          ))) {
        throw new Error('لم يتمكن الخادم من تأكيد صلاحية ونطاق إظهار الهوية. لم يتم السماح بالطباعة.');
      }
      setReport(data as ReportPayload);
      setLoadedQuery(qs);
      setPreviewPage(0);
      toast.success(`تم إنشاء التقرير لـ${data.count} موظف وفق التصفية المختارة.`);
    } catch (error) {
      setReport(null);
      setLoadedQuery('');
      toast.error(error instanceof Error ? error.message : 'تعذر إنشاء التقرير.');
    } finally {
      setLoading(false);
    }
  }, [filters, identityVisibility, canShowFullIdentity]);

  const selectedCenter = centers.find(center => String(center.id) === filters.health_center_id);
  const filterSummary = [
    filters.search ? `بحث: ${filters.search}` : '',
    selectedCenter ? `المركز: ${selectedCenter.name_ar || selectedCenter.name}` : '',
    filters.employment_status ? `الحالة: ${STATUS_LABELS[filters.employment_status] || filters.employment_status}` : '',
    filters.source_category ? `حالة المصدر: ${filters.source_category}` : '',
    filters.gender ? `الجنس: ${filters.gender === 'male' ? 'ذكر' : 'أنثى'}` : '',
    filters.job_title ? `المسمى: ${filters.job_title}` : '',
    filters.created_from ? `من: ${filters.created_from}` : '',
    filters.created_to ? `إلى: ${filters.created_to}` : '',
    `الفرز: ${REPORT_SORT_OPTIONS.find(item => item.value === filters.sort)?.label || 'الاسم'}`,
  ].filter(Boolean).join(' | ');

  function printReport(saveAsPdf: boolean) {
    if (!report || needsRefresh || loading || !columns.length) {
      toast.error('يجب تحديث المعاينة واختيار الأعمدة قبل الطباعة.');
      return;
    }
    if (columns.length > 9) {
      toast.warning('تحديد أكثر من 9 أعمدة قد يجعل الخط صغيرًا في الورقة؛ يُفضّل اختيار الأعمدة المهمة فقط.');
    }
    if (saveAsPdf) {
      toast.info('من نافذة الطباعة اختر «حفظ بتنسيق PDF / Save as PDF» للاحتفاظ بالتقرير.');
    }
    try {
      exportFlexibleEmployeeReport(report.results, columns, {
        title: title.trim() || 'تقرير بيانات الموظفين',
        generatedBy: report.generated_by,
        filterSummary,
        orientation,
        archived: report.scope === 'archived',
        showFullNationalId: identityVisibility === 'full' &&
          canShowFullIdentity && report.identity_mode === 'full',
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تجهيز الطباعة.');
    }
  }

  const selectedKeys = new Set(columns);
  const results = report?.results || [];
  const pageRows = results.slice(previewPage * previewPerPage, (previewPage + 1) * previewPerPage);
  const activeCount = results.filter(row => row.employment_status === 'active').length;
  const includedCenters = new Set(results.map(row => row.health_center).filter(Boolean)).size;

  const displayValue = (row: FlexibleEmployeeReportRow, key: keyof FlexibleEmployeeReportRow): string => {
    const raw = key === 'national_id_masked' && identityVisibility === 'full' &&
      canShowFullIdentity && report?.identity_mode === 'full'
      ? row.national_id_full : row[key];
    if (key === 'employment_status') return STATUS_LABELS[String(raw)] || '—';
    if (key === 'gender') return raw === 'male' ? 'ذكر' : raw === 'female' ? 'أنثى' : '—';
    return raw == null || raw === '' ? '—' : String(raw);
  };

  return (
    <Box dir={isRtl ? 'rtl' : 'ltr'}>
      <Stack direction={{ xs: 'column', md: 'row' }}
        alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between"
        spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={900} color="#133D5F">
            <ReportIcon sx={{ verticalAlign: 'middle', mx: 1 }} />
            {isRtl ? 'التقرير المرن للموظفين' : 'Flexible Employee Report'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {isRtl ? 'تصفية وفرز حسب السجل الكامل، ومعاينة اختيارية للأعمدة، وطباعة عربية / PDF.'
              : 'Full-register filtering, sorting, customizable columns and print/PDF.'}
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<BackIcon />}
          onClick={() => navigate('/employees')}>
          {isRtl ? 'العودة إلى الموظفين' : 'Back to employees'}
        </Button>
      </Stack>

      <Paper sx={{ p: { xs: 2, md: 3 }, mb: 2.5, borderRadius: 3, border: '1px solid #D5E2EC' }}>
        <Typography fontWeight={900} variant="h6" sx={{ mb: 2 }}>
          <FilterIcon sx={{ verticalAlign: 'middle', mx: 0.7 }} />
          {isRtl ? 'إعداد معايير التقرير' : 'Report Filters'}
        </Typography>
        <Grid container spacing={1.5}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField fullWidth size="small" label="البحث بالاسم أو الرقم الوظيفي أو الهوية"
              value={filters.search} onChange={event => updateFilter('search', event.target.value)} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField select fullWidth size="small" label="المركز الصحي"
              value={filters.health_center_id} onChange={event => updateFilter('health_center_id', event.target.value)}>
              <MenuItem value="">جميع المراكز</MenuItem>
              {centers.map(center => <MenuItem key={center.id} value={String(center.id)}>
                {center.name_ar || center.name}
              </MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField select fullWidth size="small" label="الحالة الوظيفية"
              value={filters.employment_status} onChange={event => updateFilter('employment_status', event.target.value)}>
              <MenuItem value="">جميع الحالات</MenuItem>
              {Object.entries(STATUS_LABELS).map(([key, label]) =>
                <MenuItem key={key} value={key}>{label}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField select fullWidth size="small" label="حالة ملف المصدر"
              value={filters.source_category} onChange={event => updateFilter('source_category', event.target.value)}>
              <MenuItem value="">جميع الحالات</MenuItem>
              <MenuItem value="active">تعيين نشط</MenuItem>
              <MenuItem value="other">حالات أخرى</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField select fullWidth size="small" label="الجنس"
              value={filters.gender} onChange={event => updateFilter('gender', event.target.value)}>
              <MenuItem value="">الجميع</MenuItem>
              <MenuItem value="male">ذكر</MenuItem>
              <MenuItem value="female">أنثى</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField fullWidth size="small" label="بحث بالمسمى الوظيفي"
              value={filters.job_title} onChange={event => updateFilter('job_title', event.target.value)} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField select fullWidth size="small" label="الفرز"
              value={filters.sort} onChange={event => updateFilter('sort', event.target.value)}>
              {REPORT_SORT_OPTIONS.map(item => <MenuItem key={item.value} value={item.value}>
                {item.label}
              </MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField fullWidth size="small" type="date" label="تاريخ الإضافة من"
              InputLabelProps={{ shrink: true }}
              value={filters.created_from} onChange={event => updateFilter('created_from', event.target.value)} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField fullWidth size="small" type="date" label="تاريخ الإضافة إلى"
              InputLabelProps={{ shrink: true }}
              value={filters.created_to} onChange={event => updateFilter('created_to', event.target.value)} />
          </Grid>
          {canViewArchived && (
            <Grid size={{ xs: 12, md: 3 }}>
              <FormControlLabel
                control={<Checkbox checked={filters.archived}
                  onChange={(_, value) => updateFilter('archived', value)} />}
                label="سجلات الموظفين المحذوفين فقط" />
            </Grid>
          )}
        </Grid>
        {centersError && <Alert severity="warning" sx={{ mt: 1.5 }}>
          {centersError} — يمكن إنشاء التقرير بمعايير أخرى.
        </Alert>}
        <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 2 }}>
          <Button variant="contained" disabled={loading}
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <ReportIcon />}
            onClick={() => void generate()}>
            {loading ? 'جارٍ إعداد التقرير...' : 'عرض التقرير ومعاينته'}
          </Button>
          <Button variant="outlined" color="inherit" startIcon={<RefreshIcon />}
            onClick={() => {
              setFilters(initialFilters(new URLSearchParams()));
              setReport(null);
              setLoadedQuery('');
              setPreviewPage(0);
            }}>
            إعادة ضبط
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: { xs: 2, md: 2.5 }, mb: 2, borderRadius: 3, border: '1px solid #D5E2EC' }}>
        <Typography variant="h6" fontWeight={900}>إعداد الطباعة والتقرير</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          اختر الحقول التي تريد ظهورها في الجدول النهائي. لا يتضمن التقرير معلومات طبية،
          ويكون رقم الهوية مخفيًا تلقائيًا لحماية الخصوصية، مع إمكانية إظهاره للحسابات المخولة فقط.
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 8 }}>
            <TextField fullWidth size="small" label="عنوان التقرير" value={title}
              onChange={event => setTitle(event.target.value.slice(0, 120))} />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField select fullWidth size="small" label="اتجاه الصفحة" value={orientation}
              onChange={event => setOrientation(event.target.value as 'portrait' | 'landscape')}>
              <MenuItem value="landscape">أفقي A4 — مناسب للجداول</MenuItem>
              <MenuItem value="portrait">عمودي A4</MenuItem>
            </TextField>
          </Grid>
        </Grid>
        <Stack spacing={1.25} sx={{ mt: 2 }}>
          <TextField select fullWidth size="small" label="طريقة عرض رقم الهوية في التقرير"
            value={identityVisibility} disabled={loading}
            onChange={event => changeIdentityVisibility(event.target.value as 'masked' | 'full')}>
            <MenuItem value="masked">مخفي — 12••••3456 (الافتراضي)</MenuItem>
            <MenuItem value="full" disabled={!canShowFullIdentity}>
              ظاهر كاملًا — للأغراض الرسمية والحسابات المخولة فقط
            </MenuItem>
          </TextField>
          {!canShowFullIdentity && <Typography variant="caption" color="text.secondary">
            يتطلب إظهار رقم الهوية كاملًا صلاحية الاطلاع على البيانات الحساسة وتصدير التقارير.
          </Typography>}
          {identityVisibility === 'full' && (
            <Alert severity="warning">
              وضع سري: ستظهر أرقام الهوية كاملة في المعاينة والطباعة وPDF بعد تحديث التقرير.
              استخدم هذا الخيار فقط عند وجود حاجة رسمية، ولا تشارك الملف إلا مع المخولين.
            </Alert>
          )}
          {!columns.includes('national_id_masked') && (
            <Typography variant="caption" color="text.secondary">
              لتضمين رقم الهوية في التقرير، فعّل عمود «الهوية» من قائمة الأعمدة أدناه.
            </Typography>
          )}
        </Stack>
        <Divider sx={{ my: 2 }} />
        <Typography fontWeight={800} sx={{ mb: 1 }}>الأعمدة ({columns.length})</Typography>
        <Stack direction="row" gap={1} flexWrap="wrap">
          {FLEXIBLE_EMPLOYEE_COLUMNS.map(item => (
            <Chip key={item.key} clickable
              variant={selectedKeys.has(item.key) ? 'filled' : 'outlined'}
              color={selectedKeys.has(item.key) ? 'primary' : 'default'}
              label={item.key === 'national_id_masked'
                ? (identityVisibility === 'full' ? 'رقم الهوية (ظاهر)' : 'رقم الهوية (مخفي)')
                : item.ar}
              onClick={() => {
                if (loading) return;
                if (item.key === 'national_id_masked' &&
                    columns.includes(item.key) && identityVisibility === 'full') {
                  // No reason to retain sensitive payload once identity is excluded.
                  setIdentityVisibility('masked');
                  setReport(null);
                  setLoadedQuery('');
                }
                setColumns(previous => previous.includes(item.key)
                  ? previous.filter(key => key !== item.key)
                  : [...previous, item.key]);
              }} />
          ))}
        </Stack>
        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
          <Button size="small" disabled={loading} onClick={() => {
            setColumns(DEFAULT_COLUMNS);
            if (identityVisibility === 'full') {
              setIdentityVisibility('masked');
              setReport(null);
              setLoadedQuery('');
            }
          }}>الأعمدة الأساسية</Button>
          <Button size="small" disabled={loading}
            onClick={() => setColumns(FLEXIBLE_EMPLOYEE_COLUMNS.map(item => item.key))}>
            تحديد الكل
          </Button>
        </Stack>
        {columns.length > 9 && <Alert severity="warning" sx={{ mt: 1.5 }}>
          عدد الأعمدة كبير؛ قد يصبح الخط صغيرًا في PDF. يُفضّل استخدام الصفحة الأفقية وتحديد أهم الأعمدة.
        </Alert>}
      </Paper>

      {needsRefresh && report && <Alert severity="warning" sx={{ mb: 2 }}>
        تغيّرت معايير التصفية؛ اضغط «عرض التقرير ومعاينته» لتحديث النتائج قبل الطباعة أو حفظ PDF.
      </Alert>}
      {!report && <Alert severity="info" sx={{ mb: 2 }}>
        اختر المعايير ثم اضغط «عرض التقرير ومعاينته». سيشمل التقرير جميع النتائج المطابقة من قاعدة البيانات، وليس المعروض في صفحة الموظفين فقط.
      </Alert>}

      {report && !needsRefresh && (
        <Paper sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 3, border: '1px solid #D5E2EC' }}>
          {identityVisibility === 'full' && columns.includes('national_id_masked') && (
            <Alert severity="error" sx={{ mb: 2 }}>
              تقرير سري — يحتوي على أرقام الهوية الوطنية كاملة. يُحظر تداوله خارج الأشخاص المخولين.
            </Alert>
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }}
            alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between"
            spacing={2} sx={{ mb: 2 }}>
            <Box>
              <Typography variant="h6" fontWeight={900}>معاينة التقرير</Typography>
              <Typography variant="caption" color="text.secondary">
                أُعد بواسطة {report.generated_by} — {new Date(report.generated_at).toLocaleString('ar-SA')}
              </Typography>
            </Box>
            <Stack direction="row" gap={1} flexWrap="wrap">
              <Button variant="outlined" disabled={!columns.length || loading}
                startIcon={<PrintIcon />} onClick={() => printReport(false)}>
                طباعة التقرير
              </Button>
              <Button variant="contained" disabled={!columns.length || loading}
                startIcon={<PdfIcon />} onClick={() => printReport(true)}>
                حفظ PDF
              </Button>
            </Stack>
          </Stack>
          <Grid container spacing={1.5} sx={{ mb: 2 }}>
            {[
              { label: 'إجمالي المطابقين', value: report.count },
              { label: 'على رأس العمل', value: activeCount },
              { label: 'المراكز الصحية', value: includedCenters },
              { label: 'الأعمدة المحددة', value: columns.length },
            ].map(card => (
              <Grid key={card.label} size={{ xs: 6, md: 3 }}>
                <Paper variant="outlined" sx={{ borderRadius: 2, p: 1.5, textAlign: 'center' }}>
                  <Typography variant="h5" fontWeight={900} color="primary">{card.value}</Typography>
                  <Typography variant="caption" color="text.secondary">{card.label}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            **معايير التقرير:** {filterSummary || 'جميع الموظفين'}
          </Typography>
          <TableContainer sx={{ maxHeight: 520, border: '1px solid #DAE5EE', borderRadius: 2 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 900 }}>#</TableCell>
                  {visibleColumns.map(item => (
                    <TableCell key={item.key} sx={{ fontWeight: 900, whiteSpace: 'nowrap' }}>
                      {item.key === 'national_id_masked' && identityVisibility === 'full'
                        ? 'رقم الهوية كاملًا' : item.ar}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {pageRows.map((row, i) => (
                  <TableRow key={`${row.employee_number}-${previewPage * previewPerPage + i}`} hover>
                    <TableCell>{previewPage * previewPerPage + i + 1}</TableCell>
                    {visibleColumns.map(item => (
                      <TableCell key={item.key}>{displayValue(row, item.key)}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination component="div"
            count={results.length} page={previewPage} rowsPerPage={previewPerPage}
            onPageChange={(_, value) => setPreviewPage(value)}
            onRowsPerPageChange={event => {
              setPreviewPerPage(Number(event.target.value)); setPreviewPage(0);
            }}
            rowsPerPageOptions={[10, 25, 50]}
            labelRowsPerPage="صفوف المعاينة:" />
          <Alert severity="info" sx={{ mt: 1 }}>
            المعاينة مجزأة لتسهيل القراءة، لكن الطباعة وPDF يشملان جميع السجلات المطابقة ({report.count}).
            عند الضغط على «حفظ PDF» اختر «Save as PDF» من نافذة الطباعة.
          </Alert>
        </Paper>
      )}
    </Box>
  );
}
