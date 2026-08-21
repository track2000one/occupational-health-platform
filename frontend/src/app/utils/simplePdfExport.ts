import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

// Re-export the EmployeeRow type for convenience
export type { EmployeeRow } from './professionalPdfExport';

/**
 * Helper to detect if text contains Arabic characters
 */
function containsArabic(text: string): boolean {
  return /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(text);
}

/**
 * Process text for better PDF rendering
 * For Arabic text, we need to handle it specially
 */
function processTextForPDF(text: string): string {
  if (!text || !containsArabic(text)) {
    return text;
  }

  // For Arabic text, we'll keep it as is
  // jsPDF will use Unicode encoding which should preserve the characters
  return text;
}

/**
 * Simple PDF export with Arabic support
 * Uses a simpler approach that works reliably
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
  try {
    console.log('Creating PDF with', rows.length, 'employees');

    // Create PDF document in landscape mode for better table width
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const now = new Date();

    // Title - English and Arabic
    doc.setFillColor(30, 64, 175); // Blue
    doc.rect(0, 0, pageWidth, 45, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('نظام إدارة الصحة المهنية', pageWidth / 2, 15, { align: 'center' });

    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text('OCCUPATIONAL HEALTH MANAGEMENT SYSTEM', pageWidth / 2, 23, { align: 'center' });

    doc.setFontSize(10);
    doc.text('وزارة الصحة - المملكة العربية السعودية', pageWidth / 2, 30, { align: 'center' });
    doc.text('Ministry of Health - Kingdom of Saudi Arabia', pageWidth / 2, 36, { align: 'center' });

    // Statistics boxes
    const male = rows.filter(r => r.gender === 'male').length;
    const female = rows.filter(r => r.gender === 'female').length;
    const married = rows.filter(r => r.maritalStatus === 'married').length;

    let yPos = 52;
    const boxWidth = 60;
    const boxHeight = 20;
    const startX = (pageWidth - (boxWidth * 4 + 15)) / 2;

    // Total
    doc.setFillColor(30, 64, 175);
    doc.roundedRect(startX, yPos, boxWidth, boxHeight, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(String(rows.length), startX + boxWidth / 2, yPos + 10, { align: 'center' });
    doc.setFontSize(9);
    doc.text(isRtl ? 'إجمالي الموظفين' : 'Total Employees', startX + boxWidth / 2, yPos + 16, { align: 'center' });

    // Male
    doc.setFillColor(8, 145, 178);
    doc.roundedRect(startX + boxWidth + 5, yPos, boxWidth, boxHeight, 2, 2, 'F');
    doc.setFontSize(20);
    doc.text(String(male), startX + boxWidth + 5 + boxWidth / 2, yPos + 10, { align: 'center' });
    doc.setFontSize(9);
    doc.text(isRtl ? 'ذكور' : 'Male', startX + boxWidth + 5 + boxWidth / 2, yPos + 16, { align: 'center' });

    // Female
    doc.setFillColor(124, 58, 237);
    doc.roundedRect(startX + (boxWidth + 5) * 2, yPos, boxWidth, boxHeight, 2, 2, 'F');
    doc.setFontSize(20);
    doc.text(String(female), startX + (boxWidth + 5) * 2 + boxWidth / 2, yPos + 10, { align: 'center' });
    doc.setFontSize(9);
    doc.text(isRtl ? 'إناث' : 'Female', startX + (boxWidth + 5) * 2 + boxWidth / 2, yPos + 16, { align: 'center' });

    // Married
    doc.setFillColor(22, 163, 74);
    doc.roundedRect(startX + (boxWidth + 5) * 3, yPos, boxWidth, boxHeight, 2, 2, 'F');
    doc.setFontSize(20);
    doc.text(String(married), startX + (boxWidth + 5) * 3 + boxWidth / 2, yPos + 10, { align: 'center' });
    doc.setFontSize(9);
    doc.text(isRtl ? 'متزوج' : 'Married', startX + (boxWidth + 5) * 3 + boxWidth / 2, yPos + 16, { align: 'center' });

    yPos += 28;

    // Section title
    doc.setFillColor(248, 250, 252);
    doc.rect(10, yPos, pageWidth - 20, 8, 'F');
    doc.setFillColor(30, 64, 175);
    doc.rect(10, yPos, 3, 8, 'F');
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(isRtl ? 'سجل الموظفين الكامل' : 'COMPLETE EMPLOYEE DIRECTORY', 18, yPos + 5.5);

    yPos += 12;

    // Table data
    const tableData = rows.map(r => [
      r.mohId || '-',
      r.name,
      r.nationalId,
      r.jobTitle,
      r.healthCenter,
      isRtl ? (r.gender === 'male' ? 'ذكر' : 'أنثى') : (r.gender === 'male' ? 'M' : 'F'),
      isRtl ? (r.maritalStatus === 'married' ? 'متزوج' : 'أعزب') : (r.maritalStatus === 'married' ? 'Married' : 'Single'),
      r.dateOfStart || '-',
    ]);

    // @ts-ignore - autoTable is added to jsPDF prototype
    doc.autoTable({
      startY: yPos,
      head: [[
        isRtl ? 'رقم الصحة' : 'MOH ID',
        isRtl ? 'اسم الموظف' : 'Employee Name',
        isRtl ? 'رقم الهوية' : 'National ID',
        isRtl ? 'المسمى الوظيفي' : 'Position',
        isRtl ? 'المركز الصحي' : 'Health Center',
        isRtl ? 'الجنس' : 'Gender',
        isRtl ? 'الحالة' : 'Status',
        isRtl ? 'تاريخ البدء' : 'Start Date',
      ]],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 64, 175],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center',
        cellPadding: 3,
      },
      bodyStyles: {
        fontSize: 7,
        cellPadding: 2,
        halign: 'center',
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 20 },
        1: { halign: 'left', fontStyle: 'bold', cellWidth: 45 },
        2: { fontStyle: 'normal', cellWidth: 28 },
        3: { halign: 'left', cellWidth: 35 },
        4: { halign: 'left', cellWidth: 45 },
        5: { cellWidth: 15 },
        6: { cellWidth: 20 },
        7: { cellWidth: 22 },
      },
      margin: { left: 10, right: 10 },
      didDrawPage: function (data: any) {
        // Footer
        const pageHeight = doc.internal.pageSize.getHeight();
        const footerY = pageHeight - 15;

        doc.setFillColor(248, 250, 252);
        doc.rect(0, footerY - 5, pageWidth, 20, 'F');

        doc.setDrawColor(100, 116, 139);
        doc.setLineWidth(0.3);
        doc.line(10, footerY - 5, pageWidth - 10, footerY - 5);

        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        const dateStr = now.toLocaleDateString(isRtl ? 'ar-SA' : 'en-US', { dateStyle: 'long' });
        doc.text(isRtl ? `تاريخ الإنشاء: ${dateStr}` : `Generated: ${dateStr}`, pageWidth / 2, footerY, { align: 'center' });

        doc.setFontSize(6);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(220, 38, 38);
        doc.text(isRtl ? '⚠ وثيقة سرية' : '⚠ CONFIDENTIAL DOCUMENT', pageWidth / 2, footerY + 4, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(
          isRtl ? 'هذا المستند يحتوي على معلومات صحية حساسة محمية' : 'Protected health information',
          pageWidth / 2,
          footerY + 8,
          { align: 'center' }
        );
      },
    });

    // Save the PDF
    doc.save(`Employee_Directory_${now.toISOString().slice(0, 10)}.pdf`);
    console.log('PDF created successfully');

  } catch (error) {
    console.error('Error creating PDF:', error);
    throw error;
  }
}
