import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Paper, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Typography, Chip,
} from '@mui/material';
import { PlaylistAddCheck as PlanIcon, Refresh as RefreshIcon, Security as ShieldIcon } from '@mui/icons-material';
import { toast } from 'sonner';
import { authFetch } from '../context/AuthContext';

const API = (import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:8000/api'
    : 'https://occupational-health-platform-production.up.railway.app/api')).replace(/\/$/, '');

type Plan = {
  id: number;
  state: 'draft' | 'approved' | 'committed';
  summary: {
    total_rows: number; new_candidates: number; existing_unchanged: number;
    blocked_rows: number; unapproved_center_rows: number; ready: boolean;
    other_source_status_rows: number; issue_counts: Record<string, number>;
  };
  created_by: string;
  approved_by: string | null;
  expired: boolean;
  created_at: string;
  expires_at: string;
  file_sha256_prefix: string;
};

const STATE_NAME = { draft: 'بانتظار الاعتماد', approved: 'معتمدة', committed: 'منفذة' } as const;

async function api(path: string, init: RequestInit = {}) {
  const response = await authFetch(API + path, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const field = body?.detail || Object.values(body || {})[0] || 'تعذر إتمام الطلب';
    throw new Error(String(Array.isArray(field) ? field.join('، ') : field));
  }
  return body;
}

