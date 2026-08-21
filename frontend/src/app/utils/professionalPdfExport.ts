import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoImageUrl from '../../imports/ChatGPT_Image_21______2026__10_06_18__.png';

// ═══════════════════════════════════════════════════════════════════════════════
// PROFESSIONAL PDF REPORT GENERATOR
// Uses jsPDF + autoTable for reliable, high-quality PDF generation
// With Arabic font support
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Arabic Font Support ───────────────────────────────────────────────────────
// NOTE: jsPDF has limited Arabic support out of the box.
// We need to use a compatible approach for Arabic text rendering.

// Helper to detect if text contains Arabic characters
function containsArabic(text: string): boolean {
  return /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(text);
}

// Helper to reverse Arabic text for better display in jsPDF
// Since jsPDF doesn't handle RTL well, we reverse the text
function processArabicText(text: string): string {
  if (!containsArabic(text)) return text;

  // For mixed content, split by spaces and process each word
  const words = text.split(' ');
  const processedWords = words.map(word => {
    if (containsArabic(word)) {
      // Reverse Arabic words for RTL display
      return word.split('').reverse().join('');
    }
    return word;
  });

  // Reverse the word order for RTL
  return processedWords.reverse().join(' ');
}

// ─── Colors ────────────────────────────────────────────────────────────────────
const COLORS = {
  primary: [30, 64, 175],      // #1e40af - Blue
  secondary: [124, 58, 237],   // #7c3aed - Purple
  success: [22, 163, 74],      // #16a34a - Green
  warning: [245, 158, 11],     // #f59e0b - Orange
  danger: [220, 38, 38],       // #dc2626 - Red
  info: [8, 145, 178],         // #0891b2 - Cyan
  dark: [15, 23, 42],          // #0f172a - Dark
  gray: [100, 116, 139],       // #64748b - Gray
  lightGray: [241, 245, 249],  // #f1f5f9 - Light Gray
  gold: [251, 191, 36],        // #fbbf24 - Gold
  white: [255, 255, 255],
} as const;

// ─── Helper: Convert image to base64 ──────────────────────────────────────────
async function getLogoBase64(): Promise<string> {
  try {
    const response = await fetch(logoImageUrl);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string || '');
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn('Failed to load logo:', error);
    return '';
  }
}

// ─── Helper: Add Page Header ──────────────────────────────────────────────────
function addHeader(doc: jsPDF, title: string, subtitle: string, logoBase64?: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Gold bar at top
  doc.setFillColor(...COLORS.gold);
  doc.rect(0, 0, pageWidth, 4, 'F');

  // Main gradient header (simulated with blue)
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 4, pageWidth, 55, 'F');

  // Logo (if available)
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', pageWidth / 2 - 15, 8, 30, 12);
    } catch (e) {
      console.warn('Could not add logo to PDF');
    }
  }

  // System name (English)
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('OCCUPATIONAL HEALTH MANAGEMENT SYSTEM', pageWidth / 2, 28, { align: 'center' });

  // System name (Arabic)
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('نظام إدارة الصحة المهنية', pageWidth / 2, 34, { align: 'center' });

  // Ministry info
  doc.setFontSize(8);
  doc.text('Ministry of Health - Kingdom of Saudi Arabia', pageWidth / 2, 40, { align: 'center' });
  doc.text('وزارة الصحة - المملكة العربية السعودية', pageWidth / 2, 45, { align: 'center' });

  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title.toUpperCase(), pageWidth / 2, 53, { align: 'center' });

  // Subtitle
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(subtitle, pageWidth / 2, 58, { align: 'center' });

  return 65; // Return Y position after header
}

// ─── Helper: Add Metadata Section ─────────────────────────────────────────────
function addMetadata(doc: jsPDF, y: number, items: { label: string; value: string }[]) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const boxWidth = (pageWidth - 40) / 4; // 4 columns with margins

  doc.setFillColor(...COLORS.lightGray);
  doc.rect(10, y, pageWidth - 20, 20, 'F');

  doc.setDrawColor(...COLORS.gray);
  doc.setLineWidth(0.1);

  items.forEach((item, index) => {
    const x = 15 + index * boxWidth;

    // Vertical separator
    if (index > 0) {
      doc.setDrawColor(200, 200, 200);
      doc.line(x - 5, y + 3, x - 5, y + 17);
    }

    // Label
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.gray);
    doc.text(item.label.toUpperCase(), x, y + 7);

    // Value
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.dark);
    doc.text(item.value, x, y + 15);
  });

  return y + 25;
}

