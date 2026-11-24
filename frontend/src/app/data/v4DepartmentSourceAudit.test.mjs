import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';

const source=readFileSync(new URL('./v4DepartmentSourceAudit.ts', import.meta.url),'utf8');
const built=transformSync(source,{loader:'ts',format:'esm',target:'es2020'});
const m=await import('data:text/javascript;base64,'+
  Buffer.from(built.code).toString('base64'));

test('source workbook has exactly 32 organizational aggregates weighted to 631 records',()=>{
  assert.equal(m.V4_DEPARTMENT_SOURCE_ROWS.length,32);
  assert.equal(m.V4_DEPARTMENT_SOURCE_ROWS.reduce(
    (total,row)=>total+row.sourceEmployees,0),631);
  assert.deepEqual(m.V4_DEPARTMENT_LABELS,[
    'الإدارة الرئيسية','الإدارة الفرعية','القسم','الوحدة الفرعية',
  ]);
});

test('classification does not pretend sectors or service labels are departments',()=>{
  const rows=m.V4_DEPARTMENT_SOURCE_ROWS;
  assert.equal(rows.filter(x=>m.classifySource(x).status==='matchable').length,22);
  assert.equal(rows.filter(x=>m.classifySource(x).status==='excluded_historical').length,3);
  assert.equal(rows.filter(x=>m.classifySource(x).status==='source_review').length,7);
  const gaps=rows.filter(x=>x.levels[3]&&!x.levels[2]);
  assert.equal(gaps.length,1);
  assert.equal(gaps[0].sourceEmployees,8);
  const sectorOnly=rows.filter(x=>x.sector&&!x.levels[1]);
  assert.ok(sectorOnly.length>=1);
  assert.ok(sectorOnly.every(x=>m.classifySource(x).status==='source_review'));
});

test('identical hierarchy path with different clinical categories is matched once',()=>{
  const paths=m.sourceOrganizationPaths();
  assert.equal(paths.filter(p=>p.status==='matchable').length,21);
  assert.equal(paths.filter(p=>p.status!=='matchable').length,10);
  const rehab=paths.find(x=>x.key===m.departmentPathKey([
    'الخدمات الطبية والإكلينيكية','الخدمات الصحية المساندة',
    'خدمات إعادة التأهيل','العلاج الطبيعي',
  ]));
  assert.ok(rehab);
  assert.equal(rehab.sourceEmployees,54);
  assert.equal(rehab.rowCount,2);
});

test('actual records must match all ancestors, not only same department name',()=>{
  const mk=(id,parent_id,name)=>({id,parent_id,name,
    code:'V4-D-'+id,is_active:true,is_approved:false});
  const units=[
    mk(1,null,'الرعاية الأولية والمجتمعية'),
    mk(2,1,'الصحة العامة'),
    mk(3,2,'الصحة المهنية'),
    mk(4,null,'قسم مستقل لكنه بنفس اسم الصحة المهنية'),
  ];
  const audit=m.auditDepartmentPaths(units);
  assert.equal(audit.matched.length,1);
  assert.equal(audit.matchableCount,21);
  assert.equal(audit.missing.length,20);
  assert.ok(audit.matched[0].key.includes('الصحة المهنية'));
  assert.equal(audit.broken.length,0);
});

test('orphaned and circular actual hierarchy links are shown for repair',()=>{
  const mk=(id,parent_id)=>({id,parent_id,name:'Test '+id,
    code:'V4-D-'+id,is_active:true,is_approved:false});
  const audit=m.auditDepartmentPaths([mk(1,999),mk(2,3),mk(3,2)]);
  assert.equal(audit.broken.length,3);
});

test('reference module never carries personal employee data',()=>{
  const text=JSON.stringify(m.V4_DEPARTMENT_SOURCE_ROWS);
  assert.ok(!text.includes('national_id'));
  assert.ok(!text.includes('رقم الهوية'));
  assert.ok(!text.includes('البريد الإلكتروني'));
  assert.ok(!text.includes('الجوال'));
});
