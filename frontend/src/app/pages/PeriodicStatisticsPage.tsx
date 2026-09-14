import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  Assessment as AssessmentIcon,
  Badge as BadgeIcon,
  Refresh as RefreshIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { authFetch, getAccessToken, useAuth } from '../context/AuthContext';

const PRODUCTION_API_BASE_URL = 'https://occupational-health-platform-production.up.railway.app/api';
const LOCAL_API_BASE_URL = 'http://localhost:8000/api';
const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? LOCAL_API_BASE_URL : PRODUCTION_API_BASE_URL)
).replace(/\/$/, '');

const EDITABLE_ROLES = new Set(['systemAdmin', 'ohManager', 'ohDoctor', 'clinicDoctor', 'dataEntry']);
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Indicator = {
  id: number;
  code: string;
  name_ar: string;
  name_en: string;
  measurement_type: string;
  q1_target: number | null;
  q2_target: number | null;
  q3_target: number | null;
  q4_target: number | null;
  annual_target: number | null;
  is_targeted: boolean;
};

type QuarterRow = { quarter: number; target: number | null; achieved: number; percentage: number | null };
type SummaryIndicator = Indicator & {
  monthly: number[];
  quarterly: QuarterRow[];
  annual_achieved: number;
  annual_percentage: number | null;
};

type SummaryPayload = {
  year: number;
  month: number;
  quarter: number;
  total_by_month: number[];
  indicators: SummaryIndicator[];
  totals: {
    selected_month: number;
    selected_quarter: number;
    annual_achieved: number;
    annual_target: number;
    annual_targeted_achieved: number;
    annual_percentage: number;
    occupational_injuries: number;
    initiatives_quarter: number;
    document_compliance: number;
    doctors: number;
    nursing: number;
  };
};

type DailyStatistic = {
  id: number;
  indicator: number;
  date: string;
  count: number;
  location: string;
  executor: string;
  notes: string;
};

type WorkforceTarget = {
  id: number;
  member: number;
  item: string;
  annual_target: number;
  q1_target: number;
  q2_target: number;
  q3_target: number;
  q4_target: number;
  notes?: string;
};

type WorkforceMember = {
  id: number;
  category: 'doctor' | 'nursing';
  name: string;
  employee_number: string;
  job_title: string;
  qualification: string;
  targets: WorkforceTarget[];
};

type Initiative = {
  id: number;
  name: string;
  network_department: string;
  start_date: string;
  end_date?: string | null;
  leader_target: string;
  implementation_team: string;
  goals: string;
  details?: string;
  implementation_method?: string;
  beneficiaries: number;
  achieved_goals: string;
  supporting_documents_notes?: string;
  quarter: number;
  year: number;
};

type ReferenceDocument = {
  id: number;
  title: string;
  status: 'available' | 'unavailable' | 'not_applicable';
  reason: string;
  last_review_date?: string | null;
  notes?: string;
};

type DayMeta = { location: string; executor: string; notes: string };
type Paginated<T> = { results?: T[]; next?: string | null };

