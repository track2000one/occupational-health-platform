/** Aggregate guarded, read-only V4 employee-to-organization preview segments.
 * Reject a changed directory/batch or a partial result; do not turn source labels
 * into approved employee affiliations.
 */
export type AffiliationKind = 'center' | 'department' | 'unknown';
export type AffiliationState = 'matched_approved' | 'matched_pending_reference' |
  'missing_in_directory' | 'ambiguous_directory' | 'missing_source' | 'invalid_hierarchy';
export type AffiliationPathCount = {
  kind: AffiliationKind;
  state: AffiliationState;
  path: string;
  code: string;
  count: number;
};
export type AffiliationPreview = {
  mode: 'v4_provisional_affiliation_preview_read_only';
  batch_id: number;
  rows_total: number;
  rows_scanned: number;
  directory_snapshot: string;
  segment: { offset: number; limit: number; next_offset: number; has_more: boolean };
  source_kinds: Record<AffiliationKind, number>;
  statuses: Record<AffiliationState, number>;
  source_review_flags: number;
  paths: AffiliationPathCount[];
  organizations_created: 0;
  employees_created: 0;
  employees_modified: 0;
  health_centers_modified: 0;
  approvals_created: 0;
  notice: string;
};

const KINDS: AffiliationKind[] = ['center','department','unknown'];
const STATES: AffiliationState[] = [
  'matched_approved','matched_pending_reference','missing_in_directory',
  'ambiguous_directory','missing_source','invalid_hierarchy',
];

function total(input: Record<string, number>) {
  return Object.values(input).reduce((sum, value) => {
    if (!Number.isInteger(value) || value < 0) throw new Error('Invalid affiliation count');
    return sum + value;
  }, 0);
}

function isSafeResult(result: AffiliationPreview) {
  return result.mode === 'v4_provisional_affiliation_preview_read_only' &&
    Boolean(result.directory_snapshot) && result.batch_id > 0 &&
    Number.isInteger(result.rows_scanned) && result.rows_scanned > 0 &&
    result.rows_scanned <= 100 && result.segment.limit <= 100 &&
    result.segment.next_offset === result.segment.offset + result.rows_scanned &&
    result.segment.has_more === (result.segment.next_offset < result.rows_total) &&
    total(result.source_kinds) === result.rows_scanned &&
    total(result.statuses) === result.rows_scanned &&
    result.source_review_flags >= 0 && result.source_review_flags <= result.rows_scanned &&
    result.organizations_created === 0 && result.employees_created === 0 &&
    result.employees_modified === 0 && result.health_centers_modified === 0 &&
    result.approvals_created === 0 &&
    total(Object.fromEntries(result.paths.map((path,i)=>[String(i), path.count]))) === result.rows_scanned;
}

export function mergeAffiliationPreview(
  current: AffiliationPreview | null,
  incoming: AffiliationPreview,
): AffiliationPreview {
  if (!isSafeResult(incoming) || incoming.segment.offset !== (current?.rows_scanned || 0))
    throw new Error('معاينة التبعية غير متسقة؛ لم يتم إجراء أي ربط.');
  if (current && (current.batch_id !== incoming.batch_id ||
      current.rows_total !== incoming.rows_total ||
      current.directory_snapshot !== incoming.directory_snapshot)) {
    throw new Error('تغيرت دفعة الموظفين أو الدليل التنظيمي أثناء المعاينة؛ أعد الفحص.');
  }
  if (!current) return incoming;
  const source_kinds = { ...current.source_kinds };
  for (const key of KINDS) source_kinds[key] += incoming.source_kinds[key];
  const statuses = { ...current.statuses };
  for (const key of STATES) statuses[key] += incoming.statuses[key];
  const paths = new Map<string, AffiliationPathCount>();
  for (const path of [...current.paths, ...incoming.paths]) {
    const key = JSON.stringify([path.kind,path.state,path.path,path.code]);
    const previous = paths.get(key);
    paths.set(key, {...path, count:path.count + (previous?.count || 0)});
  }
  return {
    ...incoming,
    rows_scanned: current.rows_scanned + incoming.rows_scanned,
    source_kinds, statuses,
    source_review_flags: current.source_review_flags + incoming.source_review_flags,
    paths: [...paths.values()].sort((a,b) => b.count - a.count || a.path.localeCompare(b.path,'ar')),
  };
}
