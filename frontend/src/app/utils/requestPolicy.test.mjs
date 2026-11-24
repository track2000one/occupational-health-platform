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
test('bounded V4 readiness segments are retryable and preserve report classification', () => {
  const policy = requestPolicy('http://127.0.0.1:18081/api/provisional-employees/readiness/?offset=100&limit=100', 'GET');
  assert.deepEqual(policy, { timeoutMs: 25000, attempts: 2, report: true });
});
test('health center master reads use a bounded private-proxy budget', () => {
  assert.deepEqual(requestPolicy('http://127.0.0.1:18081/api/health-centers/?page=1', 'GET'),
    { timeoutMs: 30000, attempts: 2, report: false });
  assert.deepEqual(requestPolicy('http://127.0.0.1:18081/api/health-centers/?archived=true&page=1', 'GET'),
    { timeoutMs: 30000, attempts: 2, report: false });
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

// Run the related private-proxy directory pagination safeguards in the same CI suite.
import './healthCenterPagination.test.mjs';

// Run V4 center selection regression in the existing employee lifecycle CI suite.
import './centerActivationSelection.test.mjs';

// V4: synthetic regression for canonical center/department options on employee creation.
import '../data/v4EmployeePlacementOptions.test.mjs';
// Isolated V4 department batch selection regression.
import '../data/v4DepartmentBulkSelection.test.mjs';

// Organizational source hierarchy regression (metadata only; no employee rows).
import '../data/v4FoundationHierarchyReference.test.mjs';

// Independent organizational reconciliation coverage; no roster data.
import '../data/v4DepartmentSourceAudit.test.mjs';
