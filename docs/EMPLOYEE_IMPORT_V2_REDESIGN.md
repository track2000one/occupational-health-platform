# Employee Import V2 — Clean Redesign / إعادة هندسة استيراد الموظفين

Status: **Phase 1 in draft, NOT a production-ready import**.
Owner: Occupational Health Platform.
Scope: Employee XLSX ingestion and matching only. Clinical labs/vaccinations,
health-center reference management, organization structure, employee editing,
archive/recovery and audit logs are **outside the removal scope**.

## Decision

Retire the confusing Excel employee import UX (preview/plan/pending cards/
review/reconciliation/temporary workforce). Replace it with **one** entry point
`/employees/import` consisting of:

1. **رفع الملف — Upload.** Pick XLSX, recognize sheet/columns; never direct
   Staging file uploads to Production.
2. **فحص البيانات والمطابقة — Validate and match.** Structural validation,
   identity check against active and archived records, controlled center/organization
   matching, and disambiguation of names without asserting identity from
   spelling similarity or transliteration.
3. **مراجعة واعتماد — Review and commit.** One-page disposition:
   new verified employees; existing fill-only updates; archived restoration
   after authorization; yellow records missing optional data; blocked duplicates
   and identity conflicts with action-specific reasons. Approval must show
   before/after diffs and require administrator confirmation.

### Phase 1 implemented in this PR

- Old employee-import navigation/route components retired in frontend;
  all former employee-specific UI routes redirect to the same new page.
- New endpoint `/api/employee-import-v2/preview/` is read-only and private.
- Only recognizes columns and checks basic identity format, in-file
  duplicates and missing fields. Does **not** check or change PostgreSQL.
- Save/approve is explicitly disabled until next phase.
- No uploaded workbook is retained; only aggregate counts and masked IDs
  are returned.
- No schema migration or Employee/EmployeeImportReview/health writes.

### Phase 2 acceptance criteria (not yet implemented)

- Match **strictly by unique national ID**, with name/employee number
  discrepancies treated as separate safety checks.
- Support archived identities without creating a second record and with
  explicit verified restore decisions; preserve existing clinical links.
- Never overwrite a non-empty field by default. Mark optional-data gaps
  as yellow and allow controlled later completion, including during clinic
  verification.
- Only attach an approved, already-existing health center or organization
  unit; no placeholder center, no implicit organization changes.
- Show real counts: new, fill-only, archive-review, conflicting, missing,
  duplicate, already processed. Present a masked and searchable exceptions
  table (without creating a redundant queue on each preview).
- Preview token expires and is tied to source-file digest and current
  registry snapshot. Recheck immediately before saving.
- Administrator-only approval with reason, batch size caps, atomic commit,
  audit trail, backup/rollback rehearsal, and idempotent reupload.
- Tests must prove no duplicate identity, no lost medical data, no
  unexpected archive/unarchive or center reassignment, no Staging-to-
  Production fallback, and correct Arabic/English field mapping.

## Deliberately retained for safety

Do **not** delete production PostgreSQL Employee records, archived employees,
visits, medical/occupational data, audit logs, historical migrations,
or data-import batch provenance.

Legacy backend endpoints and shared generic Excel importer need a separate
dependency and compatibility review before decommissioning. Merely hiding
legacy UI does not make those endpoints unavailable to API callers;
do **not** advertise full server-side retirement until verified. Avoid
dropping historical tables or migrations, including EmployeeImportReview,
until confirmed that no medical or auditing references depend on them.

## Production release checklist

- [ ] Frontend and backend CI passes with PostgreSQL.
- [ ] Audit/retire direct legacy employee Excel POST entrypoints safely.
- [ ] New structural preview and masked output verified in Staging.
- [ ] Registry-matching and selective commit fully implemented and tested.
- [ ] Backup + rollback tested using synthetic data.
- [ ] Formal approval to replace Production employee-import workflow.
- [ ] Post-release monitoring of employee/health record counts.
