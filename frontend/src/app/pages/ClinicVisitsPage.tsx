import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert, Avatar, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, IconButton, InputAdornment, MenuItem,
  Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { Grid } from '@mui/material';
import {
  Add, CalendarMonth, Clear, DeleteOutlined as DeleteOutline, EditOutlined, Groups, History,
  LocalHospital, PersonAddAlt1, Refresh, Search, Today, VisibilityOutlined,
} from '@mui/icons-material';
import { toast } from 'sonner';
import { authFetch, getAccessToken, useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../data/roles';
import { EmployeeQuickSearch, type EmployeeSearchOption } from '../components/EmployeeQuickSearch';
import { CalendarDateField } from '../components/CalendarDateField';
import { DateText, useDatePreference } from '../context/DatePreferenceContext';

const PROD_API = 'https://occupational-health-platform-production.up.railway.app/api';
const LOCAL_API = 'http://localhost:8000/api';
const API = (import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname) ? LOCAL_API : PROD_API)
).replace(/\/$/, '');

type Status = 'open' | 'completed' | 'follow_up';
type Mode = 'employees' | 'history' | 'today';
type Visit = {
  id: number; visit_number: string; employee: number | string; employee_name: string;
  employee_number: string; national_id_masked: string; health_center_name: string;
  job_title: string; visit_date: string | null; visit_time: string | null;
  clinic_type: string; diagnosis: string; action_taken: string;
  sick_leave_days: number | null; follow_up_date: string | null; doctor_name: string;
  status: Status; notes: string; created_by_name: string; created_at: string; updated_at: string;
};
type VisitForm = {
  employeeId: string; employeeName: string; visitDate: string; visitTime: string;
  clinicType: string; diagnosis: string; actionTaken: string; sickLeaveDays: string;
  followUpDate: string; doctorName: string; status: Status; notes: string;
};

const EMPTY: VisitForm = {
  employeeId: '', employeeName: '', visitDate: '', visitTime: '', clinicType: 'Employee Clinic',
  diagnosis: '', actionTaken: '', sickLeaveDays: '', followUpDate: '', doctorName: '',
  status: 'completed', notes: '',
};
const STATUSES: Record<Status, { ar: string; en: string; color: 'success' | 'warning' | 'info' }> = {
  completed: { ar: 'مكتملة', en: 'Completed', color: 'success' },
  open: { ar: 'مفتوحة', en: 'Open', color: 'info' },
  follow_up: { ar: 'تحتاج متابعة', en: 'Follow-up', color: 'warning' },
};

