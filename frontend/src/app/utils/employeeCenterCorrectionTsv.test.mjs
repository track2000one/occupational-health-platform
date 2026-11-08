import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

// Test the real TypeScript helper without adding a browser, authentication,
// customer spreadsheet or new production dependency.
const code = readFileSync(new URL('./employeeCenterCorrectionTsv.ts', import.meta.url), 'utf8');
const transpiled = transformSync(code, { loader: 'ts', format: 'esm', target: 'es2020' });
const mod = await import(`data:text/javascript;base64,${Buffer.from(transpiled.code).toString('base64')}`);
const { buildCorrectionTemplate, buildCenterDirectory, parseCenterCorrectionTemplate } = mod;
const rows = [
  { row: 2, health_center: '', health_center_matched: false,
    issues: ['Missing required field: health_center.'] },
  { row: 3, health_center: 'Unknown official alias', health_center_matched: false,
    issues: ['Health center does not match an active center in the platform.'] },
  { row: 4, health_center: 'Approved Center', health_center_matched: true, issues: [] },
];
const centers = [
  { id: 15, name: 'Approved Center', name_ar: 'مركز معتمد', code: 'QA-C15', is_active: true },
  { id: 16, name: 'Inactive Center', is_active: false },
];
const batch = 503;
function fill(entries) {
  const parts = buildCorrectionTemplate(rows, batch).split('\r\n');
  for (const [excelRow, centerId] of entries) {
    const index = parts.findIndex(part => part.split('\t')[1] === String(excelRow));
    if (index < 0) throw new Error('Missing template row');
    parts[index] += String(centerId);
  }
  return parts.join('\r\n');
}

test('exports only blocking center rows, no staff PII and no clinic records', () => {
  const template = buildCorrectionTemplate(rows, batch);
  assert.ok(template.startsWith('\uFEFFpreview_batch_id\texcel_row\tsource_center\tapproved_center_id'));
  assert.ok(template.includes('503\t2\t\t'));
  assert.ok(template.includes('503\t3\tUnknown official alias\t'));
  assert.ok(!template.includes('503\t4\t'));
  assert.ok(!template.includes('national_id'));
  const directory = buildCenterDirectory(centers);
  assert.ok(directory.includes('15\tمركز معتمد\tQA-C15'));
  assert.ok(!directory.includes('Inactive Center'));
});

test('requires explicit approved center per worksheet row; does not fill blanks', () => {
  const parsed = parseCenterCorrectionTemplate(fill([[2, 15]]), rows, centers, batch);
  assert.deepEqual(parsed.corrections, { '2': '15' });
  assert.equal(parsed.corrected, 1);
  assert.equal(parsed.blank, 1);
  const complete = parseCenterCorrectionTemplate(fill([[2, 15], [3, 15]]), rows, centers, batch);
  assert.equal(complete.corrected, 2);
  assert.equal(complete.blank, 0);
});

test('rejects stale preview, invalid centers, duplicate or altered source rows', () => {
  assert.throws(() => parseCenterCorrectionTemplate(fill([[2, 15]]), rows, centers, 504), /معاينة مختلفة/);
  assert.throws(() => parseCenterCorrectionTemplate(fill([[2, 16]]), rows, centers, batch), /غير موجود أو غير فعال/);
  assert.throws(() => parseCenterCorrectionTemplate(fill([[2, 99]]), rows, centers, batch), /غير موجود أو غير فعال/);
  const duplicate = fill([[2, 15]]) + '503\t2\t\t15\r\n';
  assert.throws(() => parseCenterCorrectionTemplate(duplicate, rows, centers, batch), /مكرر/);
  const edited = fill([[2, 15]]).replace('Unknown official alias', 'Edited alias');
  assert.throws(() => parseCenterCorrectionTemplate(edited, rows, centers, batch), /اختلف اسم المركز/);
});

test('escapes spreadsheet formulas in untrusted source center labels', () => {
  const formulaRow = [{ row: 9, health_center: '=HYPERLINK("example")',
    health_center_matched: false, issues: ['Health center does not match an active center in the platform.'] }];
  const template = buildCorrectionTemplate(formulaRow, 99);
  assert.ok(template.includes(`99\t9\t'=HYPERLINK("example")\t`));
  const filled = template.replace('example")\t', 'example")\t15');
  const parsed = parseCenterCorrectionTemplate(filled, formulaRow, centers, 99);
  assert.deepEqual(parsed.corrections, { '9': '15' });
});
