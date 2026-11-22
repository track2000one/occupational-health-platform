import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
const source = readFileSync(new URL('./requestPolicy.ts', import.meta.url), 'utf8');
const output = transformSync(source, { loader: 'ts', format: 'esm', target: 'es2020' });
const { requestPolicy } = await import(
  'data:text/javascript;base64,' + Buffer.from(output.code).toString('base64')
);

test('V4 readiness uses one bounded 90-second read-only request', () => {
  for (const path of [
    '/api/provisional-employees/readiness/',
    '/api/provisional-employees/approval-plan/?page=1',
    '/api/provisional-employees/name-review/?page=1',
    '/api/provisional-employees/conflict-diagnostics/',
  ]) {
    const policy = requestPolicy('http://127.0.0.1:18081' + path, 'GET');
    assert.equal(policy.timeoutMs, 90000, path);
    assert.equal(policy.attempts, 1, path);
    assert.equal(policy.report, true, path);
  }
});
test('ordinary reads, credential refresh and writes retain existing policies', () => {
  assert.deepEqual(requestPolicy('http://127.0.0.1:18081/api/provisional-employees/?page=1', 'GET'),
    { timeoutMs: 15000, attempts: 2, report: false });
  assert.deepEqual(requestPolicy('http://127.0.0.1:18081/api/auth/token/refresh/', 'POST'),
    { timeoutMs: 30000, attempts: 1, report: false });
  assert.deepEqual(requestPolicy('http://127.0.0.1:18081/api/provisional-employees/import/', 'POST'),
    { timeoutMs: 120000, attempts: 1, report: false });
  assert.deepEqual(requestPolicy('http://127.0.0.1:18081/api/provisional-employees/readiness/', 'POST'),
    { timeoutMs: 30000, attempts: 1, report: false });
});
