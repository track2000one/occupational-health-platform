import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  FactCheck as FitnessIcon,
  HealthAndSafety as HealthCardIcon,
  Refresh as RefreshIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import { toast } from 'sonner';
import { EmployeeQuickSearch, type EmployeeSearchOption } from '../components/EmployeeQuickSearch';
import { CalendarDateField } from '../components/CalendarDateField';
import { authFetch, getAccessToken, useAuth } from '../context/AuthContext';
import { useDatePreference } from '../context/DatePreferenceContext';

const PRODUCTION_API_BASE_URL = 'https://occupational-health-platform-production.up.railway.app/api';
const LOCAL_API_BASE_URL = 'http://localhost:8000/api';
const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? LOCAL_API_BASE_URL : PRODUCTION_API_BASE_URL)
).replace(/\/$/, '');

const FITNESS_MARKER = '[FITNESS_FOR_DUTY]';
const EDITABLE_ROLES = new Set(['systemAdmin', 'ohManager', 'ohDoctor', 'clinicDoctor', 'dataEntry']);

const FITNESS_DECISIONS = [
  { value: 'fit', ar: 'لائق للعمل', en: 'Fit' },
  { value: 'fitWithRestrictions', ar: 'لائق للعمل مع قيود', en: 'Fit with Restrictions' },
  { value: 'temporarilyUnfit', ar: 'غير لائق للعمل مؤقتًا', en: 'Temporarily Unfit' },
  { value: 'permanentlyUnfit', ar: 'غير لائق للعمل دائمًا', en: 'Permanently Unfit' },
] as const;

type FitnessDecision = typeof FITNESS_DECISIONS[number]['value'];

type Assessment = {
  id: number;
  employee: number;
  employee_name: string;
  employee_number?: string | null;
  health_center_name?: string | null;
  assessment_date: string;
  assessment_type: string;
  fitness_decision: FitnessDecision;
  restrictions?: string;
  next_assessment_date?: string | null;
  assessor_name?: string;
  notes?: string;
  created_by_name?: string;
  created_at?: string;
};

type Paginated<T> = { results?: T[]; next?: string | null };

type HealthCardPayload = {
  issue_date?: string;
  next_review_date?: string | null;
  reviewed_by?: string;
  is_approved?: boolean;
  data?: Record<string, Record<string, unknown>>;
};

function localToday() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function employeeNumber(employee: EmployeeSearchOption | null) {
  return String(employee?.employee_number || employee?.employeeNumber || '');
}

function nationalId(employee: EmployeeSearchOption | null) {
  return String(employee?.national_id || employee?.nationalId || '');
}

function jobTitle(employee: EmployeeSearchOption | null) {
  return String(employee?.job_title || employee?.jobTitle || '');
}

function healthCenter(employee: EmployeeSearchOption | null) {
  return String(employee?.health_center_name || employee?.healthCenterName || '');
}

function decisionLabel(value: string, isRtl: boolean) {
  const item = FITNESS_DECISIONS.find(option => option.value === value);
  return item ? (isRtl ? item.ar : item.en) : value;
}

function decisionColor(value: string): 'success' | 'warning' | 'error' | 'info' | 'default' {
  if (value === 'fit') return 'success';
  if (value === 'fitWithRestrictions') return 'warning';
  if (value === 'temporarilyUnfit') return 'info';
  if (value === 'permanentlyUnfit') return 'error';
  return 'default';
}

function cleanNotes(value?: string | null) {
  return String(value || '').replace(FITNESS_MARKER, '').trim();
}

function appendLine(current: unknown, line: string) {
  const existing = String(current || '').trim();
  if (!existing) return line;
  if (existing.includes(line)) return existing;
  return `${existing}\n${line}`;
}

