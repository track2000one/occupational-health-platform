import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Alert, Box, Button, CircularProgress, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  HealthAndSafety as HealthAndSafetyIcon,
  Print as PrintIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { toast } from 'sonner';
import { getAccessToken } from '../context/AuthContext';
import '../../styles/employee-health-card.css';

const PRODUCTION_API_BASE_URL = 'https://occupational-health-platform-production.up.railway.app/api';
const LOCAL_API_BASE_URL = 'http://localhost:8000/api';
const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? LOCAL_API_BASE_URL
    : PRODUCTION_API_BASE_URL)
).replace(/\/$/, '');

type EmployeeOption = {
  id: string | number;
  name: string;
  employee_number?: string | null;
  national_id?: string;
  health_center_name?: string;
};

type HealthCardData = {
  card_number?: string;
  issue_date?: string;
  next_review_date?: string;
  reviewed_by?: string;
  employee: Record<string, unknown>;
  physical?: Record<string, unknown>;
  conditions?: Record<string, unknown>;
  mental?: Record<string, unknown>;
  follow_up?: Record<string, unknown>;
  vaccinations?: Array<Record<string, unknown>>;
  recommendations?: Record<string, unknown>;
};

function getList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object' && Array.isArray((payload as { results?: unknown }).results)) {
    return (payload as { results: T[] }).results;
  }
  return [];
}

async function apiRequest<T>(path: string): Promise<T> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('لا يوجد رمز دخول من Django. أعد تسجيل الدخول بحساب Backend.');
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.detail || 'تعذر جلب بيانات البطاقة الصحية.');
  }
  return body as T;
}

function value(input: unknown, fallback = '—') {
  if (input === null || input === undefined) return fallback;
  const text = String(input).trim();
  return text || fallback;
}

function yesNo(input: unknown) {
  if (input === true || input === 'true' || input === 'yes' || input === 'Yes') return 'نعم';
  if (input === false || input === 'false' || input === 'no' || input === 'No') return 'لا';
  return value(input);
}

function formatDate(input: unknown) {
  const raw = value(input, '');
  if (!raw) return '—';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { year: 'numeric', month: 'short', day: '2-digit' }).format(date);
}

