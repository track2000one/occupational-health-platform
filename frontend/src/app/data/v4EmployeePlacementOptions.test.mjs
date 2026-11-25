import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('./v4EmployeePlacementOptions.ts', import.meta.url), 'utf8');
const compiled = transformSync(source, { loader:'ts', format:'esm', target:'es2020' });
const { v4RegisteredCenters, v4VisibleDepartments } = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled.code).toString('base64')
);

test('all 25 master centers remain available when no proposed sectors are activated', () => {
  const centers = Array.from({length:25}, (_,i)=>({id:i+1,is_active:true,name:'مركز '+(i+1)}));
  assert.equal(v4RegisteredCenters(centers).length,25);
  assert.deepEqual(v4RegisteredCenters([{id:1,is_active:false}, ...centers]).map(x=>x.id),
    centers.map(x=>x.id));
});

test('38 draft departments appear in the directory before activation', () => {
  const drafts=Array.from({length:38},(_,i)=>({
    id:i+1,kind:'department',is_active:true,is_approved:false,code:'V4-D-'+(i+1),
  }));
  assert.equal(v4VisibleDepartments(drafts).length,38);
  assert.equal(v4VisibleDepartments(drafts).filter(x=>x.is_approved).length,0);
});

test('foreign sectors, archived/inactive department records and center-org entries stay excluded', () => {
  const rows=[
    {kind:'department',is_active:true,code:'V4-D-1'},
    {kind:'department',is_active:false,code:'V4-D-2'},
    {kind:'department',is_active:true,code:'LEGACY-3'},
    {kind:'center',is_active:true,code:'V4-D-4'},
    {kind:'sector',is_active:true,code:'SECTOR-1'},
  ];
  assert.deepEqual(v4VisibleDepartments(rows).map(x=>x.code), ['V4-D-1']);
});
