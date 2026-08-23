import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  Grid,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Download as DownloadIcon,
  Edit as EditIcon,
  ExpandMore as ExpandMoreIcon,
  HealthAndSafety as HealthAndSafetyIcon,
  Image as ImageIcon,
  Print as PrintIcon,
  Refresh as RefreshIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import { toast } from 'sonner';
import logoImg from '@/imports/ChatGPT_Image_21______2026__10_06_18__.png';
import { EmployeeQuickSearch, type EmployeeSearchOption } from '../components/EmployeeQuickSearch';
import { CalendarDateField } from '../components/CalendarDateField';
import { getAccessToken, useAuth } from '../context/AuthContext';
import { useDatePreference } from '../context/DatePreferenceContext';
import '../../styles/employee-health-card.css';

const PRODUCTION_API_BASE_URL = 'https://occupational-health-platform-production.up.railway.app/api';
const LOCAL_API_BASE_URL = 'http://localhost:8000/api';
const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? LOCAL_API_BASE_URL
    : PRODUCTION_API_BASE_URL)
).replace(/\/$/, '');

type SectionKey =
  | 'personal'
  | 'employment'
  | 'physical'
  | 'conditions'
  | 'mental'
  | 'follow_up'
  | 'vaccinations'
  | 'recommendations'
  | 'additional';

type FieldKind = 'text' | 'date' | 'number' | 'select' | 'textarea';

type FieldDefinition = {
  key: string;
  label: string;
  en?: string;
  kind?: FieldKind;
  options?: Array<{ value: string; label: string }>;
};

type SectionData = Record<SectionKey, Record<string, string>>;

type EmployeeData = {
  id?: string | number;
  name?: string;
  email?: string;
  national_id?: string;
  employee_number?: string;
  national_address?: string;
  mobile?: string;
  date_of_birth?: string;
  birth_place?: string;
  age?: number | string;
  gender?: string;
  marital_status?: string;
  health_center_name?: string;
  job_title?: string;
  appointment_date?: string;
  years_of_experience?: string | number;
};

type HealthCardData = {
  id?: string | number | null;
  exists?: boolean;
  card_number?: string;
  issue_date?: string;
  next_review_date?: string;
  reviewed_by?: string;
  is_approved?: boolean;
  updated_at?: string | null;
  employee: EmployeeData;
  data?: Partial<SectionData>;
  personal?: Record<string, unknown>;
  employment?: Record<string, unknown>;
  physical?: Record<string, unknown>;
  conditions?: Record<string, unknown>;
  mental?: Record<string, unknown>;
  follow_up?: Record<string, unknown>;
  vaccinations?: Record<string, unknown>;
  recommendations?: Record<string, unknown>;
  additional?: Record<string, unknown>;
};

const YES_NO_OPTIONS = [
  { value: '', label: 'غير محدد' },
  { value: 'Yes', label: 'نعم' },
  { value: 'No', label: 'لا' },
  { value: 'N/A', label: 'لا ينطبق' },
];

const PERSONAL_FIELDS: FieldDefinition[] = [
  { key: 'children_count', label: 'عدد الأبناء', en: 'No. of Children', kind: 'number' },
  { key: 'spouse_name', label: 'اسم الزوج/الزوجة (اختياري)', en: 'Spouse Name' },
];

const EMPLOYMENT_FIELDS: FieldDefinition[] = [
  { key: 'moh_id', label: 'رقم وزارة الصحة', en: 'MOH ID' },
  { key: 'current_position', label: 'الوظيفة الحالية', en: 'Current Job' },
];

const PHYSICAL_FIELDS: FieldDefinition[] = [
  { key: 'weight_kg', label: 'الوزن (كجم)', en: 'Weight (kg)', kind: 'number' },
  { key: 'height_cm', label: 'الطول (سم)', en: 'Height (cm)', kind: 'number' },
  { key: 'bmi', label: 'مؤشر كتلة الجسم BMI', en: 'BMI', kind: 'number' },
  { key: 'obesity_status', label: 'تصنيف الوزن/السمنة', en: 'Obesity' },
  { key: 'physical_activity', label: 'النشاط البدني', en: 'Physical Exercise' },
  { key: 'activity_level', label: 'مستوى النشاط', en: 'Activity Level' },
];

