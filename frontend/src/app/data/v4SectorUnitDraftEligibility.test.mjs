import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const source=readFileSync(new URL('./v4SectorUnitDraftEligibility.ts', import.meta.url),'utf8');
const compiled=transformSync(source,{loader:'ts',format:'esm',target:'es2020'});
const {canPreviewSectorUnitDraft}=await import(
  'data:text/javascript;base64,'+Buffer.from(compiled.code).toString('base64'));

test('V4 draft preview remains visible with existing active sector pending approval',()=>{
  assert.equal(canPreviewSectorUnitDraft({
    status:'unit_missing',can_create_link:true,sector_active:true,sector_activated:false,
  }),true);
  assert.equal(canPreviewSectorUnitDraft({
    status:'unit_missing',can_create_link:true,sector_active:true,sector_activated:true,
  }),true);
});
test('no draft preview for inactive, ambiguous, missing or conflicting sector or unit',()=>{
  for(const status of ['sector_missing','sector_ambiguous','sector_invalid',
    'already_linked','unit_conflict','unit_ambiguous']){
    assert.equal(canPreviewSectorUnitDraft({
      status,can_create_link:true,sector_active:true,sector_activated:false,
    }),false);
  }
  assert.equal(canPreviewSectorUnitDraft({
    status:'unit_missing',can_create_link:true,sector_active:false,sector_activated:true,
  }),false);
  assert.equal(canPreviewSectorUnitDraft({
    status:'unit_missing',can_create_link:false,sector_active:true,sector_activated:false,
  }),false);
  assert.equal(canPreviewSectorUnitDraft(null),false);
});
