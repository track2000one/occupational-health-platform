# Employee lifecycle — phase 1

This change is a **non-destructive administrative workflow** for employee status transitions.

- Default status for existing employees is `active`. No imported / unmatched row can trigger automatic retirement.
- A staff administrator must submit a formal evidence reference and effective date to change status.
- `POST /api/employees/{id}/employment-status/` accepts `status` (`active`, `transferred`, `retired`, `separated`, `under_review`), `effective_date` (`YYYY-MM-DD`), `evidence_reference`, optional `notes`; for an internal transfer, use the dedicated `transfer-center` endpoint.
- `GET /api/employees/{id}/employment-status/` returns the auditable status history to staff.
- Internal center transfers use `POST /api/employees/{id}/transfer-center/` with an active destination, date and document reference. The employee remains `active`, while the previous center is retained in history. The `transferred` employment status denotes transfer out of the network.
- Retirement **retains** the last center, employee identity, health card, examinations and clinical history. The employee is not deleted.
- Direct employee serializer writes cannot alter `employment_status`; use the audited endpoint.
- The endpoint is currently staff-admin only. Before public launch, integrate with the application's intended HR approval workflow and uploadable supporting documents.

## Working with the two source spreadsheets

The new spreadsheet contains 1,423 unique valid identities (not import-ready for the existing strict employee-create template). 1,155 identities match the older database; 268 are new-only. The older source contains 593 valid unique IDs absent in the new list, 72 duplicated identities, and 70 rows with invalid/missing IDs. These are **review cases**, not verified retirees.

The provided files also contain clinical information, so **never commit source spreadsheets, identifiable comparison reports or medical data to a public Git repository.** The private review workbook remains separate from this code.

The next phase should provide: (1) an encrypted/private source-upload preview, (2) a source-to-center mapping approval screen, (3) explicit HR verification of unmatched people, and (4) a restricted staff-facing approval UI.

No production migration or database import is performed by this PR itself.


## Phase 2 — Workforce roster preview and center approval (October 2026)

A new protected admin screen at `/admin/workforce-roster-preview` accepts **only the original
19-column current roster** and previews it without writing Employee or clinical records.
It uses column H for employee identity; column D contains manager identity.
The dashboard reports existing-DB matches, internal duplicates, source leave/assignment
statuses and the 131 organizational groups for center mapping. Actual employee counts
vary with the platform's existing database, and **must not** be confused with the
two-source Excel-to-Excel reconciliation counts.

Each organizational path and type has a stable fingerprint. An authorized staff admin
can approve an existing active HealthCenter with an official reference. Every approval
or reassignment creates a `WorkforceCenterMappingRevision` and `AuditLog`.
Preview statistics distinguish approved and unapproved center coverage. No mapping
is inferred as approved from string matching.

**Not implemented or authorized**: mass employee creation, medical merges, automatic
retirement, approval of historic employee statuses, or database import to production.
The source file is parsed in memory and not kept by the preview endpoint.
The next release gate is: complete center mapping approvals, run migrations and automated
tests, verify an encrypted DB backup and restore drill in the target environment,
then implement and test a separate explicit commit path.

The public GitHub repository must never receive employee identities, medical records,
or the source/import-review spreadsheets.
