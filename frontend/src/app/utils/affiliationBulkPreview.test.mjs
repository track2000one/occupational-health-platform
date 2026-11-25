import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('./affiliationBulkPreview.ts', import.meta.url), 'utf8');
const built = transformSync(source, {loader:'ts', format:'esm', target:'es2020'});
const { mergeAffiliationPreview } = await import(
  'data:text/javascript;base64,' + Buffer.from(built.code).toString('base64'),
);

function segment(offset, n, snapshot='stable', batch=5) {
  const path = offset === 0
    ? {kind:'center', state:'matched_pending_reference', path:'الغربي 1 / الفيصلية', code:'TMP-C001', count:n}
    : {kind:'department', state:'matched_pending_reference', path:'الصحة العامة / الصحة المهنية', code:'V4-D-ABC', count:n};
  return {
    mode:'v4_provisional_affiliation_preview_read_only',
    batch_id:batch, rows_total:3, rows_scanned:n, directory_snapshot:snapshot,
    segment:{offset,limit:2,next_offset:offset+n,has_more:offset+n<3},
    source_kinds:{center:offset===0?n:0, department:offset===0?0:n, unknown:0},
    statuses:{matched_approved:0,matched_pending_reference:n,missing_in_directory:0,
      ambiguous_directory:0,missing_source:0,invalid_hierarchy:0},
    source_review_flags:offset===0?1:0,
    paths:[path],
    organizations_created:0, employees_created:0, employees_modified:0,
    health_centers_modified:0, approvals_created:0,
    notice:'Preview only',
  };
}
test('merges V4 100-row preview segments and never implies employee writes',()=>{
  const one=mergeAffiliationPreview(null,segment(0,2));
  const all=mergeAffiliationPreview(one,segment(2,1));
  assert.equal(all.rows_scanned,3);
  assert.equal(all.source_kinds.center,2);
  assert.equal(all.source_kinds.department,1);
  assert.equal(all.statuses.matched_pending_reference,3);
  assert.equal(all.source_review_flags,1);
  assert.equal(all.paths.length,2);
  assert.equal(all.employees_modified,0);
  assert.equal(all.approvals_created,0);
});
test('rejects stale batch, directory change, repeated or partial segment',()=>{
  const first=mergeAffiliationPreview(null,segment(0,2));
  assert.throws(()=>mergeAffiliationPreview(first,segment(2,1,'new-snapshot')),/تغيرت/);
  assert.throws(()=>mergeAffiliationPreview(first,segment(2,1,'stable',6)),/تغيرت/);
  assert.throws(()=>mergeAffiliationPreview(first,segment(0,2)),/غير متسقة/);
  assert.throws(()=>mergeAffiliationPreview(null,{...segment(0,2),employees_created:1}),/غير متسقة/);
  assert.throws(()=>mergeAffiliationPreview(null,{...segment(0,2),statuses:{...segment(0,2).statuses,matched_pending_reference:1}}),/غير متسقة/);
});
