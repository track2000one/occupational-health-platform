/** Normalization for suggestions only. Never uses fuzzy or substring matching. */
export function normalizeCenterName(value: string): string {
  let text = (value || '').normalize('NFKC').toLocaleLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  // Remove only whole generic prefix/suffix tokens. Named places stay distinct.
  text = text.replace(/^(?:مركز صحي|مركز الصحه|المركز الصحي|مركز|مركز الرعايه الصحيه)\s+/u, '');
  text = text.replace(/\s+(?:الصحي|الصحيه)$/u, '');
  return text.trim();
}
export type CenterCandidate = {
  id: number;
  name: string;
  name_ar?: string;
  name_en?: string;
};
export function exactCenterSuggestions<T extends CenterCandidate>(
  proposedName: string, centers: readonly T[],
): T[] {
  const expected = normalizeCenterName(proposedName);
  if (!expected) return [];
  return centers.filter(center =>
    [center.name, center.name_ar, center.name_en].some(
      name => name && normalizeCenterName(name) === expected,
    ),
  );
}