export function WorkforceImportPlansPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Plan | null>(null);
  const [reference, setReference] = useState('');
  const [backup, setBackup] = useState('');
  const [restore, setRestore] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const result = await api('/workforce-roster/import-plan/');
      setPlans(result.plans || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحميل الخطط');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const create = async () => {
    if (!sourceFile || busy) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', sourceFile);
      const result = await api('/workforce-roster/import-plan/', {
        method: 'POST', body,
      });
      toast.success(result.summary.ready
        ? 'خطة الاستيراد جاهزة للمراجعة والاعتماد من مسؤول آخر'
        : 'أُعدت الخطة مع ملاحظات؛ لا يمكن اعتمادها قبل المعالجة');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر إعداد الخطة');
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!selected || busy || !reference.trim() || !backup.trim() || !restore.trim()) return;
    if (!window.confirm('هل تؤكد مراجعتك المستقلة والتحقق من النسخة الاحتياطية واختبار استعادتها؟')) return;
    setBusy(true);
    try {
      await api('/workforce-roster/import-plan/' + selected.id + '/approve/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approval_reference: reference.trim(),
          backup_reference: backup.trim(),
          restore_verification_reference: restore.trim(),
        }),
      });
      toast.success('تم تسجيل الاعتماد الإداري؛ لم يتم استيراد أي بيانات');
      setSelected(null);
      setReference('');
      setBackup('');
      setRestore('');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر اعتماد الخطة');
    } finally {
      setBusy(false);
    }
  };

  return <Box dir="rtl">
    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} sx={{ mb: 3 }}>
      <Box>
        <Typography variant="h4" fontWeight={850}>خطط استيراد بيانات الموظفين</Typography>
        <Typography color="text.secondary">تجهيز دفعات الاستيراد والتحقق من الموافقات — دون المساس بالسجلات الصحية</Typography>
      </Box>
      <Stack direction="row" gap={1}>
        <Button variant="outlined" onClick={() => navigate('/admin/workforce-roster-preview')}>معاينة الملف والمراكز</Button>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => void load()}>تحديث</Button>
      </Stack>
    </Stack>

    <Alert severity="warning" icon={<ShieldIcon />} sx={{ mb: 2 }}>
      تنفيذ الاستيراد الفعلي معطل افتراضيًا. يلزم اعتماد المراكز لجميع السجلات،
      وخطة سليمة، وموافقة مسؤول مستقل، ونسخة احتياطية جُرّبت استعادتها.
      كتابة مراجع النسخ الاحتياطي هنا إقرار إداري فقط وليست تحققًا آليًا من وجود النسخة.
    </Alert>

    <Paper sx={{ p: 3, mb: 2 }}>
      <Typography variant="h6" fontWeight={800} sx={{ mb: 1.5 }}>١. إعداد خطة استيراد جديدة</Typography>
      <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} gap={2}>
        <Button variant="outlined" component="label">
          اختيار ملف بيانات الموظفين (.xlsx)
          <input hidden type="file" accept=".xlsx" onChange={event => {
            const selectedFile = event.target.files?.[0] || null;
            if (selectedFile && (selectedFile.size > 20 * 1024 * 1024 || !selectedFile.name.toLowerCase().endsWith('.xlsx'))) {
              toast.error('الملف يجب أن يكون XLSX وحجمه أقل من 20 ميجابايت');
              setSourceFile(null);
              return;
            }
            setSourceFile(selectedFile);
          }} />
        </Button>
        <Typography sx={{ flex: 1 }} color="text.secondary">
          {sourceFile ? sourceFile.name : 'لم يتم اختيار ملف'}
        </Typography>
        <Button variant="contained" startIcon={<PlanIcon />} onClick={() => void create()}
          disabled={!sourceFile || busy}>
          {busy ? 'جارٍ إعداد الخطة...' : 'فحص وإعداد خطة دون استيراد'}
        </Button>
      </Stack>
    </Paper>

    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>٢. خطط الاستيراد ومراجعة الاعتماد</Typography>
      <TableContainer>
        <Table size="small">
          <TableHead><TableRow>
            <TableCell>رقم الخطة</TableCell><TableCell>منشئ الخطة</TableCell>
            <TableCell>الجدد</TableCell><TableCell>الموجودون</TableCell><TableCell>الملاحظات</TableCell>
            <TableCell>الحالة</TableCell><TableCell>المسؤول</TableCell><TableCell>الإجراء</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={8}><CircularProgress size={22} /></TableCell></TableRow> :
              plans.length === 0 ? <TableRow><TableCell colSpan={8}>لم تُنشأ أي خطط بعد</TableCell></TableRow> :
                plans.map(plan => <TableRow key={plan.id} hover>
                  <TableCell>#{plan.id}</TableCell>
                  <TableCell>{plan.created_by}</TableCell>
                  <TableCell>{plan.summary.new_candidates}</TableCell>
                  <TableCell>{plan.summary.existing_unchanged}</TableCell>
                  <TableCell>
                    {plan.summary.blocked_rows ? 'صفوف موقوفة: ' + plan.summary.blocked_rows : 'دون تعارضات'}
                  </TableCell>
                  <TableCell><Chip size="small"
                    color={plan.state === 'approved' || plan.state === 'committed' ? 'success' : 'warning'}
                    label={plan.expired && plan.state !== 'committed' ? 'منتهية الصلاحية' : STATE_NAME[plan.state]} /></TableCell>
                  <TableCell>{plan.approved_by || '—'}</TableCell>
                  <TableCell>
                    <Button size="small" variant="outlined"
                      disabled={!plan.summary.ready || plan.expired || plan.state !== 'draft'}
                      onClick={() => setSelected(plan)}>مراجعة واعتماد</Button>
                  </TableCell>
                </TableRow>)}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>

    <Dialog open={!!selected} onClose={() => !busy && setSelected(null)} maxWidth="sm" fullWidth>
      <DialogTitle>اعتماد إداري مستقل للخطة #{selected?.id}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Alert severity="info">
            يجب أن يكون المعتمد مختلفًا عن منشئ الخطة. إتمام الاعتماد لا ينفذ الاستيراد.
            لا تدخل كلمات مرور أو مفاتيح نسخ احتياطية هنا.
          </Alert>
          <TextField label="رقم خطاب أو قرار اعتماد خطة الاستيراد" value={reference}
            required onChange={event => setReference(event.target.value)} />
          <TextField label="الرقم المرجعي للنسخة الاحتياطية المشفرة" value={backup}
            required onChange={event => setBackup(event.target.value)} />
          <TextField label="مرجع إثبات اختبار استعادة النسخة الاحتياطية" value={restore}
            required onChange={event => setRestore(event.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={() => setSelected(null)}>إلغاء</Button>
        <Button variant="contained" disabled={busy || reference.trim().length < 4 ||
          backup.trim().length < 4 || restore.trim().length < 4}
          onClick={() => void approve()}>تسجيل الاعتماد فقط</Button>
      </DialogActions>
    </Dialog>
  </Box>;
}
