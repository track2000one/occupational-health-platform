/**
 * Client-side worksheet for matching Excel rows to an approved health center.
 * No employee identity, contact detail, or clinical data is exported.
 * Never guesses a center, commits data, or updates an employee.
 */
export type CenterCorrectionRow = {
  row: number;
  health_center?: string;
  health_center_matched?: boolean;
  issues?: string[];
};

export type CenterDirectoryItem = {
  id: number | string;
  name: string;
  name_ar?: string;
  code?: string;
  is_active?: boolean;
};

export const CORRECTION_HEADER = 'excel_row\tsource_center\tapproved_center_id';
export const DIRECTORY_HEADER = 'approved_center_id\tapproved_center_name\tcenter_code';

export function requiresCenterCorrection(row: CenterCorrectionRow): boolean {
  return row.health_center_matched === false && Boolean(row.issues?.some(issue =>
    /health center|health_center|active center/i.test(issue)));
}

function safeCell(value: unknown): string {
  const clean = String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim();
  // Prevent CSV/TSV formula execution when Excel opens source labels.
  return /^[=+@-]/.test(clean) ? `'${clean}` : clean;
}

export function buildCorrectionTemplate(rows: CenterCorrectionRow[]): string {
  const unique = new Set<number>();
  const entries = rows.filter(requiresCenterCorrection)
    .sort((left, right) => left.row - right.row)
    .filter(row => {
      if (unique.has(row.row)) return false;
      unique.add(row.row);
      return true;
    })
    .map(row => [row.row, safeCell(row.health_center), ''].join('\t'));
  return '\uFEFF' + [CORRECTION_HEADER, ...entries].join('\r\n') + '\r\n';
}

export function buildCenterDirectory(centers: CenterDirectoryItem[]): string {
  const entries = centers.filter(center => center.is_active !== false)
    .sort((a, b) => String(a.name_ar || a.name).localeCompare(String(b.name_ar || b.name), 'ar'))
    .map(center => [center.id, safeCell(center.name_ar || center.name), safeCell(center.code)].join('\t'));
  return '\uFEFF' + [DIRECTORY_HEADER, ...entries].join('\r\n') + '\r\n';
}

export function parseCenterCorrectionTemplate(
  rawText: string,
  rows: CenterCorrectionRow[],
  centers: CenterDirectoryItem[],
): { corrections: Record<string, string>; corrected: number; blank: number } {
  if (rawText.length > 1024 * 1024) {
    throw new Error('ملف التصحيح أكبر من الحد المسموح (1 MB).');
  }
  const lines = rawText.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  if (lines.shift()?.trim() !== CORRECTION_HEADER) {
    throw new Error('عناوين ملف التصحيح غير صحيحة. استخدم القالب الذي نزلته دون تغيير أسماء الأعمدة.');
  }
  const pendingRows = new Map(rows.filter(requiresCenterCorrection).map(row => [row.row, row]));
  const activeCenters = new Map(centers.filter(center => center.is_active !== false)
    .map(center => [String(center.id), center]));
  const seen = new Set<number>();
  const corrections: Record<string, string> = {};
  let blank = 0;
  if (lines.length > rows.length + 1) {
    throw new Error('ملف التصحيح يحتوي على صفوف إضافية غير متوقعة.');
  }
  for (const [index, line] of lines.entries()) {
    const columns = line.replace(/\r$/, '').split('\t');
    if (columns.length !== 3) {
      throw new Error(`تنسيق الصف ${index + 2} غير صحيح؛ احفظ الملف بصيغة TSV (نص مفصول بعلامات جدولة).`);
    }
    const [numberText, sourceText, selectedIdText] = columns.map(value => value.trim());
    if (!/^\d+$/.test(numberText)) {
      throw new Error(`رقم صف Excel غير صحيح في السطر ${index + 2}.`);
    }
    const number = Number(numberText);
    const original = pendingRows.get(number);
    if (!original || seen.has(number)) {
      throw new Error(`صف Excel رقم ${number} مكرر أو ليس ضمن الصفوف الحالية التي تحتاج تصحيح المركز.`);
    }
    seen.add(number);
    if (safeCell(original.health_center) !== sourceText) {
      throw new Error(`اختلف اسم المركز الأصلي لصف Excel رقم ${number}. أعد تنزيل قالب التصحيح من المعاينة الحالية.`);
    }
    if (!selectedIdText) {
      blank += 1;
      continue;
    }
    if (!/^\d+$/.test(selectedIdText) || !activeCenters.has(selectedIdText)) {
      throw new Error(`رقم المركز المعتمد في صف Excel رقم ${number} غير موجود أو غير فعال. راجع دليل المراكز.`);
    }
    corrections[numberText] = selectedIdText;
  }
  if (seen.size !== pendingRows.size) {
    throw new Error('قالب التصحيح ناقص أو لا يطابق الملف الحالي. لا تحذف أي صف من القالب؛ اترك المركز فارغًا للصفوف غير المحققة.');
  }
  return { corrections, corrected: Object.keys(corrections).length, blank };
}
