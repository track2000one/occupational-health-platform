import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
const source = readFileSync(new URL('./v4DepartmentBulkSelection.ts', import.meta.url),'utf8');
const compiled=transformSync(source,{loader:'ts',format:'esm',target:'es2020'});
const {pendingV4DepartmentIds}=await import(
  'data:text/javascript;base64,'+Buffer.from(compiled.code).toString('base64')
);
test('select the 38 drafted active departments for review, parent-first is done on server',()=>{
  const draft=Array.from({length:38},(_,i)=>({
    id:i+1, code:'V4-D-'+(i+1), is_active:true, is_approved:false,
  }));
  assert.deepEqual(pendingV4DepartmentIds(draft),draft.map(item=>item.id));
});
test('exclude inactive, approved, foreign org records and duplicate ids from batch',()=>{
  assert.deepEqual(pendingV4DepartmentIds([
    {id:1,code:'V4-D-A',is_active:true,is_approved:false},
    {id:1,code:'V4-D-A',is_active:true,is_approved:false},
    {id:2,code:'V4-D-B',is_active:true,is_approved:true},
    {id:3,code:'V4-D-C',is_active:false,is_approved:false},
    {id:4,code:'LEGACY-D',is_active:true,is_approved:false},
  ]),[1]);
});
test('no draft departments means no activation write can be requested',()=>{
  assert.deepEqual(pendingV4DepartmentIds([]),[]);
});
