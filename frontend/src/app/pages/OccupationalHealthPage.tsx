import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Grid } from '@mui/material';
import {
  Add as AddIcon,
  CheckCircle as CheckIcon,
  HealthAndSafety as OhIcon,
  Search as SearchIcon,
  Warning as WarnIcon,
} from '@mui/icons-material';
import { toast } from 'sonner';
import { getAccessToken, useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../data/roles';
import { EmployeeQuickSearch, type EmployeeSearchOption } from '../components/EmployeeQuickSearch';

interface OhAssessment {
  id: string;
  employeeId: string;
  employeeName: string;
  assessmentDate: string;
  assessmentType: string;
  fitnessDecision: 'fit' | 'fitWithRestrictions' | 'temporarilyUnfit' | 'permanentlyUnfit';
  restrictions?: string;
  nextAssessmentDate?: string;
  assessorName: string;
  notes?: string;
}

type OhAssessmentApiRecord = {
  id: string | number;
  employee: string | number;
  employee_name?: string;
  assessment_date: string;
  assessment_type: string;
  fitness_decision: OhAssessment['fitnessDecision'];
  restrictions?: string | null;
  next_assessment_date?: string | null;
  assessor_name?: string | null;
  notes?: string | null;
};

const PRODUCTION_API_BASE_URL = 'https://occupational-health-platform-production.up.railway.app/api';
const LOCAL_API_BASE_URL = 'http://localhost:8000/api';
const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? LOCAL_API_BASE_URL
    : PRODUCTION_API_BASE_URL)
).replace(/\/$/, '');

function getList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object' && Array.isArray((payload as { results?: unknown }).results)) {
    return (payload as { results: T[] }).results;
  }
  return [];
}

function mapAssessment(record: OhAssessmentApiRecord): OhAssessment {
  return {
    id: String(record.id),
    employeeId: String(record.employee),
    employeeName: record.employee_name || String(record.employee),
    assessmentDate: record.assessment_date,
    assessmentType: record.assessment_type || 'Periodic',
    fitnessDecision: record.fitness_decision,
    restrictions: record.restrictions || undefined,
    nextAssessmentDate: record.next_assessment_date || undefined,
    assessorName: record.assessor_name || '',
    notes: record.notes || '',
  };
}

async function readApiError(response: Response) {
  try {
    const payload = await response.json() as Record<string, unknown>;
    if (typeof payload.detail === 'string') return payload.detail;
    const firstValue = Object.values(payload)[0];
    if (Array.isArray(firstValue) && firstValue.length) return String(firstValue[0]);
    if (typeof firstValue === 'string') return firstValue;
  } catch {
    // The API may return an empty body for upstream deployment failures.
  }
  return `Request failed (${response.status})`;
}

const EMPTY_ASSESSMENTS: OhAssessment[] = [];
const FITNESS_COLORS = { fit: 'success', fitWithRestrictions: 'warning', temporarilyUnfit: 'info', permanentlyUnfit: 'error' } as const;
const FITNESS_LABELS_EN = { fit: 'Fit', fitWithRestrictions: 'Fit with Restrictions', temporarilyUnfit: 'Temporarily Unfit', permanentlyUnfit: 'Permanently Unfit' };
const FITNESS_LABELS_AR = { fit: 'لائق', fitWithRestrictions: 'لائق مع قيود', temporarilyUnfit: 'غير لائق مؤقتاً', permanentlyUnfit: 'غير لائق دائماً' };
const EMPTY_ASSESSMENT_FORM = {
  employeeId: '', employeeName: '', assessmentDate: '', assessmentType: '',
  fitnessDecision: 'fit' as OhAssessment['fitnessDecision'],
  restrictions: '', nextAssessmentDate: '', assessorName: '', notes: '',
};

