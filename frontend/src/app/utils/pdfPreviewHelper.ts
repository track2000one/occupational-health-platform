// Re-export the EmployeeRow type for convenience
export type { EmployeeRow } from './professionalPdfExport';

/**
 * Generate HTML content for PDF preview
 */
export function generateEmployeeReportHTML(
  rows: Array<{
    mohId: string;
    name: string;
    nationalId: string;
    jobTitle: string;
    healthCenter: string;
    gender: string;
    maritalStatus: string;
    dateOfStart: string;
  }>,
  isRtl = false
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString(isRtl ? 'ar-SA' : 'en-US', { dateStyle: 'long' });

  // Statistics
  const male = rows.filter(r => r.gender === 'male').length;
  const female = rows.filter(r => r.gender === 'female').length;
  const married = rows.filter(r => r.maritalStatus === 'married').length;

  return `
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');

  .pdf-preview-content * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  .pdf-preview-content {
    font-family: 'Cairo', 'Segoe UI', 'Tahoma', 'Arial', sans-serif;
    font-size: 11px;
    line-height: 1.5;
    direction: ${isRtl ? 'rtl' : 'ltr'};
    color: #1a202c;
  }

  .pdf-header {
    background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
    color: white;
    padding: 30px 20px;
    text-align: center;
    border-radius: 8px;
    margin-bottom: 20px;
  }

  .pdf-header h1 {
    font-size: 24px;
    font-weight: 700;
    margin-bottom: 8px;
  }

  .pdf-header h2 {
    font-size: 16px;
    font-weight: 400;
    margin-bottom: 12px;
    opacity: 0.95;
  }

  .pdf-header .ministry {
    font-size: 11px;
    opacity: 0.9;
  }

  .pdf-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 15px;
    margin-bottom: 20px;
  }

  .stat-box {
    background: #1e40af;
    color: white;
    padding: 20px;
    border-radius: 8px;
    text-align: center;
    box-shadow: 0 2px 8px rgba(30, 64, 175, 0.2);
  }

  .stat-box.male { background: linear-gradient(135deg, #0891b2, #06b6d4); }
  .stat-box.female { background: linear-gradient(135deg, #7c3aed, #a855f7); }
  .stat-box.married { background: linear-gradient(135deg, #16a34a, #22c55e); }

  .stat-box .value {
    font-size: 32px;
    font-weight: 700;
    line-height: 1;
    margin-bottom: 8px;
  }

  .stat-box .label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    opacity: 0.95;
  }

  .pdf-section-title {
    background: #f1f5f9;
    border-${isRtl ? 'right' : 'left'}: 4px solid #1e40af;
    padding: 12px 15px;
    margin-bottom: 15px;
    font-weight: 700;
    font-size: 14px;
    text-transform: uppercase;
    border-radius: 4px;
  }

  .pdf-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    border-radius: 8px;
    overflow: hidden;
  }

  .pdf-table thead {
    background: #1e40af;
    color: white;
  }

  .pdf-table thead th {
    padding: 12px 10px;
    text-align: center;
    font-weight: 700;
    font-size: 11px;
    text-transform: uppercase;
    border: none;
  }

  .pdf-table tbody tr {
    border-bottom: 1px solid #e2e8f0;
    transition: background-color 0.2s;
  }

  .pdf-table tbody tr:hover {
    background: #f8fafc;
  }

  .pdf-table tbody tr:nth-child(even) {
    background: #f8fafc;
  }

  .pdf-table tbody tr:nth-child(even):hover {
    background: #f1f5f9;
  }

  .pdf-table tbody td {
    padding: 12px 10px;
    text-align: center;
    border: none;
    vertical-align: middle;
  }

  .pdf-table tbody td:nth-child(2) {
    text-align: ${isRtl ? 'right' : 'left'};
    font-weight: 600;
    color: #1e293b;
  }

  .pdf-table tbody td:nth-child(4),
  .pdf-table tbody td:nth-child(5) {
    text-align: ${isRtl ? 'right' : 'left'};
  }

  .moh-id {
    color: #1e40af;
    font-weight: 700;
    background: #eff6ff;
    padding: 4px 8px;
    border-radius: 4px;
    display: inline-block;
  }

  .national-id {
    font-family: 'Courier New', monospace;
    color: #64748b;
    font-size: 10px;
  }

  .pdf-footer {
    margin-top: 30px;
    padding-top: 15px;
    border-top: 2px solid #e2e8f0;
    text-align: center;
    font-size: 10px;
    color: #64748b;
  }

  .pdf-footer .date {
    font-weight: 600;
    margin-bottom: 8px;
    color: #475569;
  }

  .pdf-footer .warning {
    color: #dc2626;
    font-weight: 700;
    margin: 8px 0 5px;
    font-size: 11px;
  }

  @media print {
    .pdf-preview-content {
      padding: 0 !important;
    }

    .pdf-table tbody tr:hover {
      background: inherit;
    }

    .pdf-table tbody tr:nth-child(even):hover {
      background: #f8fafc;
    }
  }
</style>

<div class="pdf-preview-content">
  <div class="pdf-header">
    <h1>نظام إدارة الصحة المهنية</h1>
    <h2>OCCUPATIONAL HEALTH MANAGEMENT SYSTEM</h2>
    <div class="ministry">
      وزارة الصحة - المملكة العربية السعودية<br>
      Ministry of Health - Kingdom of Saudi Arabia
    </div>
  </div>

  <div class="pdf-stats">
    <div class="stat-box">
      <div class="value">${rows.length}</div>
      <div class="label">${isRtl ? 'إجمالي الموظفين' : 'Total Employees'}</div>
    </div>
    <div class="stat-box male">
      <div class="value">${male}</div>
      <div class="label">${isRtl ? 'ذكور' : 'Male'}</div>
    </div>
    <div class="stat-box female">
      <div class="value">${female}</div>
      <div class="label">${isRtl ? 'إناث' : 'Female'}</div>
    </div>
    <div class="stat-box married">
      <div class="value">${married}</div>
      <div class="label">${isRtl ? 'متزوج' : 'Married'}</div>
    </div>
  </div>

  <div class="pdf-section-title">
    ${isRtl ? 'سجل الموظفين الكامل' : 'Complete Employee Directory'}
  </div>

  <table class="pdf-table">
    <thead>
      <tr>
        <th style="width: 8%">${isRtl ? 'رقم الصحة' : 'MOH ID'}</th>
        <th style="width: 20%">${isRtl ? 'اسم الموظف' : 'Employee Name'}</th>
        <th style="width: 12%">${isRtl ? 'رقم الهوية' : 'National ID'}</th>
        <th style="width: 15%">${isRtl ? 'المسمى الوظيفي' : 'Position'}</th>
        <th style="width: 20%">${isRtl ? 'المركز الصحي' : 'Health Center'}</th>
        <th style="width: 8%">${isRtl ? 'الجنس' : 'Gender'}</th>
        <th style="width: 8%">${isRtl ? 'الحالة' : 'Status'}</th>
        <th style="width: 9%">${isRtl ? 'تاريخ البدء' : 'Start Date'}</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(row => `
        <tr>
          <td><span class="moh-id">${row.mohId || '-'}</span></td>
          <td>${row.name}</td>
          <td><span class="national-id">${row.nationalId}</span></td>
          <td>${row.jobTitle}</td>
          <td>${row.healthCenter}</td>
          <td>${isRtl ? (row.gender === 'male' ? 'ذكر' : 'أنثى') : (row.gender === 'male' ? 'Male' : 'Female')}</td>
          <td>${isRtl ? (row.maritalStatus === 'married' ? 'متزوج' : 'أعزب') : (row.maritalStatus === 'married' ? 'Married' : 'Single')}</td>
          <td>${row.dateOfStart || '-'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="pdf-footer">
    <div class="date">${isRtl ? `تاريخ الإنشاء: ${dateStr}` : `Generated: ${dateStr}`}</div>
    <div class="warning">⚠ ${isRtl ? 'وثيقة سرية' : 'CONFIDENTIAL DOCUMENT'}</div>
    <div>
      ${isRtl
        ? 'هذا المستند يحتوي على معلومات صحية حساسة محمية بموجب لوائح الخصوصية'
        : 'This document contains sensitive health information protected by privacy regulations'}
    </div>
  </div>
</div>
  `;
}

/**
 * Print the preview content
 */
export function printPreview(htmlContent: string, isRtl = false): void {
  const printWindow = window.open('', '_blank', 'width=1200,height=800');

  if (!printWindow) {
    throw new Error(isRtl ? 'تعذر فتح نافذة الطباعة' : 'Could not open print window');
  }

  const fullHtml = `
<!DOCTYPE html>
<html dir="${isRtl ? 'rtl' : 'ltr'}" lang="${isRtl ? 'ar' : 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isRtl ? 'سجل الموظفين' : 'Employee Directory'}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 15mm;
    }
    body {
      margin: 0;
      padding: 20px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>
  `;

  printWindow.document.write(fullHtml);
  printWindow.document.close();

  printWindow.addEventListener('load', () => {
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      setTimeout(() => printWindow.close(), 1000);
    }, 500);
  });
}

/**
 * Download as PDF (using browser's print to PDF functionality)
 */
export function downloadAsPdf(htmlContent: string, isRtl = false): void {
  // Same as print, but user will choose "Save as PDF" in print dialog
  printPreview(htmlContent, isRtl);
}
