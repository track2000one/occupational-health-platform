import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const source=readFileSync(new URL('./v4FoundationHierarchyReference.ts', import.meta.url),'utf8');
const compiled=transformSync(source,{loader:'ts',format:'esm',target:'es2020'});
const h=await import('data:text/javascript;base64,'+Buffer.from(compiled.code).toString('base64'));

test('V4 source has 4 advisory sectors with 23 unique center names',()=>{
  assert.equal(Object.keys(h.V4_CENTER_SECTORS).length,4);
  const all=Object.values(h.V4_CENTER_SECTORS).flat();
  assert.equal(all.length,23);
  assert.equal(new Set(all).size,23);
  assert.equal(h.v4CenterSourceSector('الفيصلية'),'القطاع الغربي الاستشاري 1');
  assert.deepEqual(h.v4CenterNamesForSector('غير معروف'),[]);
});
test('center path has correct fixed cluster/network/main/sub levels',()=>{
  assert.equal(h.V4_FOUNDATION_CONTEXT.health_cluster,'تجمع الشرقية الصحي');
  assert.equal(h.V4_FOUNDATION_CONTEXT.health_network,'شبكة الدمام الصحية');
  assert.equal(h.V4_FOUNDATION_CONTEXT.center_main_administration,'الرعاية الأولية والمجتمعية');
  assert.equal(h.V4_FOUNDATION_CONTEXT.center_sub_administration,'القطاعات التشغيلية للرعاية الأولية');
});
test('four-level department source options retain parents and exclude the previously removed operation level',()=>{
  const mains=h.v4MainDepartmentChoices();
  assert.ok(mains.includes('الخدمات الطبية والإكلينيكية'));
  assert.ok(mains.includes('الرعاية الأولية والمجتمعية'));
  assert.ok(!mains.includes('التشغيل'));
  assert.deepEqual(h.v4DepartmentChoices(['الخدمات الطبية والإكلينيكية','الخدمات الصحية المساندة','خدمات إعادة التأهيل'],3),['العلاج الطبيعي']);
  assert.ok(h.v4DepartmentChoices(['الرعاية الأولية والمجتمعية','الصحة العامة'],2).includes('الصحة المهنية'));
  assert.ok(!h.V4_DEPARTMENT_SOURCE_PATHS.some(path => path[2]==='الوحدة الإدارية للفحص الشامل'));
});
test('no employee identity fields or placeholders are in organizational names',()=>{
  const fields=JSON.stringify({centers:h.V4_CENTER_SECTORS,paths:h.V4_DEPARTMENT_SOURCE_PATHS});
  assert.ok(!fields.includes('لا ينطبق'));
  assert.ok(!fields.includes('غير محدد في المصدر'));
  assert.ok(!fields.includes('الهوية'));
});