// ─── Helper: Add KPI Boxes ────────────────────────────────────────────────────
function addKPIBoxes(doc: jsPDF, y: number, items: { label: string; value: string; color: number[] }[]) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const boxWidth = (pageWidth - 50) / 4;
  const boxHeight = 28;

  items.forEach((item, index) => {
    const x = 15 + index * (boxWidth + 5);

    // Box background
    doc.setFillColor(...item.color);
    doc.roundedRect(x, y, boxWidth, boxHeight, 3, 3, 'F');

    // White border
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.8);
    doc.roundedRect(x, y, boxWidth, boxHeight, 3, 3, 'S');

    // Value
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(item.value, x + boxWidth / 2, y + 14, { align: 'center' });

    // Label
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(item.label.toUpperCase(), x + boxWidth / 2, y + 22, { align: 'center' });
  });

  return y + boxHeight + 10;
}

// ─── Helper: Add Section Title ────────────────────────────────────────────────
function addSectionTitle(doc: jsPDF, y: number, title: string) {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Background
  doc.setFillColor(248, 250, 252);
  doc.rect(10, y, pageWidth - 20, 10, 'F');

  // Left border
  doc.setFillColor(...COLORS.primary);
  doc.rect(10, y, 3, 10, 'F');

  // Title
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.dark);
  doc.text(title.toUpperCase(), 18, y + 7);

  return y + 15;
}

// ─── Helper: Add Footer ───────────────────────────────────────────────────────
function addFooter(doc: jsPDF) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const y = pageHeight - 25;

  // Background
  doc.setFillColor(248, 250, 252);
  doc.rect(0, y - 5, pageWidth, 30, 'F');

  // Top border
  doc.setDrawColor(...COLORS.gray);
  doc.setLineWidth(0.5);
  doc.line(10, y - 5, pageWidth - 10, y - 5);

  // Date
  const now = new Date();
  const dateEn = now.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });
  const dateAr = now.toLocaleDateString('ar-SA', { dateStyle: 'long' });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.gray);
  doc.text(`Generated: ${dateEn}`, pageWidth / 2, y, { align: 'center' });
  doc.text(`تاريخ الإنشاء: ${dateAr}`, pageWidth / 2, y + 4, { align: 'center' });

  // Confidential warning
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.danger);
  doc.text('⚠ CONFIDENTIAL DOCUMENT', pageWidth / 2, y + 10, { align: 'center' });

  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.gray);
  doc.text('This document contains sensitive health information protected by privacy regulations', pageWidth / 2, y + 14, { align: 'center' });
  doc.text('هذا المستند يحتوي على معلومات صحية حساسة محمية بموجب لوائح الخصوصية', pageWidth / 2, y + 18, { align: 'center' });
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Employee Directory ───────────────────────────────────────────────────────
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

export async function exportEmployeesPdf(rows: EmployeeRow[], isRtl = false) {
  const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });
  const logoBase64 = await getLogoBase64();

  let yPos = addHeader(doc, 'Employee Directory', 'Confidential HR Record', logoBase64);

  // Metadata
  const now = new Date();
  yPos = addMetadata(doc, yPos, [
    { label: 'Report Date', value: now.toLocaleDateString('en-US', { dateStyle: 'medium' }) },
    { label: 'Total Records', value: String(rows.length) },
    { label: 'Generated By', value: 'OH System' },
    { label: 'Classification', value: 'CONFIDENTIAL' },
  ]);

  // KPIs
  const male = rows.filter(r => r.gender === 'male').length;
  const female = rows.filter(r => r.gender === 'female').length;
  const married = rows.filter(r => r.maritalStatus === 'married').length;

  yPos = addKPIBoxes(doc, yPos, [
    { label: 'Total Employees', value: String(rows.length), color: COLORS.primary },
    { label: 'Male', value: String(male), color: COLORS.info },
    { label: 'Female', value: String(female), color: COLORS.secondary },
    { label: 'Married', value: String(married), color: COLORS.success },
  ]);

  // Section title
  yPos = addSectionTitle(doc, yPos, 'Complete Employee Directory Listing');

  // Table
  autoTable(doc, {
    startY: yPos,
    head: [['MOH ID', 'Employee Name', 'National ID', 'Position', 'Health Center', 'Gender', 'Status', 'Start Date']],
    body: rows.map(r => [
      r.mohId,
      r.name,
      r.nationalId,
      r.jobTitle,
      r.healthCenter,
      r.gender.charAt(0).toUpperCase() + r.gender.slice(1),
      r.maritalStatus.charAt(0).toUpperCase() + r.maritalStatus.slice(1),
      r.dateOfStart,
    ]),
    headStyles: {
      fillColor: COLORS.primary,
      textColor: COLORS.white,
      fontSize: 9,
      fontStyle: 'bold',
      halign: 'center',
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: 8,
      cellPadding: 3,
      halign: 'center',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: COLORS.primary },
      1: { halign: 'left', fontStyle: 'bold' },
      2: { fontStyle: 'normal', textColor: COLORS.gray },
      3: { halign: 'left' },
      4: { halign: 'left' },
      7: { textColor: COLORS.gray },
    },
    margin: { left: 15, right: 15 },
    didDrawPage: () => addFooter(doc),
  });

  doc.save(`Employee_Directory_${now.toISOString().slice(0, 10)}.pdf`);
}

