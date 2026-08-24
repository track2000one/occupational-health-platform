export type DateCalendar = 'gregorian' | 'hijri';

export type CalendarDateParts = {
  year: number;
  month: number;
  day: number;
};

export const MIN_HIJRI_YEAR = 1300;
export const MAX_HIJRI_YEAR = 1600;

const HIJRI_LOCALE = 'en-US-u-ca-islamic-umalqura';
const hijriFormatter = new Intl.DateTimeFormat(HIJRI_LOCALE, {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  timeZone: 'UTC',
});

const conversionCache = new Map<string, string | null>();

export function normalizeDateDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function formatIsoDate(parts: CalendarDateParts) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function gregorianToHijriParts(isoDate?: string | null): CalendarDateParts | null {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;

  const values: Partial<Record<'year' | 'month' | 'day', number>> = {};
  for (const part of hijriFormatter.formatToParts(date)) {
    if (part.type === 'year' || part.type === 'month' || part.type === 'day') {
      values[part.type] = Number(normalizeDateDigits(part.value));
    }
  }

  if (!values.year || !values.month || !values.day) return null;
  return { year: values.year, month: values.month, day: values.day };
}

export function gregorianToHijri(isoDate?: string | null) {
  const parts = gregorianToHijriParts(isoDate);
  return parts ? formatIsoDate(parts) : '';
}

export function parseCalendarDate(value: string): CalendarDateParts | null {
  const normalized = normalizeDateDigits(value.trim()).replace(/[/.]/g, '-');
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  if (parts.year < MIN_HIJRI_YEAR || parts.year > MAX_HIJRI_YEAR || parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 30) return null;
  return parts;
}

export function hijriToGregorian(value: string) {
  const parts = parseCalendarDate(value);
  if (!parts) return null;
  const key = formatIsoDate(parts);
  if (conversionCache.has(key)) return conversionCache.get(key) ?? null;

  // A Hijri year overlaps two Gregorian years. Searching this small, bounded
  // UTC range keeps conversion aligned with the browser's Umm al-Qura calendar.
  const approximateGregorianYear = parts.year + 579;
  const start = Date.UTC(approximateGregorianYear - 1, 0, 1);
  const end = Date.UTC(approximateGregorianYear + 1, 11, 31);
  for (let timestamp = start; timestamp <= end; timestamp += 86_400_000) {
    const date = new Date(timestamp);
    const iso = date.toISOString().slice(0, 10);
    const converted = gregorianToHijriParts(iso);
    if (converted) conversionCache.set(formatIsoDate(converted), iso);
    if (converted && converted.year === parts.year && converted.month === parts.month && converted.day === parts.day) {
      return iso;
    }
  }

  conversionCache.set(key, null);
  return null;
}

export function daysInHijriMonth(year: number, month: number) {
  if (hijriToGregorian(formatIsoDate({ year, month, day: 30 }))) return 30;
  if (hijriToGregorian(formatIsoDate({ year, month, day: 29 }))) return 29;
  return 0;
}