export function OccupationalHealthPage() {
  const { i18n } = useTranslation();
  const { can } = useAuth();
  const isRtl = i18n.language === 'ar';

  const [assessments, setAssessments] = useState<OhAssessment[]>(EMPTY_ASSESSMENTS);
  const [search, setSearch] = useState('');
  const [filterDecision, setFilterDecision] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_ASSESSMENT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);

    async function loadAssessments() {
      try {
        const response = await fetch(`${API_BASE_URL}/occupational-health-assessments/`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(await readApiError(response));
        const payload = await response.json();
        setAssessments(getList<OhAssessmentApiRecord>(payload).map(mapAssessment));
      } catch (error) {
        if (!active) return;
        if (controller.signal.aborted) {
          toast.error(isRtl ? 'انتهت مهلة الاتصال بالخادم أثناء تحميل التقييمات' : 'Loading assessments timed out');
        } else {
          toast.error(error instanceof Error ? error.message : (isRtl ? 'تعذر تحميل التقييمات' : 'Could not load assessments'));
        }
      } finally {
        window.clearTimeout(timeout);
        if (active) setLoading(false);
      }
    }

    void loadAssessments();
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [isRtl]);

  const filtered = assessments.filter(a => {
    const matchSearch = a.employeeName.toLowerCase().includes(search.toLowerCase());
    const matchDecision = filterDecision === 'all' || a.fitnessDecision === filterDecision;
    return matchSearch && matchDecision;
  });

  function handleEmployeeSelect(employeeId: string, employee: EmployeeSearchOption | null) {
    setForm(prev => ({ ...prev, employeeId, employeeName: employee?.name || '' }));
  }

  async function handleSave() {
    if (!form.employeeId || !form.assessmentDate) {
      toast.error(isRtl ? 'يرجى تعبئة الحقول المطلوبة' : 'Please fill required fields');
      return;
    }
    if (saving) return;

    const token = getAccessToken();
    if (!token) {
      toast.error(isRtl ? 'انتهت جلسة الدخول. سجل الدخول مرة أخرى ثم أعد المحاولة.' : 'Your session has expired. Please sign in again.');
      return;
    }

    setSaving(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`${API_BASE_URL}/occupational-health-assessments/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employee: Number(form.employeeId),
          assessment_date: form.assessmentDate,
          assessment_type: form.assessmentType || 'Periodic',
          fitness_decision: form.fitnessDecision,
          restrictions: form.restrictions.trim(),
          next_assessment_date: form.nextAssessmentDate || null,
          assessor_name: form.assessorName.trim(),
          notes: form.notes.trim(),
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const savedAssessment = mapAssessment(await response.json() as OhAssessmentApiRecord);
      setAssessments(prev => [savedAssessment, ...prev.filter(item => item.id !== savedAssessment.id)]);
      setDialogOpen(false);
      setForm(EMPTY_ASSESSMENT_FORM);
      toast.success(isRtl ? 'تم حفظ تقييم الصحة المهنية في قاعدة البيانات' : 'OH assessment saved to the database');
    } catch (error) {
      if (controller.signal.aborted) {
        toast.error(isRtl ? 'انتهت مهلة الحفظ. تحقق من اتصال الخادم ثم أعد المحاولة.' : 'Save timed out. Check the server connection and try again.');
      } else {
        toast.error(error instanceof Error ? error.message : (isRtl ? 'تعذر حفظ التقييم' : 'Could not save assessment'));
      }
    } finally {
      window.clearTimeout(timeout);
      setSaving(false);
    }
  }

  const fitCount = assessments.filter(a => a.fitnessDecision === 'fit').length;
  const restrictedCount = assessments.filter(a => a.fitnessDecision === 'fitWithRestrictions').length;
  const unfitCount = assessments.filter(a => a.fitnessDecision === 'temporarilyUnfit' || a.fitnessDecision === 'permanentlyUnfit').length;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <OhIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">{isRtl ? 'الصحة المهنية' : 'Occupational Health'}</Typography>
            <Typography variant="body2" color="text.secondary">
              {isRtl ? 'تقييمات اللياقة للعمل وقرارات الصحة المهنية' : 'Fitness for work assessments and OH decisions'}
            </Typography>
          </Box>
        </Box>
        {can(PERMISSIONS.CREATE_OH_VISIT) && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
            {isRtl ? 'تقييم جديد' : 'New Assessment'}
          </Button>
        )}
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        {isRtl
          ? 'يتم حفظ تقييمات الصحة المهنية وربطها بسجل الموظف مباشرة في PostgreSQL.'
          : 'Occupational health assessments are saved to PostgreSQL and linked to the employee record.'}
      </Alert>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: isRtl ? 'إجمالي التقييمات' : 'Total Assessments', value: assessments.length, color: 'primary.main' },
          { label: isRtl ? 'لائق' : 'Fit for Work', value: fitCount, color: 'success.main', icon: <CheckIcon /> },
          { label: isRtl ? 'لائق مع قيود' : 'With Restrictions', value: restrictedCount, color: 'warning.main' },
          { label: isRtl ? 'غير لائق' : 'Unfit', value: unfitCount, color: 'error.main', icon: <WarnIcon /> },
        ].map(s => (
          <Grid key={s.label} size={{ xs: 6, sm: 3 }}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4" fontWeight="bold" color={s.color}>{s.value}</Typography>
              <Typography variant="body2" color="text.secondary">{s.label}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 7 }}>
            <TextField fullWidth placeholder={(isRtl ? 'بحث باسم الموظف' : 'Search employee') + '...'}
              value={search} onChange={e => setSearch(e.target.value)}
              slotProps={{ input: { startAdornment: <SearchIcon /> } }} />
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <TextField fullWidth select label={isRtl ? 'قرار اللياقة' : 'Fitness Decision'} value={filterDecision}
              onChange={e => setFilterDecision(e.target.value)}>
              <MenuItem value="all">{isRtl ? 'الكل' : 'All'}</MenuItem>
              {Object.entries(FITNESS_LABELS_EN).map(([key, label]) => (
                <MenuItem key={key} value={key}>{isRtl ? FITNESS_LABELS_AR[key as keyof typeof FITNESS_LABELS_AR] : label}</MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'رقم' : 'ID'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'الموظف' : 'Employee'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'تاريخ التقييم' : 'Assessment Date'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'نوع التقييم' : 'Type'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'قرار اللياقة' : 'Fitness Decision'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'القيود' : 'Restrictions'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'التقييم القادم' : 'Next Assessment'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'المقيِّم' : 'Assessor'}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={26} />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {isRtl ? 'جاري تحميل التقييمات...' : 'Loading assessments...'}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  {isRtl ? 'لا توجد تقييمات محفوظة حتى الآن' : 'No saved assessments yet'}
                </TableCell>
              </TableRow>
            )}
            {!loading && filtered.map(assessment => (
              <TableRow key={assessment.id} hover>
                <TableCell>{assessment.id}</TableCell>
                <TableCell>{assessment.employeeName}</TableCell>
                <TableCell>{assessment.assessmentDate}</TableCell>
                <TableCell><Chip label={assessment.assessmentType} size="small" variant="outlined" /></TableCell>
                <TableCell><Chip label={isRtl ? FITNESS_LABELS_AR[assessment.fitnessDecision] : FITNESS_LABELS_EN[assessment.fitnessDecision]} size="small" color={FITNESS_COLORS[assessment.fitnessDecision]} /></TableCell>
                <TableCell>{assessment.restrictions || '—'}</TableCell>
                <TableCell>{assessment.nextAssessmentDate || '—'}</TableCell>
                <TableCell>{assessment.assessorName}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={() => { if (!saving) setDialogOpen(false); }} maxWidth="sm" fullWidth>
        <DialogTitle>{isRtl ? 'تسجيل تقييم الصحة المهنية' : 'Record OH Assessment'}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <EmployeeQuickSearch value={form.employeeId} onChange={handleEmployeeSelect} required label={isRtl ? 'بحث الموظف' : 'Employee Search'} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth required label={isRtl ? 'تاريخ التقييم' : 'Assessment Date'} type="date" value={form.assessmentDate}
                onChange={e => setForm(p => ({ ...p, assessmentDate: e.target.value }))} slotProps={{ inputLabel: { shrink: true } }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth select label={isRtl ? 'نوع التقييم' : 'Assessment Type'} value={form.assessmentType}
                onChange={e => setForm(p => ({ ...p, assessmentType: e.target.value }))}>
                {['Pre-employment', 'Periodic', 'Return to Work', 'Special', 'Exit'].map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth select required label={isRtl ? 'قرار اللياقة' : 'Fitness Decision'} value={form.fitnessDecision}
                onChange={e => setForm(p => ({ ...p, fitnessDecision: e.target.value as OhAssessment['fitnessDecision'] }))}>
                {Object.entries(FITNESS_LABELS_EN).map(([key, label]) => (
                  <MenuItem key={key} value={key}>{isRtl ? FITNESS_LABELS_AR[key as keyof typeof FITNESS_LABELS_AR] : label}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth label={isRtl ? 'القيود' : 'Restrictions'} value={form.restrictions}
                onChange={e => setForm(p => ({ ...p, restrictions: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label={isRtl ? 'التقييم القادم' : 'Next Assessment Date'} type="date" value={form.nextAssessmentDate}
                onChange={e => setForm(p => ({ ...p, nextAssessmentDate: e.target.value }))} slotProps={{ inputLabel: { shrink: true } }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label={isRtl ? 'اسم المقيِّم' : 'Assessor Name'} value={form.assessorName}
                onChange={e => setForm(p => ({ ...p, assessorName: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth multiline minRows={2} label={isRtl ? 'ملاحظات' : 'Notes'} value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button disabled={saving} onClick={() => setDialogOpen(false)}>{isRtl ? 'إلغاء' : 'Cancel'}</Button>
          <Button
            variant="contained"
            disabled={saving}
            onClick={() => { void handleSave(); }}
            startIcon={saving ? <CircularProgress size={17} color="inherit" /> : undefined}
          >
            {saving ? (isRtl ? 'جارٍ الحفظ...' : 'Saving...') : (isRtl ? 'حفظ' : 'Save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
