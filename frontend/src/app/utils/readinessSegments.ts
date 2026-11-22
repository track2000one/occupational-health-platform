/** Merge read-only 100-card readiness segments from the same unchanged batch.
 * Counts are additive; official directory size and report safety flags are NOT.
 * No employee identities or contacts are transmitted to the browser.
 */
type Segment = { offset: number; limit: number; next_offset: number; has_more: boolean };
export type ReadinessPiece = {
  batch_id: number | null;
  rows_total: number;
  rows_scanned?: number;
  segment?: Segment;
};
type Counts = Record<string, number>;
type ReadyCounters = Record<string, unknown>;

function counters(value: unknown): Counts {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Counts;
}
function sumCounts(left: unknown, right: unknown): Counts {
  const merged = { ...counters(left) };
  for (const [key, value] of Object.entries(counters(right))) {
    if (!Number.isFinite(value) || value < 0) throw new Error('Invalid readiness count');
    merged[key] = (merged[key] || 0) + value;
  }
  return merged;
}
function sumNumber(left: unknown, right: unknown) {
  const a = left === undefined ? 0 : Number(left);
  const b = right === undefined ? 0 : Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0)
    throw new Error('Invalid readiness summary value');
  return a + b;
}
const GROUPS = ['source_classification','original_registry','approved_center_name_check','optional_fields_missing'] as const;
const NESTED = ['same_name_review_only','different_name_unverified','blank_in_both_for_matching_name'] as const;
const HISTORIC_CENTER = ['original_linked_center','original_linked_to_currently_approved_center','original_source_center_text_available'] as const;

export function mergeReadinessSegments<T extends ReadinessPiece>(current: T | null, next: T): T {
  const chunk = next.segment;
  if (!chunk || next.rows_scanned === undefined
      || !Number.isInteger(chunk.offset) || !Number.isInteger(chunk.limit)
      || !Number.isInteger(next.rows_scanned) || chunk.limit < 1 || chunk.limit > 100
      || next.rows_scanned < 1 || next.rows_scanned > chunk.limit
      || next.rows_total <= 0 || chunk.next_offset !== chunk.offset + next.rows_scanned)
    throw new Error('Unexpected readiness segment');
  const progress = current?.rows_scanned || 0;
  if (chunk.offset !== progress || (current && (
      next.batch_id !== current.batch_id || next.rows_total !== current.rows_total)))
    throw new Error('Readiness batch changed during scan');
  if (chunk.has_more !== (chunk.next_offset < next.rows_total))
    throw new Error('Inconsistent readiness progress');
  if (!current) return { ...next };
  const a = current as ReadyCounters;
  const b = next as ReadyCounters;
  const merged: ReadyCounters = { ...a, rows_scanned: progress + next.rows_scanned, segment: chunk };
  for (const key of GROUPS) merged[key] = sumCounts(a[key], b[key]);
  const historicalA = a.historical_values_for_missing_source as ReadyCounters || {};
  const historicalB = b.historical_values_for_missing_source as ReadyCounters || {};
  merged.historical_values_for_missing_source = Object.fromEntries(
    NESTED.map(key => [key, sumCounts(historicalA[key], historicalB[key])]),
  );
  const directoryA = a.official_center_directory as ReadyCounters || {};
  const directoryB = b.official_center_directory as ReadyCounters || {};
  if (directoryA.active_approved_count !== directoryB.active_approved_count)
    throw new Error('Official center directory changed during scan');
  merged.official_center_directory = { ...directoryA,
    ...Object.fromEntries(HISTORIC_CENTER.map(key =>
      [key, sumNumber(directoryA[key], directoryB[key])])),
  };
  for (const key of ['source_name_matches_original','archived_active_name_match_for_review',
                      'cards_missing_any_optional_field']) {
    merged[key] = sumNumber(a[key], b[key]);
  }
  return merged as T;
}
