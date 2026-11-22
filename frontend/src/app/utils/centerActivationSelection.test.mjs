import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('./centerActivationSelection.ts', import.meta.url), 'utf8');
const compiled = transformSync(source, { loader: 'ts', format: 'esm', target: 'es2020' });
const { canActivateCenter, selectableCenterIds, retainVisibleSelection, toggleVisibleCenter } =
  await import('data:text/javascript;base64,' + Buffer.from(compiled.code).toString('base64'));

const centers = Array.from({ length: 25 }, (_, index) => ({
  id: index + 1, is_active: true, is_archived: false, approval_status: 'pending',
}));

test('V4 select-all selects the 25 visible eligible centers only', () => {
  assert.deepEqual(selectableCenterIds(centers), Array.from({length:25}, (_, n)=>n+1));
  assert.deepEqual(selectableCenterIds(centers.slice(0,3)), [1,2,3]);
});

test('already activated, inactive and archived cards cannot be activated', () => {
  const mixed = [
    centers[0],
    { ...centers[1], approval_status: 'approved' },
    { ...centers[2], is_active: false },
    { ...centers[3], is_archived: true },
  ];
  assert.deepEqual(selectableCenterIds(mixed), [1]);
  for (const center of mixed.slice(1)) assert.equal(canActivateCenter(center), false);
});

test('individual checkboxes toggle without duplicates or ineligible IDs', () => {
  const visible = [centers[0], centers[1]];
  assert.deepEqual(toggleVisibleCenter([], 1, visible), [1]);
  assert.deepEqual(toggleVisibleCenter([1], 2, visible), [1,2]);
  assert.deepEqual(toggleVisibleCenter([1,2], 1, visible), [2]);
  assert.deepEqual(toggleVisibleCenter([1,2], 999, visible), [1,2]);
  assert.deepEqual(selectableCenterIds([centers[0], centers[0]]), [1]);
});

test('changed filters clear hidden IDs instead of activating unseen centers', () => {
  assert.deepEqual(retainVisibleSelection([1,2,3], [centers[1]]), [2]);
  assert.deepEqual(retainVisibleSelection([1,2,3], []), []);
  assert.deepEqual(retainVisibleSelection([1,1,2], [centers[0], centers[1]]), [1,2]);
});

test('selection is consistent across card/table display and archive switch', () => {
  const sameRows = centers.slice(0,4);
  const ids = selectableCenterIds(sameRows);
  assert.deepEqual(retainVisibleSelection(ids, sameRows), ids);
  assert.deepEqual(retainVisibleSelection(ids, []), []);
});
