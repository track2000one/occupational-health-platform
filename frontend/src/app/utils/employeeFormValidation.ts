/** Input checks shared by the employee editor and its standalone QA tests. */
export function toWesternDigits(value: string): string {
  return String(value ?? '')
    .replace(/[٠-٩]/g, char => String('٠١٢٣٤٥٦٧٨٩'.indexOf(char)))
    .replace(/[۰-۹]/g, char => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(char)));
}

export function normalizeNationalId(value: string): string {
  return toWesternDigits(value).replace(/[^0-9]/g, '');
}

export function isValidNationalId(value: string): boolean {
  return /^[0-9]{10}$/.test(normalizeNationalId(value));
}

export function isValidEmployeeEmail(value: string): boolean {
  const cleaned = value.trim();
  return cleaned === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned);
}

export function isValidChildrenCount(value: string): boolean {
  if (!value.trim()) return true;
  const normalized = toWesternDigits(value.trim());
  return /^[0-9]+$/.test(normalized) && Number(normalized) <= 100;
}

function isoParts(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const actual = new Date(Date.UTC(year, month - 1, day));
  if (!Number.isFinite(actual.getTime()) ||
      actual.getUTCFullYear() !== year || actual.getUTCMonth() !== month - 1 ||
      actual.getUTCDate() !== day) return null;
  return { year, month, day };
}

/** Age is complete Gregorian years, not a Hijri year count. */
export function calculateAgeFromIso(birthDate: string, today = new Date()): number | null {
  const dob = isoParts(birthDate);
  if (!dob) return null;
  const now = { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() };
  if (dob.year > now.year ||
      (dob.year === now.year && dob.month > now.month) ||
      (dob.year === now.year && dob.month === now.month && dob.day > now.day)) return null;
  let age = now.year - dob.year;
  if (now.month < dob.month || (now.month === dob.month && now.day < dob.day)) age--;
  return age;
}

export function joinedPrecedesOrEqualsBirth(birthDate: string, joined: string): boolean {
  return Boolean(isoParts(birthDate) && isoParts(joined) && joined <= birthDate);
}
