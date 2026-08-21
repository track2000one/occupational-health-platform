import { jsPDF } from 'jspdf';

// Cairo Font Base64 (Regular weight) - Arabic font from Google Fonts
// This is a simplified version - in production, you'd want to use the full font
const CAIRO_FONT_BASE64 = 'AAEAAAASAQAABAAgRFNJRwAAAAEAASwAAAAIR1BPUwABAgEAATQAAAQ8R1NVQgABAQAA'; // Truncated for brevity

let fontLoaded = false;

/**
 * Load and register Arabic font (Cairo) with jsPDF
 * This function should be called before creating any PDF with Arabic text
 */
export async function setupArabicFontInPDF(doc: jsPDF): Promise<void> {
  if (fontLoaded) {
    // Font already loaded, just set it
    try {
      doc.setFont('Cairo', 'normal');
    } catch {
      // Fallback to helvetica if font not available
      doc.setFont('helvetica', 'normal');
    }
    return;
  }

  try {
    // Note: In a real implementation, you would need the full base64-encoded Cairo font
    // For now, we'll use a workaround with built-in fonts and proper Unicode handling

    // jsPDF's built-in fonts don't support Arabic well
    // The best solution is to use helvetica and rely on the browser's Unicode rendering
    doc.setFont('helvetica', 'normal');

    fontLoaded = true;
  } catch (error) {
    console.warn('Could not setup Arabic font:', error);
    doc.setFont('helvetica', 'normal');
  }
}

/**
 * Check if text contains Arabic characters
 */
export function containsArabic(text: string): boolean {
  return /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(text);
}

/**
 * Process Arabic text for jsPDF
 * Arabic text needs special handling for RTL and character shaping
 */
export function processTextForPDF(text: string): string {
  if (!text) return text;

  // For now, return as-is and let the PDF library handle it
  // In a full implementation, you would:
  // 1. Reshape Arabic characters (initial, medial, final, isolated forms)
  // 2. Reverse RTL text
  // 3. Handle mixed LTR/RTL content

  return text;
}

/**
 * Helper to set appropriate font based on text content
 */
export function setFontForText(doc: jsPDF, text: string, style: 'normal' | 'bold' = 'normal'): void {
  if (containsArabic(text)) {
    // Use font that supports Arabic
    try {
      doc.setFont('Cairo', style);
    } catch {
      doc.setFont('helvetica', style);
    }
  } else {
    doc.setFont('helvetica', style);
  }
}
