import assert from 'node:assert/strict';
import test from 'node:test';
import {
  JOB_TITLES, getNationalityOptions, normalizeNationalitySearch,
} from './employeeFormOptions.ts';

test('exactly 116 distinct job titles are supplied by the reference workbook', () => {
  assert.equal(JOB_TITLES.length, 116);
  assert.equal(new Set(JOB_TITLES).size, 116);
  assert.ok(JOB_TITLES.includes('طبيب عام'));
  assert.ok(JOB_TITLES.includes('مساعد إداري ممارس'));
  assert.ok(JOB_TITLES.includes('Registrar'));
});

test('Saudi Arabia first, then Arab countries, then other searchable countries', () => {
  const options = getNationalityOptions();
  assert.equal(options[0].code, 'SA');
  assert.deepEqual(options.slice(0, 7).map(item => item.code), ['SA','AE','BH','KW','OM','QA','YE']);
  assert.equal(new Set(options.map(item => item.code)).size, options.length);
  assert.ok(options.length >= 240);
  const sa = options.find(item => item.code === 'SA');
  const eg = options.find(item => item.code === 'EG');
  const us = options.find(item => item.code === 'US');
  assert.ok(sa && eg && us);
  assert.equal(sa.countryAr, 'السعودية');
  assert.equal(options.find(item => item.code === 'BH')?.countryAr, 'البحرين');
  assert.equal(options.find(item => item.code === 'KW')?.countryAr, 'الكويت');
  assert.equal(eg.countryAr, 'مصر');
  assert.ok(!sa.countryAr.includes('—'));
  assert.ok(sa.searchText.includes(normalizeNationalitySearch('المملكة العربية السعودية')));
  assert.ok(options.find(item => item.code === 'BH')?.searchText.includes(normalizeNationalitySearch('بحريني')));
  assert.ok(sa.searchText.includes(normalizeNationalitySearch('السعودية')));
  assert.ok(sa.searchText.includes(normalizeNationalitySearch('سعودي')));
  assert.ok(eg.searchText.includes(normalizeNationalitySearch('مصري')));
  assert.ok(us.searchText.includes('united states'));
});