const CONDITION_FIELDS: FieldDefinition[] = [
  { key: 'diabetes', label: 'السكري', en: 'Diabetes Mellitus', kind: 'select', options: YES_NO_OPTIONS },
  { key: 'hypertension', label: 'ارتفاع ضغط الدم', en: 'Hypertension', kind: 'select', options: YES_NO_OPTIONS },
  { key: 'thyroid_disease', label: 'أمراض الغدة الدرقية', en: 'Thyroid', kind: 'select', options: YES_NO_OPTIONS },
  { key: 'asthma', label: 'الربو', en: 'Asthma', kind: 'select', options: YES_NO_OPTIONS },
  { key: 'ms_disorder', label: 'اضطرابات الجهاز العضلي', en: 'MS Disorder', kind: 'select', options: YES_NO_OPTIONS },
  { key: 'chronic_disease', label: 'أمراض مزمنة أخرى', en: 'Any Chronic Disease' },
  { key: 'blood_disease', label: 'اضطرابات الدم', en: 'Blood Disorder', kind: 'select', options: YES_NO_OPTIONS },
  { key: 'smoking_status', label: 'حالة التدخين', en: 'Smoking' },
  { key: 'surgical_history', label: 'وجود تاريخ عمليات', en: 'Surgical History', kind: 'select', options: YES_NO_OPTIONS },
  { key: 'surgical_details', label: 'تفاصيل العمليات', en: 'Surgical Hx (if any)', kind: 'textarea' },
  { key: 'family_history', label: 'التاريخ العائلي/الحساسية', en: 'Other + Family Hx', kind: 'textarea' },
  { key: 'allergy_history', label: 'تاريخ الحساسية', en: 'Allergy History', kind: 'textarea' },
  { key: 'colon_cancer_history', label: 'تاريخ سرطان القولون', en: 'Colon Cancer Hx', kind: 'select', options: YES_NO_OPTIONS },
  { key: 'breast_cancer_history', label: 'تاريخ سرطان الثدي', en: 'Breast Cancer Hx', kind: 'select', options: YES_NO_OPTIONS },
  { key: 'other_cancer_history', label: 'تاريخ أورام أخرى', en: 'Other Cancer Hx', kind: 'select', options: YES_NO_OPTIONS },
  { key: 'needle_stick_history', label: 'تاريخ وخز الإبر', en: 'Needle Stick Hx', kind: 'select', options: YES_NO_OPTIONS },
  { key: 'medical_restrictions', label: 'القيود الطبية', en: 'Restrictions', kind: 'textarea' },
  { key: 'other_conditions', label: 'حالات/ملاحظات طبية أخرى', en: 'Other Conditions', kind: 'textarea' },
  { key: 'metabolic_syndrome', label: 'متلازمة التمثيل الغذائي', en: 'Metabolic Syndrome', kind: 'select', options: YES_NO_OPTIONS },
  { key: 'regular_medication', label: 'أدوية منتظمة', en: 'Regular Medication', kind: 'textarea' },
];

const MENTAL_FIELDS: FieldDefinition[] = [
  { key: 'phq_result', label: 'نتيجة PHQ (الاكتئاب)', en: 'PHQ Result', kind: 'number' },
  { key: 'gad_result', label: 'نتيجة GAD (القلق)', en: 'GAD Result', kind: 'number' },
  { key: 'mbi_result', label: 'نتيجة MBI (الاحتراق)', en: 'MBI Result', kind: 'number' },
  { key: 'other_psychological', label: 'ملاحظات نفسية أخرى', en: 'Other Psychological', kind: 'textarea' },
  { key: 'depression', label: 'الاكتئاب', en: 'Depression', kind: 'select', options: YES_NO_OPTIONS },
  { key: 'anxiety', label: 'القلق', en: 'Anxiety', kind: 'select', options: YES_NO_OPTIONS },
  { key: 'burnout', label: 'الإنهاك الوظيفي', en: 'Burnout', kind: 'select', options: YES_NO_OPTIONS },
  { key: 'sleep_disorder', label: 'اضطراب النوم', en: 'Sleep Disorder', kind: 'select', options: YES_NO_OPTIONS },
  { key: 'other_risks', label: 'مخاطر نفسية أخرى', en: 'Other Risks', kind: 'textarea' },
];

const FOLLOW_UP_FIELDS: FieldDefinition[] = [
  { key: 'latest_virtual_visit', label: 'آخر زيارة افتراضية', en: 'Latest Virtual Visit', kind: 'date' },
  { key: 'joined', label: 'ملتحق بالبرنامج', en: 'Joined', kind: 'select', options: YES_NO_OPTIONS },
  { key: 'latest_field_visit', label: 'آخر زيارة ميدانية', en: 'Latest Field Visit', kind: 'date' },
  { key: 'lab_request', label: 'طلب فحوصات مخبرية', en: 'LAB Request' },
  { key: 'lab_request_date', label: 'تاريخ طلب الفحوصات', en: 'LAB Request Date', kind: 'date' },
  { key: 'lab_result', label: 'نتيجة الفحوصات', en: 'LAB Result' },
  { key: 'result_checked_date', label: 'تاريخ مراجعة النتيجة', en: 'Result Checked Date', kind: 'date' },
  { key: 'ppd_date', label: 'تاريخ اختبار PPD', en: 'Date of PPD Test', kind: 'date' },
  { key: 'ppd_test', label: 'نتيجة اختبار PPD', en: 'PPD Test' },
  { key: 'breast_cancer_screening', label: 'فحص سرطان الثدي', en: 'Breast Cancer Screening' },
  { key: 'colon_cancer_screening', label: 'فحص سرطان القولون', en: 'Colon Cancer Screening' },
  { key: 'flu_vaccine', label: 'لقاح الإنفلونزا', en: 'FLU Vaccine' },
  { key: 'mcv4_vaccine', label: 'لقاح MCV4', en: 'MCV4 Vaccine' },
  { key: 'covid_19', label: 'لقاح COVID-19', en: 'COVID-19 Vaccination' },
  { key: 'other_vaccine', label: 'لقاحات أخرى', en: 'Other Vaccine' },
  { key: 'notes', label: 'ملاحظات المتابعة', en: 'Follow-up Notes', kind: 'textarea' },
];