// ─── Periodic Examination Report ─────────────────────────────────────────────
export async function exportPeriodicExaminationPdf(
  coverageByCenter: { center: string; target: number; examined: number; percentage: number }[]
) {
  const doc = new jsPDF({ format: 'a4' });
  const logoBase64 = await getLogoBase64();
  const now = new Date();

  let yPos = addHeader(doc, 'Annual Periodic Examination', 'Health Screening Coverage Analysis', logoBase64);

  const totalTarget = coverageByCenter.reduce((s, r) => s + r.target, 0);
  const totalExamined = coverageByCenter.reduce((s, r) => s + r.examined, 0);
  const overallPct = Math.round((totalExamined / totalTarget) * 100);

  // Metadata
  yPos = addMetadata(doc, yPos, [
    { label: 'Report Date', value: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) },
    { label: 'Period', value: `FY ${now.getFullYear()}` },
    { label: 'Centers', value: String(coverageByCenter.length) },
    { label: 'Achievement', value: `${overallPct}%` },
  ]);

  // KPIs
  yPos = addKPIBoxes(doc, yPos, [
    { label: 'Target', value: String(totalTarget), color: COLORS.primary },
    { label: 'Examined', value: String(totalExamined), color: COLORS.success },
    { label: 'Remaining', value: String(totalTarget - totalExamined), color: COLORS.danger },
    { label: 'Coverage', value: `${overallPct}%`, color: overallPct >= 80 ? COLORS.success : COLORS.danger },
  ]);

  // Section
  yPos = addSectionTitle(doc, yPos, 'Coverage Breakdown by Health Center');

  // Table
  autoTable(doc, {
    startY: yPos,
    head: [['Health Center', 'Target', 'Examined', 'Remaining', 'Coverage %', 'Status']],
    body: coverageByCenter.map(r => [
      r.center,
      String(r.target),
      String(r.examined),
      String(r.target - r.examined),
      `${r.percentage}%`,
      r.percentage >= 80 ? '✓ On Track' : '⚠ Attention',
    ]),
    headStyles: {
      fillColor: COLORS.primary,
      textColor: COLORS.white,
      fontSize: 9,
      fontStyle: 'bold',
      halign: 'center',
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: 9,
      cellPadding: 3.5,
      halign: 'center',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold' },
      1: { textColor: COLORS.primary, fontStyle: 'bold' },
      2: { textColor: COLORS.success, fontStyle: 'bold' },
      3: { textColor: COLORS.danger, fontStyle: 'bold' },
      4: { fontStyle: 'bold', fontSize: 10 },
    },
    margin: { left: 15, right: 15 },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 4) {
        const pct = parseInt(data.cell.text[0]);
        const color = pct >= 80 ? COLORS.success : COLORS.danger;
        doc.setTextColor(...color);
      }
    },
    didDrawPage: () => addFooter(doc),
  });

  doc.save(`Periodic_Examination_${now.toISOString().slice(0, 10)}.pdf`);
}

