import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ORG_LEVELS, TOP_LEVELS, UNVERIFIED, NOT_APPLICABLE,
  emptyOrganizationalHierarchy, fromSourceHierarchy,
  updateHierarchyAffiliation, missingHierarchyLevels,
} from './employeeOrganizationalHierarchy.ts';

test('13 separate levels align with V4 order, no blanks on new form', () => {
  const values = emptyOrganizationalHierarchy();
  assert.equal(ORG_LEVELS.length, 13);
  assert.equal(missingHierarchyLevels(values).length, 0);
  for (const [key, value] of Object.entries(TOP_LEVELS)) {
    assert.equal(values[key as keyof typeof TOP_LEVELS], value);
  }
});

test('central department affiliation does not create a fake health center', () => {
  const values = updateHierarchyAffiliation(
    emptyOrganizationalHierarchy('department'),
    'department', 'الصحة المهنية',
  );
  assert.equal(values.department, 'الصحة المهنية');
  assert.equal(values.health_center, NOT_APPLICABLE);
  assert.equal(values.consultative_sector, NOT_APPLICABLE);
});

test('approved center populates the center level without guessing a sector', () => {
  const values = updateHierarchyAffiliation(
    emptyOrganizationalHierarchy(), 'center', 'مركز صحي العدامة',
  );
  assert.equal(values.health_center, 'مركز صحي العدامة');
  assert.equal(values.consultative_sector, UNVERIFIED);
  assert.equal(values.department, UNVERIFIED);
});

test('source labels appear in edit form; unknown levels remain explicit', () => {
  const values = fromSourceHierarchy({
    main_administration: 'الطبية والإكلينيكية',
    department: 'خدمات الأسنان',
  }, 'department');
  assert.equal(values.main_administration, 'الطبية والإكلينيكية');
  assert.equal(values.department, 'خدمات الأسنان');
  assert.equal(values.sub_unit, UNVERIFIED);
  assert.equal(values.health_center, NOT_APPLICABLE);
});