const VACCINATION_FIELDS: FieldDefinition[] = [
  { key: 'anti_hbs', label: 'أجسام مضادة Anti-HBs', en: 'Anti-HBs' },
  { key: 'hbv_vaccine', label: 'لقاح التهاب الكبد B', en: 'HBV Vaccine' },
  { key: 'hbv_dose_1', label: 'HBV الجرعة الأولى', en: 'HBV Dose 1', kind: 'date' },
  { key: 'hbv_dose_2', label: 'HBV الجرعة الثانية', en: 'HBV Dose 2', kind: 'date' },
  { key: 'hbv_dose_3', label: 'HBV الجرعة الثالثة', en: 'HBV Dose 3', kind: 'date' },
  { key: 'post_vaccine_anti_hbs', label: 'Anti-HBs بعد التطعيم', en: 'Post Vac. Anti-HBs' },
  { key: 'post_vaccine_anti_hbs_date', label: 'تاريخ Anti-HBs بعد التطعيم', en: 'Post Vac. Anti-HBs Date', kind: 'date' },
  { key: 'rubella_igg', label: 'Rubella IgG', en: 'Rubella IgG' },
  { key: 'mmr_vaccine', label: 'لقاح MMR', en: 'MMR Vaccine' },
  { key: 'mmr_dose_1', label: 'MMR الجرعة الأولى', en: 'MMR Dose 1', kind: 'date' },
  { key: 'mmr_dose_2', label: 'MMR الجرعة الثانية', en: 'MMR Dose 2', kind: 'date' },
  { key: 'influenza_vaccine', label: 'لقاح الإنفلونزا', en: 'Influenza Vaccine' },
  { key: 'hpv_vaccine', label: 'لقاح HPV', en: 'HPV Vaccine' },
  { key: 'hbsag', label: 'HBsAg', en: 'HBsAg' },
  { key: 'hcv', label: 'التهاب الكبد C', en: 'HCV' },
  { key: 'hiv', label: 'فحص HIV', en: 'HIV Test' },
  { key: 'measles_igg', label: 'Measles IgG', en: 'Measles IgG' },
  { key: 'mumps_igg', label: 'Mumps IgG', en: 'Mumps IgG' },
  { key: 'varicella_igg', label: 'Varicella IgG', en: 'Varicella IgG' },
  { key: 'tetanus_vaccine', label: 'لقاح الكزاز Td/Tdap', en: 'Tetanus Vaccine' },
  { key: 'covid_booster', label: 'الجرعة المنشطة COVID-19', en: 'COVID-19 Booster' },
  { key: 'other_immunization', label: 'تحصينات أخرى', en: 'Other Immunization' },
  { key: 'notes', label: 'ملاحظات التطعيم', en: 'Vaccination Notes', kind: 'textarea' },
];

const RECOMMENDATION_FIELDS: FieldDefinition[] = [
  { key: 'medical', label: 'التوصيات الطبية', en: 'Medical Recommendations', kind: 'textarea' },
  { key: 'vaccination', label: 'توصيات التطعيم', en: 'Vaccination Recommendations', kind: 'textarea' },
];

const ADDITIONAL_FIELDS: FieldDefinition[] = [
  { key: 'pi_spare_1', label: 'PI-Spare1' },
  { key: 'pi_spare_2', label: 'PI-Spare2' },
  { key: 'ei_spare_1', label: 'EI-Spare1' },
  { key: 'ei_spare_2', label: 'EI-Spare2' },
  { key: 'physical_spare', label: 'PhI-Spare' },
  { key: 'medical_spare_1', label: 'MC-Spare1' },
  { key: 'nsi', label: 'NSI' },
  { key: 'medical_spare_3', label: 'MC-Spare3' },
  { key: 'mental_spare', label: 'MH-Spare' },
  { key: 'follow_up_spare_1', label: 'HF-Spare1' },
  { key: 'follow_up_spare_2', label: 'HF-Spare2' },
  { key: 'follow_up_spare_3', label: 'HF-Spare3' },
  { key: 'comments', label: 'التعليقات العامة', en: 'Comments', kind: 'textarea' },
];

const SECTION_FIELDS: Record<SectionKey, FieldDefinition[]> = {
  personal: PERSONAL_FIELDS,
  employment: EMPLOYMENT_FIELDS,
  physical: PHYSICAL_FIELDS,
  conditions: CONDITION_FIELDS,
  mental: MENTAL_FIELDS,
  follow_up: FOLLOW_UP_FIELDS,
  vaccinations: VACCINATION_FIELDS,
  recommendations: RECOMMENDATION_FIELDS,
  additional: ADDITIONAL_FIELDS,
};

const EDITABLE_ROLES = new Set(['systemAdmin', 'ohManager', 'ohDoctor', 'clinicDoctor', 'dataEntry']);

function createEmptySections(): SectionData {
  return Object.fromEntries(
    (Object.keys(SECTION_FIELDS) as SectionKey[]).map(section => [
      section,
      Object.fromEntries(SECTION_FIELDS[section].map(field => [field.key, ''])),
    ])
  ) as SectionData;
}

function stringifyValue(input: unknown): string {
  if (input === null || input === undefined) return '';
  if (input === true) return 'Yes';
  if (input === false) return 'No';
  return String(input);
}

function normalizeSections(card: HealthCardData): SectionData {
  const empty = createEmptySections();
  const source = card.data || {};
  (Object.keys(empty) as SectionKey[]).forEach(section => {
    const legacy = card[section];
    const values = source[section] || (legacy && typeof legacy === 'object' ? legacy : {});
    Object.entries(values || {}).forEach(([key, fieldValue]) => {
      empty[section][key] = stringifyValue(fieldValue);
    });
  });
  return empty;
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  if (!token) throw new Error('لا يوجد رمز دخول من Django. أعد تسجيل الدخول بحساب Backend.');
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.detail || body?.data || body?.next_review_date || 'تعذر تنفيذ طلب البطاقة الصحية.';
    throw new Error(Array.isArray(detail) ? detail.join('، ') : String(detail));
  }
  return body as T;
}

function value(input: unknown, fallback = '—') {
  const text = stringifyValue(input).trim();
  return text || fallback;
}

function localizedGender(input: unknown) {
  return String(input).toLowerCase() === 'female' ? 'أنثى / Female' : 'ذكر / Male';
}

