import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeNationalId, isValidNationalId, isValidEmployeeEmail,
  isValidChildrenCount, calculateAgeFromIso, joinedPrecedesOrEqualsBirth,
} from './employeeFormValidation.ts';

test('accepts real ten-digit input and converts Arabic/Persian numerals', () => {
  assert.equal(isValidNationalId('9991234567'), true);
  assert.equal(isValidNationalId('٩٩٩١٢٣٤٥٦٧'), true);
  assert.equal(normalizeNationalId('۹۹۹۱۲۳۴۵۶۷'), '9991234567');
  assert.equal(isValidNationalId('999123456'), false);
  assert.equal(isValidNationalId('99912345670'), false);
});

test('validates optional email and children correctly', () => {
  assert.equal(isValidEmployeeEmail(''), true);
  assert.equal(isValidEmployeeEmail('test@example.invalid'), true);
  assert.equal(isValidEmployeeEmail('@م.ص'), false);
  assert.equal(isValidChildrenCount(''), true);
  assert.equal(isValidChildrenCount('٢'), true);
  assert.equal(isValidChildrenCount('101'), false);
  assert.equal(isValidChildrenCount('1.5'), false);
});

test('computes age in completed years and handles a recent birth as age zero', () => {
  const today = new Date(2026, 10, 1);
  assert.equal(calculateAgeFromIso('1987-12-23', today), 38);
  assert.equal(calculateAgeFromIso('2000-10-31', today), 26);
  assert.equal(calculateAgeFromIso('2026-10-14', today), 0);
  assert.equal(calculateAgeFromIso('2027-01-01', today), null);
  assert.equal(calculateAgeFromIso('2026-02-30', today), null);
});

test('prevents a joining date before or equal to birth date', () => {
  assert.equal(joinedPrecedesOrEqualsBirth('2026-10-14', '1987-12-23'), true);
  assert.equal(joinedPrecedesOrEqualsBirth('1987-12-23', '2016-01-01'), false);
  assert.equal(joinedPrecedesOrEqualsBirth('', '2016-01-01'), false);
});
