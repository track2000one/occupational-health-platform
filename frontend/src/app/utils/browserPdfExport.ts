// Re-export the EmployeeRow type for convenience
export type { EmployeeRow } from './professionalPdfExport';

/**
 * Export employees to PDF using browser's native print functionality
 * This provides perfect Arabic support since it uses the browser's rendering
 */
export async function exportEmployeesHtmlToPdf(
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
): Promise<void> {
  const now = new Date();
  const dateStr = now.toLocaleDateString(isRtl ? 'ar-SA' : 'en-US', { dateStyle: 'long' });

  // Statistics
  const male = rows.filter(r => r.gender === 'male').length;
  const female = rows.filter(r => r.gender === 'female').length;
  const married = rows.filter(r => r.maritalStatus === 'married').length;

  // Create HTML content with proper styling
  const htmlContent = `
<!DOCTYPE html>
<html dir="${isRtl ? 'rtl' : 'ltr'}" lang="${isRtl ? 'ar' : 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Employee Directory - ${dateStr}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4 landscape;
      margin: 15mm;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Cairo', 'Segoe UI', 'Tahoma', 'Arial', sans-serif;
      font-size: 9pt;
      line-height: 1.4;
      direction: ${isRtl ? 'rtl' : 'ltr'};
      color: #1a202c;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .header {
      background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
      color: white;
      padding: 20px;
      text-align: center;
      border-radius: 8px;
      margin-bottom: 15px;
    }

    .header h1 {
      font-size: 20pt;
      font-weight: 700;
      margin-bottom: 5px;
    }

    .header h2 {
      font-size: 12pt;
      font-weight: 400;
      margin-bottom: 8px;
    }

    .header .ministry {
      font-size: 9pt;
      opacity: 0.95;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 15px;
    }

    .stat-box {
      background: #1e40af;
      color: white;
      padding: 12px;
      border-radius: 6px;
      text-align: center;
    }

    .stat-box.male { background: #0891b2; }
    .stat-box.female { background: #7c3aed; }
    .stat-box.married { background: #16a34a; }

    .stat-box .value {
      font-size: 24pt;
      font-weight: 700;
      line-height: 1;
      margin-bottom: 4px;
    }

    .stat-box .label {
      font-size: 8pt;
      font-weight: 600;
      opacity: 0.95;
    }

    .section-title {
      background: #f1f5f9;
      border-${isRtl ? 'right' : 'left'}: 4px solid #1e40af;
      padding: 8px 12px;
      margin-bottom: 10px;
      font-weight: 700;
      font-size: 10pt;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8pt;
    }

    thead {
      background: #1e40af;
      color: white;
    }

    thead th {
      padding: 8px 6px;
      text-align: center;
      font-weight: 700;
      border: 1px solid #1e3a8a;
    }

    tbody tr {
      page-break-inside: avoid;
    }

    tbody tr:nth-child(even) {
      background: #f8fafc;
    }

    tbody td {
      padding: 6px 5px;
      text-align: center;
      border: 1px solid #e2e8f0;
      vertical-align: middle;
    }

    tbody td:nth-child(2) {
      text-align: ${isRtl ? 'right' : 'left'};
      font-weight: 600;
      padding-${isRtl ? 'right' : 'left'}: 8px;
    }

    tbody td:nth-child(4),
    tbody td:nth-child(5) {
      text-align: ${isRtl ? 'right' : 'left'};
      padding-${isRtl ? 'right' : 'left'}: 8px;
    }

    .moh-id {
      color: #1e40af;
      font-weight: 700;
    }

    .footer {
      margin-top: 15px;
      padding-top: 10px;
      border-top: 2px solid #cbd5e0;
      text-align: center;
      font-size: 7pt;
      color: #64748b;
      page-break-inside: avoid;
    }

    .footer .warning {
      color: #dc2626;
      font-weight: 700;
      margin: 5px 0;
    }

    @media print {
      body {
        margin: 0;
        padding: 0;
      }

      .no-print {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>نظام إدارة الصحة المهنية</h1>
    <h2>OCCUPATIONAL HEALTH MANAGEMENT SYSTEM</h2>
    <div class="ministry">وزارة الصحة - المملكة العربية السعودية • Ministry of Health - Kingdom of Saudi Arabia</div>
  </div>

  <div class="stats">
    <div class="stat-box">
      <div class="value">${rows.length}</div>
      <div class="label">${isRtl ? 'إجمالي الموظفين' : 'TOTAL EMPLOYEES'}</div>
    </div>
    <div class="stat-box male">
      <div class="value">${male}</div>
      <div class="label">${isRtl ? 'ذكور' : 'MALE'}</div>
    </div>
    <div class="stat-box female">
      <div class="value">${female}</div>
      <div class="label">${isRtl ? 'إناث' : 'FEMALE'}</div>
    </div>
    <div class="stat-box married">
      <div class="value">${married}</div>
      <div class="label">${isRtl ? 'متزوج' : 'MARRIED'}</div>
    </div>
  </div>

  <div class="section-title">${isRtl ? 'سجل الموظفين الكامل' : 'COMPLETE EMPLOYEE DIRECTORY'}</div>

  <table>
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
          <td>${row.nationalId}</td>
          <td>${row.jobTitle}</td>
          <td>${row.healthCenter}</td>
          <td>${isRtl ? (row.gender === 'male' ? 'ذكر' : 'أنثى') : (row.gender === 'male' ? 'Male' : 'Female')}</td>
          <td>${isRtl ? (row.maritalStatus === 'married' ? 'متزوج' : 'أعزب') : (row.maritalStatus === 'married' ? 'Married' : 'Single')}</td>
          <td>${row.dateOfStart || '-'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="footer">
    <div>${isRtl ? `تاريخ الإنشاء: ${dateStr}` : `Generated: ${dateStr}`}</div>
    <div class="warning">⚠ ${isRtl ? 'وثيقة سرية' : 'CONFIDENTIAL DOCUMENT'}</div>
    <div>${isRtl ? 'هذا المستند يحتوي على معلومات صحية حساسة محمية بموجب لوائح الخصوصية' : 'This document contains sensitive health information protected by privacy regulations'}</div>
  </div>
</body>
</html>
  `;

  // Open in new window and trigger print dialog
  const printWindow = window.open('', '_blank', 'width=1200,height=800');

  if (!printWindow) {
    throw new Error(isRtl ? 'تعذر فتح نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة.' : 'Could not open print window. Please allow pop-ups.');
  }

  printWindow.document.write(htmlContent);
  printWindow.document.close();

  // Wait for fonts to load, then print
  printWindow.addEventListener('load', () => {
    // Small delay to ensure fonts are loaded
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();

      // Close window after printing (or if cancelled)
      setTimeout(() => {
        printWindow.close();
      }, 1000);
    }, 500);
  });
}