function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
function nowTime() { return new Date().toTimeString().slice(0, 5); }
function rows(payload: unknown): Visit[] {
  if (Array.isArray(payload)) return payload as Visit[];
  return payload && typeof payload === 'object' && Array.isArray((payload as { results?: unknown }).results)
    ? (payload as { results: Visit[] }).results : [];
}
function nextPage(payload: unknown) {
  const next = payload && typeof payload === 'object' ? (payload as { next?: unknown }).next : null;
  return typeof next === 'string' ? next : null;
}
async function apiError(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (typeof body?.detail === 'string') return body.detail;
  if (body && typeof body === 'object') {
    return Object.entries(body).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join('، ') : String(value)}`).join(' | ');
  }
  return 'تعذر تنفيذ العملية.';
}
async function loadAllVisits() {
  const output: Visit[] = [];
  const seen = new Set<string>();
  let url: string | null = `${API}/clinic-visits/`;
  while (url && !seen.has(url) && seen.size < 200) {
    seen.add(url);
    const response = await authFetch(url);
    if (!response.ok) throw new Error(await apiError(response));
    const payload: unknown = await response.json();
    output.push(...rows(payload));
    url = nextPage(payload);
  }
  return output;
}
function StatusChip({ status, rtl }: { status: Status; rtl: boolean }) {
  const item = STATUSES[status] || STATUSES.completed;
  return <Chip size="small" color={item.color} variant="outlined" label={rtl ? item.ar : item.en} />;
}

export function ClinicVisitsPage() {
  const { i18n } = useTranslation();
  const { can } = useAuth();
  const { formatDate } = useDatePreference();
  const rtl = i18n.language === 'ar';
  const canCreate = can(PERMISSIONS.CREATE_CLINIC_VISIT);
  const canUpdate = can(PERMISSIONS.UPDATE_CLINIC_VISIT);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const [mode, setMode] = useState<Mode>('employees');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Visit | null>(null);
  const [viewing, setViewing] = useState<Visit | null>(null);
  const [form, setForm] = useState<VisitForm>(EMPTY);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!getAccessToken()) { if (active) setLoading(false); return; }
      setLoading(true);
      try { const data = await loadAllVisits(); if (active) setVisits(data); }
      catch (error) { if (active) toast.error(error instanceof Error ? error.message : 'تعذر تحميل الزيارات.'); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [reload]);

  const types = useMemo(() => Array.from(new Set(visits.map(v => v.clinic_type).filter(Boolean))).sort(), [visits]);
  const employeeCards = useMemo(() => {
    const map = new Map<string, { id: string; name: string; number: string; nid: string; center: string; job: string; visits: Visit[] }>();
    visits.forEach(visit => {
      const id = String(visit.employee);
      const item = map.get(id) || { id, name: visit.employee_name, number: visit.employee_number, nid: visit.national_id_masked, center: visit.health_center_name, job: visit.job_title, visits: [] };
      item.visits.push(visit); map.set(id, item);
    });
    const needle = search.trim().toLowerCase();
    return Array.from(map.values()).map(item => ({ ...item, visits: item.visits.sort((a, b) => `${b.visit_date || ''}T${b.visit_time || ''}`.localeCompare(`${a.visit_date || ''}T${a.visit_time || ''}`)) }))
      .filter(item => !needle || [item.name, item.number, item.nid, item.center, item.job].some(value => String(value || '').toLowerCase().includes(needle)))
      .sort((a, b) => a.name.localeCompare(b.name, rtl ? 'ar' : 'en'));
  }, [visits, search, rtl]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return visits.filter(visit => {
      if (mode === 'today' && visit.visit_date !== todayIso()) return false;
      if (employeeId && String(visit.employee) !== employeeId) return false;
      if (type !== 'all' && visit.clinic_type !== type) return false;
      if (status !== 'all' && visit.status !== status) return false;
      if (from && (!visit.visit_date || visit.visit_date < from)) return false;
      if (to && (!visit.visit_date || visit.visit_date > to)) return false;
      return !needle || [visit.visit_number, visit.employee_name, visit.employee_number, visit.national_id_masked, visit.health_center_name, visit.job_title, visit.clinic_type, visit.doctor_name].some(value => String(value || '').toLowerCase().includes(needle));
    }).sort((a, b) => `${b.visit_date || ''}T${b.visit_time || ''}`.localeCompare(`${a.visit_date || ''}T${a.visit_time || ''}`));
  }, [employeeId, from, mode, search, status, to, type, visits]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Visit[]>();
    filtered.forEach(visit => { const key = visit.visit_date || 'undated'; groups.set(key, [...(groups.get(key) || []), visit]); });
    return Array.from(groups.entries());
  }, [filtered]);
  const todayCount = visits.filter(v => v.visit_date === todayIso()).length;
  const selectedEmployee = visits.find(v => String(v.employee) === employeeId);

  function createVisit(employee?: { id: string; name: string }) {
    setEditing(null);
    setForm({ ...EMPTY, employeeId: employee?.id || '', employeeName: employee?.name || '', visitDate: todayIso(), visitTime: nowTime() });
    setFormOpen(true);
  }
  function editVisit(visit: Visit) {
    setEditing(visit);
    setForm({ employeeId: String(visit.employee), employeeName: visit.employee_name, visitDate: visit.visit_date || '', visitTime: (visit.visit_time || '').slice(0, 5), clinicType: visit.clinic_type, diagnosis: visit.diagnosis, actionTaken: visit.action_taken, sickLeaveDays: visit.sick_leave_days == null ? '' : String(visit.sick_leave_days), followUpDate: visit.follow_up_date || '', doctorName: visit.doctor_name, status: visit.status, notes: visit.notes });
    setFormOpen(true);
  }
  function selectEmployee(id: string, employee: EmployeeSearchOption | null) {
    setForm(previous => ({ ...previous, employeeId: id, employeeName: employee?.name || '' }));
  }
  async function saveVisit() {
    if (!form.employeeId || !form.visitDate || !form.diagnosis.trim()) { toast.error(rtl ? 'الموظف وتاريخ الزيارة والتشخيص حقول مطلوبة.' : 'Employee, visit date and diagnosis are required.'); return; }
    if (!editing && visits.some(v => String(v.employee) === form.employeeId && v.status === 'open') && !window.confirm(rtl ? 'يوجد لهذا الموظف سجل زيارة مفتوح. هل تريد تسجيل زيارة أخرى؟' : 'This employee has an open visit. Continue?')) return;
    setSaving(true);
    try {
      const payload = { employee: Number(form.employeeId), visit_date: form.visitDate, visit_time: form.visitTime || null, clinic_type: form.clinicType, diagnosis: form.diagnosis.trim(), action_taken: form.actionTaken.trim(), sick_leave_days: form.sickLeaveDays === '' ? null : Number(form.sickLeaveDays), follow_up_date: form.followUpDate || null, doctor_name: form.doctorName.trim(), status: form.status, notes: form.notes.trim() };
      const response = await authFetch(editing ? `${API}/clinic-visits/${editing.id}/` : `${API}/clinic-visits/`, { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(await apiError(response));
      setFormOpen(false); setEditing(null); setForm(EMPTY); setReload(v => v + 1);
      toast.success(rtl ? 'تم حفظ زيارة العيادة.' : 'Clinic visit saved.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'تعذر حفظ الزيارة.'); }
    finally { setSaving(false); }
  }
  async function deleteVisit(visit: Visit) {
    if (!window.confirm(rtl ? `حذف الزيارة ${visit.visit_number} نهائيًا؟` : `Delete ${visit.visit_number}?`)) return;
    try {
      const response = await authFetch(`${API}/clinic-visits/${visit.id}/`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await apiError(response));
      setVisits(current => current.filter(item => item.id !== visit.id)); toast.success(rtl ? 'تم حذف الزيارة.' : 'Visit deleted.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'تعذر حذف الزيارة.'); }
  }
  function showHistory(id: string) { setEmployeeId(id); setSearch(''); setMode('history'); }

  const stats = [
    { label: rtl ? 'إجمالي الزيارات' : 'Total visits', value: visits.length, icon: <History />, color: '#0F5C7A' },
    { label: rtl ? 'زيارات اليوم' : "Today's visits", value: todayCount, icon: <Today />, color: '#148F8B' },
    { label: rtl ? 'الموظفون المراجعون' : 'Employees visited', value: new Set(visits.map(v => String(v.employee))).size, icon: <Groups />, color: '#3B6EA8' },
    { label: rtl ? 'تحتاج متابعة' : 'Need follow-up', value: visits.filter(v => v.status === 'follow_up').length, icon: <CalendarMonth />, color: '#B7791F' },
  ];

  return <Box>
    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={2} sx={{ mb: 3 }}>
      <Stack direction="row" spacing={1.5} alignItems="center"><LocalHospital sx={{ fontSize: 36, color: '#148F8B' }} /><Box><Typography variant="h4" fontWeight={900}>{rtl ? 'زيارات العيادة' : 'Clinic Visits'}</Typography><Typography variant="body2" color="text.secondary">{rtl ? 'بطاقة زيارات لكل موظف وسجل عام مرتب حسب الأيام والتواريخ' : 'Employee cards and a chronological visit register'}</Typography></Box></Stack>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap><Button variant="outlined" startIcon={<Refresh />} onClick={() => setReload(v => v + 1)} disabled={loading}>{rtl ? 'تحديث' : 'Refresh'}</Button>{canCreate && <Button variant="contained" startIcon={<Add />} onClick={() => createVisit()}>{rtl ? 'تسجيل زيارة' : 'Record visit'}</Button>}</Stack>
    </Stack>

    <Grid container spacing={2} sx={{ mb: 3 }}>{stats.map(card => <Grid key={card.label} size={{ xs: 6, md: 3 }}><Paper variant="outlined" sx={{ p: 2, borderRadius: 3, borderTop: `4px solid ${card.color}`, height: '100%' }}><Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography variant="h4" fontWeight={900}>{card.value}</Typography><Typography variant="body2" color="text.secondary">{card.label}</Typography></Box><Avatar sx={{ bgcolor: `${card.color}18`, color: card.color }}>{card.icon}</Avatar></Stack></Paper></Grid>)}</Grid>

    <Paper variant="outlined" sx={{ p: 1.25, mb: 2.5, borderRadius: 3 }}><Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" spacing={1.25}><Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap><Button variant={mode === 'employees' ? 'contained' : 'outlined'} startIcon={<Groups />} onClick={() => { setMode('employees'); setEmployeeId(''); }}>{rtl ? 'بطاقات الموظفين' : 'Employee cards'}</Button><Button variant={mode === 'history' ? 'contained' : 'outlined'} startIcon={<History />} onClick={() => setMode('history')}>{rtl ? 'سجل الزيارات' : 'Visit history'}</Button><Button variant={mode === 'today' ? 'contained' : 'outlined'} startIcon={<Today />} onClick={() => { setMode('today'); setEmployeeId(''); }}>{rtl ? `زيارات اليوم (${todayCount})` : `Today (${todayCount})`}</Button></Stack>{loading && <Stack direction="row" spacing={1} alignItems="center"><CircularProgress size={20} /><Typography variant="body2">{rtl ? 'جاري التحميل...' : 'Loading...'}</Typography></Stack>}</Stack></Paper>

    <Filters mode={mode} rtl={rtl} search={search} setSearch={setSearch} type={type} setType={setType} status={status} setStatus={setStatus} from={from} setFrom={setFrom} to={to} setTo={setTo} types={types} employeeId={employeeId} employeeName={selectedEmployee?.employee_name} clearEmployee={() => setEmployeeId('')} />

    {mode === 'employees' ? <Grid container spacing={2.25}>{employeeCards.map(employee => <EmployeeCard key={employee.id} employee={employee} rtl={rtl} canCreate={canCreate} onHistory={showHistory} onCreate={createVisit} />)}{!loading && employeeCards.length === 0 && <Grid size={{ xs: 12 }}><Alert severity="info">{rtl ? 'لا توجد زيارات مسجلة لعرض بطاقات الموظفين.' : 'No visits found.'}</Alert></Grid>}</Grid>
      : <VisitTable grouped={grouped} loading={loading} rtl={rtl} formatDate={formatDate} canUpdate={canUpdate} onView={setViewing} onEdit={editVisit} onDelete={deleteVisit} />}

    <VisitFormDialog open={formOpen} editing={editing} form={form} setForm={setForm} saving={saving} rtl={rtl} onClose={() => setFormOpen(false)} onEmployee={selectEmployee} onSave={saveVisit} />
    <VisitDetails visit={viewing} rtl={rtl} formatDate={formatDate} onClose={() => setViewing(null)} />
  </Box>;
}

function Filters(props: { mode: Mode; rtl: boolean; search: string; setSearch: (v: string) => void; type: string; setType: (v: string) => void; status: string; setStatus: (v: string) => void; from: string; setFrom: (v: string) => void; to: string; setTo: (v: string) => void; types: string[]; employeeId: string; employeeName?: string; clearEmployee: () => void }) {
  const p = props;
  return <Paper variant="outlined" sx={{ p: 2, mb: 2.5, borderRadius: 3 }}><Grid container spacing={1.5}><Grid size={{ xs: 12, md: p.mode === 'employees' ? 12 : 4 }}><TextField fullWidth size="small" placeholder={p.rtl ? 'بحث بالاسم أو الرقم الوظيفي أو الهوية أو المركز...' : 'Search employee, number, ID or center...'} value={p.search} onChange={e => p.setSearch(e.target.value)} slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> } }} /></Grid>{p.mode !== 'employees' && <><Grid size={{ xs: 12, sm: 6, md: 2 }}><TextField fullWidth select size="small" label={p.rtl ? 'نوع العيادة' : 'Clinic type'} value={p.type} onChange={e => p.setType(e.target.value)}><MenuItem value="all">{p.rtl ? 'جميع الأنواع' : 'All types'}</MenuItem>{p.types.map(type => <MenuItem key={type} value={type}>{type}</MenuItem>)}</TextField></Grid><Grid size={{ xs: 12, sm: 6, md: 2 }}><TextField fullWidth select size="small" label={p.rtl ? 'الحالة' : 'Status'} value={p.status} onChange={e => p.setStatus(e.target.value)}><MenuItem value="all">{p.rtl ? 'جميع الحالات' : 'All statuses'}</MenuItem>{(Object.keys(STATUSES) as Status[]).map(status => <MenuItem key={status} value={status}>{p.rtl ? STATUSES[status].ar : STATUSES[status].en}</MenuItem>)}</TextField></Grid><Grid size={{ xs: 12, sm: 6, md: 2 }}><CalendarDateField label={p.rtl ? 'من تاريخ' : 'From'} value={p.from} onChange={p.setFrom} /></Grid><Grid size={{ xs: 12, sm: 6, md: 2 }}><CalendarDateField label={p.rtl ? 'إلى تاريخ' : 'To'} value={p.to} onChange={p.setTo} /></Grid></>}</Grid>{p.employeeId && <Chip sx={{ mt: 1.5 }} color="primary" variant="outlined" label={`${p.rtl ? 'سجل الموظف' : 'Employee'}: ${p.employeeName || p.employeeId}`} onDelete={p.clearEmployee} deleteIcon={<Clear />} />}</Paper>;
}

type EmployeeCardData = { id: string; name: string; number: string; nid: string; center: string; job: string; visits: Visit[] };
function EmployeeCard({ employee, rtl, canCreate, onHistory, onCreate }: { employee: EmployeeCardData; rtl: boolean; canCreate: boolean; onHistory: (id: string) => void; onCreate: (employee: { id: string; name: string }) => void }) {
  const latest = employee.visits[0];
  const followUp = employee.visits.find(v => v.follow_up_date && v.follow_up_date >= todayIso());
  return <Grid size={{ xs: 12, md: 6, xl: 4 }}><Paper variant="outlined" sx={{ p: 2.25, borderRadius: 3, borderTop: '4px solid #0F5C7A', height: '100%', maxWidth: 500, mx: { xs: 'auto', md: 0 } }}><Stack direction="row" justifyContent="space-between" spacing={1.5}><Stack direction="row" spacing={1.2} alignItems="center"><Avatar sx={{ bgcolor: '#148F8B', fontWeight: 900 }}>{employee.name.charAt(0)}</Avatar><Box><Typography variant="h6" fontWeight={900}>{employee.name}</Typography><Typography variant="caption" color="text.secondary">{employee.number || '—'} · {employee.nid || '—'}</Typography></Box></Stack><StatusChip status={latest.status} rtl={rtl} /></Stack><Divider sx={{ my: 1.6 }} /><Grid container spacing={1.4}><CardField label={rtl ? 'المركز الصحي' : 'Health center'} value={employee.center} /><CardField label={rtl ? 'المسمى الوظيفي' : 'Job title'} value={employee.job} /><CardField label={rtl ? 'عدد الزيارات' : 'Visits'} value={String(employee.visits.length)} /><Grid size={{ xs: 6 }}><Typography variant="caption" color="text.secondary">{rtl ? 'آخر زيارة' : 'Latest visit'}</Typography><Typography variant="body2" fontWeight={700}><DateText value={latest.visit_date} /></Typography></Grid><CardField label={rtl ? 'نوع آخر زيارة' : 'Latest type'} value={latest.clinic_type} /><Grid size={{ xs: 6 }}><Typography variant="caption" color="text.secondary">{rtl ? 'المتابعة القادمة' : 'Next follow-up'}</Typography><Typography variant="body2" fontWeight={700}>{followUp ? <DateText value={followUp.follow_up_date} /> : '—'}</Typography></Grid></Grid><Divider sx={{ my: 1.6 }} /><Stack direction="row" spacing={1}><Button size="small" variant="outlined" startIcon={<History />} onClick={() => onHistory(employee.id)}>{rtl ? 'عرض السجل' : 'View history'}</Button>{canCreate && <Button size="small" variant="contained" startIcon={<PersonAddAlt1 />} onClick={() => onCreate(employee)}>{rtl ? 'زيارة جديدة' : 'New visit'}</Button>}</Stack></Paper></Grid>;
}
function CardField({ label, value }: { label: string; value: string }) { return <Grid size={{ xs: 6 }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" fontWeight={700}>{value || '—'}</Typography></Grid>; }

function VisitTable({ grouped, loading, rtl, formatDate, canUpdate, onView, onEdit, onDelete }: { grouped: [string, Visit[]][]; loading: boolean; rtl: boolean; formatDate: (v?: string | Date | null, o?: Intl.DateTimeFormatOptions) => string; canUpdate: boolean; onView: (v: Visit) => void; onEdit: (v: Visit) => void; onDelete: (v: Visit) => void }) {
  return <TableContainer className="clinic-visits-history-table" component={Paper} variant="outlined" sx={{ borderRadius: 3, maxHeight: 680 }}><Table stickyHeader size="small"><TableHead><TableRow>{(rtl ? ['رقم الزيارة', 'الموظف', 'الوقت', 'نوع العيادة', 'الطبيب', 'الحالة', 'المتابعة', 'الإجراءات'] : ['Visit no.', 'Employee', 'Time', 'Clinic type', 'Doctor', 'Status', 'Follow-up', 'Actions']).map(label => <TableCell key={label} sx={{ fontWeight: 900 }}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{grouped.map(([date, visits]) => <VisitDay key={date} date={date} visits={visits} rtl={rtl} formatDate={formatDate} canUpdate={canUpdate} onView={onView} onEdit={onEdit} onDelete={onDelete} />)}{!loading && grouped.length === 0 && <TableRow><TableCell colSpan={8} align="center" sx={{ py: 6, color: 'text.secondary' }}>{rtl ? 'لا توجد زيارات مطابقة.' : 'No matching visits.'}</TableCell></TableRow>}</TableBody></Table></TableContainer>;
}
function VisitDay({ date, visits, rtl, formatDate, canUpdate, onView, onEdit, onDelete }: { date: string; visits: Visit[]; rtl: boolean; formatDate: (v?: string | Date | null, o?: Intl.DateTimeFormatOptions) => string; canUpdate: boolean; onView: (v: Visit) => void; onEdit: (v: Visit) => void; onDelete: (v: Visit) => void }) {
  const label = date === 'undated' ? (rtl ? 'بدون تاريخ' : 'Undated') : formatDate(date, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  return <><TableRow className="clinic-visit-day-heading"><TableCell colSpan={8} sx={{ fontWeight: 900, color: '#0F5C7A', py: 1.25 }}><Stack direction="row" spacing={1} alignItems="center"><CalendarMonth fontSize="small" /><span>{label}</span><Chip size="small" label={visits.length} /></Stack></TableCell></TableRow>{visits.map(visit => <TableRow key={visit.id} hover><TableCell><Typography variant="body2" fontFamily="monospace" fontWeight={700}>{visit.visit_number}</Typography></TableCell><TableCell><Stack direction="row" spacing={1} alignItems="center"><Avatar sx={{ width: 30, height: 30, bgcolor: '#148F8B', fontSize: 13 }}>{visit.employee_name.charAt(0)}</Avatar><Box><Typography variant="body2" fontWeight={800}>{visit.employee_name}</Typography><Typography variant="caption" color="text.secondary">{visit.employee_number || '—'} · {visit.health_center_name || '—'}</Typography></Box></Stack></TableCell><TableCell>{visit.visit_time?.slice(0, 5) || '—'}</TableCell><TableCell><Chip size="small" variant="outlined" label={visit.clinic_type} /></TableCell><TableCell>{visit.doctor_name || '—'}</TableCell><TableCell><StatusChip status={visit.status} rtl={rtl} /></TableCell><TableCell>{visit.follow_up_date ? <DateText value={visit.follow_up_date} /> : '—'}</TableCell><TableCell><Stack direction="row" spacing={0.25}><Tooltip title={rtl ? 'عرض' : 'View'}><IconButton size="small" color="primary" onClick={() => onView(visit)}><VisibilityOutlined fontSize="small" /></IconButton></Tooltip>{canUpdate && <><Tooltip title={rtl ? 'تعديل' : 'Edit'}><IconButton size="small" color="info" onClick={() => onEdit(visit)}><EditOutlined fontSize="small" /></IconButton></Tooltip><Tooltip title={rtl ? 'حذف' : 'Delete'}><IconButton size="small" color="error" onClick={() => void onDelete(visit)}><DeleteOutline fontSize="small" /></IconButton></Tooltip></>}</Stack></TableCell></TableRow>)}</>;
}

function VisitFormDialog({ open, editing, form, setForm, saving, rtl, onClose, onEmployee, onSave }: { open: boolean; editing: Visit | null; form: VisitForm; setForm: Dispatch<SetStateAction<VisitForm>>; saving: boolean; rtl: boolean; onClose: () => void; onEmployee: (id: string, employee: EmployeeSearchOption | null) => void; onSave: () => void }) {
  return <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="md" fullWidth><DialogTitle>{editing ? (rtl ? 'تعديل زيارة العيادة' : 'Edit clinic visit') : (rtl ? 'تسجيل زيارة جديدة' : 'Record clinic visit')}</DialogTitle><DialogContent dividers><Grid container spacing={2}><Grid size={{ xs: 12 }}><EmployeeQuickSearch required disabled={Boolean(editing)} value={form.employeeId} onChange={onEmployee} label={rtl ? 'بحث الموظف' : 'Employee'} helperText={rtl ? 'بحث بالاسم أو الهوية أو الرقم الوظيفي أو الجوال' : 'Search by name, ID, employee number or mobile'} /></Grid><Grid size={{ xs: 12, sm: 6 }}><CalendarDateField required label={rtl ? 'تاريخ الزيارة' : 'Visit date'} value={form.visitDate} onChange={value => setForm(p => ({ ...p, visitDate: value }))} /></Grid><Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth required type="time" label={rtl ? 'وقت الزيارة' : 'Visit time'} value={form.visitTime} onChange={e => setForm(p => ({ ...p, visitTime: e.target.value }))} slotProps={{ inputLabel: { shrink: true } }} /></Grid><Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth select required label={rtl ? 'نوع العيادة' : 'Clinic type'} value={form.clinicType} onChange={e => setForm(p => ({ ...p, clinicType: e.target.value }))}>{['Employee Clinic', 'Occupational Health', 'Emergency', 'Specialist'].map(type => <MenuItem key={type} value={type}>{type}</MenuItem>)}</TextField></Grid><Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth label={rtl ? 'اسم الطبيب' : 'Doctor'} value={form.doctorName} onChange={e => setForm(p => ({ ...p, doctorName: e.target.value }))} /></Grid><Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth select label={rtl ? 'حالة الزيارة' : 'Status'} value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as Status }))}>{(Object.keys(STATUSES) as Status[]).map(status => <MenuItem key={status} value={status}>{rtl ? STATUSES[status].ar : STATUSES[status].en}</MenuItem>)}</TextField></Grid><Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth type="number" label={rtl ? 'أيام الإجازة المرضية' : 'Sick leave days'} value={form.sickLeaveDays} onChange={e => setForm(p => ({ ...p, sickLeaveDays: e.target.value }))} slotProps={{ htmlInput: { min: 0, max: 365 } }} /></Grid><Grid size={{ xs: 12 }}><TextField fullWidth required multiline minRows={2} label={rtl ? 'التشخيص' : 'Diagnosis'} value={form.diagnosis} onChange={e => setForm(p => ({ ...p, diagnosis: e.target.value }))} /></Grid><Grid size={{ xs: 12 }}><TextField fullWidth multiline minRows={2} label={rtl ? 'الإجراء المتخذ' : 'Action taken'} value={form.actionTaken} onChange={e => setForm(p => ({ ...p, actionTaken: e.target.value }))} /></Grid><Grid size={{ xs: 12, sm: 6 }}><CalendarDateField label={rtl ? 'تاريخ المتابعة' : 'Follow-up date'} value={form.followUpDate} onChange={value => setForm(p => ({ ...p, followUpDate: value }))} /></Grid><Grid size={{ xs: 12 }}><TextField fullWidth multiline minRows={2} label={rtl ? 'ملاحظات' : 'Notes'} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></Grid></Grid></DialogContent><DialogActions><Button onClick={onClose} disabled={saving}>{rtl ? 'إلغاء' : 'Cancel'}</Button><Button variant="contained" onClick={() => void onSave()} disabled={saving} startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}>{saving ? (rtl ? 'جاري الحفظ...' : 'Saving...') : (rtl ? 'حفظ' : 'Save')}</Button></DialogActions></Dialog>;
}

function VisitDetails({ visit, rtl, formatDate, onClose }: { visit: Visit | null; rtl: boolean; formatDate: (v?: string | Date | null) => string; onClose: () => void }) {
  return <Dialog open={Boolean(visit)} onClose={onClose} maxWidth="sm" fullWidth><DialogTitle>{rtl ? 'تفاصيل زيارة العيادة' : 'Clinic visit details'}</DialogTitle>{visit && <DialogContent dividers><Alert severity="info" sx={{ mb: 2 }}>{rtl ? 'هذه بيانات طبية سرية وتظهر للمستخدمين المصرح لهم فقط.' : 'Confidential medical data for authorized users only.'}</Alert><Grid container spacing={2}><Detail label={rtl ? 'رقم الزيارة' : 'Visit no.'} value={visit.visit_number} /><Detail label={rtl ? 'الموظف' : 'Employee'} value={`${visit.employee_name} — ${visit.employee_number || '—'}`} /><Detail label={rtl ? 'تاريخ ووقت الزيارة' : 'Date and time'} value={`${formatDate(visit.visit_date)} ${visit.visit_time?.slice(0, 5) || ''}`} /><Detail label={rtl ? 'العيادة والطبيب' : 'Clinic and doctor'} value={`${visit.clinic_type} — ${visit.doctor_name || '—'}`} /><Detail wide label={rtl ? 'التشخيص' : 'Diagnosis'} value={visit.diagnosis || '—'} /><Detail wide label={rtl ? 'الإجراء المتخذ' : 'Action taken'} value={visit.action_taken || '—'} /><Detail label={rtl ? 'الإجازة المرضية' : 'Sick leave'} value={visit.sick_leave_days == null ? '—' : `${visit.sick_leave_days} ${rtl ? 'يوم' : 'days'}`} /><Detail label={rtl ? 'موعد المتابعة' : 'Follow-up'} value={formatDate(visit.follow_up_date)} /><Detail wide label={rtl ? 'الملاحظات' : 'Notes'} value={visit.notes || '—'} /></Grid></DialogContent>}<DialogActions><Button onClick={onClose}>{rtl ? 'إغلاق' : 'Close'}</Button></DialogActions></Dialog>;
}
function Detail({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) { return <Grid size={{ xs: 12, sm: wide ? 12 : 6 }}><Paper variant="outlined" sx={{ p: 1.5, height: '100%' }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" fontWeight={700} sx={{ whiteSpace: 'pre-wrap' }}>{value}</Typography></Paper></Grid>; }
