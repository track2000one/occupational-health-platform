import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCenterName, exactCenterSuggestions } from './organizationMatching.ts';

test('safe Arabic normalization handles generic center labels only', () => {
  assert.equal(normalizeCenterName('مركز بدر الغربي الصحي'), normalizeCenterName('بدر الغربي'));
  assert.equal(normalizeCenterName('مركز صحي غــرناطة'), normalizeCenterName('غرناطة'));
  assert.notEqual(normalizeCenterName('بدر'), normalizeCenterName('بدر الغربي'));
  assert.notEqual(normalizeCenterName('الضاحية'), normalizeCenterName('حمد العمار الخالدي بالضاحية'));
});
test('only exact and unambiguous suggestions may be offered', () => {
  const centers = [
    { id: 1, name: 'مركز بدر' }, { id: 2, name: 'مركز بدر الغربي الصحي' },
    { id: 3, name: 'مركز صحي غرناطة' },
  ];
  assert.deepEqual(exactCenterSuggestions('بدر الغربي', centers).map(c=>c.id), [2]);
  assert.deepEqual(exactCenterSuggestions('بدر', centers).map(c=>c.id), [1]);
  assert.deepEqual(exactCenterSuggestions('الضاحية', centers), []);
  assert.deepEqual(exactCenterSuggestions('غرناطة', [...centers, {id: 4, name: 'غرناطة'}]).map(c=>c.id), [3,4]);
});
