import assert from 'node:assert/strict';
import test from 'node:test';
import { isExcludedEmployeeCenter, selectableEmployeeCenters } from './employeeCenterOptions.ts';

const excluded = [
  'حمد العمار الخالدي بالضاحية',
  'عيادة الموظفين',
  'مركز الصحة المهنية الرئيسي',
  'وحدة اللجنة الطبية',
];

test('exclude only the four requested center names from employee selection', () => {
  for (const name of excluded) {
    assert.equal(isExcludedEmployeeCenter({ name }), true, name);
  }
  assert.equal(isExcludedEmployeeCenter({ name: 'مركز صحي آخر' }), false);
  assert.equal(isExcludedEmployeeCenter({ name: 'عيادة الموظفين بالظهران' }), false);
});

test('normalize whitespace and Arabic diacritics and check alternate Arabic label', () => {
  assert.equal(isExcludedEmployeeCenter({ name: '  عيادة   الموظفين  ' }), true);
  assert.equal(isExcludedEmployeeCenter({ name: 'Employee Clinic', name_ar: 'مَرْكَز الصحة المهنية الرئيسي' }), true);
});

test('retain unrelated centers and preserve source collection for existing employee history', () => {
  const centers = [
    { id: 1, name: 'عيادة الموظفين' },
    { id: 2, name: 'مركز صحي الظهران' },
    { id: 3, name: 'Medical Committee', name_ar: 'وحدة اللجنة الطبية' },
  ];
  assert.deepEqual(selectableEmployeeCenters(centers).map(center => center.id), [2]);
  assert.equal(centers.length, 3);
});
