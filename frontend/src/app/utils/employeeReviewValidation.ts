/** Strict, unambiguous restoration of legacy Excel review fields.
 * Never guess a center, even if the source contains a long organizational path.
 */
export type ReviewCenterOption = {
  id: number | string; name: string; name_ar?: string;
  is_active?: boolean;
};
export type ReviewNationalityOption = {
  code: string; countryAr: string; countryEn: string; nationalityAr: string;
};

export function normalizedReviewLabel(value: unknown): string {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase()
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[\u200c-\u200f\ufeff]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function restoreReviewCenterId(
  payload: Record<string, unknown>,
  centers: readonly ReviewCenterOption[],
): string {
  const activeCenters = centers.filter(center => center.is_active !== false);
  const existing = payload.health_center;
  const pk = typeof existing === 'number' ? existing : (
    typeof existing === 'string' && /^[1-9]\d*$/.test(existing) ? Number(existing) : NaN
  );
  if (Number.isSafeInteger(pk) && pk > 0) {
    const target = activeCenters.find(center => Number(center.id) === pk);
    if (target) return String(target.id);
  }
  const rawCandidates = [payload.health_center_name, payload.health_center]
    .filter((value): value is string => typeof value === 'string' && !!value.trim());
  for (const raw of rawCandidates) {
    const expected = normalizedReviewLabel(raw);
    if (!expected) continue;
    const matches = activeCenters.filter(center => [center.name, center.name_ar]
      .some(label => label && normalizedReviewLabel(label) === expected));
    if (matches.length === 1) return String(matches[0].id);
  }
  return '';
}

export function restoreReviewNationality(
  raw: unknown, countries: readonly ReviewNationalityOption[],
): string {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  const exactCode = countries.find(country => country.code === text.toUpperCase());
  if (exactCode) return exactCode.code;
  const expected = normalizedReviewLabel(text);
  const matches = countries.filter(country => {
    const labels = [
      country.countryAr, country.countryEn,
      ...country.nationalityAr.split(/\s+/).filter(Boolean),
    ];
    return labels.some(label => normalizedReviewLabel(label) === expected);
  });
  return matches.length === 1 ? matches[0].code : '';
}