function localizedMarital(input: unknown) {
  const map: Record<string, string> = {
    single: 'أعزب / Single', married: 'متزوج / Married', divorced: 'مطلق / Divorced', widowed: 'أرمل / Widowed',
  };
  return map[String(input || '').toLowerCase()] || value(input);
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function inlineCloneImages(clone: HTMLElement) {
  const images = Array.from(clone.querySelectorAll('img'));
  await Promise.all(images.map(async image => {
    if (!image.src || image.src.startsWith('data:')) return;
    try {
      const response = await fetch(image.src);
      if (!response.ok) return;
      image.src = await blobToDataUrl(await response.blob());
    } catch {
      // The card remains exportable even if an optional logo cannot be inlined.
    }
  }));
}

function collectPageCss() {
  return Array.from(document.styleSheets).map(sheet => {
    try {
      return Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n');
    } catch {
      return '';
    }
  }).join('\n');
}

function escapeXmlText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function loadExportImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('تعذر تحويل البطاقة إلى صورة. يرجى تحديث الصفحة والمحاولة مرة أخرى.'));
    image.src = source;
  });
}

async function elementToPng(element: HTMLElement, pixelRatio = 2): Promise<string> {
  const width = Math.ceil(Math.max(element.scrollWidth, element.getBoundingClientRect().width));
  const height = Math.ceil(Math.max(element.scrollHeight, element.getBoundingClientRect().height));
  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.width = `${width}px`;
  clone.style.maxWidth = 'none';
  clone.style.margin = '0';
  await inlineCloneImages(clone);

  const serialized = new XMLSerializer().serializeToString(clone);
  // Stylesheets can contain XML-sensitive text such as Tailwind's `&` nested
  // selectors. Inserting raw CSS into an SVG makes the whole source invalid,
  // which causes Chromium's "The source image cannot be decoded" error.
  const safeCss = escapeXmlText(collectPageCss());
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml">
          <style>${safeCss}</style>
          ${serialized}
        </div>
      </foreignObject>
    </svg>`;
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = await loadExportImage(svgUrl);
    const canvas = document.createElement('canvas');
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('تعذر إنشاء Canvas لصورة البطاقة.');
    context.scale(pixelRatio, pixelRatio);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/png', 1);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function CardCode({ seed }: { seed: string }) {
  const cells = useMemo(() => {
    let hash = 2166136261;
    for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    return Array.from({ length: 121 }, (_, index) => {
      const row = Math.floor(index / 11);
      const column = index % 11;
      const finder = (
        (row < 4 && column < 4) ||
        (row < 4 && column > 6) ||
        (row > 6 && column < 4)
      );
      if (finder) {
        const localRow = row > 6 ? row - 7 : row;
        const localColumn = column > 6 ? column - 7 : column;
        return localRow === 0 || localRow === 3 || localColumn === 0 || localColumn === 3 || (localRow === 2 && localColumn === 2);
      }
      hash = Math.imul(hash ^ (index + 31), 16777619);
      return (hash >>> 0) % 3 !== 0;
    });
  }, [seed]);
  return <div className="ohc-card-code" aria-label="رمز البطاقة">{cells.map((filled, index) => <i key={index} className={filled ? 'filled' : ''} />)}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ohc-field">
      <span className="ohc-field-label">{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

function StatusField({ label, fieldValue }: { label: string; fieldValue: unknown }) {
  const normalized = String(fieldValue ?? '').toLowerCase();
  const positive = ['yes', 'true', 'نعم', 'positive', 'immune', 'محصن', 'موجب'].some(token => normalized.includes(token));
  const negative = ['no', 'false', 'لا', 'negative', 'سلبي'].some(token => normalized.includes(token));
  return (
    <div className="ohc-condition-row">
      <span>{label}</span>
      <b>{value(fieldValue)}</b>
      <i className={positive ? 'ok' : negative ? 'no' : 'neutral'}>{positive ? '✓' : negative ? '×' : '•'}</i>
    </div>
  );
}

function Section({ number, title, subtitle, color, children }: { number: string; title: string; subtitle: string; color: string; children: React.ReactNode }) {
  return (
    <section className="ohc-section" style={{ '--section-color': color } as React.CSSProperties}>
      <div className="ohc-section-tab">
        <span>{number}</span>
        <b>{title}</b>
        <small>{subtitle}</small>
      </div>
      <div className="ohc-section-content">{children}</div>
    </section>
  );
}

function HealthCardSheet({ card, form }: { card: HealthCardData; form: SectionData }) {
  const { formatDate } = useDatePreference();
  const employee = card.employee || {};
  const conditionRows = CONDITION_FIELDS.filter(field => !['surgical_details', 'family_history', 'allergy_history', 'medical_restrictions', 'other_conditions', 'regular_medication'].includes(field.key));
  const vaccineRows = VACCINATION_FIELDS.filter(field => field.key !== 'notes');

  return (
    <article className="ohc-card-sheet">
      <header className="ohc-card-header">
        <div className="ohc-meta-box">
          <Field label="رقم البطاقة / Card No.">{value(card.card_number)}</Field>
          <Field label="تاريخ الإصدار / Issue Date">{formatDate(card.issue_date)}</Field>
        </div>
        <div className="ohc-qr"><CardCode seed={value(card.card_number, 'EHC')} /></div>
        <div className="ohc-title-box">
          <HealthAndSafetyIcon />
          <h1>البطاقة الصحية للموظف</h1>
          <p>Employee Occupational Health Card {formatDate(card.issue_date, { year: 'numeric' })}</p>
        </div>
        <div className="ohc-employee-name">
          <span>اسم الموظف / Employee Name</span>
          <strong>{value(employee.name)}</strong>
          <small>{value(employee.email)}</small>
        </div>
        <div className="ohc-brand">
          <img src={logoImg} alt="الشعار" />
          <b>{value(employee.health_center_name, 'مركز الرعاية الصحية')}</b>
          <small>Occupational Health Management Platform</small>
        </div>
      </header>

      <main className="ohc-grid">
        <div className="ohc-left">
          <Section number="1" title="المعلومات الشخصية" subtitle="Personal Information" color="#0b76b7">
            <div className="ohc-fields-grid four">
              <Field label="رقم الهوية / National ID">{value(employee.national_id)}</Field>
              <Field label="الاسم / Name">{value(employee.name)}</Field>
              <Field label="تاريخ الميلاد / Date of Birth">{formatDate(employee.date_of_birth)}</Field>
              <Field label="العمر / Age">{value(employee.age)}</Field>
              <Field label="الجوال / Mobile">{value(employee.mobile)}</Field>
              <Field label="الجنس / Gender">{localizedGender(employee.gender)}</Field>
              <Field label="الحالة الاجتماعية / Marital Status">{localizedMarital(employee.marital_status)}</Field>
              <Field label="عدد الأبناء / Children">{value(form.personal.children_count)}</Field>
              <Field label="اسم الزوج/الزوجة / Spouse">{value(form.personal.spouse_name)}</Field>
              <Field label="مكان الميلاد / Birth Place">{value(employee.birth_place)}</Field>
              <Field label="العنوان الوطني / National Address">{value(employee.national_address)}</Field>
              <Field label="البريد الإلكتروني / Email">{value(employee.email)}</Field>
            </div>
          </Section>

          <Section number="2" title="معلومات العمل" subtitle="Employment Information" color="#0f9189">
            <div className="ohc-fields-grid four">
              <Field label="المركز الصحي / Health Center">{value(employee.health_center_name)}</Field>
              <Field label="الرقم الوظيفي / Employee ID">{value(employee.employee_number)}</Field>
              <Field label="رقم وزارة الصحة / MOH ID">{value(form.employment.moh_id)}</Field>
              <Field label="تاريخ التعيين / Start Date">{formatDate(employee.appointment_date)}</Field>
              <Field label="المسمى الوظيفي / Job Title">{value(employee.job_title)}</Field>
              <Field label="سنوات الخبرة / Experience">{value(employee.years_of_experience)}</Field>
              <Field label="الوظيفة الحالية / Current Job">{value(form.employment.current_position)}</Field>
            </div>
          </Section>

          <Section number="3" title="المعلومات البدنية" subtitle="Physical Information" color="#68a844">
            <div className="ohc-fields-grid three">
              {PHYSICAL_FIELDS.map(field => <Field key={field.key} label={`${field.label} / ${field.en || ''}`}>{value(form.physical[field.key])}</Field>)}
            </div>
          </Section>

          <Section number="4" title="الحالات الطبية" subtitle="Medical Conditions" color="#f59b3b">
            <div className="ohc-conditions-grid">
              {conditionRows.map(field => <StatusField key={field.key} label={field.label} fieldValue={form.conditions[field.key]} />)}
            </div>
            <div className="ohc-fields-grid two ohc-medical-notes">
              <Field label="تفاصيل العمليات">{value(form.conditions.surgical_details)}</Field>
              <Field label="التاريخ العائلي">{value(form.conditions.family_history)}</Field>
              <Field label="الحساسية">{value(form.conditions.allergy_history)}</Field>
              <Field label="القيود الطبية">{value(form.conditions.medical_restrictions)}</Field>
              <Field label="أدوية منتظمة">{value(form.conditions.regular_medication)}</Field>
              <Field label="حالات أخرى">{value(form.conditions.other_conditions)}</Field>
            </div>
          </Section>
        </div>

        <div className="ohc-center">
          <Section number="5" title="الصحة النفسية" subtitle="Mental Health" color="#8652a8">
            <div className="ohc-mini-table">
              {MENTAL_FIELDS.map(field => (
                <div key={field.key}><b>{field.label}</b><span>{value(form.mental[field.key])}</span><i>●</i></div>
              ))}
            </div>
          </Section>

          <Section number="6" title="المتابعة الصحية" subtitle="Health Follow-up" color="#2389c9">
            <div className="ohc-follow-table">
              {FOLLOW_UP_FIELDS.map(field => (
                <Field key={field.key} label={`${field.label}${field.en ? ` / ${field.en}` : ''}`}>
                  {field.kind === 'date' ? formatDate(form.follow_up[field.key]) : value(form.follow_up[field.key])}
                </Field>
              ))}
            </div>
          </Section>
        </div>

        <aside className="ohc-right">
          <Section number="7" title="التطعيمات والمناعة" subtitle="Vaccinations & Immunity" color="#22b7bb">
            <div className="ohc-vaccine-table">
              <div className="head"><b>الفحص / اللقاح</b><b>النتيجة أو التاريخ</b><b>الحالة</b></div>
              {vaccineRows.map(field => {
                const result = form.vaccinations[field.key];
                return (
                  <div key={field.key}>
                    <span>{field.label}</span>
                    <b>{field.kind === 'date' ? formatDate(result) : value(result)}</b>
                    <small>{result ? '✓' : '—'}</small>
                  </div>
                );
              })}
              <div><span>ملاحظات / Notes</span><b>{value(form.vaccinations.notes)}</b><small>—</small></div>
            </div>
          </Section>
        </aside>
      </main>

      <footer className="ohc-card-footer">
        <Section number="8" title="التوصيات" subtitle="Recommendations" color="#0b5f94">
          <div className="ohc-recommendations">
            <Field label="التوصيات الطبية / Medical Recommendations">{value(form.recommendations.medical)}</Field>
            <Field label="توصيات التطعيم / Vaccination Recommendations">{value(form.recommendations.vaccination)}</Field>
            <Field label="تاريخ المراجعة القادمة / Next Review">{formatDate(card.next_review_date)}</Field>
            <Field label="مراجعة واعتماد / Reviewed By">{value(card.reviewed_by)}</Field>
          </div>
        </Section>
        <div className="ohc-additional-grid">
          {ADDITIONAL_FIELDS.filter(field => form.additional[field.key]).map(field => (
            <Field key={field.key} label={field.label}>{value(form.additional[field.key])}</Field>
          ))}
        </div>
        <div className="ohc-confidential">
          <span>ⓘ هذه البطاقة سرية وتستخدم لأغراض المتابعة الصحية المهنية فقط.</span>
          <span>Confidential — Occupational health follow-up use only.</span>
        </div>
      </footer>
    </article>
  );
}

function FormSection({
  title,
  subtitle,
  fields,
  values,
  onChange,
  defaultExpanded = false,
}: {
  title: string;
  subtitle: string;
  fields: FieldDefinition[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  defaultExpanded?: boolean;
}) {
  return (
    <Accordion defaultExpanded={defaultExpanded} disableGutters className="ohc-form-accordion">
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box>
          <Typography fontWeight={900}>{title}</Typography>
          <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Grid container spacing={1.5}>
          {fields.map(field => (
            <Grid key={field.key} size={{ xs: 12, sm: field.kind === 'textarea' ? 12 : 6, lg: field.kind === 'textarea' ? 6 : 4 }}>
              {field.kind === 'date' ? (
                <CalendarDateField
                  label={field.en ? `${field.label} / ${field.en}` : field.label}
                  value={values[field.key] || ''}
                  onChange={fieldValue => onChange(field.key, fieldValue)}
                />
              ) : (
                <TextField
                  fullWidth
                  select={field.kind === 'select'}
                  type={field.kind === 'number' ? 'number' : 'text'}
                  multiline={field.kind === 'textarea'}
                  minRows={field.kind === 'textarea' ? 2 : undefined}
                  label={field.en ? `${field.label} / ${field.en}` : field.label}
                  value={values[field.key] || ''}
                  onChange={event => onChange(field.key, event.target.value)}
                >
                  {field.options?.map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
                </TextField>
              )}
            </Grid>
          ))}
        </Grid>
      </AccordionDetails>
    </Accordion>
  );
}

export function EmployeeHealthCardPage() {
  const navigate = useNavigate();
  const { employeeId } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { formatDate } = useDatePreference();
  const requestedEditMode = searchParams.get('mode') === 'edit';
  const cardRef = useRef<HTMLElement | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(employeeId || '');
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeSearchOption | null>(null);
  const [card, setCard] = useState<HealthCardData | null>(null);
  const [form, setForm] = useState<SectionData>(() => createEmptySections());
  const [issueDate, setIssueDate] = useState('');
  const [nextReviewDate, setNextReviewDate] = useState('');
  const [reviewedBy, setReviewedBy] = useState('');
  const [isApproved, setIsApproved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generateAfterSave, setGenerateAfterSave] = useState(false);
  const [cardImage, setCardImage] = useState('');
  const [error, setError] = useState('');

  const canEdit = Boolean(user?.role && EDITABLE_ROLES.has(user.role));

  const employeeLabel = useMemo(() => {
    const employee = card?.employee || selectedEmployee;
    return employee ? `${value(employee.name)} — ${value((employee as EmployeeData).employee_number)}` : '';
  }, [card?.employee, selectedEmployee]);

  const applyCard = useCallback((payload: HealthCardData) => {
    setCard(payload);
    setForm(normalizeSections(payload));
    setIssueDate(payload.issue_date || new Date().toISOString().slice(0, 10));
    setNextReviewDate(payload.next_review_date || '');
    setReviewedBy(payload.reviewed_by || user?.name || '');
    setIsApproved(Boolean(payload.is_approved));
    setCardImage('');
  }, [user?.name]);

  const loadCard = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const payload = await apiRequest<HealthCardData>(`/employees/${id}/health_card/`);
      applyCard(payload);
      setSelectedEmployee({
        id: payload.employee.id || id,
        name: payload.employee.name || '',
        email: payload.employee.email,
        national_id: payload.employee.national_id,
        employee_number: payload.employee.employee_number,
        mobile: payload.employee.mobile,
        job_title: payload.employee.job_title,
        health_center_name: payload.employee.health_center_name,
      });
      // View always renders the complete visual card, even before its optional
      // clinical fields are saved. The explicit Edit action opens the form.
      setEditing(requestedEditMode);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'تعذر تحميل البطاقة الصحية.';
      setError(message);
      setCard(null);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [applyCard, requestedEditMode]);

  useEffect(() => {
    if (selectedEmployeeId) void loadCard(selectedEmployeeId);
  }, [loadCard, selectedEmployeeId]);

  const captureCard = useCallback(async () => {
    setCardImage('');
    setGeneratingImage(true);
    await new Promise(resolve => window.setTimeout(resolve, 80));
    try {
      if (!cardRef.current) throw new Error('تعذر العثور على معاينة البطاقة.');
      const image = await elementToPng(cardRef.current, 2);
      setCardImage(image);
      return image;
    } catch (captureError) {
      const message = captureError instanceof Error ? captureError.message : 'تعذر إنشاء صورة البطاقة.';
      toast.error(message);
      return '';
    } finally {
      setGeneratingImage(false);
    }
  }, []);

  useEffect(() => {
    if (!generateAfterSave || !card) return;
    setGenerateAfterSave(false);
    void captureCard();
  }, [card, captureCard, generateAfterSave]);

  function updateSection(section: SectionKey, key: string, fieldValue: string) {
    setForm(previous => {
      const next = {
        ...previous,
        [section]: { ...previous[section], [key]: fieldValue },
      };
      if (section === 'physical' && (key === 'weight_kg' || key === 'height_cm')) {
        const weight = Number(next.physical.weight_kg);
        const heightCm = Number(next.physical.height_cm);
        if (weight > 0 && heightCm > 0) {
          const bmi = weight / ((heightCm / 100) ** 2);
          next.physical.bmi = bmi.toFixed(1);
          next.physical.obesity_status = bmi < 18.5 ? 'نقص وزن' : bmi < 25 ? 'طبيعي' : bmi < 30 ? 'زيادة وزن' : 'سمنة';
        }
      }
      return next;
    });
  }

  async function handleSave() {
    if (!selectedEmployeeId) {
      toast.error('يرجى اختيار الموظف أولًا.');
      return;
    }
    if (!issueDate) {
      toast.error('تاريخ إصدار البطاقة مطلوب.');
      return;
    }
    setSaving(true);
    try {
      const payload = await apiRequest<HealthCardData>(`/employees/${selectedEmployeeId}/health_card/`, {
        method: 'PUT',
        body: JSON.stringify({
          issue_date: issueDate,
          next_review_date: nextReviewDate || null,
          reviewed_by: reviewedBy.trim(),
          is_approved: isApproved,
          data: form,
        }),
      });
      applyCard(payload);
      setEditing(false);
      setGenerateAfterSave(true);
      toast.success('تم حفظ البطاقة الصحية في Django/PostgreSQL وتجهيزها كصورة.');
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'تعذر حفظ البطاقة الصحية.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function downloadImage() {
    const image = cardImage || await captureCard();
    if (!image || !card) return;
    const link = document.createElement('a');
    link.download = `${card.card_number || `employee-health-card-${selectedEmployeeId}`}.png`;
    link.href = image;
    link.click();
  }

  function handleEmployeeChange(id: string, employee: EmployeeSearchOption | null) {
    setSelectedEmployeeId(id);
    setSelectedEmployee(employee);
    setCard(null);
    setCardImage('');
    setEditing(false);
    if (id) navigate(`/employees/${id}/health-card${requestedEditMode ? '?mode=edit' : ''}`, { replace: true });
    else navigate('/employee-health-card', { replace: true });
  }

  return (
    <Box className="ohc-page" dir="rtl">
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'center' }} className="ohc-toolbar no-print">
        <Box>
          <Typography variant="h4" fontWeight={950}>البطاقة الصحية</Typography>
          <Typography variant="body2" color="text.secondary">بطاقة مستقلة لكل موظف — محفوظة في Django/PostgreSQL ومتاحة كصورة PNG</Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate('/employees')}>الموظفون</Button>
          {selectedEmployeeId && <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => void loadCard(selectedEmployeeId)} disabled={loading}>تحديث</Button>}
          {card && canEdit && <Button variant="outlined" startIcon={<EditIcon />} onClick={() => { setCardImage(''); setEditing(true); }}>تعبئة/تعديل</Button>}
          {card && !editing && <Button variant="outlined" startIcon={<ImageIcon />} onClick={() => void captureCard()} disabled={generatingImage}>عرض كصورة</Button>}
          {card && !editing && <Button variant="contained" startIcon={<DownloadIcon />} onClick={() => void downloadImage()} disabled={generatingImage}>تنزيل PNG</Button>}
          {card && !editing && <Button variant="outlined" startIcon={<PrintIcon />} onClick={() => window.print()}>طباعة</Button>}
        </Stack>
      </Stack>

      <Paper className="ohc-selector no-print">
        <EmployeeQuickSearch
          value={selectedEmployeeId}
          onChange={handleEmployeeChange}
          label="بحث الموظف للبطاقة الصحية"
          helperText="ابحث بالاسم، الهوية الوطنية، الرقم الوظيفي، الجوال أو البريد الإلكتروني. لكل موظف بطاقة واحدة فقط."
        />
        {employeeLabel && <Chip sx={{ mt: 1.25, fontWeight: 800 }} color="primary" variant="outlined" label={`الموظف المحدد: ${employeeLabel}`} />}
      </Paper>

      {error && <Alert severity="warning" className="no-print" sx={{ mb: 2 }}>{error}</Alert>}
      {!selectedEmployeeId && (
        <Alert severity="info" className="no-print">ابحث عن الموظف أولًا، ثم عبّئ بيانات البطاقة واحفظها. ستظهر البطاقة بعد الحفظ كصورة قابلة للتنزيل.</Alert>
      )}
      {loading && (
        <Paper sx={{ p: 5, textAlign: 'center' }}>
          <CircularProgress />
          <Typography sx={{ mt: 2 }}>جاري تحميل البطاقة الصحية...</Typography>
        </Paper>
      )}

      {card && editing && !loading && (
        <Paper className="ohc-form-shell no-print">
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} sx={{ mb: 2 }}>
            <Box>
              <Typography variant="h5" fontWeight={900}>{card.exists ? 'تعديل البطاقة الصحية' : 'إنشاء البطاقة الصحية'}</Typography>
              <Typography variant="body2" color="text.secondary">بيانات الهوية والعمل الأساسية تُجلب تلقائيًا من سجل الموظف، وبقية حقول Excel تُحفظ هنا.</Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              {card.exists && <Button variant="outlined" onClick={() => setEditing(false)}>إلغاء</Button>}
              <Button variant="contained" startIcon={saving ? <CircularProgress size={17} color="inherit" /> : <SaveIcon />} onClick={() => void handleSave()} disabled={saving}>حفظ وإظهار كصورة</Button>
            </Stack>
          </Stack>

          <Paper variant="outlined" className="ohc-master-data">
            <Typography fontWeight={900} sx={{ mb: 1.5 }}>بيانات الموظف المرتبطة تلقائيًا</Typography>
            <Grid container spacing={1.25}>
              {[
                ['الاسم', card.employee.name], ['رقم الهوية', card.employee.national_id], ['الرقم الوظيفي', card.employee.employee_number],
                ['تاريخ الميلاد', formatDate(card.employee.date_of_birth)], ['العمر', card.employee.age], ['الجوال', card.employee.mobile],
                ['المركز الصحي', card.employee.health_center_name], ['المسمى الوظيفي', card.employee.job_title], ['تاريخ التعيين', formatDate(card.employee.appointment_date)],
              ].map(([label, fieldValue]) => (
                <Grid key={String(label)} size={{ xs: 12, sm: 6, lg: 4 }}><Field label={String(label)}>{value(fieldValue)}</Field></Grid>
              ))}
            </Grid>
          </Paper>

          <Grid container spacing={1.5} sx={{ my: 2 }}>
            <Grid size={{ xs: 12, md: 4 }}><CalendarDateField required label="تاريخ إصدار البطاقة" value={issueDate} onChange={setIssueDate} /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><CalendarDateField label="تاريخ المراجعة القادمة" value={nextReviewDate} onChange={setNextReviewDate} /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth label="مراجعة واعتماد من قبل" value={reviewedBy} onChange={event => setReviewedBy(event.target.value)} /></Grid>
            <Grid size={{ xs: 12 }}><FormControlLabel control={<Switch checked={isApproved} onChange={event => setIsApproved(event.target.checked)} />} label="تمت مراجعة واعتماد البطاقة" /></Grid>
          </Grid>

          <FormSection title="1. المعلومات الشخصية الإضافية" subtitle="حقول Excel غير الموجودة في سجل الموظف" fields={PERSONAL_FIELDS} values={form.personal} onChange={(key, fieldValue) => updateSection('personal', key, fieldValue)} defaultExpanded />
          <FormSection title="2. معلومات العمل الإضافية" subtitle="MOH ID والوظيفة الحالية" fields={EMPLOYMENT_FIELDS} values={form.employment} onChange={(key, fieldValue) => updateSection('employment', key, fieldValue)} />
          <FormSection title="3. المعلومات البدنية" subtitle="الوزن والطول وBMI والنشاط البدني" fields={PHYSICAL_FIELDS} values={form.physical} onChange={(key, fieldValue) => updateSection('physical', key, fieldValue)} />
          <FormSection title="4. الحالات الطبية" subtitle="جميع الحالات والتاريخ الطبي الواردة في Excel" fields={CONDITION_FIELDS} values={form.conditions} onChange={(key, fieldValue) => updateSection('conditions', key, fieldValue)} />
          <FormSection title="5. الصحة النفسية" subtitle="PHQ وGAD وMBI ومؤشرات الصحة النفسية" fields={MENTAL_FIELDS} values={form.mental} onChange={(key, fieldValue) => updateSection('mental', key, fieldValue)} />
          <FormSection title="6. المتابعة الصحية" subtitle="الزيارات والفحوصات وبرامج المسح" fields={FOLLOW_UP_FIELDS} values={form.follow_up} onChange={(key, fieldValue) => updateSection('follow_up', key, fieldValue)} />
          <FormSection title="7. التطعيمات والمناعة" subtitle="جميع حقول التطعيم والسيرولوجيا في Excel والصورة المرجعية" fields={VACCINATION_FIELDS} values={form.vaccinations} onChange={(key, fieldValue) => updateSection('vaccinations', key, fieldValue)} />
          <FormSection title="8. التوصيات" subtitle="التوصيات الطبية وتوصيات التطعيم" fields={RECOMMENDATION_FIELDS} values={form.recommendations} onChange={(key, fieldValue) => updateSection('recommendations', key, fieldValue)} />
          <FormSection title="الحقول الإضافية في ملف Excel" subtitle="Spare fields وNSI والتعليقات — محفوظة لضمان عدم فقد أي محتوى من الملف" fields={ADDITIONAL_FIELDS} values={form.additional} onChange={(key, fieldValue) => updateSection('additional', key, fieldValue)} />

          <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
            <Button size="large" variant="contained" startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />} onClick={() => void handleSave()} disabled={saving}>حفظ البطاقة وإظهارها كصورة</Button>
          </Stack>
        </Paper>
      )}

      {card && !editing && !loading && (
        <>
          {generatingImage && <Alert severity="info" className="no-print" sx={{ mb: 2 }}>جاري إنشاء صورة PNG عالية الدقة للبطاقة...</Alert>}
          {cardImage ? (
            <Paper className="ohc-image-shell">
              <img className="ohc-image-preview" src={cardImage} alt={`البطاقة الصحية للموظف ${card.employee.name || ''}`} />
            </Paper>
          ) : (
            <div ref={node => { cardRef.current = node?.querySelector('article') || null; }}>
              <HealthCardSheet card={card} form={form} />
            </div>
          )}
          {cardImage && (
            <div className="ohc-hidden-capture" aria-hidden="true" ref={node => { cardRef.current = node?.querySelector('article') || null; }}>
              <HealthCardSheet card={card} form={form} />
            </div>
          )}
        </>
      )}
    </Box>
  );
}
