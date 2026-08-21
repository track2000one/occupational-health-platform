// @ts-ignore - html2pdf.js doesn't have types
import html2pdf from 'html2pdf.js';

// Re-export the EmployeeRow type for convenience
export type { EmployeeRow } from './professionalPdfExport';

/**
 * Export employees to PDF using html2pdf.js
 * This method properly supports Arabic text and RTL layout
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
) {
  console.log('Starting PDF export with', rows.length, 'rows');
  const now = new Date();
  const dateStr = now.toLocaleDateString('ar-SA', { dateStyle: 'medium' });

  // Statistics
  const male = rows.filter(r => r.gender === 'male').length;
  const female = rows.filter(r => r.gender === 'female').length;
  const married = rows.filter(r => r.maritalStatus === 'married').length;

  // Create HTML content
  const htmlContent = `
<!DOCTYPE html>
<html dir="${isRtl ? 'rtl' : 'ltr'}" lang="${isRtl ? 'ar' : 'en'}">
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Cairo', 'Helvetica', 'Arial', sans-serif;
      font-size: 11px;
      line-height: 1.5;
      direction: ${isRtl ? 'rtl' : 'ltr'};
      padding: 20px;
    }

    .header {
      background: linear-gradient(135deg, #1e40af 0%, #7c3aed 100%);
      color: white;
      padding: 30px 20px;
      text-align: center;
      border-radius: 8px 8px 0 0;
      margin-bottom: 20px;
    }

    .header h1 {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 8px;
      text-transform: uppercase;
    }

    .header h2 {
      font-size: 14px;
      font-weight: 400;
      opacity: 0.95;
    }

    .header .ministry {
      font-size: 10px;
      margin-top: 10px;
      opacity: 0.9;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      margin-bottom: 20px;
    }

    .stat-box {
      background: linear-gradient(135deg, #1e40af, #3b82f6);
      color: white;
      padding: 15px;
      border-radius: 8px;
      text-align: center;
    }

    .stat-box.male {
      background: linear-gradient(135deg, #0891b2, #06b6d4);
    }

    .stat-box.female {
      background: linear-gradient(135deg, #7c3aed, #a855f7);
    }

    .stat-box.married {
      background: linear-gradient(135deg, #16a34a, #22c55e);
    }

    .stat-box .value {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 5px;
    }

    .stat-box .label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      opacity: 0.95;
    }

    .section-title {
      background: #f8fafc;
      border-${isRtl ? 'right' : 'left'}: 4px solid #1e40af;
      padding: 10px 15px;
      margin-bottom: 15px;
      font-weight: 700;
      font-size: 13px;
      text-transform: uppercase;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      font-size: 10px;
    }

    thead {
      background: #1e40af;
      color: white;
    }

    thead th {
      padding: 12px 8px;
      text-align: center;
      font-weight: 700;
      font-size: 10px;
      text-transform: uppercase;
    }

    tbody tr {
      border-bottom: 1px solid #e2e8f0;
    }

    tbody tr:nth-child(even) {
      background: #f8fafc;
    }

    tbody td {
      padding: 10px 8px;
      text-align: center;
      vertical-align: middle;
    }

    tbody td:nth-child(2) {
      text-align: ${isRtl ? 'right' : 'left'};
      font-weight: 600;
    }

    tbody td:nth-child(4),
    tbody td:nth-child(5) {
      text-align: ${isRtl ? 'right' : 'left'};
    }

    .moh-id {
      color: #1e40af;
      font-weight: 700;
    }

    .national-id {
      color: #64748b;
      font-family: 'Courier New', monospace;
    }

    .footer {
      margin-top: 30px;
      padding-top: 15px;
      border-top: 2px solid #e2e8f0;
      text-align: center;
      color: #64748b;
      font-size: 9px;
    }

    .footer .date {
      font-weight: 600;
      margin-bottom: 8px;
    }

    .footer .warning {
      color: #dc2626;
      font-weight: 700;
      margin: 8px 0 5px;
    }

    @media print {
      body {
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>نظام إدارة الصحة المهنية</h1>
    <h2>OCCUPATIONAL HEALTH MANAGEMENT SYSTEM</h2>
    <div class="ministry">وزارة الصحة - المملكة العربية السعودية<br>Ministry of Health - Kingdom of Saudi Arabia</div>
  </div>

  <div class="stats">
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

  <div class="section-title">${isRtl ? 'سجل الموظفين الكامل' : 'Complete Employee Directory'}</div>

  <table>
    <thead>
      <tr>
        <th>${isRtl ? 'رقم الصحة' : 'MOH ID'}</th>
        <th>${isRtl ? 'اسم الموظف' : 'Employee Name'}</th>
        <th>${isRtl ? 'رقم الهوية' : 'National ID'}</th>
        <th>${isRtl ? 'المسمى الوظيفي' : 'Position'}</th>
        <th>${isRtl ? 'المركز الصحي' : 'Health Center'}</th>
        <th>${isRtl ? 'الجنس' : 'Gender'}</th>
        <th>${isRtl ? 'الحالة' : 'Status'}</th>
        <th>${isRtl ? 'تاريخ البدء' : 'Start Date'}</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(row => `
        <tr>
          <td class="moh-id">${row.mohId || '-'}</td>
          <td>${row.name}</td>
          <td class="national-id">${row.nationalId}</td>
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
    <div class="date">${isRtl ? `تاريخ الإنشاء: ${dateStr}` : `Generated: ${now.toLocaleDateString('en-US', { dateStyle: 'long' })}`}</div>
    <div class="warning">⚠ ${isRtl ? 'وثيقة سرية' : 'CONFIDENTIAL DOCUMENT'}</div>
    <div>${isRtl ? 'هذا المستند يحتوي على معلومات صحية حساسة محمية بموجب لوائح الخصوصية' : 'This document contains sensitive health information protected by privacy regulations'}</div>
  </div>
</body>
</html>
  `;

  // Create a temporary element
  const element = document.createElement('div');
  element.innerHTML = htmlContent;
  element.style.position = 'absolute';
  element.style.left = '-9999px';
  document.body.appendChild(element);

  try {
    // Configure html2pdf options
    const opt = {
      margin: [10, 10, 10, 10],
      filename: `Employee_Directory_${now.toISOString().slice(0, 10)}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        letterRendering: true,
      },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: 'landscape',
      },
    };

    // Generate PDF
    await html2pdf().set(opt).from(element).save();
  } finally {
    // Clean up
    document.body.removeChild(element);
  }
}
