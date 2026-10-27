# Employee lifecycle — phase 1

This change is a **non-destructive administrative workflow** for employee status transitions.

- Default status for existing employees is `active`. No imported / unmatched row can trigger automatic retirement.
- A staff administrator must submit a formal evidence reference and effective date to change status.
- `POST /api/employees/{id}/employment-status/` accepts `status` (`active`, `transferred`, `retired`, `separated`, `under_review`), `effective_date` (`YYYY-MM-DD`), `evidence_reference`, optional `notes`, and `new_health_center_id` when transferring.
- `GET /api/employees/{id}/employment-status/` returns the auditable status history to staff.
- A transfer changes the current center only with an explicit active destination center; the previous center remains in history.
- Retirement **retains** the last center, employee identity, health card, examinations and clinical history. The employee is not deleted.
- Direct employee serializer writes cannot alter `employment_status`; use the audited endpoint.
- The endpoint is currently staff-admin only. Before public launch, integrate with the application's intended HR approval workflow and uploadable supporting documents.

## Working with the two source spreadsheets

The new spreadsheet contains 1,423 unique valid identities (not import-ready for the existing strict employee-create template). 1,155 identities match the older database; 268 are new-only. The older source contains 593 valid unique IDs absent in the new list, 72 duplicated identities, and 70 rows with invalid/missing IDs. These are **review cases**, not verified retirees.

The provided files also contain clinical information, so **never commit source spreadsheets, identifiable comparison reports or medical data to a public Git repository.** The private review workbook remains separate from this code.

The next phase should provide: (1) an encrypted/private source-upload preview, (2) a source-to-center mapping approval screen, (3) explicit HR verification of unmatched people, and (4) a restricted staff-facing approval UI.

No production migration or database import is performed by this PR itself.