async function apiError(response: Response) {
  try {
    const payload = await response.json() as Record<string, unknown>;
    if (typeof payload.detail === 'string') return payload.detail;
    const first = Object.values(payload)[0];
    if (Array.isArray(first) && first.length) return String(first[0]);
    if (typeof first === 'string') return first;
  } catch {
    // Use the HTTP status below when the deployment returns an empty body.
  }
  return `Request failed (${response.status})`;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  if (!token) throw new Error('Authentication required');
  const response = await authFetch(path.startsWith('http') ? path : `${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) throw new Error(await apiError(response));
  if (response.status === 204) return null as T;
  return await response.json() as T;
}

async function fetchCollection<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  const visited = new Set<string>();
  let next: string | null = `${API_BASE_URL}${path}`;
  while (next && !visited.has(next) && visited.size < 100) {
    visited.add(next);
    const payload = await apiRequest<Paginated<T> | T[]>(next);
    if (Array.isArray(payload)) {
      rows.push(...payload);
      next = null;
    } else {
      rows.push(...(payload.results || []));
      next = payload.next || null;
    }
  }
  return rows;
}

export function FitnessForDutyPage() {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const { formatDate } = useDatePreference();
  const isRtl = i18n.language === 'ar';
  const canEdit = Boolean(user?.role && EDITABLE_ROLES.has(user.role));

  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeSearchOption | null>(null);
  const [assessmentDate, setAssessmentDate] = useState(localToday());
  const [fitnessDecision, setFitnessDecision] = useState<FitnessDecision>('fit');
  const [restrictions, setRestrictions] = useState('');
  const [nextAssessmentDate, setNextAssessmentDate] = useState('');
  const [assessorName, setAssessorName] = useState(user?.name || '');
  const [notes, setNotes] = useState('');
  const [history, setHistory] = useState<Assessment[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    if (!assessorName && user?.name) setAssessorName(user.name);
  }, [assessorName, user?.name]);

  useEffect(() => {
    if (!selectedEmployeeId || !selectedEmployee) {
      setHistory([]);
      return;
    }
    let active = true;
    setLoadingHistory(true);
    const searchTerm = employeeNumber(selectedEmployee) || selectedEmployee.name || selectedEmployeeId;
    void fetchCollection<Assessment>(`/occupational-health-assessments/?search=${encodeURIComponent(searchTerm)}`)
      .then(rows => {
        if (!active) return;
        const exact = rows
          .filter(row => String(row.employee) === String(selectedEmployeeId) && String(row.notes || '').includes(FITNESS_MARKER))
          .sort((a, b) => `${b.assessment_date}-${b.id}`.localeCompare(`${a.assessment_date}-${a.id}`));
        setHistory(exact);
      })
      .catch(error => {
        if (active) toast.error(error instanceof Error ? error.message : (isRtl ? 'تعذر تحميل زيارات لياقة العمل' : 'Could not load fitness visits'));
      })
      .finally(() => {
        if (active) setLoadingHistory(false);
      });
    return () => { active = false; };
  }, [selectedEmployeeId, selectedEmployee, refreshVersion, isRtl]);

  const latest = useMemo(() => history[0] || null, [history]);

  function handleEmployeeChange(id: string, employee: EmployeeSearchOption | null) {
    setSelectedEmployeeId(id);
    setSelectedEmployee(employee);
    setHistory([]);
  }

  async function syncToHealthCard(assessment: Assessment) {
    const card = await apiRequest<HealthCardPayload>(`/employees/${assessment.employee}/health_card/`);
    const source = card.data || {};
    const data: Record<string, Record<string, unknown>> = {
      personal: { ...(source.personal || {}) },
      employment: { ...(source.employment || {}) },
      physical: { ...(source.physical || {}) },
      conditions: { ...(source.conditions || {}) },
      mental: { ...(source.mental || {}) },
      follow_up: { ...(source.follow_up || {}) },
      vaccinations: { ...(source.vaccinations || {}) },
      recommendations: { ...(source.recommendations || {}) },
      additional: { ...(source.additional || {}) },
    };

    const labelAr = decisionLabel(assessment.fitness_decision, true);
    const summary = [
      `لياقة العمل ${assessment.assessment_date}: ${labelAr}`,
      assessment.restrictions ? `القيود: ${assessment.restrictions}` : '',
      assessment.next_assessment_date ? `المراجعة القادمة: ${assessment.next_assessment_date}` : '',
      assessment.assessor_name ? `المقيّم: ${assessment.assessor_name}` : '',
      cleanNotes(assessment.notes) ? `ملاحظات: ${cleanNotes(assessment.notes)}` : '',
    ].filter(Boolean).join(' | ');

    data.follow_up.latest_field_visit = assessment.assessment_date;
    data.follow_up.fitness_for_duty_date = assessment.assessment_date;
    data.follow_up.fitness_for_duty_decision = labelAr;
    data.follow_up.fitness_for_duty_restrictions = assessment.restrictions || '';
    data.follow_up.fitness_for_duty_next_assessment = assessment.next_assessment_date || '';
    data.follow_up.fitness_for_duty_assessor = assessment.assessor_name || '';
    data.follow_up.fitness_for_duty_notes = cleanNotes(assessment.notes);
    data.follow_up.notes = appendLine(data.follow_up.notes, summary);
    data.recommendations.medical = appendLine(data.recommendations.medical, summary);
    data.additional.fitness_for_duty_latest = summary;
    if (assessment.restrictions) {
      data.conditions.medical_restrictions = appendLine(data.conditions.medical_restrictions, assessment.restrictions);
    }

    await apiRequest(`/employees/${assessment.employee}/health_card/`, {
      method: 'PUT',
      body: JSON.stringify({
        issue_date: card.issue_date || localToday(),
        next_review_date: assessment.next_assessment_date || card.next_review_date || null,
        reviewed_by: assessment.assessor_name || card.reviewed_by || user?.name || '',
        is_approved: Boolean(card.is_approved),
        data,
      }),
    });
  }

  async function saveVisit() {
    if (!canEdit || saving) return;
    if (!selectedEmployeeId || !selectedEmployee) {
      toast.error(isRtl ? 'اختر الموظف أولًا' : 'Select an employee first');
      return;
    }
    if (!assessmentDate) {
      toast.error(isRtl ? 'تاريخ الزيارة مطلوب' : 'Visit date is required');
      return;
    }
    if (fitnessDecision === 'fitWithRestrictions' && !restrictions.trim()) {
      toast.error(isRtl ? 'أدخل القيود الطبية عند اختيار لائق مع قيود' : 'Enter restrictions when selecting Fit with Restrictions');
      return;
    }

    setSaving(true);
    try {
      const assessment = await apiRequest<Assessment>('/occupational-health-assessments/', {
        method: 'POST',
        body: JSON.stringify({
          employee: Number(selectedEmployeeId),
          assessment_date: assessmentDate,
          assessment_type: 'Special',
          fitness_decision: fitnessDecision,
          restrictions: restrictions.trim(),
          next_assessment_date: nextAssessmentDate || null,
          assessor_name: assessorName.trim(),
          notes: `${FITNESS_MARKER}${notes.trim() ? ` ${notes.trim()}` : ''}`,
        }),
      });

      try {
        await syncToHealthCard(assessment);
        toast.success(isRtl ? 'تم حفظ زيارة لياقة العمل وإضافتها إلى البطاقة الصحية' : 'Fitness visit saved and added to the health card');
      } catch (syncError) {
        toast.warning(isRtl
          ? 'تم حفظ زيارة لياقة العمل، لكن تعذرت مزامنتها مع البطاقة الصحية. أعد المحاولة أو راجع صلاحية البطاقة.'
          : 'Fitness visit was saved, but health-card synchronization failed.');
      }

      setRestrictions('');
      setNextAssessmentDate('');
      setNotes('');
      setFitnessDecision('fit');
      setAssessmentDate(localToday());
      setRefreshVersion(value => value + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (isRtl ? 'تعذر حفظ زيارة لياقة العمل' : 'Could not save fitness visit'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box dir={isRtl ? 'rtl' : 'ltr'}>
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'center' }} sx={{ mb: 2.5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Avatar sx={{ width: 52, height: 52, bgcolor: '#0F6F6D' }}><FitnessIcon /></Avatar>
          <Box>
            <Typography variant="h4" fontWeight={950}>{isRtl ? 'لياقة العمل' : 'Fitness for Duty'}</Typography>
            <Typography variant="body2" color="text.secondary">
              {isRtl ? 'تسجيل تقييم لياقة الموظف للعمل وربط النتيجة تلقائيًا بالبطاقة الصحية' : 'Record employee fitness-for-duty assessments and sync results to the health card'}
            </Typography>
          </Box>
        </Stack>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => setRefreshVersion(value => value + 1)} disabled={!selectedEmployeeId || loadingHistory}>
          {isRtl ? 'تحديث الزيارات' : 'Refresh visits'}
        </Button>
      </Stack>

      <Alert severity="info" sx={{ mb: 2.5 }}>
        {isRtl
          ? 'اختر الموظف، ثم أدخل زيارة لياقة العمل. عند الحفظ تُحفظ الزيارة كسجل مستقل، وتُضاف خلاصة القرار والقيود وتاريخ الزيارة والمراجعة القادمة إلى البطاقة الصحية دون حذف بياناتها السابقة.'
          : 'Select an employee and record the visit. Saving creates a separate assessment and appends its decision, restrictions, date and next review to the employee health card without deleting previous card data.'}
      </Alert>

      <Paper sx={{ p: { xs: 2, md: 2.5 }, mb: 2.5 }}>
        <Typography variant="h6" fontWeight={900} sx={{ mb: 1.5 }}>{isRtl ? 'بيانات الموظف' : 'Employee'}</Typography>
        <EmployeeQuickSearch
          value={selectedEmployeeId}
          onChange={handleEmployeeChange}
          label={isRtl ? 'بحث الموظف لزيارة لياقة العمل' : 'Search employee for Fitness for Duty'}
          helperText={isRtl ? 'ابحث بالاسم أو الهوية أو الرقم الوظيفي أو الجوال أو البريد الإلكتروني.' : 'Search by name, ID, employee number, mobile or email.'}
        />
        {selectedEmployee && (
          <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)', lg: 'repeat(4,1fr)' }, gap: 1.25 }}>
            {[
              [isRtl ? 'الاسم' : 'Name', selectedEmployee.name],
              [isRtl ? 'الرقم الوظيفي' : 'Employee No.', employeeNumber(selectedEmployee)],
              [isRtl ? 'رقم الهوية' : 'National ID', nationalId(selectedEmployee)],
              [isRtl ? 'المسمى الوظيفي' : 'Job title', jobTitle(selectedEmployee)],
              [isRtl ? 'المركز' : 'Center', healthCenter(selectedEmployee)],
              [isRtl ? 'الجوال' : 'Mobile', String(selectedEmployee.mobile || selectedEmployee.phone || '')],
            ].map(([label, fieldValue]) => (
              <Paper key={label} variant="outlined" sx={{ p: 1.3, boxShadow: 'none' }}>
                <Typography variant="caption" color="text.secondary" fontWeight={750}>{label}</Typography>
                <Typography variant="body2" fontWeight={900} sx={{ mt: .4 }}>{fieldValue || '—'}</Typography>
              </Paper>
            ))}
          </Box>
        )}
      </Paper>

      <Paper sx={{ p: { xs: 2, md: 2.5 }, mb: 3, borderTop: '4px solid #0F6F6D' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1} sx={{ mb: 2 }}>
          <Box>
            <Typography variant="h5" fontWeight={950}>{isRtl ? 'بطاقة زيارة لياقة العمل' : 'Fitness for Duty Visit Card'}</Typography>
            <Typography variant="body2" color="text.secondary">{isRtl ? 'بيانات التقييم والقرار الطبي' : 'Assessment details and medical fitness decision'}</Typography>
          </Box>
          {latest && selectedEmployee && (
            <Chip color={decisionColor(latest.fitness_decision)} label={`${isRtl ? 'آخر قرار' : 'Latest'}: ${decisionLabel(latest.fitness_decision, isRtl)}`} />
          )}
        </Stack>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2,1fr)' }, gap: 1.5 }}>
          <CalendarDateField required label={isRtl ? 'تاريخ الزيارة' : 'Visit date'} value={assessmentDate} onChange={setAssessmentDate} />
          <TextField select label={isRtl ? 'قرار لياقة العمل' : 'Fitness decision'} value={fitnessDecision} onChange={event => setFitnessDecision(event.target.value as FitnessDecision)}>
            {FITNESS_DECISIONS.map(option => <MenuItem key={option.value} value={option.value}>{isRtl ? option.ar : option.en}</MenuItem>)}
          </TextField>
          <TextField
            label={isRtl ? 'القيود / التوصيات الوظيفية' : 'Restrictions / work recommendations'}
            value={restrictions}
            onChange={event => setRestrictions(event.target.value)}
            multiline
            minRows={2}
          />
          <CalendarDateField label={isRtl ? 'تاريخ التقييم القادم' : 'Next assessment date'} value={nextAssessmentDate} onChange={setNextAssessmentDate} />
          <TextField label={isRtl ? 'الطبيب / المقيّم' : 'Assessor'} value={assessorName} onChange={event => setAssessorName(event.target.value)} />
          <TextField label={isRtl ? 'ملاحظات' : 'Notes'} value={notes} onChange={event => setNotes(event.target.value)} multiline minRows={2} />
        </Box>

        <Divider sx={{ my: 2 }} />
        {canEdit ? (
          <Stack direction="row" justifyContent="flex-end">
            <Button size="large" variant="contained" startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />} onClick={() => void saveVisit()} disabled={saving || !selectedEmployeeId}>
              {saving ? (isRtl ? 'جاري الحفظ...' : 'Saving...') : (isRtl ? 'حفظ الزيارة وإضافتها للبطاقة الصحية' : 'Save visit & update health card')}
            </Button>
          </Stack>
        ) : (
          <Alert severity="warning">{isRtl ? 'حسابك للعرض فقط ولا يملك صلاحية إضافة تقييم لياقة العمل.' : 'Your account is read-only for Fitness for Duty assessments.'}</Alert>
        )}
      </Paper>

      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1.5} sx={{ mb: 1.5 }}>
        <Box>
          <Typography variant="h5" fontWeight={950}>{isRtl ? 'سجل زيارات لياقة العمل' : 'Fitness for Duty History'}</Typography>
          <Typography variant="body2" color="text.secondary">{selectedEmployee ? `${selectedEmployee.name} · ${history.length}` : (isRtl ? 'اختر موظفًا لعرض سجل الزيارات' : 'Select an employee to view visit history')}</Typography>
        </Box>
        {selectedEmployeeId && (
          <Button variant="outlined" startIcon={<HealthCardIcon />} onClick={() => navigate(`/employees/${selectedEmployeeId}/health-card`)}>
            {isRtl ? 'فتح البطاقة الصحية' : 'Open health card'}
          </Button>
        )}
      </Stack>

      {!selectedEmployeeId ? (
        <Alert severity="info">{isRtl ? 'اختر الموظف لعرض زيارات لياقة العمل الخاصة به.' : 'Select an employee to show their Fitness for Duty visits.'}</Alert>
      ) : loadingHistory ? (
        <Paper sx={{ p: 5, textAlign: 'center' }}><CircularProgress /><Typography sx={{ mt: 1.5 }}>{isRtl ? 'جاري تحميل الزيارات...' : 'Loading visits...'}</Typography></Paper>
      ) : history.length === 0 ? (
        <Alert severity="info">{isRtl ? 'لا توجد زيارات لياقة عمل مسجلة لهذا الموظف بعد.' : 'No Fitness for Duty visits have been recorded for this employee yet.'}</Alert>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 360px), 1fr))', gap: 2 }}>
          {history.map(visit => (
            <Paper key={visit.id} sx={{ p: 2.2, borderTop: '4px solid', borderTopColor: `${decisionColor(visit.fitness_decision)}.main` }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                <Box>
                  <Typography variant="h6" fontWeight={950}>{visit.employee_name}</Typography>
                  <Typography variant="caption" color="text.secondary">{visit.employee_number || '—'} · {visit.health_center_name || '—'}</Typography>
                </Box>
                <Chip size="small" color={decisionColor(visit.fitness_decision)} label={decisionLabel(visit.fitness_decision, isRtl)} />
              </Stack>
              <Divider sx={{ my: 1.5 }} />
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <Box><Typography variant="caption" color="text.secondary">{isRtl ? 'تاريخ الزيارة' : 'Visit date'}</Typography><Typography fontWeight={850}>{formatDate(visit.assessment_date)}</Typography></Box>
                <Box><Typography variant="caption" color="text.secondary">{isRtl ? 'التقييم القادم' : 'Next assessment'}</Typography><Typography fontWeight={850}>{formatDate(visit.next_assessment_date)}</Typography></Box>
                <Box sx={{ gridColumn: '1 / -1' }}><Typography variant="caption" color="text.secondary">{isRtl ? 'القيود' : 'Restrictions'}</Typography><Typography variant="body2" fontWeight={800}>{visit.restrictions || '—'}</Typography></Box>
                <Box><Typography variant="caption" color="text.secondary">{isRtl ? 'المقيّم' : 'Assessor'}</Typography><Typography variant="body2" fontWeight={800}>{visit.assessor_name || visit.created_by_name || '—'}</Typography></Box>
                <Box><Typography variant="caption" color="text.secondary">{isRtl ? 'ملاحظات' : 'Notes'}</Typography><Typography variant="body2" fontWeight={800}>{cleanNotes(visit.notes) || '—'}</Typography></Box>
              </Box>
              <Button fullWidth sx={{ mt: 1.75 }} variant="outlined" startIcon={<HealthCardIcon />} onClick={() => navigate(`/employees/${visit.employee}/health-card`)}>
                {isRtl ? 'عرض البطاقة الصحية' : 'View health card'}
              </Button>
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}
