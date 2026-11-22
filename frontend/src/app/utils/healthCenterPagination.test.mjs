import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('./healthCenterPagination.ts', import.meta.url), 'utf8');
const output = transformSync(source, { loader: 'ts', format: 'esm', target: 'es2020' });
const { loadCenterPages } = await import(
  'data:text/javascript;base64,' + Buffer.from(output.code).toString('base64'),
);

test('shows center rows after page one and retains immutable snapshots', async () => {
  const snapshots = [];
  const all = await loadCenterPages(async page => page === 1
    ? {results:[{id:1},{id:2}],next:'/api/health-centers/?page=2'}
    : {results:[{id:3}],next:null}, items => snapshots.push(items));
  assert.deepEqual(all.map(x=>x.id),[1,2,3]);
  assert.deepEqual(snapshots.map(items => items.map(x=>x.id)),[[1,2],[1,2,3]]);
  assert.notEqual(snapshots[0],snapshots[1]);
});
test('never treats timeout or invalid response as an empty directory', async () => {
  const progress = [];
  await assert.rejects(loadCenterPages(async () => null, rows => progress.push(rows)),/غير صالحة/);
  assert.deepEqual(progress,[]);
  await assert.rejects(loadCenterPages(async () => {throw new Error('proxy timeout')}, () => {}),/proxy timeout/);
});
test('page 2 errors leave first page available to the UI', async () => {
  const progress = [];
  await assert.rejects(loadCenterPages(async page => {
    if(page===1)return {results:[{id:11}],next:'next'};
    throw new Error('second page unavailable');
  }, rows => progress.push(rows)),/second page unavailable/);
  assert.deepEqual(progress,[[{id:11}]]);
});
test('empty authenticated result is different from failed fetch', async () => {
  const progress=[];
  const rows=await loadCenterPages(async ()=>({results:[],next:null}),value=>progress.push(value));
  assert.deepEqual(rows,[]);
  assert.deepEqual(progress,[[]]);
});
