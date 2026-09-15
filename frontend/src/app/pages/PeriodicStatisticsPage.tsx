import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
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
  DeleteOutline as DeleteIcon,
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
import { CalendarDateField } from '../components/CalendarDateField';

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
type SummaryIndicator = Indicator & { monthly: number[]; quarterly: QuarterRow[]; annual_achieved: number; annual_percentage: number | null };
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

type DailyStatistic = { id: number; indicator: number; date: string; count: number; location: string; executor: string; notes: string };
type WorkforceTarget = { id: number; member: number; item: string; annual_target: number; q1_target: number; q2_target: number; q3_target: number; q4_target: number; notes?: string };
type WorkforceMember = { id: number; category: 'doctor' | 'nursing'; name: string; employee_number: string; job_title: string; qualification: string; targets: WorkforceTarget[] };
type InitiativeActivity = { title: string; objective: string; beneficiary_count: number | string };
type Initiative = {
  id: number;
  name: string;
  network_department: string;
  start_date: string;
  end_date?: string | null;
  leader_target: string;
  implementation_team: string;
  team_members?: string[];
  goals: string;
  details?: string;
  implementation_method?: string;
  beneficiaries: number;
  activities?: InitiativeActivity[];
  total_beneficiaries?: number;
  achieved_goals: string;
  supporting_documents_notes?: string;
  evidence_links?: string[];
  status: 'draft' | 'in_progress' | 'completed' | 'submitted';
  redcap_uploaded: boolean;
  redcap_upload_date?: string | null;
  redcap_reference?: string;
  department_copy_saved: boolean;
  quarter: number;
  year: number;
};
type ReferenceDocument = {
  id: number;
  title: string;
  status: 'available' | 'unavailable' | 'not_applicable';
  reason: string;
  source?: string;
  issuing_authority?: string;
  version_number?: string;
  issue_date?: string | null;
  document_count?: number;
  responsible_person?: string;
  evidence_links?: string[];
  last_review_date?: string | null;
  notes?: string;
};
type DayMeta = { location: string; executor: string; notes: string };
type Paginated<T> = { results?: T[]; next?: string | null };

function percentage(value: number | null | undefined) { return value == null ? '—' : `${Math.round(value)}%`; }
function pad(value: number) { return String(value).padStart(2, '0'); }
function dateKey(year: number, month: number, day: number) { return `${year}-${pad(month)}-${pad(day)}`; }
function splitLines(value: string) { return value.split(/\r?\n|،|,/).map(item => item.trim()).filter(Boolean); }

async function apiError(response: Response) {
  try {
    const body = await response.json() as Record<string, unknown>;
    if (typeof body.detail === 'string') return body.detail;
    const first = Object.values(body)[0];
    if (Array.isArray(first) && first.length) return String(first[0]);
    if (typeof first === 'string') return first;
  } catch { /* use status below */ }
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
    if (Array.isArray(payload)) { items.push(...payload); next = null; }
    else { items.push(...(payload.results || [])); next = payload.next || null; }
  }
  return items;
}

