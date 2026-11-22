import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('./v4DepartmentReviewGuidance.ts', import.meta.url), 'utf8');
const transpiled = transformSync(source, { loader: 'ts', format: 'esm', target: 'es2020' });
const { departmentReviewGuidance: guidance } = await import(
  'data:text/javascript;base64,' + Buffer.from(transpiled.code).toString('base64')
);

const root = {id:1,code:'V4-D-ROOT',name:'الإدارة الرئيسية',parent_id:null,health_center_id:null,is_active:true,is_approved:false};
const child = {id:2,code:'V4-D-SUB',name:'الإدارة الفرعية',parent_id:1,health_center_id:null,is_active:true,is_approved:false};

test('approved parent is required before child approval; legal V4 parent is not a legacy warning',()=>{
  assert.equal(guidance(root,[root,child]).canApprove,true);
  const wait = guidance(child,[root,child]);
  assert.equal(wait.canApprove,false);
  assert.equal(wait.kind,'info');
  assert.match(wait.label,/اعتماد الإدارة الأعلى/);
  const approvedRoot={...root,is_approved:true};
  const ready=guidance(child,[approvedRoot,child]);
  assert.equal(ready.canApprove,true);
  assert.match(ready.label,/جاهزة/);
});
test('unverified, legacy and center-affiliated links remain blocked',()=>{
  assert.equal(guidance({...child,code:'OLD-2'},[root,child]).kind,'warning');
  assert.equal(guidance({...child,health_center_id:9},[root,child]).canApprove,false);
  assert.equal(guidance({...child,parent_id:99},[root,child]).canApprove,false);
  assert.equal(guidance({...child,is_active:false},[root,child]).canApprove,false);
  assert.equal(guidance({...child,parent_id:1},[{...root,code:'LEGACY'}]).canApprove,false);
});
