import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
const code = readFileSync(new URL('./readinessSegments.ts', import.meta.url), 'utf8');
const built = transformSync(code,{loader:'ts',format:'esm',target:'es2020'});
const { mergeReadinessSegments } = await import(
  'data:text/javascript;base64,' + Buffer.from(built.code).toString('base64'),
);

function report(offset, scan, counts, batch_id = 91) {
  return {
    batch_id, rows_total: 3, rows_scanned:scan,
    segment:{offset,limit:2,next_offset:offset+scan,has_more:offset+scan<3},
    source_classification:{not_in_registry:counts},
    original_registry:{no_original_record:counts,archived:0},
    approved_center_name_check:{missing_in_file:counts,approved_exact_unique:0,not_applicable:0},
    source_affiliation_kind:{center:counts,department:0,unresolved:0,legacy_unknown:0},
    optional_fields_missing:{email:counts},
    historical_values_for_missing_source:{
      same_name_review_only:{email:counts},
      different_name_unverified:{email:0},
      blank_in_both_for_matching_name:{email:counts},
    },
    official_center_directory:{
      active_approved_count:23,
      original_linked_center:counts,
      original_linked_to_currently_approved_center:0,
      original_source_center_text_available:counts,
    },
    source_name_matches_original:0,
    archived_active_name_match_for_review:0,
    cards_missing_any_optional_field:counts,
    approved_count:0, creates_employee_records:false,
    modifies_employee_records:false, modifies_clinical_records:false,
    notice:'Read-only',
  };
}
test('combines V4 report segments without inflating official directory count',()=>{
  const initial = mergeReadinessSegments(null,report(0,2,2));
  const full = mergeReadinessSegments(initial,report(2,1,1));
  assert.equal(full.rows_scanned,3);
  assert.equal(full.source_classification.not_in_registry,3);
  assert.equal(full.source_affiliation_kind.center,3);
  assert.equal(full.original_registry.no_original_record,3);
  assert.equal(full.optional_fields_missing.email,3);
  assert.equal(full.historical_values_for_missing_source.same_name_review_only.email,3);
  assert.equal(full.official_center_directory.active_approved_count,23);
  assert.equal(full.official_center_directory.original_linked_center,3);
  assert.equal(full.cards_missing_any_optional_field,3);
  assert.equal(full.approved_count,0);
  assert.equal(full.modifies_employee_records,false);
});
test('blocks incomplete, changed or overlapping V4 report scans',()=>{
  const first=mergeReadinessSegments(null,report(0,2,2));
  assert.throws(()=>mergeReadinessSegments(first,report(1,2,2)),/batch changed/);
  assert.throws(()=>mergeReadinessSegments(first,report(2,1,1,92)),/batch changed/);
  assert.throws(()=>mergeReadinessSegments(null,report(1,2,2)),/batch changed/);
  assert.throws(()=>mergeReadinessSegments(null,{...report(0,2,2), rows_scanned:0}),/Unexpected/);
});