function maskNationalId(input: unknown) {
  const digits = String(input || '').replace(/\D/g, '');
  if (!digits) return '—';
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 2)}****${digits.slice(-4)}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ohc-field">
      <span className="ohc-field-label">{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

function StatusField({ label, value: fieldValue }: { label: string; value: unknown }) {
  const normalized = String(fieldValue ?? '').toLowerCase();
  const isPositive = ['yes', 'true', 'نعم', 'completed', 'immune', 'موجب'].some(token => normalized.includes(token));
  const isNegative = ['no', 'false', 'لا', 'negative', 'سلبي'].some(token => normalized.includes(token));
  return (
    <div className="ohc-condition-row">
      <span>{label}</span>
      <b>{yesNo(fieldValue)}</b>
      <i className={isPositive ? 'ok' : isNegative ? 'no' : 'neutral'}>{isPositive ? '✓' : isNegative ? '×' : '•'}</i>
    </div>
  );
}

function Section({ number, title, subtitle, color, children }: { number: string; title: string; subtitle?: string; color: string; children: React.ReactNode }) {
  return (
    <section className="ohc-section" style={{ '--section-color': color } as React.CSSProperties}>
      <div className="ohc-section-tab">
        <span>{number}</span>
        <b>{title}</b>
        {subtitle && <small>{subtitle}</small>}
      </div>
      <div className="ohc-section-content">{children}</div>
    </section>
  );
}

export function EmployeeHealthCardPage() {
  const navigate = useNavigate();
  const { employeeId } = useParams();
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(employeeId || '');
  const [card, setCard] = useState<HealthCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const selectedEmployee = useMemo(
    () => employees.find(employee => String(employee.id) === String(selectedEmployeeId)),
    [employees, selectedEmployeeId]
  );

  async function loadEmployees() {
    const payload = await apiRequest<unknown>('/employees/');
    const items = getList<EmployeeOption>(payload);
    setEmployees(items);
    if (!selectedEmployeeId && items[0]) {
      setSelectedEmployeeId(String(items[0].id));
    }
  }

  async function loadCard(id: string) {
    const payload = await apiRequest<HealthCardData>(`/employees/${id}/health_card/`);
    setCard(payload);
  }

  async function refresh(id = selectedEmployeeId) {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      if (!employees.length) await loadEmployees();
      await loadCard(id);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'تعذر تحميل البطاقة الصحية.';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        await loadEmployees();
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : 'تعذر تحميل قائمة الموظفين.';
        setError(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedEmployeeId) void refresh(selectedEmployeeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmployeeId]);

  const employee = card?.employee || selectedEmployee || {};
  const physical = card?.physical || {};
  const conditions = card?.conditions || {};
  const mental = card?.mental || {};
  const followUp = card?.follow_up || {};
  const recommendations = card?.recommendations || {};
  const vaccinationRows = card?.vaccinations?.length ? card.vaccinations : [
    { label: 'Anti-HBs', result: '—', date: '—' },
    { label: 'HBV Vaccine - Dose 1', result: '—', date: '—' },
    { label: 'HBV Vaccine - Dose 2', result: '—', date: '—' },
    { label: 'HBV Vaccine - Dose 3', result: '—', date: '—' },
    { label: 'Rubella IgG', result: '—', date: '—' },
    { label: 'MMR Vaccine', result: '—', date: '—' },
    { label: 'HCV', result: '—', date: '—' },
    { label: 'HIV Test', result: '—', date: '—' },
  ];

  return (
    <Box className="ohc-page" dir="rtl">
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} className="ohc-toolbar no-print">
        <Box>
          <Typography variant="h4" fontWeight={900}>البطاقة الصحية المهنية للموظف</Typography>
          <Typography variant="body2" color="text.secondary">بطاقة مرتبطة ببيانات الموظف الصحية في Django/PostgreSQL</Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate('/employees')}>العودة للموظفين</Button>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => void refresh()}>تحديث</Button>
          <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>طباعة البطاقة</Button>
        </Stack>
      </Stack>

      <Paper className="ohc-selector no-print">
        <TextField
          fullWidth
          select
          label="اختر الموظف"
          value={selectedEmployeeId}
          onChange={event => setSelectedEmployeeId(event.target.value)}
        >
          {employees.map(item => (
            <MenuItem key={item.id} value={String(item.id)}>
              {value(item.name)} — {value(item.employee_number)} — {value(item.health_center_name)}
            </MenuItem>
          ))}
        </TextField>
      </Paper>

      {error && <Alert severity="warning" className="no-print" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && !card ? (
        <Paper sx={{ p: 5, textAlign: 'center' }}>
          <CircularProgress />
          <Typography sx={{ mt: 2 }}>جاري تجهيز البطاقة الصحية...</Typography>
        </Paper>
      ) : (
        <article className="ohc-card-sheet">
          <header className="ohc-card-header">
            <div className="ohc-meta-box">
              <Field label="رقم البطاقة">{value(card?.card_number)}</Field>
              <Field label="تاريخ الإصدار">{formatDate(card?.issue_date)}</Field>
            </div>
            <div className="ohc-qr">QR</div>
            <div className="ohc-title-box">
              <HealthAndSafetyIcon />
              <h1>البطاقة الصحية المهنية للموظف</h1>
              <p>Employee Occupational Health Card 2025</p>
            </div>
            <div className="ohc-employee-name">
              <span>اسم الموظف</span>
              <strong>{value(employee.name)}</strong>
              <small>{value(employee.email)}</small>
            </div>
            <div className="ohc-brand">
              <b>منصة إدارة الصحة المهنية</b>
              <small>Occupational Health Management Platform</small>
              <i>＋</i>
            </div>
          </header>

          <main className="ohc-grid">
            <div className="ohc-left">
              <Section number="1" title="المعلومات الشخصية" subtitle="Personal Information" color="#0b76b7">
                <div className="ohc-fields-grid four">
                  <Field label="الاسم الكامل">{value(employee.name)}</Field>
                  <Field label="رقم الهوية الوطنية">{maskNationalId(employee.national_id)}</Field>
                  <Field label="تاريخ الميلاد">{formatDate(employee.date_of_birth)}</Field>
                  <Field label="العمر">{value(employee.age)}</Field>
                  <Field label="الجنس">{value(employee.gender) === 'female' ? 'أنثى' : 'ذكر'}</Field>
                  <Field label="رقم الجوال">{value(employee.mobile)}</Field>
                  <Field label="الحالة الاجتماعية">{value(employee.marital_status)}</Field>
                  <Field label="مكان الميلاد">{value(employee.birth_place)}</Field>
                  <Field label="العنوان الوطني">{value(employee.national_address)}</Field>
                  <Field label="البريد الإلكتروني">{value(employee.email)}</Field>
                </div>
              </Section>

              <Section number="2" title="معلومات العمل" subtitle="Employment Information" color="#0f9189">
                <div className="ohc-fields-grid four">
                  <Field label="المركز الصحي">{value(employee.health_center_name)}</Field>
                  <Field label="الرقم الوظيفي">{value(employee.employee_number)}</Field>
                  <Field label="المسمى الوظيفي">{value(employee.job_title)}</Field>
                  <Field label="تاريخ التعيين">{formatDate(employee.appointment_date)}</Field>
                  <Field label="سنوات الخبرة">{value(employee.years_of_experience)}</Field>
                  <Field label="الوظيفة الحالية">{value(physical.current_position || employee.job_title)}</Field>
                </div>
              </Section>

              <Section number="3" title="المعلومات البدنية" subtitle="Physical Information" color="#68a844">
                <div className="ohc-fields-grid four">
                  <Field label="الوزن (كجم)">{value(physical.weight_kg)}</Field>
                  <Field label="الطول (سم)">{value(physical.height_cm)}</Field>
                  <Field label="BMI">{value(physical.bmi)}</Field>
                  <Field label="السمنة">{value(physical.obesity_status)}</Field>
                  <Field label="النشاط البدني">{value(physical.physical_activity)}</Field>
                </div>
              </Section>

              <Section number="4" title="الحالات الطبية" subtitle="Medical Conditions" color="#f59b3b">
                <div className="ohc-conditions-grid">
                  <StatusField label="السكري" value={conditions.diabetes} />
                  <StatusField label="ارتفاع الضغط" value={conditions.hypertension} />
                  <StatusField label="الغدة الدرقية" value={conditions.thyroid_disease} />
                  <StatusField label="الربو" value={conditions.asthma} />
                  <StatusField label="اضطرابات الدم" value={conditions.blood_disease} />
                  <StatusField label="التدخين" value={conditions.smoking_status} />
                  <StatusField label="تاريخ العمليات" value={conditions.surgical_history} />
                  <StatusField label="التاريخ العائلي" value={conditions.family_history} />
                  <StatusField label="القيود الصحية" value={conditions.medical_restrictions} />
                  <StatusField label="ملاحظات إضافية" value={conditions.notes} />
                </div>
              </Section>
            </div>

            <div className="ohc-center">
              <Section number="5" title="الصحة النفسية" subtitle="Mental Health" color="#8652a8">
                <div className="ohc-mini-table">
                  <div><b>المقياس</b><b>النتيجة</b><b>التقييم</b></div>
                  <div><span>PHQ</span><span>{value(mental.phq_result)}</span><span>{value(mental.phq_status)}</span></div>
                  <div><span>GAD</span><span>{value(mental.gad_result)}</span><span>{value(mental.gad_status)}</span></div>
                  <div><span>MBI</span><span>{value(mental.mbi_result)}</span><span>{value(mental.mbi_status)}</span></div>
                  <div><span>ملاحظات أخرى</span><span>{value(mental.notes)}</span><span>—</span></div>
                </div>
              </Section>

              <Section number="6" title="المتابعة الصحية" subtitle="Health Follow-up" color="#2389c9">
                <div className="ohc-follow-table">
                  <Field label="آخر زيارة افتراضية">{formatDate(followUp.latest_virtual_visit)}</Field>
                  <Field label="تم الانضمام">{yesNo(followUp.joined)}</Field>
                  <Field label="آخر زيارة ميدانية">{formatDate(followUp.latest_field_visit)}</Field>
                  <Field label="طلب فحوصات مخبرية">{value(followUp.lab_request)}</Field>
                  <Field label="تاريخ طلب الفحوصات">{formatDate(followUp.lab_request_date)}</Field>
                  <Field label="نتيجة الفحوصات">{value(followUp.lab_result)}</Field>
                  <Field label="تاريخ مراجعة النتيجة">{formatDate(followUp.result_checked_date)}</Field>
                  <Field label="تاريخ اختبار PPD">{formatDate(followUp.ppd_date)}</Field>
                  <Field label="نتيجة PPD">{value(followUp.ppd_test)}</Field>
                  <Field label="فحص سرطان القولون">{value(followUp.colon_cancer_screening)}</Field>
                  <Field label="لقاح الإنفلونزا">{value(followUp.flu_vaccine)}</Field>
                  <Field label="COVID-19">{value(followUp.covid_19)}</Field>
                  <Field label="ملاحظات المتابعة">{value(followUp.notes)}</Field>
                </div>
              </Section>
            </div>

            <aside className="ohc-right">
              <Section number="7" title="التحصينات / السيرولوجيا" subtitle="Vaccination / Serology" color="#22b7bb">
                <div className="ohc-vaccine-table">
                  <div className="head"><b>الاختبار / اللقاح</b><b>النتيجة</b><b>التاريخ / ملاحظات</b></div>
                  {vaccinationRows.slice(0, 18).map((row, index) => (
                    <div key={`${value(row.label)}-${index}`}>
                      <span>{value(row.label || row.vaccine_type)}</span>
                      <b>{value(row.result || row.status)}</b>
                      <small>{formatDate(row.date || row.dose_date || row.first_dose_date || row.notes)}</small>
                    </div>
                  ))}
                </div>
              </Section>
            </aside>
          </main>

          <footer className="ohc-card-footer">
            <Section number="8" title="التوصيات" subtitle="Recommendations" color="#0b5f94">
              <div className="ohc-recommendations">
                <Field label="التوصيات الطبية">{value(recommendations.medical)}</Field>
                <Field label="توصيات التطعيم">{value(recommendations.vaccination)}</Field>
                <Field label="تاريخ المراجعة القادمة">{formatDate(card?.next_review_date || recommendations.next_review_date)}</Field>
                <Field label="تمت المراجعة والاعتماد من قبل">{value(card?.reviewed_by || recommendations.reviewed_by)}</Field>
              </div>
            </Section>
            <div className="ohc-confidential">🔒 ملاحظة: هذه البطاقة سرية وتستخدم لأغراض المتابعة الصحية المهنية فقط.</div>
          </footer>
        </article>
      )}
    </Box>
  );
}