function KpiCard({ title, value, hint, accent = '#0F6F6D' }: { title: string; value: string | number; hint?: string; accent?: string }) {
  return <Paper sx={{ p: 2.2, borderTop: `4px solid ${accent}`, minHeight: 120 }}>
    <Typography variant="caption" color="text.secondary" fontWeight={800}>{title}</Typography>
    <Typography variant="h4" sx={{ mt: .7, fontWeight: 950, color: accent }}>{value}</Typography>
    {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
  </Paper>;
}

function EmptyState({ text }: { text: string }) { return <Alert severity="info">{text}</Alert>; }

function statusLabel(status: Initiative['status'], isRtl: boolean) {
  const labels = {
    draft: isRtl ? 'مسودة' : 'Draft',
    in_progress: isRtl ? 'قيد التنفيذ' : 'In progress',
    completed: isRtl ? 'مكتملة' : 'Completed',
    submitted: isRtl ? 'تم الرفع' : 'Submitted',
  };
  return labels[status] || status;
}

function statusColor(status: Initiative['status']): 'default' | 'info' | 'success' | 'warning' {
  if (status === 'submitted') return 'success';
  if (status === 'completed') return 'info';
  if (status === 'in_progress') return 'warning';
  return 'default';
}

export function PeriodicStatisticsPage() {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const isRtl = i18n.language === 'ar';
  const canEdit = Boolean(user?.role && EDITABLE_ROLES.has(user.role));
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

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
    name: '', network_department: '', start_date: today, end_date: '', leader_target: '', team_members_text: '', goals: '', details: '',
    implementation_method: '', activities: [{ title: '', objective: '', beneficiary_count: '' }] as InitiativeActivity[], achieved_goals: '',
    supporting_documents_notes: '', evidence_links_text: '', status: 'draft' as Initiative['status'], redcap_uploaded: false,
    redcap_upload_date: '', redcap_reference: '', department_copy_saved: false,
  });
  const [documentForm, setDocumentForm] = useState({
    title: '', status: 'available' as ReferenceDocument['status'], reason: '', source: '', issuing_authority: '', version_number: '',
    issue_date: '', document_count: '1', responsible_person: '', evidence_links_text: '', last_review_date: '', notes: '',
  });

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
        counts[key] = String(Number(counts[key] || 0) + Number(row.count || 0));
        if (!meta[day]) meta[day] = { location: row.location || '', executor: row.executor || '', notes: row.notes || '' };
      });
      setMonthCounts(counts);
      setDayMeta(meta);
    }).catch(error => {
      if (active) toast.error(error instanceof Error ? error.message : (isRtl ? 'تعذر تحميل الإحصائيات' : 'Failed to load statistics'));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [year, month, quarter, refreshVersion, isRtl]);

  const doctors = useMemo(() => workforce.filter(item => item.category === 'doctor'), [workforce]);
  const nursing = useMemo(() => workforce.filter(item => item.category === 'nursing'), [workforce]);
  const monthNames = isRtl ? MONTHS_AR : MONTHS_EN;
  const daysInMonth = useMemo(() => new Date(year, month, 0).getDate(), [year, month]);
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, index) => index + 1), [daysInMonth]);
  const monthlyChartData = useMemo(() => monthNames.map((label, index) => ({ month: label, total: summary?.total_by_month[index] || 0 })), [monthNames, summary]);
  const annualChartData = useMemo(() => (summary?.indicators || []).filter(item => item.is_targeted).map(item => ({ name: isRtl ? item.name_ar : item.name_en, target: item.annual_target || 0, achieved: item.annual_achieved })), [summary, isRtl]);
  const selectedQuarterInitiatives = useMemo(() => initiatives.filter(item => item.quarter === quarter), [initiatives, quarter]);
  const documentStats = useMemo(() => {
    const applicable = documents.filter(item => item.status !== 'not_applicable');
    const available = applicable.filter(item => item.status === 'available').length;
    const unavailable = applicable.filter(item => item.status === 'unavailable').length;
    return { available, unavailable, notApplicable: documents.length - applicable.length, compliance: applicable.length ? Math.round((available / applicable.length) * 100) : 100 };
  }, [documents]);

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
    return new Intl.DateTimeFormat(isRtl ? 'ar-SA' : 'en-US', { weekday: 'long' }).format(new Date(year, month - 1, day));
  }

  function updateDayMeta(day: number, field: keyof DayMeta, value: string) {
    setDayMeta(current => ({ ...current, [day]: { location: '', executor: '', notes: '', ...(current[day] || {}), [field]: value } }));
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
          const count = monthCounts[key] === '' || monthCounts[key] == null ? 0 : Number(monthCounts[key]);
          if (!Number.isFinite(count) || count < 0) throw new Error(isRtl ? `قيمة غير صحيحة في يوم ${day}` : `Invalid value on day ${day}`);
          const existing = existingMap.get(key) || [];
          if (count > 0) {
            const payload = { indicator: indicator.id, date, count, location: meta.location, executor: meta.executor, notes: meta.notes };
            if (existing.length) {
              operations.push(apiRequest(`/periodic-statistics/daily-statistics/${existing[0].id}/`, { method: 'PATCH', body: JSON.stringify(payload) }));
              existing.slice(1).forEach(row => operations.push(apiRequest(`/periodic-statistics/daily-statistics/${row.id}/`, { method: 'DELETE' })));
            } else operations.push(apiRequest('/periodic-statistics/daily-statistics/', { method: 'POST', body: JSON.stringify(payload) }));
          } else existing.forEach(row => operations.push(apiRequest(`/periodic-statistics/daily-statistics/${row.id}/`, { method: 'DELETE' })));
        }
      }
      await Promise.all(operations);
      toast.success(isRtl ? `تم حفظ جدول ${monthNames[month - 1]} بنجاح` : `${monthNames[month - 1]} table saved`);
      setRefreshVersion(value => value + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (isRtl ? 'تعذر حفظ جدول الشهر' : 'Could not save monthly table'));
    } finally { setSavingMonth(false); }
  }

  async function addMember(category: 'doctor' | 'nursing') {
    if (!memberForm.name.trim() || !memberForm.employee_number.trim()) return toast.error(isRtl ? 'الاسم والرقم الوظيفي مطلوبان' : 'Name and employee number are required');
    try {
      await apiRequest('/periodic-statistics/workforce-members/', { method: 'POST', body: JSON.stringify({ ...memberForm, category }) });
      setMemberForm({ category, name: '', employee_number: '', job_title: '', qualification: '' });
      toast.success(isRtl ? 'تمت إضافة الموظف' : 'Workforce member added');
      setRefreshVersion(value => value + 1);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Error'); }
  }

  async function addTarget() {
    if (!targetForm.member || !targetForm.item.trim()) return toast.error(isRtl ? 'اختر الموظف وأدخل بند الهدف' : 'Select a member and target');
    const payload = {
      member: Number(targetForm.member), item: targetForm.item, annual_target: Number(targetForm.annual_target || 0),
      q1_target: Number(targetForm.q1_target || 0), q2_target: Number(targetForm.q2_target || 0), q3_target: Number(targetForm.q3_target || 0), q4_target: Number(targetForm.q4_target || 0), notes: targetForm.notes,
    };
    try {
      await apiRequest('/periodic-statistics/workforce-targets/', { method: 'POST', body: JSON.stringify(payload) });
      setTargetForm({ member: '', item: '', annual_target: '', q1_target: '', q2_target: '', q3_target: '', q4_target: '', notes: '' });
      toast.success(isRtl ? 'تمت إضافة الهدف' : 'Target added');
      setRefreshVersion(value => value + 1);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Error'); }
  }

  function updateActivity(index: number, field: keyof InitiativeActivity, value: string) {
    setInitiativeForm(current => ({ ...current, activities: current.activities.map((activity, i) => i === index ? { ...activity, [field]: value } : activity) }));
  }

  function addActivityRow() {
    setInitiativeForm(current => ({ ...current, activities: [...current.activities, { title: '', objective: '', beneficiary_count: '' }] }));
  }

  function removeActivityRow(index: number) {
    setInitiativeForm(current => ({ ...current, activities: current.activities.filter((_, i) => i !== index) }));
  }

  async function addInitiative() {
    if (!initiativeForm.name.trim() || !initiativeForm.start_date) return toast.error(isRtl ? 'اسم المبادرة وتاريخ البداية مطلوبان' : 'Name and start date are required');
    if (initiativeForm.redcap_uploaded && !initiativeForm.redcap_upload_date) return toast.error(isRtl ? 'حدد تاريخ الرفع على REDCap' : 'Select REDCap upload date');
    const activities = initiativeForm.activities
      .filter(item => item.title.trim() || item.objective.trim() || Number(item.beneficiary_count || 0) > 0)
      .map(item => ({ title: item.title.trim(), objective: item.objective.trim(), beneficiary_count: Number(item.beneficiary_count || 0) }));
    const teamMembers = splitLines(initiativeForm.team_members_text);
    const evidenceLinks = splitLines(initiativeForm.evidence_links_text);
    try {
      await apiRequest('/periodic-statistics/initiatives/', {
        method: 'POST',
        body: JSON.stringify({
          name: initiativeForm.name, network_department: initiativeForm.network_department, start_date: initiativeForm.start_date,
          end_date: initiativeForm.end_date || null, leader_target: initiativeForm.leader_target, implementation_team: teamMembers.join('\n'),
          team_members: teamMembers, goals: initiativeForm.goals, details: initiativeForm.details, implementation_method: initiativeForm.implementation_method,
          activities, beneficiaries: activities.reduce((sum, item) => sum + item.beneficiary_count, 0), achieved_goals: initiativeForm.achieved_goals,
          supporting_documents_notes: initiativeForm.supporting_documents_notes, evidence_links: evidenceLinks, status: initiativeForm.status,
          redcap_uploaded: initiativeForm.redcap_uploaded, redcap_upload_date: initiativeForm.redcap_upload_date || null,
          redcap_reference: initiativeForm.redcap_reference, department_copy_saved: initiativeForm.department_copy_saved,
        }),
      });
      setInitiativeForm({ name: '', network_department: '', start_date: today, end_date: '', leader_target: '', team_members_text: '', goals: '', details: '', implementation_method: '', activities: [{ title: '', objective: '', beneficiary_count: '' }], achieved_goals: '', supporting_documents_notes: '', evidence_links_text: '', status: 'draft', redcap_uploaded: false, redcap_upload_date: '', redcap_reference: '', department_copy_saved: false });
      toast.success(isRtl ? 'تمت إضافة المبادرة ومتابعتها ربع سنويًا' : 'Initiative added');
      setRefreshVersion(value => value + 1);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Error'); }
  }

  async function addDocument() {
    if (!documentForm.title.trim()) return toast.error(isRtl ? 'اسم الوثيقة مطلوب' : 'Document title is required');
    if (documentForm.status !== 'available' && !documentForm.reason.trim()) return toast.error(isRtl ? 'السبب إلزامي عند اختيار غير متوفر أو لا ينطبق' : 'Reason is required');
    try {
      await apiRequest('/periodic-statistics/reference-documents/', {
        method: 'POST',
        body: JSON.stringify({
          title: documentForm.title, status: documentForm.status, reason: documentForm.reason, source: documentForm.source,
          issuing_authority: documentForm.issuing_authority, version_number: documentForm.version_number, issue_date: documentForm.issue_date || null,
          document_count: Number(documentForm.document_count || 1), responsible_person: documentForm.responsible_person,
          evidence_links: splitLines(documentForm.evidence_links_text), last_review_date: documentForm.last_review_date || null, notes: documentForm.notes,
        }),
      });
      setDocumentForm({ title: '', status: 'available', reason: '', source: '', issuing_authority: '', version_number: '', issue_date: '', document_count: '1', responsible_person: '', evidence_links_text: '', last_review_date: '', notes: '' });
      toast.success(isRtl ? 'تمت إضافة الوثيقة إلى قائمة الامتثال' : 'Document added');
      setRefreshVersion(value => value + 1);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Error'); }
  }

  function renderWorkforce(category: 'doctor' | 'nursing') {
    const rows = category === 'doctor' ? doctors : nursing;
    return <Stack spacing={2.5}>
      {canEdit && <Paper sx={{ p: 2.5 }}>
        <Typography variant="h6" fontWeight={900} gutterBottom>{isRtl ? 'إضافة موظف' : 'Add workforce member'}</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4,1fr)' }, gap: 1.5 }}>
          <TextField label={isRtl ? 'الاسم' : 'Name'} value={memberForm.name} onChange={e => setMemberForm(v => ({ ...v, name: e.target.value }))} />
          <TextField label={isRtl ? 'الرقم الوظيفي' : 'Employee no.'} value={memberForm.employee_number} onChange={e => setMemberForm(v => ({ ...v, employee_number: e.target.value }))} />
          <TextField label={isRtl ? 'المسمى الوظيفي' : 'Job title'} value={memberForm.job_title} onChange={e => setMemberForm(v => ({ ...v, job_title: e.target.value }))} />
          <TextField label={isRtl ? 'المؤهل' : 'Qualification'} value={memberForm.qualification} onChange={e => setMemberForm(v => ({ ...v, qualification: e.target.value }))} />
        </Box>
        <Button sx={{ mt: 1.5 }} variant="contained" startIcon={<AddIcon />} onClick={() => void addMember(category)}>{isRtl ? 'إضافة' : 'Add'}</Button>
      </Paper>}
      {rows.length === 0 ? <EmptyState text={isRtl ? 'لا توجد أسماء مسجلة.' : 'No workforce members.'} /> : rows.map(member => <Paper key={member.id} sx={{ p: 2.5 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1}>
          <Box><Typography variant="h6" fontWeight={950}>{member.name}</Typography><Typography variant="body2" color="text.secondary">{member.employee_number} · {member.job_title || '—'} · {member.qualification || '—'}</Typography></Box>
          <Chip icon={<BadgeIcon />} label={category === 'doctor' ? (isRtl ? 'طبيب' : 'Doctor') : (isRtl ? 'تمريض' : 'Nursing')} color={category === 'doctor' ? 'primary' : 'success'} />
        </Stack>
        <TableContainer sx={{ mt: 2 }}><Table size="small"><TableHead><TableRow>{[isRtl ? 'البند' : 'Item', isRtl ? 'السنوي' : 'Annual', 'Q1', 'Q2', 'Q3', 'Q4', isRtl ? 'ملاحظات' : 'Notes'].map(label => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>
          {member.targets.map(target => <TableRow key={target.id}><TableCell>{target.item}</TableCell><TableCell>{target.annual_target}</TableCell><TableCell>{target.q1_target}</TableCell><TableCell>{target.q2_target}</TableCell><TableCell>{target.q3_target}</TableCell><TableCell>{target.q4_target}</TableCell><TableCell>{target.notes || '—'}</TableCell></TableRow>)}
        </TableBody></Table></TableContainer>
      </Paper>)}
      {canEdit && rows.length > 0 && <Paper sx={{ p: 2.5 }}>
        <Typography variant="h6" fontWeight={900}>{isRtl ? 'إضافة هدف لموظف' : 'Add target'}</Typography>
        <Box sx={{ mt: 1.5, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 2fr repeat(5,1fr)' }, gap: 1.2 }}>
          <TextField select label={isRtl ? 'الموظف' : 'Member'} value={targetForm.member} onChange={e => setTargetForm(v => ({ ...v, member: e.target.value }))}>{rows.map(item => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</TextField>
          <TextField label={isRtl ? 'البند' : 'Item'} value={targetForm.item} onChange={e => setTargetForm(v => ({ ...v, item: e.target.value }))} />
          {(['annual_target','q1_target','q2_target','q3_target','q4_target'] as const).map(field => <TextField key={field} type="number" label={field === 'annual_target' ? (isRtl ? 'سنوي' : 'Annual') : field.replace('_target','').toUpperCase()} value={targetForm[field]} onChange={e => setTargetForm(v => ({ ...v, [field]: e.target.value }))} />)}
        </Box>
        <Button sx={{ mt: 1.5 }} variant="contained" onClick={() => void addTarget()}>{isRtl ? 'إضافة الهدف' : 'Add target'}</Button>
      </Paper>}
    </Stack>;
  }

  if (loading && !summary) return <Paper sx={{ p: 8, textAlign: 'center' }}><CircularProgress /><Typography sx={{ mt: 2 }}>{isRtl ? 'جاري تحميل نظام الإحصائيات...' : 'Loading statistics module...'}</Typography></Paper>;

  return <Box dir={isRtl ? 'rtl' : 'ltr'}>
    <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'center' }} spacing={2} sx={{ mb: 2.5 }}>
      <Stack direction="row" spacing={1.5} alignItems="center"><Box sx={{ width: 52, height: 52, display: 'grid', placeItems: 'center', borderRadius: 3, bgcolor: 'primary.main', color: 'white' }}><AssessmentIcon /></Box><Box><Typography variant="h4" fontWeight={950}>{isRtl ? 'الإحصائيات والمؤشرات' : 'Statistics & Indicators'}</Typography><Typography variant="body2" color="text.secondary">{isRtl ? 'تسجيل يومي وتجميع شهري وربع سنوي وسنوي مع المبادرات والامتثال' : 'Daily, monthly, quarterly and annual statistics with initiatives and compliance'}</Typography></Box></Stack>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <TextField size="small" type="number" label={isRtl ? 'السنة' : 'Year'} value={year} onChange={e => setYear(Number(e.target.value || now.getFullYear()))} sx={{ width: 110 }} />
        <TextField size="small" select label={isRtl ? 'الشهر' : 'Month'} value={month} onChange={e => setMonth(Number(e.target.value))} sx={{ minWidth: 130 }}>{monthNames.map((name, index) => <MenuItem key={name} value={index + 1}>{name}</MenuItem>)}</TextField>
        <TextField size="small" select label={isRtl ? 'الربع' : 'Quarter'} value={quarter} onChange={e => setQuarter(Number(e.target.value))} sx={{ minWidth: 100 }}>{[1,2,3,4].map(q => <MenuItem key={q} value={q}>Q{q}</MenuItem>)}</TextField>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => setRefreshVersion(v => v + 1)} disabled={loading}>{isRtl ? 'تحديث' : 'Refresh'}</Button>
      </Stack>
    </Stack>

    <Paper sx={{ mb: 2.5, overflow: 'hidden' }}><Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto">
      <Tab label={isRtl ? 'لوحة المؤشرات' : 'Dashboard'} /><Tab label={isRtl ? 'التسجيل اليومي' : 'Daily Entry'} /><Tab label={isRtl ? 'الشهرية' : 'Monthly'} /><Tab label={isRtl ? 'الربعية' : 'Quarterly'} /><Tab label={isRtl ? 'القوى العاملة - الأطباء' : 'Doctors'} /><Tab label={isRtl ? 'القوى العاملة - التمريض' : 'Nursing'} /><Tab label={isRtl ? 'المبادرات' : 'Initiatives'} /><Tab label={isRtl ? 'الوثائق والمراجع' : 'References'} />
    </Tabs></Paper>

    {tab === 0 && summary && <Stack spacing={2.5}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4,1fr)' }, gap: 2 }}>
        <KpiCard title={isRtl ? 'إجمالي الشهر المختار' : 'Selected month'} value={summary.totals.selected_month} /><KpiCard title={isRtl ? 'إجمالي الربع المختار' : 'Selected quarter'} value={summary.totals.selected_quarter} accent="#2563EB" /><KpiCard title={isRtl ? 'إجمالي السنة' : 'Annual total'} value={summary.totals.annual_achieved} accent="#168B88" /><KpiCard title={isRtl ? 'نسبة الإنجاز السنوية' : 'Annual achievement'} value={percentage(summary.totals.annual_percentage)} accent="#7C3AED" /><KpiCard title={isRtl ? 'الإصابات المهنية' : 'Occupational injuries'} value={summary.totals.occupational_injuries} accent="#DC2626" /><KpiCard title={isRtl ? 'مبادرات الربع' : 'Quarter initiatives'} value={summary.totals.initiatives_quarter} accent="#D97706" /><KpiCard title={isRtl ? 'امتثال الوثائق' : 'Document compliance'} value={percentage(summary.totals.document_compliance)} accent="#0F766E" /><KpiCard title={isRtl ? 'القوى العاملة' : 'Workforce'} value={summary.totals.doctors + summary.totals.nursing} hint={`${isRtl ? 'أطباء' : 'Doctors'} ${summary.totals.doctors} · ${isRtl ? 'تمريض' : 'Nursing'} ${summary.totals.nursing}`} accent="#475569" />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1fr 1fr' }, gap: 2 }}>
        <Paper sx={{ p: 2.5, height: 380 }}><Typography variant="h6" fontWeight={900}>{isRtl ? 'الاتجاه الشهري لإجمالي المؤشرات' : 'Monthly trend'}</Typography><ResponsiveContainer width="100%" height="88%"><LineChart data={monthlyChartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Line type="monotone" dataKey="total" stroke="#0F6F6D" strokeWidth={3} /></LineChart></ResponsiveContainer></Paper>
        <Paper sx={{ p: 2.5, height: 380 }}><Typography variant="h6" fontWeight={900}>{isRtl ? 'المستهدف السنوي مقابل المنجز' : 'Annual target vs achieved'}</Typography><ResponsiveContainer width="100%" height="88%"><BarChart data={annualChartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" hide /><YAxis /><Tooltip /><Legend /><Bar dataKey="target" fill="#94A3B8" name={isRtl ? 'المستهدف' : 'Target'} /><Bar dataKey="achieved" fill="#168B88" name={isRtl ? 'المنجز' : 'Achieved'} /></BarChart></ResponsiveContainer></Paper>
      </Box>
    </Stack>}

    {tab === 1 && summary && <Stack spacing={2}>
      <Alert severity="info">{isRtl ? `كل شهر له جدول مستقل. الجدول الحالي خاص بشهر ${monthNames[month - 1]} ${year}.` : `The current monthly table is ${monthNames[month - 1]} ${year}.`}</Alert>
      <Paper sx={{ overflow: 'hidden' }}><Box sx={{ px: 2.5, py: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}><Box><Typography variant="h6" fontWeight={950}>{isRtl ? `جدول التسجيل اليومي - ${monthNames[month - 1]} ${year}` : `Daily registration - ${monthNames[month - 1]} ${year}`}</Typography><Typography variant="body2" color="text.secondary">{isRtl ? 'أدخل العدد في تقاطع اليوم مع المؤشر.' : 'Enter counts per day and indicator.'}</Typography></Box>{canEdit && <Button variant="contained" startIcon={<SaveIcon />} onClick={() => void saveMonthlyTable()} disabled={savingMonth}>{isRtl ? 'حفظ جدول الشهر' : 'Save month'}</Button>}</Box>
        <TableContainer sx={{ maxHeight: '68vh' }}><Table stickyHeader size="small" sx={{ minWidth: 1450 }}><TableHead><TableRow><TableCell sx={{ minWidth: 105 }}>{isRtl ? 'التاريخ' : 'Date'}</TableCell><TableCell sx={{ minWidth: 95 }}>{isRtl ? 'اليوم' : 'Day'}</TableCell>{summary.indicators.map(indicator => <TableCell key={indicator.id} align="center" sx={{ minWidth: 150 }}><Typography variant="caption" fontWeight={950}>{isRtl ? indicator.name_ar : indicator.name_en}</Typography></TableCell>)}<TableCell align="center">{isRtl ? 'إجمالي اليوم' : 'Total'}</TableCell><TableCell>{isRtl ? 'الموقع / المركز' : 'Location'}</TableCell><TableCell>{isRtl ? 'المنفذ' : 'Executor'}</TableCell><TableCell>{isRtl ? 'ملاحظات' : 'Notes'}</TableCell></TableRow></TableHead><TableBody>
          {days.map(day => { const date = dateKey(year, month, day); const meta = dayMeta[day] || { location: '', executor: '', notes: '' }; const dailyTotal = summary.indicators.reduce((sum, indicator) => sum + Number(monthCounts[`${date}|${indicator.id}`] || 0), 0); return <TableRow key={day}><TableCell>{`${pad(day)}/${pad(month)}/${year}`}</TableCell><TableCell>{getDayName(day)}</TableCell>{summary.indicators.map(indicator => { const key = `${date}|${indicator.id}`; return <TableCell key={indicator.id} align="center"><TextField size="small" type="number" value={monthCounts[key] ?? ''} disabled={!canEdit} inputProps={{ min: 0, style: { textAlign: 'center', width: 60 } }} onChange={e => setMonthCounts(current => ({ ...current, [key]: e.target.value }))} sx={{ width: 90 }} /></TableCell>; })}<TableCell align="center"><Chip size="small" label={dailyTotal} /></TableCell><TableCell><TextField size="small" value={meta.location} disabled={!canEdit} onChange={e => updateDayMeta(day, 'location', e.target.value)} /></TableCell><TableCell><TextField size="small" value={meta.executor} disabled={!canEdit} onChange={e => updateDayMeta(day, 'executor', e.target.value)} /></TableCell><TableCell><TextField size="small" value={meta.notes} disabled={!canEdit} onChange={e => updateDayMeta(day, 'notes', e.target.value)} /></TableCell></TableRow>; })}
          <TableRow sx={{ bgcolor: 'rgba(15,111,109,.08)' }}><TableCell colSpan={2} sx={{ fontWeight: 950 }}>{isRtl ? 'إجمالي الشهر' : 'Month total'}</TableCell>{summary.indicators.map(indicator => <TableCell key={indicator.id} align="center" sx={{ fontWeight: 950 }}>{indicatorMonthTotals[indicator.id] || 0}</TableCell>)}<TableCell align="center" sx={{ fontWeight: 950 }}>{Object.values(indicatorMonthTotals).reduce((sum, value) => sum + value, 0)}</TableCell><TableCell colSpan={3} /></TableRow>
        </TableBody></Table></TableContainer>
      </Paper>
    </Stack>}

    {tab === 2 && summary && <Paper sx={{ p: 2 }}><TableContainer><Table size="small"><TableHead><TableRow><TableCell>{isRtl ? 'المؤشر' : 'Indicator'}</TableCell>{monthNames.map(m => <TableCell key={m} align="center">{m}</TableCell>)}<TableCell align="center">{isRtl ? 'السنوي' : 'Annual'}</TableCell></TableRow></TableHead><TableBody>{summary.indicators.map(indicator => <TableRow key={indicator.id}><TableCell sx={{ minWidth: 220, fontWeight: 800 }}>{isRtl ? indicator.name_ar : indicator.name_en}</TableCell>{indicator.monthly.map((value, idx) => <TableCell key={idx} align="center">{value}</TableCell>)}<TableCell align="center" sx={{ fontWeight: 900 }}>{indicator.annual_achieved}</TableCell></TableRow>)}</TableBody></Table></TableContainer></Paper>}

    {tab === 3 && summary && <Paper sx={{ p: 2 }}><TableContainer><Table size="small"><TableHead><TableRow><TableCell>{isRtl ? 'المؤشر' : 'Indicator'}</TableCell>{[1,2,3,4].flatMap(q => [<TableCell key={`t${q}`} align="center">Q{q} {isRtl ? 'مستهدف' : 'Target'}</TableCell>, <TableCell key={`a${q}`} align="center">Q{q} {isRtl ? 'منجز' : 'Done'}</TableCell>, <TableCell key={`p${q}`} align="center">%</TableCell>])}<TableCell>{isRtl ? 'سنوي' : 'Annual'}</TableCell></TableRow></TableHead><TableBody>{summary.indicators.map(indicator => <TableRow key={indicator.id}><TableCell sx={{ fontWeight: 800 }}>{isRtl ? indicator.name_ar : indicator.name_en}</TableCell>{indicator.quarterly.flatMap(row => [<TableCell key={`t${row.quarter}`} align="center">{row.target ?? '—'}</TableCell>,<TableCell key={`a${row.quarter}`} align="center">{row.achieved}</TableCell>,<TableCell key={`p${row.quarter}`} align="center">{percentage(row.percentage)}</TableCell>])}<TableCell><b>{indicator.annual_achieved}</b> / {indicator.annual_target ?? '—'}</TableCell></TableRow>)}</TableBody></Table></TableContainer></Paper>}

    {tab === 4 && renderWorkforce('doctor')}
    {tab === 5 && renderWorkforce('nursing')}

    {tab === 6 && <Stack spacing={2.5}>
      <Alert severity="info">{isRtl ? `النموذج ربع سنوي. الربع المختار Q${quarter}، ويشمل تسجيل الأنشطة وفريق التنفيذ والمستفيدين وحالة الرفع على REDCap.` : `Quarterly initiative form for Q${quarter}.`}</Alert>
      {canEdit && <Paper sx={{ p: 2.5 }}>
        <Typography variant="h5" fontWeight={950}>{isRtl ? 'بطاقة مبادرة / مشروع تحسين' : 'Initiative / Improvement Project'}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{isRtl ? 'مطابقة لحقول النموذج الثالث مع متابعة الرفع الربع سنوي.' : 'Aligned with the initiative reporting form.'}</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3,1fr)' }, gap: 1.5 }}>
          <TextField label={isRtl ? 'اسم المبادرة / المشروع' : 'Initiative name'} value={initiativeForm.name} onChange={e => setInitiativeForm(v => ({ ...v, name: e.target.value }))} />
          <TextField label={isRtl ? 'اسم الشبكة / القسم' : 'Network / Department'} value={initiativeForm.network_department} onChange={e => setInitiativeForm(v => ({ ...v, network_department: e.target.value }))} />
          <TextField select label={isRtl ? 'حالة المبادرة' : 'Status'} value={initiativeForm.status} onChange={e => setInitiativeForm(v => ({ ...v, status: e.target.value as Initiative['status'] }))}><MenuItem value="draft">{isRtl ? 'مسودة' : 'Draft'}</MenuItem><MenuItem value="in_progress">{isRtl ? 'قيد التنفيذ' : 'In progress'}</MenuItem><MenuItem value="completed">{isRtl ? 'مكتملة' : 'Completed'}</MenuItem><MenuItem value="submitted">{isRtl ? 'تم الرفع' : 'Submitted'}</MenuItem></TextField>
          <CalendarDateField required label={isRtl ? 'تاريخ البداية' : 'Start date'} value={initiativeForm.start_date} onChange={value => setInitiativeForm(v => ({ ...v, start_date: value }))} />
          <CalendarDateField label={isRtl ? 'تاريخ النهاية' : 'End date'} value={initiativeForm.end_date} onChange={value => setInitiativeForm(v => ({ ...v, end_date: value }))} />
          <TextField label={isRtl ? 'قائد المبادرة / المستهدف' : 'Leader / Target'} value={initiativeForm.leader_target} onChange={e => setInitiativeForm(v => ({ ...v, leader_target: e.target.value }))} />
          <TextField multiline minRows={3} label={isRtl ? 'فريق التنفيذ - اسم في كل سطر' : 'Implementation team'} value={initiativeForm.team_members_text} onChange={e => setInitiativeForm(v => ({ ...v, team_members_text: e.target.value }))} />
          <TextField multiline minRows={3} label={isRtl ? 'الأهداف' : 'Goals'} value={initiativeForm.goals} onChange={e => setInitiativeForm(v => ({ ...v, goals: e.target.value }))} />
          <TextField multiline minRows={3} label={isRtl ? 'الشرح التفصيلي' : 'Details'} value={initiativeForm.details} onChange={e => setInitiativeForm(v => ({ ...v, details: e.target.value }))} />
          <TextField multiline minRows={3} label={isRtl ? 'طريقة التطبيق' : 'Implementation method'} value={initiativeForm.implementation_method} onChange={e => setInitiativeForm(v => ({ ...v, implementation_method: e.target.value }))} />
          <TextField multiline minRows={3} label={isRtl ? 'الأهداف المحققة' : 'Achieved goals'} value={initiativeForm.achieved_goals} onChange={e => setInitiativeForm(v => ({ ...v, achieved_goals: e.target.value }))} />
          <TextField multiline minRows={3} label={isRtl ? 'ملاحظات المستندات الداعمة' : 'Supporting document notes'} value={initiativeForm.supporting_documents_notes} onChange={e => setInitiativeForm(v => ({ ...v, supporting_documents_notes: e.target.value }))} />
        </Box>
        <Divider sx={{ my: 2.5 }} />
        <Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography variant="h6" fontWeight={900}>{isRtl ? 'الأنشطة التابعة للمبادرة' : 'Initiative activities'}</Typography><Typography variant="caption" color="text.secondary">{isRtl ? 'أضف كل محاضرة أو ورشة أو فعالية مع هدفها وعدد المستفيدين.' : 'Add each activity and its beneficiaries.'}</Typography></Box><Button startIcon={<AddIcon />} onClick={addActivityRow}>{isRtl ? 'إضافة نشاط' : 'Add activity'}</Button></Stack>
        <Stack spacing={1.2} sx={{ mt: 1.5 }}>{initiativeForm.activities.map((activity, index) => <Paper key={index} variant="outlined" sx={{ p: 1.5, boxShadow: 'none' }}><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 3fr 1fr auto' }, gap: 1 }}><TextField label={isRtl ? `النشاط ${index + 1}` : `Activity ${index + 1}`} value={activity.title} onChange={e => updateActivity(index, 'title', e.target.value)} /><TextField label={isRtl ? 'الهدف / الوصف' : 'Objective'} value={activity.objective} onChange={e => updateActivity(index, 'objective', e.target.value)} /><TextField type="number" label={isRtl ? 'المستفيدون' : 'Beneficiaries'} value={activity.beneficiary_count} onChange={e => updateActivity(index, 'beneficiary_count', e.target.value)} /><IconButton color="error" disabled={initiativeForm.activities.length === 1} onClick={() => removeActivityRow(index)}><DeleteIcon /></IconButton></Box></Paper>)}</Stack>
        <Divider sx={{ my: 2.5 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr' }, gap: 1.5 }}>
          <TextField multiline minRows={3} label={isRtl ? 'المستندات الداعمة / روابط الإثبات - رابط في كل سطر' : 'Evidence links'} value={initiativeForm.evidence_links_text} onChange={e => setInitiativeForm(v => ({ ...v, evidence_links_text: e.target.value }))} />
          <Box><FormControlLabel control={<Switch checked={initiativeForm.redcap_uploaded} onChange={e => setInitiativeForm(v => ({ ...v, redcap_uploaded: e.target.checked, status: e.target.checked ? 'submitted' : v.status }))} />} label={isRtl ? 'تم الرفع على REDCap' : 'Uploaded to REDCap'} /><FormControlLabel control={<Switch checked={initiativeForm.department_copy_saved} onChange={e => setInitiativeForm(v => ({ ...v, department_copy_saved: e.target.checked }))} />} label={isRtl ? 'تم حفظ نسخة بملف القسم' : 'Department copy saved'} /></Box>
          <Box><CalendarDateField label={isRtl ? 'تاريخ الرفع على REDCap' : 'REDCap upload date'} value={initiativeForm.redcap_upload_date} onChange={value => setInitiativeForm(v => ({ ...v, redcap_upload_date: value }))} /><TextField fullWidth sx={{ mt: 1 }} label={isRtl ? 'رقم / مرجع الرفع' : 'Upload reference'} value={initiativeForm.redcap_reference} onChange={e => setInitiativeForm(v => ({ ...v, redcap_reference: e.target.value }))} /></Box>
        </Box>
        <Button sx={{ mt: 2 }} size="large" variant="contained" startIcon={<SaveIcon />} onClick={() => void addInitiative()}>{isRtl ? 'حفظ بطاقة المبادرة' : 'Save initiative'}</Button>
      </Paper>}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,420px),1fr))', gap: 2 }}>
        {selectedQuarterInitiatives.map(item => <Paper key={item.id} sx={{ p: 2.2, borderTop: '4px solid', borderTopColor: item.status === 'submitted' ? 'success.main' : item.status === 'completed' ? 'info.main' : 'warning.main' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}><Box><Typography variant="h6" fontWeight={950}>{item.name}</Typography><Typography variant="caption" color="text.secondary">{item.network_department || '—'} · Q{item.quarter} · {item.start_date}{item.end_date ? ` → ${item.end_date}` : ''}</Typography></Box><Chip size="small" color={statusColor(item.status)} label={statusLabel(item.status, isRtl)} /></Stack>
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="body2"><b>{isRtl ? 'قائد المبادرة/المستهدف:' : 'Leader/Target:'}</b> {item.leader_target || '—'}</Typography>
          <Typography variant="body2" sx={{ mt: .8 }}><b>{isRtl ? 'الأهداف:' : 'Goals:'}</b> {item.goals || '—'}</Typography>
          {(item.activities || []).length > 0 && <Box sx={{ mt: 1.5 }}><Typography variant="subtitle2" fontWeight={900}>{isRtl ? 'الأنشطة' : 'Activities'}</Typography>{(item.activities || []).map((activity, idx) => <Paper key={idx} variant="outlined" sx={{ p: 1, mt: .7, boxShadow: 'none' }}><Typography variant="body2" fontWeight={850}>{activity.title || `${isRtl ? 'نشاط' : 'Activity'} ${idx + 1}`}</Typography><Typography variant="caption" color="text.secondary">{activity.objective || '—'} · {isRtl ? 'المستفيدون' : 'Beneficiaries'}: {activity.beneficiary_count || 0}</Typography></Paper>)}</Box>}
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}><Chip size="small" label={`${isRtl ? 'إجمالي المستفيدين' : 'Total beneficiaries'}: ${item.total_beneficiaries ?? item.beneficiaries}`} /><Chip size="small" color={item.redcap_uploaded ? 'success' : 'default'} label={item.redcap_uploaded ? (isRtl ? 'تم رفع REDCap' : 'REDCap uploaded') : (isRtl ? 'لم يرفع على REDCap' : 'REDCap pending')} /><Chip size="small" color={item.department_copy_saved ? 'success' : 'default'} label={item.department_copy_saved ? (isRtl ? 'نسخة القسم محفوظة' : 'Department copy saved') : (isRtl ? 'نسخة القسم غير محفوظة' : 'Department copy pending')} /></Stack>
          {(item.evidence_links || []).length > 0 && <Box sx={{ mt: 1.5 }}><Typography variant="subtitle2" fontWeight={900}>{isRtl ? 'المستندات الداعمة' : 'Evidence'}</Typography>{(item.evidence_links || []).map((link, idx) => <Typography key={idx} component="a" href={link} target="_blank" rel="noreferrer" variant="body2" sx={{ display: 'block', mt: .4, color: 'primary.main', overflowWrap: 'anywhere' }}>{link}</Typography>)}</Box>}
        </Paper>)}
        {selectedQuarterInitiatives.length === 0 && <EmptyState text={isRtl ? `لا توجد مبادرات مسجلة للربع Q${quarter}.` : `No initiatives for Q${quarter}.`} />}
      </Box>
    </Stack>}

    {tab === 7 && <Stack spacing={2.5}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4,1fr)' }, gap: 1.5 }}><KpiCard title={isRtl ? 'نسبة الامتثال' : 'Compliance'} value={`${documentStats.compliance}%`} accent="#0F766E" /><KpiCard title={isRtl ? 'متوفر' : 'Available'} value={documentStats.available} accent="#168B88" /><KpiCard title={isRtl ? 'غير متوفر' : 'Unavailable'} value={documentStats.unavailable} accent="#DC2626" /><KpiCard title={isRtl ? 'لا ينطبق' : 'Not applicable'} value={documentStats.notApplicable} accent="#64748B" /></Box>
      <Alert severity="info">{isRtl ? 'قائمة امتثال للوثائق والمراجع. السبب إلزامي عند اختيار غير متوفر أو لا ينطبق، ولا تدخل عناصر لا ينطبق في نسبة الامتثال.' : 'Document compliance checklist.'}</Alert>
      {canEdit && <Paper sx={{ p: 2.5 }}>
        <Typography variant="h5" fontWeight={950}>{isRtl ? 'إضافة وثيقة / مرجع' : 'Add reference document'}</Typography>
        <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3,1fr)' }, gap: 1.5 }}>
          <TextField label={isRtl ? 'الوثيقة / المرجع' : 'Document / Reference'} value={documentForm.title} onChange={e => setDocumentForm(v => ({ ...v, title: e.target.value }))} />
          <TextField select label={isRtl ? 'الحالة' : 'Status'} value={documentForm.status} onChange={e => setDocumentForm(v => ({ ...v, status: e.target.value as ReferenceDocument['status'] }))}><MenuItem value="available">{isRtl ? 'متوفر' : 'Available'}</MenuItem><MenuItem value="unavailable">{isRtl ? 'غير متوفر' : 'Unavailable'}</MenuItem><MenuItem value="not_applicable">{isRtl ? 'لا ينطبق' : 'Not applicable'}</MenuItem></TextField>
          <TextField required={documentForm.status !== 'available'} label={isRtl ? 'السبب' : 'Reason'} value={documentForm.reason} onChange={e => setDocumentForm(v => ({ ...v, reason: e.target.value }))} />
          <TextField label={isRtl ? 'المصدر / المرجع' : 'Source'} value={documentForm.source} onChange={e => setDocumentForm(v => ({ ...v, source: e.target.value }))} />
          <TextField label={isRtl ? 'الجهة المصدرة' : 'Issuing authority'} value={documentForm.issuing_authority} onChange={e => setDocumentForm(v => ({ ...v, issuing_authority: e.target.value }))} />
          <TextField label={isRtl ? 'رقم الإصدار' : 'Version'} value={documentForm.version_number} onChange={e => setDocumentForm(v => ({ ...v, version_number: e.target.value }))} />
          <CalendarDateField label={isRtl ? 'تاريخ الإصدار' : 'Issue date'} value={documentForm.issue_date} onChange={value => setDocumentForm(v => ({ ...v, issue_date: value }))} />
          <CalendarDateField label={isRtl ? 'تاريخ آخر مراجعة' : 'Last review'} value={documentForm.last_review_date} onChange={value => setDocumentForm(v => ({ ...v, last_review_date: value }))} />
          <TextField type="number" label={isRtl ? 'عدد الوثائق / السياسات' : 'Document count'} value={documentForm.document_count} onChange={e => setDocumentForm(v => ({ ...v, document_count: e.target.value }))} inputProps={{ min: 1 }} />
          <TextField label={isRtl ? 'المسؤول عن التحديث' : 'Responsible person'} value={documentForm.responsible_person} onChange={e => setDocumentForm(v => ({ ...v, responsible_person: e.target.value }))} />
          <TextField multiline minRows={3} label={isRtl ? 'روابط صور / إثباتات الوثيقة - رابط في كل سطر' : 'Evidence links'} value={documentForm.evidence_links_text} onChange={e => setDocumentForm(v => ({ ...v, evidence_links_text: e.target.value }))} />
          <TextField multiline minRows={3} label={isRtl ? 'ملاحظات' : 'Notes'} value={documentForm.notes} onChange={e => setDocumentForm(v => ({ ...v, notes: e.target.value }))} />
        </Box>
        <Button sx={{ mt: 2 }} variant="contained" startIcon={<SaveIcon />} onClick={() => void addDocument()}>{isRtl ? 'حفظ الوثيقة' : 'Save document'}</Button>
      </Paper>}
      <Paper sx={{ p: 2 }}><TableContainer><Table size="small"><TableHead><TableRow><TableCell>{isRtl ? 'الوثيقة / المرجع' : 'Document'}</TableCell><TableCell>{isRtl ? 'الحالة' : 'Status'}</TableCell><TableCell>{isRtl ? 'المصدر / الجهة' : 'Source'}</TableCell><TableCell>{isRtl ? 'العدد' : 'Count'}</TableCell><TableCell>{isRtl ? 'آخر مراجعة' : 'Last review'}</TableCell><TableCell>{isRtl ? 'المسؤول' : 'Responsible'}</TableCell><TableCell>{isRtl ? 'الإثباتات' : 'Evidence'}</TableCell><TableCell>{isRtl ? 'السبب / الملاحظات' : 'Reason / Notes'}</TableCell></TableRow></TableHead><TableBody>
        {documents.map(doc => <TableRow key={doc.id}><TableCell sx={{ fontWeight: 850 }}>{doc.title}</TableCell><TableCell><Chip size="small" color={doc.status === 'available' ? 'success' : doc.status === 'unavailable' ? 'error' : 'default'} label={doc.status === 'available' ? (isRtl ? 'متوفر' : 'Available') : doc.status === 'unavailable' ? (isRtl ? 'غير متوفر' : 'Unavailable') : (isRtl ? 'لا ينطبق' : 'Not applicable')} /></TableCell><TableCell>{[doc.source, doc.issuing_authority].filter(Boolean).join(' · ') || '—'}</TableCell><TableCell>{doc.document_count || 1}</TableCell><TableCell>{doc.last_review_date || '—'}</TableCell><TableCell>{doc.responsible_person || '—'}</TableCell><TableCell>{(doc.evidence_links || []).length ? (doc.evidence_links || []).map((link, idx) => <Typography key={idx} component="a" href={link} target="_blank" rel="noreferrer" variant="caption" sx={{ display: 'block', color: 'primary.main' }}>{isRtl ? `إثبات ${idx + 1}` : `Evidence ${idx + 1}`}</Typography>) : '—'}</TableCell><TableCell><Typography variant="body2">{doc.reason || '—'}</Typography>{doc.notes && <Typography variant="caption" color="text.secondary">{doc.notes}</Typography>}</TableCell></TableRow>)}
      </TableBody></Table></TableContainer></Paper>
    </Stack>}
  </Box>;
}
