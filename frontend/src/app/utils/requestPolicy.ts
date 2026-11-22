/** Read-only roster reports scan/decrypt an entire batch. Treat them differently
 * from a small paginated GET, without changing write request safeguards.
 * Avoid transparent retries, which duplicate an expensive server scan.
 */
export const STANDARD_READ_TIMEOUT_MS = 15_000;
export const STANDARD_WRITE_TIMEOUT_MS = 30_000;
export const EXCEL_IMPORT_TIMEOUT_MS = 120_000;
export const ROSTER_REPORT_TIMEOUT_MS = 90_000;

const LARGE_READ_ONLY_REPORT = /\/provisional-employees\/(?:readiness|approval-plan|name-review|conflict-diagnostics)\/?$/;
const LARGE_UPLOAD = /\/(?:excel-import\/upload|employee-roster\/reconcile|provisional-employees\/import)\/?$/;

export function requestPolicy(url: string, method: string = 'GET') {
  const verb = method.toUpperCase();
  const safeRead = ['GET', 'HEAD', 'OPTIONS'].includes(verb);
  const path = url.split(/[?#]/, 1)[0];
  const report = verb === 'GET' && LARGE_READ_ONLY_REPORT.test(path);
  return {
    timeoutMs: report ? ROSTER_REPORT_TIMEOUT_MS
      : LARGE_UPLOAD.test(path) ? EXCEL_IMPORT_TIMEOUT_MS
        : safeRead ? STANDARD_READ_TIMEOUT_MS : STANDARD_WRITE_TIMEOUT_MS,
    attempts: safeRead && !report ? 2 : 1,
    report,
  };
}
