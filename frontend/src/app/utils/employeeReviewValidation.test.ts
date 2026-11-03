import assert from 'node:assert/strict';
import test from 'node:test';
import {
  restoreReviewCenterId, restoreReviewNationality, normalizedReviewLabel,
} from './employeeReviewValidation.ts';

const centers = [
  { id: 10, name: 'مركز صحي بدر', name_ar: 'بدر', is_active: true },
  { id: 11, name: 'مركز بدر الغربي', name_ar: 'بدر الغربي', is_active: true },
  { id: 12, name: 'مركز صحي اليرموك', is_active: false },
];

test('existing active primary key restores as a valid ID string', () => {
  assert.equal(restoreReviewCenterId({ health_center: 10 }, centers), '10');
  assert.equal(restoreReviewCenterId({ health_center: '11' }, centers), '11');
  assert.equal(restoreReviewCenterId({ health_center: '0' }, centers), '');
  assert.equal(restoreReviewCenterId({ health_center: 12 }, centers), '');
});

test('legacy text aliases recover unambiguously without mixing centers', () => {
  assert.equal(restoreReviewCenterId({ health_center: null, health_center_name: 'بدر الغربي' }, centers), '11');
  assert.equal(restoreReviewCenterId({ health_center: 'بدر' }, centers), '10');
  assert.equal(restoreReviewCenterId({ health_center_name: 'مجمع الشرقية / بدر الغربي' }, centers), '');
  assert.equal(restoreReviewCenterId({ health_center: null }, centers), '');
  const ambiguous = [...centers, { id: 13, name: 'بدر', is_active: true }];
  assert.equal(restoreReviewCenterId({ health_center_name: 'بدر' }, ambiguous), '');
});

test('historical Arabic country name maps to code without invalid fallback', () => {
  const nations = [
    { code: 'SA', countryAr: 'السعودية', countryEn: 'Saudi Arabia', nationalityAr: 'سعودي سعودية' },
    { code: 'BH', countryAr: 'البحرين', countryEn: 'Bahrain', nationalityAr: 'بحريني بحرينية' },
  ];
  assert.equal(restoreReviewNationality('SA', nations), 'SA');
  assert.equal(restoreReviewNationality('السعودية', nations), 'SA');
  assert.equal(restoreReviewNationality('سعودية', nations), 'SA');
  assert.equal(restoreReviewNationality('البحرين', nations), 'BH');
  assert.equal(restoreReviewNationality('بلد غير موجود', nations), '');
  assert.equal(normalizedReviewLabel('الإقامة'), normalizedReviewLabel('الاقامة'));
});