function percentage(value: number | null | undefined) {
  return value == null ? '—' : `${Math.round(value)}%`;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

async function apiError(response: Response) {
  try {
    const body = await response.json() as Record<string, unknown>;
    if (typeof body.detail === 'string') return body.detail;
    const first = Object.values(body)[0];
    if (Array.isArray(first) && first.length) return String(first[0]);
    if (typeof first === 'string') return first;
  } catch {
    // Use HTTP status below when the deployment response is not JSON.
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
  const items: T[] = [];
  const visited = new Set<string>();
  let next: string | null = `${API_BASE_URL}${path}`;
  while (next && !visited.has(next) && visited.size < 100) {
    visited.add(next);
    const payload = await apiRequest<Paginated<T> | T[]>(next);
    if (Array.isArray(payload)) {
      items.push(...payload);
      next = null;
    } else {
      items.push(...(payload.results || []));
      next = payload.next || null;
    }
  }
  return items;
}

function KpiCard({ title, value, hint, accent = '#0F6F6D' }: { title: string; value: string | number; hint?: string; accent?: string }) {
  return (
    <Paper sx={{ p: 2.2, borderTop: `4px solid ${accent}`, minHeight: 120 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={800}>{title}</Typography>
      <Typography variant="h4" sx={{ mt: .7, fontWeight: 950, color: accent }}>{value}</Typography>
      {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
    </Paper>
  );
}

function EmptyState({ text }: { text: string }) {
  return <Alert severity="info">{text}</Alert>;
}

export function PeriodicStatisticsPage() {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const isRtl = i18n.language === 'ar';
  const canEdit = Boolean(user?.role && EDITABLE_ROLES.has(user.role));
  const now = new Date();

  const [tab, setTab] = useState(0);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [workforce, setWorkforce] = useState<WorkforceMember[]>([]);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [documents, setDocuments] = useState<ReferenceDocument[]>([]);
  const [monthEntries, setMonthEntries] = useState<DailyStatistic[]>([]);
  const [monthCounts, setMonthCounts] = useState<Record<string, string>>({});
  const [dayMeta, setDayMeta] = useState<Record<number, DayMeta>>({});
  const [loading, setLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [savingMonth, setSavingMonth] = useState(false);

  const [memberForm, setMemberForm] = useState({ category: 'doctor', name: '', employee_number: '', job_title: '', qualification: '' });
  const [targetForm, setTargetForm] = useState({ member: '', item: '', annual_target: '', q1_target: '', q2_target: '', q3_target: '', q4_target: '', notes: '' });
  const [initiativeForm, setInitiativeForm] = useState({
    name: '', network_department: '', start_date: now.toISOString().slice(0, 10), end_date: '', leader_target: '',
    implementation_team: '', goals: '', details: '', implementation_method: '', beneficiaries: '', achieved_goals: '', supporting_documents_notes: '',
  });
  const [documentForm, setDocumentForm] = useState({ title: '', status: 'available', reason: '', last_review_date: '', notes: '' });

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      apiRequest<SummaryPayload>(`/periodic-statistics/summary/?year=${year}&month=${month}&quarter=${quarter}`),
      fetchCollection<WorkforceMember>('/periodic-statistics/workforce-members/'),
      fetchCollection<Initiative>(`/periodic-statistics/initiatives/?year=${year}`),
      fetchCollection<ReferenceDocument>('/periodic-statistics/reference-documents/'),
      fetchCollection<DailyStatistic>(`/periodic-statistics/daily-statistics/?year=${year}&month=${month}`),
    ]).then(([summaryPayload, workforceRows, initiativeRows, documentRows, dailyRows]) => {
      if (!active) return;
      setSummary(summaryPayload);
      setWorkforce(workforceRows);
      setInitiatives(initiativeRows);
      setDocuments(documentRows);
      setMonthEntries(dailyRows);

      const counts: Record<string, string> = {};
      const meta: Record<number, DayMeta> = {};
      dailyRows.forEach(row => {
        const day = Number(row.date.slice(8, 10));
        const key = `${row.date}|${row.indicator}`;
        const previous = Number(counts[key] || 0);
        counts[key] = String(previous + Number(row.count || 0));
        if (!meta[day]) {
          meta[day] = { location: row.location || '', executor: row.executor || '', notes: row.notes || '' };
        } else {
          meta[day] = {
            location: meta[day].location || row.location || '',
            executor: meta[day].executor || row.executor || '',
            notes: meta[day].notes || row.notes || '',
          };
        }
      });
      setMonthCounts(counts);
      setDayMeta(meta);
    }).catch((error) => {
      if (active) toast.error(error instanceof Error ? error.message : (isRtl ? 'تعذر تحميل الإحصائيات' : 'Failed to load statistics'));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [year, month, quarter, refreshVersion, isRtl]);

  const doctors = useMemo(() => workforce.filter(item => item.category === 'doctor'), [workforce]);
  const nursing = useMemo(() => workforce.filter(item => item.category === 'nursing'), [workforce]);
  const monthNames = isRtl ? MONTHS_AR : MONTHS_EN;
  const daysInMonth = useMemo(() => new Date(year, month, 0).getDate(), [year, month]);
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, index) => index + 1), [daysInMonth]);
  const monthlyChartData = useMemo(() => monthNames.map((label, index) => ({ month: label, total: summary?.total_by_month[index] || 0 })), [monthNames, summary]);
  const annualChartData = useMemo(() => (summary?.indicators || []).filter(item => item.is_targeted).map(item => ({
    name: isRtl ? item.name_ar : item.name_en,
    target: item.annual_target || 0,
    achieved: item.annual_achieved,
  })), [summary, isRtl]);

  const indicatorMonthTotals = useMemo(() => {
    const totals: Record<number, number> = {};
    (summary?.indicators || []).forEach(indicator => { totals[indicator.id] = 0; });
    Object.entries(monthCounts).forEach(([key, value]) => {
      const indicatorId = Number(key.split('|')[1]);
      totals[indicatorId] = (totals[indicatorId] || 0) + Number(value || 0);
    });
    return totals;
  }, [monthCounts, summary]);

  function getDayName(day: number) {
    const locale = isRtl ? 'ar-SA' : 'en-US';
    return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(new Date(year, month - 1, day));
  }

  function updateDayMeta(day: number, field: keyof DayMeta, value: string) {
    setDayMeta(current => ({
      ...current,
      [day]: { location: '', executor: '', notes: '', ...(current[day] || {}), [field]: value },
    }));
  }

  async function saveMonthlyTable() {
    if (!summary || savingMonth) return;
    setSavingMonth(true);
    try {
      const existingMap = new Map<string, DailyStatistic[]>();
      monthEntries.forEach(entry => {
        const key = `${entry.date}|${entry.indicator}`;
        existingMap.set(key, [...(existingMap.get(key) || []), entry]);
      });

      const operations: Promise<unknown>[] = [];
      for (const day of days) {
        const date = dateKey(year, month, day);
        const meta = dayMeta[day] || { location: '', executor: '', notes: '' };
        for (const indicator of summary.indicators) {
          const key = `${date}|${indicator.id}`;
          const raw = monthCounts[key] ?? '';
          const count = raw === '' ? 0 : Number(raw);
          if (!Number.isFinite(count) || count < 0) {
            throw new Error(isRtl ? `قيمة غير صحيحة في يوم ${day}` : `Invalid value on day ${day}`);
          }
          const existing = existingMap.get(key) || [];
          if (count > 0) {
            const payload = { indicator: indicator.id, date, count, location: meta.location, executor: meta.executor, notes: meta.notes };
            if (existing.length > 0) {
              operations.push(apiRequest(`/periodic-statistics/daily-statistics/${existing[0].id}/`, { method: 'PATCH', body: JSON.stringify(payload) }));
              existing.slice(1).forEach(duplicate => operations.push(apiRequest(`/periodic-statistics/daily-statistics/${duplicate.id}/`, { method: 'DELETE' })));
            } else {
              operations.push(apiRequest('/periodic-statistics/daily-statistics/', { method: 'POST', body: JSON.stringify(payload) }));
            }
          } else if (existing.length > 0) {
            existing.forEach(row => operations.push(apiRequest(`/periodic-statistics/daily-statistics/${row.id}/`, { method: 'DELETE' })));
          }
        }
      }

      if (operations.length === 0) {
        toast.info(isRtl ? 'لا توجد تغييرات للحفظ في هذا الشهر' : 'There are no changes to save for this month');
      } else {
        await Promise.all(operations);
        toast.success(isRtl ? `تم حفظ جدول ${monthNames[month - 1]} بنجاح` : `${monthNames[month - 1]} table saved successfully`);
        setRefreshVersion(value => value + 1);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (isRtl ? 'تعذر حفظ جدول الشهر' : 'Could not save monthly table'));
    } finally {
      setSavingMonth(false);
    }
  }

  async function addMember() {
    if (!memberForm.name.trim() || !memberForm.employee_number.trim()) {
      toast.error(isRtl ? 'الاسم والرقم الوظيفي مطلوبان' : 'Name and employee number are required');
      return;
    }
    try {
      await apiRequest('/periodic-statistics/workforce-members/', { method: 'POST', body: JSON.stringify(memberForm) });
      setMemberForm({ category: memberForm.category, name: '', employee_number: '', job_title: '', qualification: '' });
      toast.success(isRtl ? 'تمت إضافة الموظف' : 'Workforce member added');
      setRefreshVersion(value => value + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (isRtl ? 'تعذر إضافة الموظف' : 'Could not add workforce member'));
    }
  }

  async function addTarget() {
    if (!targetForm.member || !targetForm.item.trim()) {
      toast.error(isRtl ? 'اختر الموظف وأدخل بند الهدف' : 'Select a member and enter a target item');
      return;
    }
    const payload = {
      member: Number(targetForm.member), item: targetForm.item,
      annual_target: Number(targetForm.annual_target || 0), q1_target: Number(targetForm.q1_target || 0),
      q2_target: Number(targetForm.q2_target || 0), q3_target: Number(targetForm.q3_target || 0),
      q4_target: Number(targetForm.q4_target || 0), notes: targetForm.notes,
    };
    try {
      await apiRequest('/periodic-statistics/workforce-targets/', { method: 'POST', body: JSON.stringify(payload) });
      setTargetForm({ member: '', item: '', annual_target: '', q1_target: '', q2_target: '', q3_target: '', q4_target: '', notes: '' });
      toast.success(isRtl ? 'تمت إضافة الهدف' : 'Target added');
      setRefreshVersion(value => value + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (isRtl ? 'تعذر إضافة الهدف' : 'Could not add target'));
    }
  }

  async function addInitiative() {
    if (!initiativeForm.name.trim() || !initiativeForm.start_date) {
      toast.error(isRtl ? 'اسم المبادرة وتاريخ البداية مطلوبان' : 'Initiative name and start date are required');
      return;
    }
    try {
      await apiRequest('/periodic-statistics/initiatives/', {
        method: 'POST',
        body: JSON.stringify({ ...initiativeForm, end_date: initiativeForm.end_date || null, beneficiaries: Number(initiativeForm.beneficiaries || 0) }),
      });
      setInitiativeForm({ name: '', network_department: '', start_date: now.toISOString().slice(0, 10), end_date: '', leader_target: '', implementation_team: '', goals: '', details: '', implementation_method: '', beneficiaries: '', achieved_goals: '', supporting_documents_notes: '' });
      toast.success(isRtl ? 'تمت إضافة المبادرة' : 'Initiative added');
      setRefreshVersion(value => value + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (isRtl ? 'تعذر إضافة المبادرة' : 'Could not add initiative'));
    }
  }

  async function addDocument() {
    if (!documentForm.title.trim()) {
      toast.error(isRtl ? 'اسم الوثيقة مطلوب' : 'Document title is required');
      return;
    }
    try {
      await apiRequest('/periodic-statistics/reference-documents/', {
        method: 'POST',
        body: JSON.stringify({ ...documentForm, last_review_date: documentForm.last_review_date || null }),
      });
      setDocumentForm({ title: '', status: 'available', reason: '', last_review_date: '', notes: '' });
      toast.success(isRtl ? 'تمت إضافة الوثيقة' : 'Document added');
      setRefreshVersion(value => value + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (isRtl ? 'تعذر إضافة الوثيقة' : 'Could not add document'));
    }
  }

  function renderWorkforce(category: 'doctor' | 'nursing') {
    const rows = category === 'doctor' ? doctors : nursing;
    return (
      <Stack spacing={2.5}>
        {canEdit && (
          <Paper sx={{ p: 2.5 }}>
            <Typography variant="h6" fontWeight={900} gutterBottom>{isRtl ? 'إضافة موظف' : 'Add workforce member'}</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
              <TextField label={isRtl ? 'الاسم' : 'Name'} value={memberForm.name} onChange={e => setMemberForm(v => ({ ...v, category, name: e.target.value }))} />
              <TextField label={isRtl ? 'الرقم الوظيفي' : 'Employee no.'} value={memberForm.employee_number} onChange={e => setMemberForm(v => ({ ...v, category, employee_number: e.target.value }))} />
              <TextField label={isRtl ? 'المسمى الوظيفي' : 'Job title'} value={memberForm.job_title} onChange={e => setMemberForm(v => ({ ...v, category, job_title: e.target.value }))} />
              <TextField label={isRtl ? 'المؤهل' : 'Qualification'} value={memberForm.qualification} onChange={e => setMemberForm(v => ({ ...v, category, qualification: e.target.value }))} />
            </Box>
            <Button sx={{ mt: 1.5 }} variant="contained" startIcon={<AddIcon />} onClick={addMember}>{isRtl ? 'إضافة' : 'Add'}</Button>
          </Paper>
        )}

        {rows.length === 0 ? <EmptyState text={isRtl ? 'لا توجد أسماء مسجلة في هذه الفئة.' : 'No workforce members in this category.'} /> : rows.map(member => (
          <Paper key={member.id} sx={{ p: 2.5 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1}>
              <Box>
                <Typography variant="h6" fontWeight={950}>{member.name}</Typography>
                <Typography variant="body2" color="text.secondary">{member.employee_number} · {member.job_title || '—'} · {member.qualification || '—'}</Typography>
              </Box>
              <Chip icon={<BadgeIcon />} label={category === 'doctor' ? (isRtl ? 'طبيب' : 'Doctor') : (isRtl ? 'تمريض' : 'Nursing')} color={category === 'doctor' ? 'primary' : 'success'} />
            </Stack>
            <TableContainer sx={{ mt: 2 }}>
              <Table size="small">
                <TableHead><TableRow>
                  {[isRtl ? 'البند' : 'Item', isRtl ? 'السنوي' : 'Annual', 'Q1', 'Q2', 'Q3', 'Q4', isRtl ? 'ملاحظات' : 'Notes'].map(label => <TableCell key={label}>{label}</TableCell>)}
                </TableRow></TableHead>
                <TableBody>
                  {member.targets.map(target => <TableRow key={target.id}>
                    <TableCell>{target.item}</TableCell><TableCell>{target.annual_target}</TableCell><TableCell>{target.q1_target}</TableCell><TableCell>{target.q2_target}</TableCell><TableCell>{target.q3_target}</TableCell><TableCell>{target.q4_target}</TableCell><TableCell>{target.notes || '—'}</TableCell>
                  </TableRow>)}
                  {member.targets.length === 0 && <TableRow><TableCell colSpan={7}>{isRtl ? 'لا توجد أهداف مسجلة' : 'No targets registered'}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        ))}

        {canEdit && rows.length > 0 && (
          <Paper sx={{ p: 2.5 }}>
            <Typography variant="h6" fontWeight={900} gutterBottom>{isRtl ? 'إضافة هدف لموظف' : 'Add workforce target'}</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
              <TextField select label={isRtl ? 'الموظف' : 'Member'} value={targetForm.member} onChange={e => setTargetForm(v => ({ ...v, member: e.target.value }))}>
                {rows.map(member => <MenuItem key={member.id} value={String(member.id)}>{member.name}</MenuItem>)}
              </TextField>
              <TextField label={isRtl ? 'بند الهدف' : 'Target item'} value={targetForm.item} onChange={e => setTargetForm(v => ({ ...v, item: e.target.value }))} />
              <TextField type="number" label={isRtl ? 'المستهدف السنوي' : 'Annual target'} value={targetForm.annual_target} onChange={e => setTargetForm(v => ({ ...v, annual_target: e.target.value }))} />
              <TextField label={isRtl ? 'ملاحظات' : 'Notes'} value={targetForm.notes} onChange={e => setTargetForm(v => ({ ...v, notes: e.target.value }))} />
              {(['q1_target', 'q2_target', 'q3_target', 'q4_target'] as const).map((field, index) => <TextField key={field} type="number" label={`Q${index + 1}`} value={targetForm[field]} onChange={e => setTargetForm(v => ({ ...v, [field]: e.target.value }))} />)}
            </Box>
            <Button sx={{ mt: 1.5 }} variant="contained" startIcon={<AddIcon />} onClick={addTarget}>{isRtl ? 'إضافة الهدف' : 'Add target'}</Button>
          </Paper>
        )}
      </Stack>
    );
  }

  if (loading && !summary) {
    return <Paper sx={{ p: 8, textAlign: 'center' }}><CircularProgress /><Typography sx={{ mt: 2 }}>{isRtl ? 'جاري تحميل نظام الإحصائيات...' : 'Loading statistics module...'}</Typography></Paper>;
  }

  return (
    <Box dir={isRtl ? 'rtl' : 'ltr'}>
      <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'center' }} spacing={2} sx={{ mb: 2.5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box sx={{ width: 52, height: 52, display: 'grid', placeItems: 'center', borderRadius: 3, bgcolor: 'primary.main', color: 'white' }}><AssessmentIcon /></Box>
          <Box>
            <Typography variant="h4" fontWeight={950}>{isRtl ? 'الإحصائيات والمؤشرات' : 'Statistics & Indicators'}</Typography>
            <Typography variant="body2" color="text.secondary">{isRtl ? 'تسجيل يومي داخل جدول شهري مستقل، ثم تجميع شهري وربع سنوي وسنوي' : 'Daily entry in a separate monthly grid, followed by monthly, quarterly and annual aggregation'}</Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <TextField size="small" type="number" label={isRtl ? 'السنة' : 'Year'} value={year} onChange={e => setYear(Number(e.target.value || now.getFullYear()))} sx={{ width: 110 }} />
          <TextField size="small" select label={isRtl ? 'الشهر' : 'Month'} value={month} onChange={e => setMonth(Number(e.target.value))} sx={{ minWidth: 130 }}>{monthNames.map((name, index) => <MenuItem key={name} value={index + 1}>{name}</MenuItem>)}</TextField>
          <TextField size="small" select label={isRtl ? 'الربع' : 'Quarter'} value={quarter} onChange={e => setQuarter(Number(e.target.value))} sx={{ minWidth: 100 }}>{[1,2,3,4].map(q => <MenuItem key={q} value={q}>Q{q}</MenuItem>)}</TextField>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => setRefreshVersion(v => v + 1)} disabled={loading}>{isRtl ? 'تحديث' : 'Refresh'}</Button>
        </Stack>
      </Stack>

      <Paper sx={{ mb: 2.5, overflow: 'hidden' }}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto">
          <Tab label={isRtl ? 'لوحة المؤشرات' : 'Dashboard'} />
          <Tab label={isRtl ? 'التسجيل اليومي' : 'Daily Entry'} />
          <Tab label={isRtl ? 'الشهرية' : 'Monthly'} />
          <Tab label={isRtl ? 'الربعية' : 'Quarterly'} />
          <Tab label={isRtl ? 'القوى العاملة - الأطباء' : 'Doctors'} />
          <Tab label={isRtl ? 'القوى العاملة - التمريض' : 'Nursing'} />
          <Tab label={isRtl ? 'المبادرات' : 'Initiatives'} />
          <Tab label={isRtl ? 'الوثائق والمراجع' : 'References'} />
        </Tabs>
      </Paper>

      {tab === 0 && summary && (
        <Stack spacing={2.5}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2 }}>
            <KpiCard title={isRtl ? 'إجمالي الشهر المختار' : 'Selected month'} value={summary.totals.selected_month} />
            <KpiCard title={isRtl ? 'إجمالي الربع المختار' : 'Selected quarter'} value={summary.totals.selected_quarter} accent="#2563EB" />
            <KpiCard title={isRtl ? 'إجمالي السنة' : 'Annual total'} value={summary.totals.annual_achieved} accent="#168B88" />
            <KpiCard title={isRtl ? 'نسبة الإنجاز السنوية' : 'Annual achievement'} value={percentage(summary.totals.annual_percentage)} accent="#7C3AED" />
            <KpiCard title={isRtl ? 'الإصابات المهنية' : 'Occupational injuries'} value={summary.totals.occupational_injuries} accent="#DC2626" />
            <KpiCard title={isRtl ? 'مبادرات الربع' : 'Quarter initiatives'} value={summary.totals.initiatives_quarter} accent="#D97706" />
            <KpiCard title={isRtl ? 'امتثال الوثائق' : 'Document compliance'} value={percentage(summary.totals.document_compliance)} accent="#0F766E" />
            <KpiCard title={isRtl ? 'القوى العاملة' : 'Workforce'} value={`${summary.totals.doctors + summary.totals.nursing}`} hint={`${isRtl ? 'أطباء' : 'Doctors'} ${summary.totals.doctors} · ${isRtl ? 'تمريض' : 'Nursing'} ${summary.totals.nursing}`} accent="#475569" />
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1fr 1fr' }, gap: 2 }}>
            <Paper sx={{ p: 2.5, height: 380 }}>
              <Typography variant="h6" fontWeight={900} gutterBottom>{isRtl ? 'الاتجاه الشهري لإجمالي المؤشرات' : 'Monthly trend'}</Typography>
              <ResponsiveContainer width="100%" height="88%"><LineChart data={monthlyChartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Line type="monotone" dataKey="total" stroke="#0F6F6D" strokeWidth={3} /></LineChart></ResponsiveContainer>
            </Paper>
            <Paper sx={{ p: 2.5, height: 380 }}>
              <Typography variant="h6" fontWeight={900} gutterBottom>{isRtl ? 'المستهدف السنوي مقابل المنجز' : 'Annual target vs achieved'}</Typography>
              <ResponsiveContainer width="100%" height="88%"><BarChart data={annualChartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" hide /><YAxis /><Tooltip /><Legend /><Bar dataKey="target" fill="#94A3B8" name={isRtl ? 'المستهدف' : 'Target'} /><Bar dataKey="achieved" fill="#168B88" name={isRtl ? 'المنجز' : 'Achieved'} /></BarChart></ResponsiveContainer>
            </Paper>
          </Box>
        </Stack>
      )}

      {tab === 1 && summary && (
        <Stack spacing={2}>
          <Alert severity="info">
            {isRtl
              ? `كل شهر له جدول مستقل. الجدول الحالي خاص بشهر ${monthNames[month - 1]} ${year}، وكل صف يمثل يومًا من أيام الشهر.`
              : `Each month has its own table. The current table is for ${monthNames[month - 1]} ${year}, with one row per day.`}
          </Alert>
          <Paper sx={{ overflow: 'hidden' }}>
            <Box sx={{ px: 2.5, py: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap', bgcolor: 'background.default' }}>
              <Box>
                <Typography variant="h6" fontWeight={950}>{isRtl ? `جدول التسجيل اليومي - ${monthNames[month - 1]} ${year}` : `Daily registration table - ${monthNames[month - 1]} ${year}`}</Typography>
                <Typography variant="body2" color="text.secondary">{isRtl ? 'أدخل العدد في تقاطع اليوم مع المؤشر، ويمكن إضافة الموقع والمنفذ والملاحظات لكل يوم.' : 'Enter the count at the day/indicator intersection. Location, executor and notes are available per day.'}</Typography>
              </Box>
              {canEdit && <Button variant="contained" startIcon={<SaveIcon />} onClick={saveMonthlyTable} disabled={savingMonth}>{savingMonth ? (isRtl ? 'جاري حفظ الشهر...' : 'Saving month...') : (isRtl ? 'حفظ جدول الشهر' : 'Save month table')}</Button>}
            </Box>

            <TableContainer sx={{ maxHeight: '68vh', borderTop: '1px solid', borderColor: 'divider' }}>
              <Table stickyHeader size="small" sx={{ minWidth: 1450 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ minWidth: 105, fontWeight: 950, position: 'sticky', right: isRtl ? 0 : 'auto', left: isRtl ? 'auto' : 0, zIndex: 5, bgcolor: 'background.paper' }}>{isRtl ? 'التاريخ' : 'Date'}</TableCell>
                    <TableCell sx={{ minWidth: 95, fontWeight: 950 }}>{isRtl ? 'اليوم' : 'Day'}</TableCell>
                    {summary.indicators.map(indicator => <TableCell key={indicator.id} align="center" sx={{ minWidth: 150, maxWidth: 180, fontWeight: 950 }}>
                      <Typography variant="caption" fontWeight={950}>{isRtl ? indicator.name_ar : indicator.name_en}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 10 }}>{isRtl ? indicator.name_en : indicator.name_ar}</Typography>
                    </TableCell>)}
                    <TableCell align="center" sx={{ minWidth: 95, fontWeight: 950 }}>{isRtl ? 'إجمالي اليوم' : 'Day total'}</TableCell>
                    <TableCell sx={{ minWidth: 170, fontWeight: 950 }}>{isRtl ? 'الموقع / المركز' : 'Location / Center'}</TableCell>
                    <TableCell sx={{ minWidth: 160, fontWeight: 950 }}>{isRtl ? 'المنفذ' : 'Executor'}</TableCell>
                    <TableCell sx={{ minWidth: 210, fontWeight: 950 }}>{isRtl ? 'ملاحظات' : 'Notes'}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {days.map(day => {
                    const date = dateKey(year, month, day);
                    const dailyTotal = summary.indicators.reduce((sum, indicator) => sum + Number(monthCounts[`${date}|${indicator.id}`] || 0), 0);
                    const meta = dayMeta[day] || { location: '', executor: '', notes: '' };
                    return <TableRow key={day} hover sx={{ '&:nth-of-type(even)': { bgcolor: 'rgba(148,163,184,.055)' } }}>
                      <TableCell sx={{ fontWeight: 850, whiteSpace: 'nowrap', position: 'sticky', right: isRtl ? 0 : 'auto', left: isRtl ? 'auto' : 0, zIndex: 2, bgcolor: 'background.paper' }}>{`${pad(day)}/${pad(month)}/${year}`}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{getDayName(day)}</TableCell>
                      {summary.indicators.map(indicator => {
                        const key = `${date}|${indicator.id}`;
                        return <TableCell key={indicator.id} align="center">
                          <TextField
                            size="small"
                            type="number"
                            value={monthCounts[key] ?? ''}
                            disabled={!canEdit}
                            inputProps={{ min: 0, step: 1, style: { textAlign: 'center', width: 62 } }}
                            onChange={e => setMonthCounts(current => ({ ...current, [key]: e.target.value }))}
                            sx={{ width: 92 }}
                          />
                        </TableCell>;
                      })}
                      <TableCell align="center"><Chip size="small" label={dailyTotal} color={dailyTotal > 0 ? 'primary' : 'default'} /></TableCell>
                      <TableCell><TextField size="small" fullWidth value={meta.location} disabled={!canEdit} onChange={e => updateDayMeta(day, 'location', e.target.value)} /></TableCell>
                      <TableCell><TextField size="small" fullWidth value={meta.executor} disabled={!canEdit} onChange={e => updateDayMeta(day, 'executor', e.target.value)} /></TableCell>
                      <TableCell><TextField size="small" fullWidth value={meta.notes} disabled={!canEdit} onChange={e => updateDayMeta(day, 'notes', e.target.value)} /></TableCell>
                    </TableRow>;
                  })}
                  <TableRow sx={{ bgcolor: 'rgba(15,111,109,.08)' }}>
                    <TableCell colSpan={2} sx={{ fontWeight: 950 }}>{isRtl ? 'إجمالي الشهر' : 'Month total'}</TableCell>
                    {summary.indicators.map(indicator => <TableCell key={indicator.id} align="center" sx={{ fontWeight: 950, fontSize: 16 }}>{indicatorMonthTotals[indicator.id] || 0}</TableCell>)}
                    <TableCell align="center" sx={{ fontWeight: 950, fontSize: 16 }}>{Object.values(indicatorMonthTotals).reduce((sum, value) => sum + value, 0)}</TableCell>
                    <TableCell colSpan={3} />
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
            {!canEdit && <Alert severity="warning" sx={{ m: 2 }}>{isRtl ? 'حسابك للعرض فقط ولا يملك صلاحية إدخال البيانات.' : 'Your account is read-only.'}</Alert>}
          </Paper>
        </Stack>
      )}

      {tab === 2 && summary && (
        <Paper sx={{ p: 2 }}><TableContainer><Table size="small"><TableHead><TableRow><TableCell>{isRtl ? 'المؤشر' : 'Indicator'}</TableCell>{monthNames.map(m => <TableCell key={m} align="center">{m}</TableCell>)}<TableCell align="center">{isRtl ? 'السنوي' : 'Annual'}</TableCell></TableRow></TableHead><TableBody>{summary.indicators.map(indicator => <TableRow key={indicator.id}><TableCell sx={{ minWidth: 220, fontWeight: 800 }}>{isRtl ? indicator.name_ar : indicator.name_en}</TableCell>{indicator.monthly.map((value, idx) => <TableCell key={idx} align="center">{value}</TableCell>)}<TableCell align="center" sx={{ fontWeight: 900 }}>{indicator.annual_achieved}</TableCell></TableRow>)}</TableBody></Table></TableContainer></Paper>
      )}

      {tab === 3 && summary && (
        <Paper sx={{ p: 2 }}><TableContainer><Table size="small"><TableHead><TableRow><TableCell>{isRtl ? 'المؤشر' : 'Indicator'}</TableCell>{[1,2,3,4].flatMap(q => [<TableCell key={`t${q}`} align="center">Q{q} {isRtl ? 'مستهدف' : 'Target'}</TableCell>, <TableCell key={`a${q}`} align="center">Q{q} {isRtl ? 'منجز' : 'Done'}</TableCell>, <TableCell key={`p${q}`} align="center">%</TableCell>])}<TableCell align="center">{isRtl ? 'سنوي' : 'Annual'}</TableCell></TableRow></TableHead><TableBody>{summary.indicators.map(indicator => <TableRow key={indicator.id}><TableCell sx={{ minWidth: 220, fontWeight: 800 }}>{isRtl ? indicator.name_ar : indicator.name_en}</TableCell>{indicator.quarterly.flatMap(row => [<TableCell key={`t${row.quarter}`} align="center">{row.target ?? '—'}</TableCell>, <TableCell key={`a${row.quarter}`} align="center">{row.achieved}</TableCell>, <TableCell key={`p${row.quarter}`} align="center">{percentage(row.percentage)}</TableCell>])}<TableCell align="center"><b>{indicator.annual_achieved}</b> / {indicator.annual_target ?? '—'}<br/><Typography variant="caption">{percentage(indicator.annual_percentage)}</Typography></TableCell></TableRow>)}</TableBody></Table></TableContainer></Paper>
      )}

      {tab === 4 && renderWorkforce('doctor')}
      {tab === 5 && renderWorkforce('nursing')}

      {tab === 6 && (
        <Stack spacing={2.5}>
          {canEdit && <Paper sx={{ p: 2.5 }}>
            <Typography variant="h6" fontWeight={900} gutterBottom>{isRtl ? 'إضافة مبادرة / مشروع تحسين' : 'Add initiative'}</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1.5 }}>
              <TextField label={isRtl ? 'اسم المبادرة / المشروع' : 'Initiative name'} value={initiativeForm.name} onChange={e => setInitiativeForm(v => ({ ...v, name: e.target.value }))} />
              <TextField label={isRtl ? 'الشبكة / القسم' : 'Network / Department'} value={initiativeForm.network_department} onChange={e => setInitiativeForm(v => ({ ...v, network_department: e.target.value }))} />
              <TextField type="date" label={isRtl ? 'تاريخ البداية' : 'Start date'} value={initiativeForm.start_date} onChange={e => setInitiativeForm(v => ({ ...v, start_date: e.target.value }))} InputLabelProps={{ shrink: true }} />
              <TextField type="date" label={isRtl ? 'تاريخ النهاية' : 'End date'} value={initiativeForm.end_date} onChange={e => setInitiativeForm(v => ({ ...v, end_date: e.target.value }))} InputLabelProps={{ shrink: true }} />
              <TextField label={isRtl ? 'قائد المبادرة / المستهدف' : 'Leader / Target'} value={initiativeForm.leader_target} onChange={e => setInitiativeForm(v => ({ ...v, leader_target: e.target.value }))} />
              <TextField label={isRtl ? 'فريق التنفيذ' : 'Implementation team'} value={initiativeForm.implementation_team} onChange={e => setInitiativeForm(v => ({ ...v, implementation_team: e.target.value }))} />
              <TextField label={isRtl ? 'الأهداف' : 'Goals'} value={initiativeForm.goals} onChange={e => setInitiativeForm(v => ({ ...v, goals: e.target.value }))} />
              <TextField label={isRtl ? 'تفاصيل المبادرة' : 'Details'} value={initiativeForm.details} onChange={e => setInitiativeForm(v => ({ ...v, details: e.target.value }))} />
              <TextField label={isRtl ? 'طريقة التنفيذ' : 'Implementation method'} value={initiativeForm.implementation_method} onChange={e => setInitiativeForm(v => ({ ...v, implementation_method: e.target.value }))} />
              <TextField type="number" label={isRtl ? 'عدد المستفيدين' : 'Beneficiaries'} value={initiativeForm.beneficiaries} onChange={e => setInitiativeForm(v => ({ ...v, beneficiaries: e.target.value }))} />
              <TextField label={isRtl ? 'الأهداف المحققة' : 'Achieved goals'} value={initiativeForm.achieved_goals} onChange={e => setInitiativeForm(v => ({ ...v, achieved_goals: e.target.value }))} />
              <TextField label={isRtl ? 'ملاحظات الوثائق الداعمة' : 'Supporting documents notes'} value={initiativeForm.supporting_documents_notes} onChange={e => setInitiativeForm(v => ({ ...v, supporting_documents_notes: e.target.value }))} />
            </Box>
            <Button sx={{ mt: 1.5 }} variant="contained" startIcon={<AddIcon />} onClick={addInitiative}>{isRtl ? 'إضافة المبادرة' : 'Add initiative'}</Button>
          </Paper>}
          <Paper sx={{ p: 2 }}><TableContainer><Table size="small"><TableHead><TableRow><TableCell>{isRtl ? 'المبادرة' : 'Initiative'}</TableCell><TableCell>{isRtl ? 'القسم' : 'Department'}</TableCell><TableCell>{isRtl ? 'البداية' : 'Start'}</TableCell><TableCell>{isRtl ? 'النهاية' : 'End'}</TableCell><TableCell>{isRtl ? 'الربع' : 'Quarter'}</TableCell><TableCell>{isRtl ? 'المستفيدون' : 'Beneficiaries'}</TableCell></TableRow></TableHead><TableBody>{initiatives.map(item => <TableRow key={item.id}><TableCell sx={{ fontWeight: 800 }}>{item.name}</TableCell><TableCell>{item.network_department || '—'}</TableCell><TableCell>{item.start_date}</TableCell><TableCell>{item.end_date || '—'}</TableCell><TableCell>Q{item.quarter}</TableCell><TableCell>{item.beneficiaries}</TableCell></TableRow>)}{initiatives.length === 0 && <TableRow><TableCell colSpan={6}>{isRtl ? 'لا توجد مبادرات مسجلة لهذه السنة.' : 'No initiatives for this year.'}</TableCell></TableRow>}</TableBody></Table></TableContainer></Paper>
        </Stack>
      )}

      {tab === 7 && (
        <Stack spacing={2.5}>
          {canEdit && <Paper sx={{ p: 2.5 }}>
            <Typography variant="h6" fontWeight={900} gutterBottom>{isRtl ? 'إضافة وثيقة / مرجع' : 'Add reference document'}</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 2fr 1fr 2fr' }, gap: 1.5 }}>
              <TextField label={isRtl ? 'اسم الوثيقة' : 'Document title'} value={documentForm.title} onChange={e => setDocumentForm(v => ({ ...v, title: e.target.value }))} />
              <TextField select label={isRtl ? 'الحالة' : 'Status'} value={documentForm.status} onChange={e => setDocumentForm(v => ({ ...v, status: e.target.value }))}>
                <MenuItem value="available">{isRtl ? 'متوفر' : 'Available'}</MenuItem><MenuItem value="unavailable">{isRtl ? 'غير متوفر' : 'Unavailable'}</MenuItem><MenuItem value="not_applicable">{isRtl ? 'لا ينطبق' : 'Not applicable'}</MenuItem>
              </TextField>
              <TextField label={isRtl ? 'السبب / المصدر' : 'Reason / Source'} value={documentForm.reason} onChange={e => setDocumentForm(v => ({ ...v, reason: e.target.value }))} />
              <TextField type="date" label={isRtl ? 'آخر مراجعة' : 'Last review'} value={documentForm.last_review_date} onChange={e => setDocumentForm(v => ({ ...v, last_review_date: e.target.value }))} InputLabelProps={{ shrink: true }} />
              <TextField label={isRtl ? 'ملاحظات' : 'Notes'} value={documentForm.notes} onChange={e => setDocumentForm(v => ({ ...v, notes: e.target.value }))} />
            </Box>
            <Button sx={{ mt: 1.5 }} variant="contained" startIcon={<AddIcon />} onClick={addDocument}>{isRtl ? 'إضافة الوثيقة' : 'Add document'}</Button>
          </Paper>}
          <Paper sx={{ p: 2 }}><TableContainer><Table size="small"><TableHead><TableRow><TableCell>{isRtl ? 'الوثيقة / المرجع' : 'Document / Reference'}</TableCell><TableCell>{isRtl ? 'الحالة' : 'Status'}</TableCell><TableCell>{isRtl ? 'السبب / المصدر' : 'Reason / Source'}</TableCell><TableCell>{isRtl ? 'آخر مراجعة' : 'Last review'}</TableCell><TableCell>{isRtl ? 'ملاحظات' : 'Notes'}</TableCell></TableRow></TableHead><TableBody>{documents.map(doc => <TableRow key={doc.id}><TableCell sx={{ fontWeight: 800 }}>{doc.title}</TableCell><TableCell><Chip size="small" color={doc.status === 'available' ? 'success' : doc.status === 'unavailable' ? 'error' : 'default'} label={doc.status === 'available' ? (isRtl ? 'متوفر' : 'Available') : doc.status === 'unavailable' ? (isRtl ? 'غير متوفر' : 'Unavailable') : (isRtl ? 'لا ينطبق' : 'Not applicable')} /></TableCell><TableCell>{doc.reason || '—'}</TableCell><TableCell>{doc.last_review_date || '—'}</TableCell><TableCell>{doc.notes || '—'}</TableCell></TableRow>)}</TableBody></Table></TableContainer></Paper>
        </Stack>
      )}
    </Box>
  );
}
