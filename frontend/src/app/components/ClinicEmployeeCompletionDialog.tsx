import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, FormControlLabel,
  Grid, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import { authFetch, getAccessToken } from '../context/AuthContext';

const PROD_API = 'https://occupational-health-platform-production.up.railway.app/api';
const API = (import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:8000/api' : PROD_API)).replace(/\/$/, '');

type Employee = {
  id: number; name: string; national_id: string;
  health_center: number | null; registration_status?: string;
  source_center_name?: string;
  employee_number?: string | null; mobile?: string; email?: string | null;
  date_of_birth?: string | null; birth_place?: string; nationality?: string;
  gender?: string; marital_status?: string; national_address?: string;
  job_title?: string; current_job?: string; appointment_date?: string | null;
};
type Center = { id: number; name: string; name_ar?: string; is_active?: boolean };
type Props = {
  employeeId: string; open: boolean; onClose: () => void; onUpdated: () => void;
};
const FIELDS: { id: keyof Employee; title: string; type?: string }[] = [
  { id: 'employee_number', title: 'الرقم الوظيفي' },
  { id: 'mobile', title: 'الجوال' },
  { id: 'email', title: 'البريد الإلكتروني' },
  { id: 'date_of_birth', title: 'تاريخ الميلاد', type: 'date' },
  { id: 'birth_place', title: 'مكان الميلاد' },
  { id: 'nationality', title: 'الجنسية (رمز الدولة مثل SA)' },
  { id: 'gender', title: 'الجنس' },
  { id: 'marital_status', title: 'الحالة الاجتماعية' },
  { id: 'national_address', title: 'العنوان الوطني' },
  { id: 'job_title', title: 'المسمى الوظيفي' },
  { id: 'current_job', title: 'الوظيفة الحالية' },
  { id: 'appointment_date', title: 'تاريخ التعيين', type: 'date' },
];

export function ClinicEmployeeCompletionDialog({ employeeId, open, onClose, onUpdated }: Props) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [centers, setCenters] = useState<Center[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [identityChecked, setIdentityChecked] = useState(false);
  const [reason, setReason] = useState('استكمال بيانات الموظف أثناء زيارته للعيادة');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !employeeId) return;
    let cancelled = false;
    setEmployee(null); setFields({}); setIdentityChecked(false); setError('');
    const load = async () => {
      setBusy(true);
      try {
        const token = getAccessToken();
        if (!token) throw new Error('انتهت جلسة تسجيل الدخول.');
        const config = { headers: { Authorization: 'Bearer ' + token } };
        const response = await authFetch(API + '/employees/' + encodeURIComponent(employeeId) + '/', config);
        const record = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(record.detail || 'تعذر قراءة بطاقة الموظف.');
        const directory: Center[] = [];
        for (let page = 1; page <= 30; page++) {
          const res = await authFetch(API + '/health-centers/?active=true&page=' + page, config);
          if (!res.ok) throw new Error('تعذر تحميل قائمة المراكز المعتمدة.');
          const data = await res.json();
          directory.push(...(Array.isArray(data) ? data : data.results || []));
          if (!data.next) break;
        }
        if (!cancelled) { setEmployee(record); setCenters(directory); }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'تعذر فتح الاستكمال.');
      } finally { if (!cancelled) setBusy(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, [open, employeeId]);

  async function submit() {
    if (!employee || !identityChecked || saving || reason.trim().length < 10) return;
    const selected = Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value.trim() !== ''),
    );
    if (!Object.keys(selected).length) { setError('أدخل حقلًا ناقصًا واحدًا على الأقل.'); return; }
    setSaving(true); setError('');
    try {
      const token = getAccessToken();
      if (!token) throw new Error('انتهت جلسة الدخول.');
      const response = await authFetch(API + '/employees/' + employee.id + '/complete-profile/', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: { ...selected, ...(selected.health_center ? { health_center: Number(selected.health_center) } : {}) },
          identity_checked: identityChecked, reason: reason.trim(),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = result.detail || Object.entries(result).map(([k, v]) =>
          k + ': ' + String(v)).join('، ');
        throw new Error(detail || 'تعذر تحديث بيانات الموظف.');
      }
      onUpdated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ البيانات.');
    } finally { setSaving(false); }
  }

  return <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="md" fullWidth
    PaperProps={{ sx: { direction: 'rtl', borderRadius: 3 } }}>
    <DialogTitle fontWeight={900}>استكمال بيانات الموظف أثناء زيارة العيادة</DialogTitle>
    <DialogContent dividers>
      {busy ? <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress/></Box> :
        employee ? <Stack gap={2}>
          <Alert severity="warning">
            حدّث البيانات الناقصة فقط بعد التحقق من هوية المراجع.
            لا يحق لهذا الإجراء تعديل معلومات مثبتة أو نقل موظف مرتبط بمركز آخر.
            يمكن متابعة الزيارة حتى لو بقيت بعض البيانات ناقصة.
          </Alert>
          <Typography fontWeight={900}>{employee.name}</Typography>
          {!employee.health_center && <TextField select fullWidth size="small"
            value={fields.health_center || ''}
            label="اختيار المركز الصحي (إذا تم التحقق منه)"
            helperText={'اسم المركز الوارد في ملف Excel: ' +
              (employee.source_center_name || 'غير محدد')}
            onChange={event => setFields(old => ({ ...old, health_center: event.target.value }))}>
            <MenuItem value="">غير محدد — الاستكمال لاحقًا</MenuItem>
            {centers.map(center => <MenuItem key={center.id} value={String(center.id)}>
              {center.name_ar || center.name}
            </MenuItem>)}
          </TextField>}
          <Grid container spacing={1.5}>
            {FIELDS.filter(item => !String(employee[item.id] ?? '').trim()).map(item =>
              <Grid key={item.id} size={{ xs: 12, sm: 6 }}>
                {item.id === 'gender' || item.id === 'marital_status' ?
                  <TextField select fullWidth size="small" label={item.title}
                    value={fields[item.id] || ''}
                    onChange={e => setFields(old => ({ ...old, [item.id]: e.target.value }))}>
                    <MenuItem value="">غير محدد</MenuItem>
                    {(item.id === 'gender' ? [
                      { value: 'male', label: 'ذكر' }, { value: 'female', label: 'أنثى' },
                    ] : [
                      { value: 'single', label: 'أعزب' }, { value: 'married', label: 'متزوج' },
                      { value: 'divorced', label: 'مطلق' }, { value: 'widowed', label: 'أرمل' },
                    ]).map(option => <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>)}
                  </TextField> :
                  <TextField fullWidth size="small" type={item.type || 'text'}
                    label={item.title} value={fields[item.id] || ''}
                    onChange={e => setFields(old => ({ ...old, [item.id]: e.target.value }))}
                    InputLabelProps={item.type === 'date' ? { shrink: true } : undefined} />}
              </Grid>)}
          </Grid>
          <TextField fullWidth size="small" multiline minRows={2} label="سبب التحديث"
            value={reason} onChange={e => setReason(e.target.value)}
            inputProps={{ maxLength: 500 }}/>
          <FormControlLabel control={<Checkbox checked={identityChecked}
            onChange={(_, checked) => setIdentityChecked(checked)} />}
            label="تحققت من هوية المراجع قبل تحديث بياناته، وأوافق على توثيق الإجراء"/>
        </Stack> : null}
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </DialogContent>
    <DialogActions sx={{ p: 2, gap: 1 }}>
      <Button onClick={onClose} disabled={saving}>إغلاق</Button>
      <Button variant="contained" disabled={!employee || saving || busy ||
        !identityChecked || reason.trim().length < 10 ||
        !Object.values(fields).some(value => value.trim())}
        onClick={() => void submit()}>
        {saving ? 'جارٍ الحفظ...' : 'حفظ البيانات المتاحة'}
      </Button>
    </DialogActions>
  </Dialog>;
}
