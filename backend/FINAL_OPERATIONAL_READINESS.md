# Final operational readiness — occupational health platform

Baseline: PR 128 merged commit bf03c0aa2a09952157725d68c23c95c0e12cd0be.
Scope: isolated Staging, verified synthetic employees only. **NO-GO for real clinical data and Production release until independent evidence and institutional sign-off are complete.** No migration, real data upload, credential access or employee deletion is authorized by this document.

## Evidence and acceptance register

| Gate | Evidence at baseline | Acceptance requirement |
|---|---|---|
| Code / deployment | PR 128; workflow 46043548423: backend, PostgreSQL, frontend, staging-smoke passed; both staging services reported SUCCESS | Repeat for this change, record exact commit and both deployment IDs |
| Import | Synthetic API E2E (65-column template, preview, signed fill-only commit, rollback, duplicate, stale-token and privacy checks) | Repeat on separate CI database; authenticated browser UAT with synthetic records only |
| KPI / Excel | API regression and workbook checks | Independently compare browser filters and all six sheets to known synthetic fixture; PDF Arabic layout, page breaks and no personal data |
| Clinical access | Legacy endpoints relied on authentication alone; broad health-card role matrix; public QR disclosed identity | Staging fail-closed regression added; Production object-level permissions and audit design still unapproved |
| Clinical workflow | Synthetic lab/vaccine, observations, exposure, fitness/committee trial paths | Legacy clinic/injury screens are blocked in Staging by this change; implement safe scoped workflows before real use. Approvals require a separate physician-authorized path, no UI-only permissions |
| Data safety | QA exact identity gate and draft protection | Negative tests for all roles, center boundaries, unauthorized access, export and approval; independent security review |
| Backup | CI synthetic encrypted dump/checksum/isolated restore passed | Actual encrypted off-Railway backup and isolated restore; evidence owner and date per SECURE_BACKUP_RUNBOOK.md, agree RPO/RTO |
| Performance | Existing synthetic 1,423-row fixture tests; no live SLA measurement | Measure p50/p95 and errors for list, card, preview, KPI and export on synthetic cohort; agree concurrency and thresholds with owner |
| Runtime hardening | Code settings allow fallback secret and no password validators; JWT refresh lifetime 7 days | Review real runtime settings without exporting secrets, rotate exposed credentials, password/MFA policy, token revocation, TLS, allowed hosts/CORS, DB access, logging, retention, privacy |
| Data governance | No sign-off evidence supplied | Institution approves processing purpose, access matrix, hosting/storage, retention, incident response and applicable privacy requirements |
| Public verification | Staging disabled by this change | Approve minimized public output and token revocation/expiry before enabling production QR |
| Production release | Not authorized | Approved backup/restore, UAT, security/privacy review, change window, rollback, owner approval, separate explicit deployment authorization |

## Browser acceptance checklist (synthetic only)

1. Sign in to Staging as the designated test admin. Do not share credentials or upload genuine employee records. Open employee registry and test the six QA examples or the approved load cohort.
2. Download HealthData V1; populate a few explicit synthetic values and leave visit-only questions blank. Preview, select eligible rows, commit with the required reason and confirmation. Re-upload: no duplicate changes.
3. Confirm a saved draft card and separate linked clinical sources; record synthetic labs, dose, observation, exposure and fitness/committee referral/decision using scoped paths. Confirm date and decision fields without approving the card. Approved historical cards are read-only, deletion and public verification are disabled.
4. Test dashboard organization and event-date filters, compare against the same fixture, export all six Excel sheets; print/save PDF in browser; inspect Arabic text and margins. No real identifiers, names or clinical text in aggregate report.
5. Sign in with a limited test account: verify clinical cards, exports and legacy global clinical APIs are denied. Verify stale import tokens and wrong-employee records are denied. Record only pass/fail and synthetic fixture IDs, no credentials.
6. Document blocked legacy clinic/injury pages and remaining role-based/clinical approval design; do not claim production feature parity.
7. Run backup and restore drill separately under the approved administrator's control. No live restore into any active database.
8. Record date, exact commit, environment, tester, evidence reference, outcome and exception for each gate. Never record patient data or secret values in this checklist.

## Release decision

Staging technical completion is not an operational or medical authorization. Status remains **NO-GO for Production** pending the above gates. A future production change must have a separate reviewed PR/plan with role-level and object-level authorization, clinical approval, real data governance and signed operational acceptance. No automatic production deployment or real import is implied.
