import { ChangeEvent, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert, Box, Button, Chip, CircularProgress, Divider, Paper, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Typography,
} from '@mui/material';
import {
  FactCheckOutlined as VerifyIcon, FileUploadOutlined as UploadIcon,
  SecurityOutlined as SecurityIcon, WarningAmberOutlined as WarningIcon,
} from '@mui/icons-material';
import { toast } from 'sonner';
import { authFetch } from '../context/AuthContext';

const API_BASE = (import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:8000/api'
    : 'https://occupational-health-platform-production.up.railway.app/api')).replace(/\/$/, '');

interface Summary {
  total_rows: number;
  unique_employee_ids: number;
  valid_rows: number;
  review_rows: number;
  already_on_platform: number;
  not_on_platform: number;
  special_source_status: number;
  organization_groups: number;
  automatic_imported: number;
}
interface Group {
  organization: string;
  organization_type: string;
  count: number;
  manager_names: string[];
  suggested_center: string;
  matched_centers_count: number;
  requires_approval: boolean;
}
interface Review {
  excel_row: number;
  national_id_masked: string;
  issues: string[];
}
interface PreviewResult {
  sha256_prefix: string;
  summary: Summary;
  source_statuses: Record<string, number>;
  organization_types: Record<string, number>;
  organization_groups: Group[];
  review_examples: Review[];
  warnings: string[];
}

const formatCount = (v: number) => v.toLocaleString('ar-SA');

export function WorkforceRosterPreviewPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [onlyConflicts, setOnlyConflicts] = useState(false);
  const [groupPage, setGroupPage] = useState(0);
  const groups = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return (result?.organization_groups || []).filter(group => {
      const matches = !term || [
        group.organization, group.organization_type, group.suggested_center,
        ...group.manager_names,
      ].join(' ').toLowerCase().includes(term);
      const conflicting = group.manager_names.length !== 1 || group.matched_centers_count !== 1;
      return matches && (!onlyConflicts || conflicting);
    });
  }, [filter, onlyConflicts, result]);
  const pageSize = 15;
  const shown = groups.slice(groupPage * pageSize, (groupPage + 1) * pageSize);

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] || null;
    if (next && (!next.name.toLowerCase().endsWith('.xlsx') || next.size > 20 * 1024 * 1024)) {
      toast.error('اختر ملف Excel أصليًا بصيغة XLSX وحجم لا يتجاوز 20 ميجابايت');
      setFile(null);
      return;
    }
    setFile(next);
    setResult(null);
    setError('');
    setGroupPage(0);
    setFilter('');
  };

  const preview = async () => {
    if (!file || processing) return;
    setProcessing(true);
    setError('');
    setResult(null);
    try {
      const data = new FormData();
      data.append('file', file);
      const response = await authFetch(API_BASE + '/workforce-roster/preview/', {
        method: 'POST', body: data,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body?.detail || 'تعذر فحص الملف'));
      setResult(body as PreviewResult);
      toast.success('اكتملت المعاينة دون تعديل قاعدة الموظفين');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'فشلت عملية المعاينة');
      toast.error('لم تكتمل معاينة الملف');
    } finally {
      setProcessing(false);
    }
  };

  return <Box dir="rtl" sx={{ pb: 4 }}>
    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} sx={{ mb: 3 }}>
      <Box>
        <Typography variant="h4" fontWeight={850}>الاستيراد الآمن — معاينة ملف الموظفين</Typography>
        <Typography color="text.secondary">
          تحليل الملف الجديد وربطه مبدئيًا بالمراكز الصحية ومقارنته بالسجلات الحالية
        </Typography>
      </Box>
      <Button variant="outlined" onClick={() => navigate('/employees')}>العودة إلى الموظفين</Button>
    </Stack>

    <Alert severity="info" icon={<SecurityIcon />} sx={{ mb: 2 }}>
      <strong>معاينة فقط:</strong> هذه الشاشة لا تُنشئ موظفين، ولا تحدّث بياناتهم أو ملفاتهم الصحية.
      لا يُعتمد الاستيراد إلا بعد التحقق من ربط المراكز والحالات الوظيفية والنسخة الاحتياطية.
    </Alert>

    <Paper sx={{ p: 3, mb: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} gap={2}>
        <Button variant="outlined" component="label" startIcon={<UploadIcon />} disabled={processing}>
          اختيار قاعدة بيانات الموظفين الجديدة (.xlsx)
          <input type="file" hidden accept=".xlsx" onChange={chooseFile} />
        </Button>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography fontWeight={750}>{file?.name || 'لم يتم اختيار ملف'}</Typography>
          <Typography variant="caption" color="text.secondary">الملف المطلوب: الأعمدة A إلى S؛ رقم هوية الموظف في H</Typography>
        </Box>
        <Button variant="contained" size="large" onClick={() => void preview()}
          startIcon={processing ? <CircularProgress size={18} color="inherit" /> : <VerifyIcon />}
          disabled={!file || processing}>
          {processing ? 'جارٍ الفحص الآمن...' : 'معاينة ومطابقة دون استيراد'}
        </Button>
      </Stack>
    </Paper>

    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {result && <>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4,1fr)' }, mb: 2 }}>
        {[
          ['إجمالي صفوف الموظفين', result.summary.total_rows],
          ['هويات فريدة في الملف', result.summary.unique_employee_ids],
          ['مطابقون مع قاعدة المنصة الحالية', result.summary.already_on_platform],
          ['غير موجودين في قاعدة المنصة الحالية', result.summary.not_on_platform],
          ['صفوف تحتاج مراجعة', result.summary.review_rows],
          ['حالات مصدر خاصة', result.summary.special_source_status],
          ['وحدات تنظيمية للمطابقة', result.summary.organization_groups],
          ['المستوردون فعليًا', result.summary.automatic_imported],
        ].map(([label, value]) => <Paper key={String(label)} sx={{ p: 2, textAlign: 'center' }}>
          <Typography variant="h4" fontWeight={850}>{formatCount(Number(value))}</Typography>
          <Typography variant="body2" color="text.secondary">{label}</Typography>
        </Paper>)}
      </Box>

      <Alert severity="warning" sx={{ mb: 2 }}>
        أعداد «المطابقين» هنا تُقارن مباشرة بقاعدة بيانات المنصة وقت الفحص، وليست نتيجة مقارنة ملفي Excel السابقين.
        لا تُعتبر الحالات التي لم تُعثر عليها متقاعدة تلقائيًا.
      </Alert>

      <Paper sx={{ p: 2.5, mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
          <WarningIcon color="warning" />
          <Typography variant="h6" fontWeight={850}>توزيع حالات المصدر</Typography>
        </Stack>
        <Stack direction="row" gap={1} flexWrap="wrap">
          {Object.entries(result.source_statuses).map(([name, value]) =>
            <Chip key={name} variant="outlined" color={name === 'تعيين نشط' ? 'success' : 'warning'}
              label={name + ': ' + formatCount(value)} />)}
        </Stack>
        <Divider sx={{ my: 2 }} />
        <Typography variant="subtitle1" fontWeight={850}>السجلات التي تحتاج تحققًا</Typography>
        {result.review_examples.length
          ? <TableContainer><Table size="small">
              <TableHead><TableRow><TableCell>صف Excel</TableCell><TableCell>هوية مخفية</TableCell><TableCell>سبب المراجعة</TableCell></TableRow></TableHead>
              <TableBody>{result.review_examples.map(row => <TableRow key={row.excel_row}>
                <TableCell>{row.excel_row}</TableCell><TableCell>{row.national_id_masked}</TableCell>
                <TableCell>{row.issues.join('، ')}</TableCell>
              </TableRow>)}</TableBody>
            </Table></TableContainer>
          : <Alert severity="success" sx={{ mt: 1 }}>لا توجد تعارضات شكلية ظاهرة في البيانات التي فُحصت.</Alert>}
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" fontWeight={850} sx={{ mb: 1.5 }}>مراجعة ربط الجهات والمراكز الصحية</Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5} sx={{ mb: 2 }}>
          <TextField size="small" label="بحث في الجهة أو المدير أو المركز المقترح" value={filter}
            onChange={e => { setFilter(e.target.value); setGroupPage(0); }} fullWidth />
          <Button variant={onlyConflicts ? 'contained' : 'outlined'}
            onClick={() => { setOnlyConflicts(v => !v); setGroupPage(0); }}>
            {onlyConflicts ? 'عرض جميع الجهات' : 'عرض الجهات التي تحتاج تدقيقًا'}
          </Button>
        </Stack>
        <TableContainer sx={{ maxHeight: 600 }}>
          <Table size="small" stickyHeader>
            <TableHead><TableRow>
              <TableCell>الجهة التنظيمية</TableCell><TableCell>النوع</TableCell><TableCell>عدد الموظفين</TableCell>
              <TableCell>اسم المدير في المصدر</TableCell><TableCell>المركز المحتمل</TableCell><TableCell>حالة الربط</TableCell>
            </TableRow></TableHead>
            <TableBody>{shown.map((group, index) => <TableRow key={group.organization + index} hover>
              <TableCell sx={{ minWidth: 300, maxWidth: 550, whiteSpace: 'normal' }}>{group.organization}</TableCell>
              <TableCell>{group.organization_type}</TableCell>
              <TableCell>{formatCount(group.count)}</TableCell>
              <TableCell>{group.manager_names.length === 1 ? group.manager_names[0] :
                group.manager_names.length > 1 ? 'أسماء متعددة تحتاج تحققًا' : 'غير محدد'}</TableCell>
              <TableCell>{group.suggested_center || 'لا توجد مطابقة مؤكدة'}</TableCell>
              <TableCell><Chip size="small" color="warning" label="بانتظار اعتماد الربط" /></TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </TableContainer>
        <Stack direction="row" alignItems="center" justifyContent="center" gap={2} sx={{ mt: 2 }}>
          <Button disabled={groupPage === 0} onClick={() => setGroupPage(v => v - 1)}>السابق</Button>
          <Typography variant="body2">صفحة {groupPage + 1} من {Math.max(1, Math.ceil(groups.length / pageSize))} — {groups.length} جهة</Typography>
          <Button disabled={(groupPage + 1) * pageSize >= groups.length}
            onClick={() => setGroupPage(v => v + 1)}>التالي</Button>
        </Stack>
      </Paper>
      <Alert severity="info">
        رقم مراجعة الملف: {result.sha256_prefix}. لا يحتفظ النظام بملف Excel ضمن عملية المعاينة،
        ولا توجد في هذه المرحلة وظيفة لاعتماد الإدخال أو تعديل أسماء المراكز آليًا.
      </Alert>
    </>}
  </Box>;
}
