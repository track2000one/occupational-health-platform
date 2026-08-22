import logoImageUrl from '../../imports/ChatGPT_Image_21______2026__10_06_18__.png';

// ═══════════════════════════════════════════════════════════════════════════════
// PROFESSIONAL REPORT EXPORT
// Arabic-safe print/PDF generator using browser rendering instead of jsPDF fonts.
// Browser print preserves Unicode, Arabic shaping, and RTL direction correctly.
// ═══════════════════════════════════════════════════════════════════════════════

const COLORS = {
  primary: '#1e40af',
  primary2: '#2947c7',
  secondary: '#7c3aed',
  success: '#16a34a',
  warning: '#f59e0b',
  danger: '#dc2626',
  info: '#0891b2',
  dark: '#0f172a',
  gray: '#64748b',
  lightGray: '#f1f5f9',
  gold: '#fbbf24',
  white: '#ffffff',
};

export interface EmployeeRow {
  mohId: string;
  name: string;
  nationalId: string;
  jobTitle: string;
  healthCenter: string;
  gender: string;
  maritalStatus: string;
  dateOfStart: string;
}

type MetadataItem = { label: string; labelAr: string; value: string };
type KpiItem = { label: string; labelAr: string; value: string; color: string };
type TableColumn = { key: string; label: string; labelAr: string; align?: 'left' | 'right' | 'center' };

