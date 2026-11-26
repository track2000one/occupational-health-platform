import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ORG_LEVELS, TOP_LEVELS, UNVERIFIED, NOT_APPLICABLE,
  emptyOrganizationalHierarchy, fromSourceHierarchy,
  updateHierarchyAffiliation, missingHierarchyLevels, hierarchyFromApprovedPath, type ApprovedOrgNode,
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

test('center sector derives from approved parent IDs and rejects missing ancestors', () => {
  const mk = (id: number, name: string, kind: ApprovedOrgNode['kind'], parent_id: number | null, health_center_id: number | null = null): ApprovedOrgNode =>
    ({ id, name, kind, parent_id, health_center_id, is_active: true, is_approved: true });
  const root = mk(1, TOP_LEVELS.health_cluster, 'department', null);
  const network = mk(2, TOP_LEVELS.health_network, 'department', 1);
  const sector = mk(3, 'القطاع الشرقي الاستشاري 2', 'sector', 2);
  const center = mk(4, 'الجلوية', 'center', 3, 41);
  const rows = [root, network, sector, center];
  assert.equal(hierarchyFromApprovedPath(rows, center, 'الجلوية')?.consultative_sector, sector.name);
  assert.equal(hierarchyFromApprovedPath(rows.filter(n => n.id !== 2), center, 'الجلوية'), null);
  const main = mk(5, 'الرعاية الأولية والمجتمعية', 'department', 2);
  const sub = mk(6, 'الصحة العامة', 'department', 5);
  const department = mk(7, 'الصحة المهنية', 'department', 6);
  const result = hierarchyFromApprovedPath([...rows, main, sub, department], department);
  assert.equal(result?.main_administration, main.name);
  assert.equal(result?.sub_administration, sub.name);
  assert.equal(result?.health_center, NOT_APPLICABLE);
});

test('explicit synchronization preserves descriptive values and does not mutate original source', async () => {
  const { synchronizeVerifiedHierarchy, hasHierarchyChanges } = await import('./employeeOrganizationalHierarchy.ts');
  const source = emptyOrganizationalHierarchy('center');
  source.service_program = 'برنامج محفوظ';
  source.consultative_sector = 'قطاع سابق';
  const verified = emptyOrganizationalHierarchy('center');
  verified.consultative_sector = 'القطاع الشرقي الاستشاري 1';
  verified.health_center = 'إسكان الدمام';
  const result = synchronizeVerifiedHierarchy(source, verified);
  assert.equal(result.service_program, 'برنامج محفوظ');
  assert.equal(result.consultative_sector, 'القطاع الشرقي الاستشاري 1');
  assert.equal(source.consultative_sector, 'قطاع سابق');
  assert.equal(hasHierarchyChanges(source, result), true);
  assert.equal(hasHierarchyChanges(result, { ...result }), false);
});
