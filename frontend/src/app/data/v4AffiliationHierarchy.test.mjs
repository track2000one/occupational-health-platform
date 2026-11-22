import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
const code = readFileSync(new URL('./v4AffiliationHierarchy.ts', import.meta.url), 'utf8');
const { code: js } = transformSync(code, { loader: 'ts', format: 'esm', target: 'es2020',
  define: { 'import.meta.env.VITE_API_URL': '"http://127.0.0.1:18081/api"' } });
const { departmentPath, departmentChildren, approvedSectorCenters } =
  await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const node = (id, parent_id, extra = {}) => ({ id, parent_id, code: 'V4-D-'+id,
  name: String(id), kind: 'department', health_center_id: null, is_approved: true,
  is_active: true, ...extra });
const nodes = [node(1,null),node(2,1),node(3,2),node(4,3),
  node(5,null),node(6,5),node(7,1,{is_approved:false}),
  node(8,7),node(9,null,{code:'LEGACY-9'})];
test('children are filtered by verified parent, and a shorter path is valid', () => {
  assert.deepEqual(departmentPath(nodes,4).map(n=>n.id),[1,2,3,4]);
  assert.deepEqual(departmentPath(nodes,2).map(n=>n.id),[1,2]);
  assert.deepEqual(departmentChildren(nodes,1).map(n=>n.id),[2]);
  assert.deepEqual(departmentChildren(nodes,null).map(n=>n.id),[1,5]);
  assert.deepEqual(departmentPath(nodes,8),[]);
});
test('invalid, overly deep and cyclic paths are excluded',()=>{
  assert.deepEqual(departmentPath([...nodes,node(10,4)],10),[]);
  assert.deepEqual(departmentPath([node(1,2),node(2,1)],1),[]);
  assert.deepEqual(departmentPath([node(1,999)],1),[]);
});
test('centers are restricted to the selected approved sector',()=>{
  const sector = node(21,null,{kind:'sector'});
  const other = node(22,null,{kind:'sector'});
  const center = node(23,21,{kind:'center',health_center_id:10});
  const foreign = node(24,22,{kind:'center',health_center_id:11});
  const draft = node(25,21,{kind:'center',health_center_id:12,is_approved:false});
  assert.deepEqual(approvedSectorCenters([sector,other,center,foreign,draft],21).map(n=>n.id),[23]);
});
