# Employee Import V2 — Clean Redesign / إعادة هندسة استيراد الموظفين

Status: **Phase 2 read-only matching completed in a draft PR; NOT deployed or production-ready for import**.
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
  all former employee-specific UI routes and `/data-import` redirect to v2.
  Nine obsolete frontend modules were removed.
- Legacy employee and generic Excel API paths, including old bulk reset,
  are blocked by default with a 403/no-store response. Dedicated health-center
  and organization administration APIs are outside this retirement.
- New endpoint `/api/employee-import-v2/preview/` is read-only and private.
- Only recognizes columns and checks basic identity format, in-file
  duplicates and missing fields. Does **not** check or change PostgreSQL.
- Save/approve is explicitly disabled until next phase.
- No uploaded workbook is retained; only aggregate counts and masked IDs
  are returned.
- No schema migration or Employee/EmployeeImportReview/health writes.

### Phase 2: registry preflight implemented (read-only)

- One XLSX upload now performs both structural validation and live PostgreSQL
  lookup against **active and archived employees by national ID**.
- Classifies new identity candidates, existing records with potential empty
  fields, previously archived records, name discrepancy, conflicting employee
  number/email, source duplicates, invalid identifiers, and unapproved or
  mismatched health-center/organization assignments.
- Center labels must resolve uniquely to an **active, approved** HealthCenter.
  Organizational units must resolve uniquely to an **active, approved**
  OrganizationUnit and not conflict with a center's approved link.
- Incomplete demographic/administrative fields are flagged for a **yellow
  card** in the review UI, not treated as automatic denial of identity.
- The result is grouped in one page with masked-ID exception examples; no
  employee name, phone, email or full ID is returned in the preview JSON.
- Duplicate identity columns are refused rather than guessed.
- Matched identity/center/organization results are **NOT automatic approval**.
  No database fields, clinical links, archive state or audit rows are changed.
- All preview and registry checks are read-only, and button "اعتماد وحفظ"
  remains deliberately disabled.

### Later acceptance criteria (not yet implemented)

- Enforce identity matching as currently implemented, with final commit-time
  uniqueness, fresh registry snapshot and independent authorized approval.
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

Legacy backend source, audit tables and historical tests remain in code for
safe rollback and dependency review; their public API entrypoints are
disabled by default. Synthetic CI alone explicitly enables old API routes
to regression-test old behavior, and verifies the default-disabled guard.
Once V2 is fully operational, unused backend source can be removed separately.
No historical migrations or tables (including EmployeeImportReview) will be
dropped without proof that no medical or audit references depend on them.

## National ID visibility policy (2026-11-15)

- The **source XLSX must contain full, genuine 10-digit national IDs** for unique identity matching. An already-redacted spreadsheet with symbols such as `10••••1681` or `10****1681` is **not a valid import source**; V2 rejects it with counts and source row numbers without exposing IDs.
- The import preview, exception cards, employee cards, employee tables and standard employee reports **display IDs masked by default**. Masking is a *presentation-only* concern; the database retains the original verified ID.
- The employee report includes the masked-ID column by default. In the report settings, only users with both sensitive-data and export permissions may explicitly opt to print **full national IDs**. The server enforces the role restriction, full-ID report requests are audit logged, and responses are not cached.
- The administrator can alternatively omit the ID column entirely before printing. Full-ID mode is not saved as a user preference, and each new report starts in masked mode.
- Do not commit original employee XLSX files or full-identifier reports to GitHub.

## Production release checklist

- [ ] Frontend and backend CI passes with PostgreSQL.
- [x] Block legacy employee and general Excel APIs by default; leave
      exception only for controlled synthetic CI and emergency rollback.
- [ ] Remove unused historical backend source after full V2 validation.
- [ ] New structural preview and masked output verified in Staging.
- [x] Read-only registry/archived/center/organization matching with synthetic tests.
- [ ] Build and validate safe selective commit, per-record conflicts and audit trail.
- [ ] Backup + rollback tested using synthetic data.
- [ ] Formal approval to replace Production employee-import workflow.
- [ ] Post-release monitoring of employee/health record counts.