type ReportOptions = {
  title: string;
  titleAr: string;
  subtitle: string;
  subtitleAr: string;
  orientation?: 'portrait' | 'landscape';
  metadata: MetadataItem[];
  kpis: KpiItem[];
  sectionTitle: string;
  sectionTitleAr: string;
  columns: TableColumn[];
  rows: Record<string, string | number>[];
  fileName: string;
  classification?: string;
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateEn(date = new Date()) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateAr(date = new Date()) {
  return date.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
}

function safePercent(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function statusAction(name: string) {
  if (name === 'Completed') return { status: '✓ Completed', statusAr: 'مكتمل ✓', action: 'Archive results', actionAr: 'أرشفة النتائج' };
  if (name === 'Pending') return { status: '◐ Pending', statusAr: 'قيد المتابعة ◐', action: 'Follow up in 5 days', actionAr: 'المتابعة خلال 5 أيام' };
  return { status: '⚠ Missing', statusAr: 'ناقص ⚠', action: 'Immediate action required', actionAr: 'إجراء فوري مطلوب' };
}

function vaccineStatus(percentage: number) {
  if (percentage >= 30) return { en: '✓ High', ar: 'مرتفع ✓' };
  if (percentage >= 10) return { en: '◐ Moderate', ar: 'متوسط ◐' };
  return { en: '⚠ Low', ar: 'منخفض ⚠' };
}

function examStatus(percentage: number) {
  return percentage >= 80 ? { en: '✓ On Track', ar: 'ضمن المسار ✓' } : { en: '⚠ Attention', ar: 'يحتاج متابعة ⚠' };
}

function buildReportHtml(options: ReportOptions) {
  const pageSize = options.orientation === 'landscape' ? 'A4 landscape' : 'A4 portrait';
  const generated = new Date();

  const metadataHtml = options.metadata.map((item) => `
    <div class="meta-item">
      <div class="meta-label">${escapeHtml(item.label)}</div>
      <div class="meta-label ar" dir="rtl">${escapeHtml(item.labelAr)}</div>
      <div class="meta-value">${escapeHtml(item.value)}</div>
    </div>
  `).join('');

  const kpisHtml = options.kpis.map((item) => `
    <div class="kpi" style="--kpi-color:${item.color}">
      <div class="kpi-value">${escapeHtml(item.value)}</div>
      <div class="kpi-label">${escapeHtml(item.label)}</div>
      <div class="kpi-label ar" dir="rtl">${escapeHtml(item.labelAr)}</div>
    </div>
  `).join('');

  const tableHead = options.columns.map((column) => `
    <th class="${column.align || 'center'}">
      <div>${escapeHtml(column.label)}</div>
      <div class="ar" dir="rtl">${escapeHtml(column.labelAr)}</div>
    </th>
  `).join('');

  const tableRows = options.rows.map((row) => `
    <tr>
      ${options.columns.map((column) => `<td class="${column.align || 'center'}">${escapeHtml(row[column.key])}</td>`).join('')}
    </tr>
  `).join('');

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(options.titleAr)} - ${escapeHtml(options.title)}</title>
  <style>
    @page { size: ${pageSize}; margin: 12mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #eef2f7; color: ${COLORS.dark}; }
    body {
      font-family: Tahoma, Arial, "Segoe UI", "Noto Sans Arabic", sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      text-rendering: optimizeLegibility;
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      background: ${COLORS.white};
      box-shadow: 0 18px 55px rgba(15, 23, 42, .18);
      overflow: hidden;
    }
    .landscape { width: 297mm; min-height: 210mm; }
    .gold-bar { height: 5mm; background: ${COLORS.gold}; }
    .header {
      background: linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.primary2} 100%);
      color: white;
      text-align: center;
      padding: 11mm 14mm 9mm;
    }
    .logo { max-height: 13mm; max-width: 52mm; object-fit: contain; margin-bottom: 5mm; }
    .system-title { font-size: 15px; font-weight: 800; letter-spacing: .4px; margin: 0 0 2mm; }
    .system-title-ar { font-size: 14px; font-weight: 800; margin: 0 0 3mm; direction: rtl; unicode-bidi: plaintext; }
    .ministry { font-size: 11px; opacity: .96; margin: 0 0 1.2mm; }
    .report-title { font-size: 26px; font-weight: 900; margin: 5mm 0 1mm; text-transform: uppercase; }
    .report-title-ar { font-size: 24px; font-weight: 900; margin: 0 0 2mm; direction: rtl; unicode-bidi: plaintext; }
    .subtitle { font-size: 12px; opacity: .94; }
    .content { padding: 10mm 14mm 12mm; }
    .metadata {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      background: ${COLORS.lightGray};
      border: 1px solid #e2e8f0;
      margin-bottom: 8mm;
    }
    .meta-item { padding: 5mm; border-inline-start: 1px solid #cbd5e1; text-align: start; }
    .meta-item:first-child { border-inline-start: 0; }
    .meta-label { color: ${COLORS.gray}; font-size: 9px; font-weight: 800; text-transform: uppercase; margin-bottom: 1mm; }
    .meta-label.ar { font-size: 10px; }
    .meta-value { font-size: 15px; font-weight: 900; color: #020617; margin-top: 2mm; direction: ltr; unicode-bidi: plaintext; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7mm; margin-bottom: 10mm; }
    .kpi { background: var(--kpi-color); color: white; border-radius: 10px; padding: 7mm 5mm; text-align: center; box-shadow: inset 0 1px 0 rgba(255,255,255,.22); }
    .kpi-value { font-size: 33px; line-height: 1; font-weight: 950; margin-bottom: 4mm; direction: ltr; unicode-bidi: plaintext; }
    .kpi-label { font-size: 11px; font-weight: 850; text-transform: uppercase; }
    .kpi-label.ar { margin-top: 1.5mm; font-size: 12px; text-transform: none; }
    .section-title {
      display: flex;
      align-items: center;
      gap: 4mm;
      background: #f8fafc;
      border-inline-start: 4mm solid ${COLORS.primary};
      padding: 4mm 5mm;
      margin-bottom: 6mm;
      font-size: 17px;
      font-weight: 900;
    }
    .section-title small { color: ${COLORS.gray}; font-size: 12px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; direction: ltr; }
    th {
      background: ${COLORS.primary};
      color: white;
      padding: 4.5mm 3mm;
      font-size: 11px;
      font-weight: 900;
      border: 0;
      vertical-align: middle;
    }
    th .ar { font-size: 11px; opacity: .95; margin-top: 1mm; }
    td {
      padding: 4mm 3mm;
      font-size: 11px;
      border-bottom: 1px solid #e2e8f0;
      color: #334155;
      vertical-align: middle;
    }
    tr:nth-child(even) td { background: #f8fafc; }
    .left { text-align: left; }
    .right { text-align: right; }
    .center { text-align: center; }
    .footer {
      margin-top: 12mm;
      border-top: 1px solid #cbd5e1;
      background: #f8fafc;
      padding: 5mm;
      text-align: center;
      color: ${COLORS.gray};
      font-size: 9px;
    }
    .confidential { color: ${COLORS.danger}; font-weight: 900; margin: 2mm 0; }
    .ar { font-family: Tahoma, Arial, "Segoe UI", "Noto Sans Arabic", sans-serif; direction: rtl; unicode-bidi: plaintext; }
    @media print {
      html, body { background: white; }
      .page { margin: 0; box-shadow: none; width: auto; min-height: auto; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="page ${options.orientation === 'landscape' ? 'landscape' : ''}">
    <div class="gold-bar"></div>
    <header class="header">
      <img src="${escapeHtml(logoImageUrl)}" class="logo" alt="Logo" />
      <p class="system-title">OCCUPATIONAL HEALTH MANAGEMENT SYSTEM</p>
      <p class="system-title-ar ar" dir="rtl">منصة إدارة الصحة المهنية</p>
      <p class="ministry">Ministry of Health - Kingdom of Saudi Arabia</p>
      <p class="ministry ar" dir="rtl">وزارة الصحة - المملكة العربية السعودية</p>
      <div class="report-title">${escapeHtml(options.title)}</div>
      <div class="report-title-ar ar" dir="rtl">${escapeHtml(options.titleAr)}</div>
      <div class="subtitle">${escapeHtml(options.subtitle)}</div>
      <div class="subtitle ar" dir="rtl">${escapeHtml(options.subtitleAr)}</div>
    </header>

    <main class="content">
      <section class="metadata">${metadataHtml}</section>
      <section class="kpis">${kpisHtml}</section>
      <section class="section-title">
        <span class="ar" dir="rtl">${escapeHtml(options.sectionTitleAr)}</span>
        <small>${escapeHtml(options.sectionTitle)}</small>
      </section>
      <table>
        <thead><tr>${tableHead}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      <footer class="footer">
        <div>Generated: ${escapeHtml(generated.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }))}</div>
        <div class="ar" dir="rtl">تاريخ الإنشاء: ${escapeHtml(formatDateAr(generated))}</div>
        <div class="confidential">⚠ CONFIDENTIAL DOCUMENT</div>
        <div>This document contains sensitive health information protected by privacy regulations.</div>
        <div class="ar" dir="rtl">هذا المستند يحتوي على معلومات صحية حساسة ومحمية بموجب لوائح الخصوصية.</div>
      </footer>
    </main>
  </div>
</body>
</html>`;
}

function openPrintableReport(options: ReportOptions) {
  const reportWindow = window.open('', '_blank', 'noopener,noreferrer,width=1100,height=850');
  if (!reportWindow) {
    throw new Error('تعذر فتح نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة لهذا الموقع.');
  }

  reportWindow.document.open();
  reportWindow.document.write(buildReportHtml(options));
  reportWindow.document.close();

  const printReport = () => {
    reportWindow.focus();
    reportWindow.print();
  };

  setTimeout(printReport, 650);
}

export async function exportEmployeesPdf(rows: EmployeeRow[], isRtl = false) {
  const now = new Date();
  const male = rows.filter((r) => r.gender === 'male').length;
  const female = rows.filter((r) => r.gender === 'female').length;
  const married = rows.filter((r) => r.maritalStatus === 'married').length;

  openPrintableReport({
    title: 'Employee Directory',
    titleAr: 'دليل الموظفين',
    subtitle: 'Confidential HR Record',
    subtitleAr: 'سجل موارد بشرية سري',
    orientation: 'landscape',
    fileName: `Employee_Directory_${now.toISOString().slice(0, 10)}.pdf`,
    metadata: [
      { label: 'Report Date', labelAr: 'تاريخ التقرير', value: formatDateEn(now) },
      { label: 'Total Records', labelAr: 'إجمالي السجلات', value: String(rows.length) },
      { label: 'Generated By', labelAr: 'أُنشئ بواسطة', value: 'OH System' },
      { label: 'Classification', labelAr: 'التصنيف', value: 'CONFIDENTIAL' },
    ],
    kpis: [
      { label: 'Total Employees', labelAr: 'إجمالي الموظفين', value: String(rows.length), color: COLORS.primary },
      { label: 'Male', labelAr: 'ذكور', value: String(male), color: COLORS.info },
      { label: 'Female', labelAr: 'إناث', value: String(female), color: COLORS.secondary },
      { label: 'Married', labelAr: 'متزوجون', value: String(married), color: COLORS.success },
    ],
    sectionTitle: 'Complete Employee Directory Listing',
    sectionTitleAr: 'القائمة التفصيلية للموظفين',
    columns: [
      { key: 'mohId', label: 'MOH ID', labelAr: 'رقم وزارة الصحة' },
      { key: 'name', label: 'Employee Name', labelAr: 'اسم الموظف', align: isRtl ? 'right' : 'left' },
      { key: 'nationalId', label: 'National ID', labelAr: 'رقم الهوية' },
      { key: 'jobTitle', label: 'Position', labelAr: 'الوظيفة', align: isRtl ? 'right' : 'left' },
      { key: 'healthCenter', label: 'Health Center', labelAr: 'المركز الصحي', align: isRtl ? 'right' : 'left' },
      { key: 'gender', label: 'Gender', labelAr: 'الجنس' },
      { key: 'maritalStatus', label: 'Status', labelAr: 'الحالة' },
      { key: 'dateOfStart', label: 'Start Date', labelAr: 'تاريخ البداية' },
    ],
    rows: rows.map((row) => ({
      mohId: row.mohId,
      name: row.name,
      nationalId: row.nationalId,
      jobTitle: row.jobTitle,
      healthCenter: row.healthCenter,
      gender: row.gender.charAt(0).toUpperCase() + row.gender.slice(1),
      maritalStatus: row.maritalStatus.charAt(0).toUpperCase() + row.maritalStatus.slice(1),
      dateOfStart: row.dateOfStart,
    })),
  });
}

export async function exportPeriodicExaminationPdf(
  coverageByCenter: { center: string; target: number; examined: number; percentage: number }[]
) {
  const now = new Date();
  const totalTarget = coverageByCenter.reduce((sum, row) => sum + row.target, 0);
  const totalExamined = coverageByCenter.reduce((sum, row) => sum + row.examined, 0);
  const overallPct = safePercent(totalExamined, totalTarget);

  openPrintableReport({
    title: 'Annual Periodic Examination',
    titleAr: 'الفحص الدوري السنوي',
    subtitle: 'Health Screening Coverage Analysis',
    subtitleAr: 'تحليل تغطية الفحص الصحي',
    fileName: `Periodic_Examination_${now.toISOString().slice(0, 10)}.pdf`,
    metadata: [
      { label: 'Report Date', labelAr: 'تاريخ التقرير', value: formatDateEn(now) },
      { label: 'Period', labelAr: 'الفترة', value: `FY ${now.getFullYear()}` },
      { label: 'Centers', labelAr: 'المراكز', value: String(coverageByCenter.length) },
      { label: 'Achievement', labelAr: 'الإنجاز', value: `${overallPct}%` },
    ],
    kpis: [
      { label: 'Target', labelAr: 'المستهدف', value: String(totalTarget), color: COLORS.primary },
      { label: 'Examined', labelAr: 'تم فحصهم', value: String(totalExamined), color: COLORS.success },
      { label: 'Remaining', labelAr: 'المتبقي', value: String(totalTarget - totalExamined), color: COLORS.danger },
      { label: 'Coverage', labelAr: 'التغطية', value: `${overallPct}%`, color: overallPct >= 80 ? COLORS.success : COLORS.danger },
    ],
    sectionTitle: 'Coverage Breakdown by Health Center',
    sectionTitleAr: 'تفصيل التغطية حسب المركز الصحي',
    columns: [
      { key: 'center', label: 'Health Center', labelAr: 'المركز الصحي', align: 'left' },
      { key: 'target', label: 'Target', labelAr: 'المستهدف' },
      { key: 'examined', label: 'Examined', labelAr: 'تم فحصهم' },
      { key: 'remaining', label: 'Remaining', labelAr: 'المتبقي' },
      { key: 'coverage', label: 'Coverage %', labelAr: 'نسبة التغطية' },
      { key: 'status', label: 'Status', labelAr: 'الحالة' },
    ],
    rows: coverageByCenter.map((row) => {
      const status = examStatus(row.percentage);
      return {
        center: row.center,
        target: row.target,
        examined: row.examined,
        remaining: row.target - row.examined,
        coverage: `${row.percentage}%`,
        status: `${status.en} / ${status.ar}`,
      };
    }),
  });
}

export async function exportVaccinationCoveragePdf(
  vaccineDistribution: { name: string; value: number; percentage: number }[],
  monthlyTrend: { month: string; vaccines: number }[]
) {
  const now = new Date();
  const totalDoses = vaccineDistribution.reduce((sum, row) => sum + row.value, 0);
  const avgMonthly = monthlyTrend.length ? Math.round(monthlyTrend.reduce((sum, row) => sum + row.vaccines, 0) / monthlyTrend.length) : 0;

  openPrintableReport({
    title: 'Vaccination Coverage Report',
    titleAr: 'تقرير تغطية التطعيمات',
    subtitle: 'Employee Immunization Program Statistics',
    subtitleAr: 'إحصائيات برنامج تحصين الموظفين',
    fileName: `Vaccination_Coverage_${now.toISOString().slice(0, 10)}.pdf`,
    metadata: [
      { label: 'Report Date', labelAr: 'تاريخ التقرير', value: formatDateEn(now) },
      { label: 'Period', labelAr: 'الفترة', value: `Year ${now.getFullYear()}` },
      { label: 'Vaccine Types', labelAr: 'أنواع التطعيمات', value: String(vaccineDistribution.length) },
      { label: 'Total Doses', labelAr: 'إجمالي الجرعات', value: String(totalDoses) },
    ],
    kpis: [
      { label: 'Total Doses', labelAr: 'إجمالي الجرعات', value: String(totalDoses), color: COLORS.primary },
      { label: 'Vaccine Types', labelAr: 'أنواع التطعيمات', value: String(vaccineDistribution.length), color: COLORS.secondary },
      { label: 'Avg Monthly', labelAr: 'المعدل الشهري', value: String(avgMonthly), color: COLORS.success },
      { label: 'Target', labelAr: 'المستهدف', value: '≥90%', color: COLORS.info },
    ],
    sectionTitle: 'Vaccine Distribution by Type',
    sectionTitleAr: 'توزيع التطعيمات حسب النوع',
    columns: [
      { key: 'name', label: 'Vaccine Type', labelAr: 'نوع التطعيم', align: 'left' },
      { key: 'value', label: 'Doses', labelAr: 'الجرعات' },
      { key: 'percentage', label: 'Share %', labelAr: 'النسبة' },
      { key: 'status', label: 'Status', labelAr: 'الحالة' },
    ],
    rows: vaccineDistribution.map((row) => {
      const status = vaccineStatus(row.percentage);
      return { name: row.name, value: row.value, percentage: `${row.percentage}%`, status: `${status.en} / ${status.ar}` };
    }),
  });
}

export async function exportLabCompletionPdf(
  testStatus: { name: string; value: number; percentage: number }[],
  monthlyTrend: { month: string; tests: number }[]
) {
  const now = new Date();
  const total = testStatus.reduce((sum, row) => sum + row.value, 0);
  const completed = testStatus.find((row) => row.name === 'Completed');
  const pending = testStatus.find((row) => row.name === 'Pending');
  const missing = testStatus.find((row) => row.name === 'Missing');

  openPrintableReport({
    title: 'Laboratory Test Completion',
    titleAr: 'اكتمال التحاليل المخبرية',
    subtitle: 'Test Status & Performance Analysis',
    subtitleAr: 'تحليل حالة التحاليل والأداء',
    fileName: `Lab_Completion_${now.toISOString().slice(0, 10)}.pdf`,
    metadata: [
      { label: 'Report Date', labelAr: 'تاريخ التقرير', value: formatDateEn(now) },
      { label: 'Period', labelAr: 'الفترة', value: `Year ${now.getFullYear()}` },
      { label: 'Categories', labelAr: 'التصنيفات', value: String(testStatus.length) },
      { label: 'Completion', labelAr: 'الاكتمال', value: `${completed?.percentage ?? 0}%` },
    ],
    kpis: [
      { label: 'Total Tests', labelAr: 'إجمالي التحاليل', value: String(total), color: COLORS.primary },
      { label: 'Completed', labelAr: 'مكتملة', value: String(completed?.value ?? 0), color: COLORS.success },
      { label: 'Pending', labelAr: 'قيد المتابعة', value: String(pending?.value ?? 0), color: COLORS.warning },
      { label: 'Missing', labelAr: 'ناقصة', value: String(missing?.value ?? 0), color: COLORS.danger },
    ],
    sectionTitle: 'Test Completion Status Breakdown',
    sectionTitleAr: 'تفصيل حالة اكتمال التحاليل',
    columns: [
      { key: 'status', label: 'Status', labelAr: 'الحالة' },
      { key: 'count', label: 'Count', labelAr: 'العدد' },
      { key: 'percentage', label: 'Percentage', labelAr: 'النسبة' },
      { key: 'action', label: 'Recommended Action', labelAr: 'الإجراء الموصى به', align: 'left' },
    ],
    rows: testStatus.map((row) => {
      const action = statusAction(row.name);
      return {
        status: `${action.status} / ${action.statusAr}`,
        count: row.value,
        percentage: `${row.percentage}%`,
        action: `${action.action} / ${action.actionAr}`,
      };
    }),
  });
}