// ─── Vaccination Coverage ────────────────────────────────────────────────────
export async function exportVaccinationCoveragePdf(
  vaccineDistribution: { name: string; value: number; percentage: number }[],
  monthlyTrend: { month: string; vaccines: number }[]
) {
  const doc = new jsPDF({ format: 'a4' });
  const logoBase64 = await getLogoBase64();
  const now = new Date();

  let yPos = addHeader(doc, 'Vaccination Coverage Report', 'Employee Immunization Program Statistics', logoBase64);

  const totalDoses = vaccineDistribution.reduce((s, v) => s + v.value, 0);
  const avgMonthly = Math.round(monthlyTrend.reduce((s, m) => s + m.vaccines, 0) / monthlyTrend.length);

  yPos = addMetadata(doc, yPos, [
    { label: 'Report Date', value: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) },
    { label: 'Period', value: `Year ${now.getFullYear()}` },
    { label: 'Vaccine Types', value: String(vaccineDistribution.length) },
    { label: 'Total Doses', value: String(totalDoses) },
  ]);

  yPos = addKPIBoxes(doc, yPos, [
    { label: 'Total Doses', value: String(totalDoses), color: COLORS.primary },
    { label: 'Vaccine Types', value: String(vaccineDistribution.length), color: COLORS.secondary },
    { label: 'Avg Monthly', value: String(avgMonthly), color: COLORS.success },
    { label: 'Target', value: '≥90%', color: COLORS.info },
  ]);

  yPos = addSectionTitle(doc, yPos, 'Vaccine Distribution by Type');

  autoTable(doc, {
    startY: yPos,
    head: [['Vaccine Type', 'Doses', 'Share %', 'Status']],
    body: vaccineDistribution.map(v => [
      v.name,
      String(v.value),
      `${v.percentage}%`,
      v.percentage >= 30 ? '✓ High' : v.percentage >= 10 ? '◐ Moderate' : '⚠ Low',
    ]),
    headStyles: {
      fillColor: COLORS.primary,
      textColor: COLORS.white,
      fontSize: 9,
      fontStyle: 'bold',
      halign: 'center',
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: 9,
      cellPadding: 3.5,
      halign: 'center',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold' },
      1: { textColor: COLORS.primary, fontStyle: 'bold' },
      2: { fontStyle: 'bold' },
    },
    margin: { left: 15, right: 15 },
    didDrawPage: () => addFooter(doc),
  });

  doc.save(`Vaccination_Coverage_${now.toISOString().slice(0, 10)}.pdf`);
}

// ─── Lab Completion Report ───────────────────────────────────────────────────
export async function exportLabCompletionPdf(
  testStatus: { name: string; value: number; percentage: number }[],
  monthlyTrend: { month: string; tests: number }[]
) {
  const doc = new jsPDF({ format: 'a4' });
  const logoBase64 = await getLogoBase64();
  const now = new Date();

  let yPos = addHeader(doc, 'Laboratory Test Completion', 'Test Status & Performance Analysis', logoBase64);

  const total = testStatus.reduce((s, t) => s + t.value, 0);
  const completed = testStatus.find(t => t.name === 'Completed');
  const pending = testStatus.find(t => t.name === 'Pending');
  const missing = testStatus.find(t => t.name === 'Missing');

  yPos = addMetadata(doc, yPos, [
    { label: 'Report Date', value: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) },
    { label: 'Period', value: `Year ${now.getFullYear()}` },
    { label: 'Categories', value: String(testStatus.length) },
    { label: 'Completion', value: `${completed?.percentage ?? 0}%` },
  ]);

  yPos = addKPIBoxes(doc, yPos, [
    { label: 'Total Tests', value: String(total), color: COLORS.primary },
    { label: 'Completed', value: String(completed?.value ?? 0), color: COLORS.success },
    { label: 'Pending', value: String(pending?.value ?? 0), color: COLORS.warning },
    { label: 'Missing', value: String(missing?.value ?? 0), color: COLORS.danger },
  ]);

  yPos = addSectionTitle(doc, yPos, 'Test Completion Status Breakdown');

  autoTable(doc, {
    startY: yPos,
    head: [['Status', 'Count', 'Percentage', 'Recommended Action']],
    body: testStatus.map(s => [
      s.name === 'Completed' ? '✓ Completed' : s.name === 'Pending' ? '◐ Pending' : '⚠ Missing',
      String(s.value),
      `${s.percentage}%`,
      s.name === 'Completed'
        ? 'Archive results'
        : s.name === 'Pending'
        ? 'Follow up in 5 days'
        : 'Immediate action required',
    ]),
    headStyles: {
      fillColor: COLORS.primary,
      textColor: COLORS.white,
      fontSize: 9,
      fontStyle: 'bold',
      halign: 'center',
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: 9,
      cellPadding: 3.5,
      halign: 'center',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { textColor: COLORS.primary, fontStyle: 'bold' },
      2: { fontStyle: 'bold' },
      3: { halign: 'left', fontSize: 8, textColor: COLORS.gray },
    },
    margin: { left: 15, right: 15 },
    didDrawPage: () => addFooter(doc),
  });

  doc.save(`Lab_Completion_${now.toISOString().slice(0, 10)}.pdf`);
}
