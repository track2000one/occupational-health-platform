# Secure independent PostgreSQL backup — occupational health

This is an **operator-run** encrypted backup and restore drill, not a Railway
volume snapshot or an automatically scheduled backup. The backup is not
considered complete until a copy exists outside Railway and a restore drill
has passed. A PostgreSQL volume alone is **not** a backup.

## What the tool does

\`backend/ops/secure_pg_backup.py\` streams a PostgreSQL **custom-format**
\`pg_dump\` archive directly into GnuPG symmetric **AES-256** encryption,
without creating an unencrypted dump file. It generates a SHA-256 companion
manifest and verifies that encrypted archive before restoring to an **empty,
separate** database. The original database is never selected as a restore
target. It compares \`health_employee\` and \`health_healthcenter\` row counts
between source and isolated restored DB. CI also verifies the synthetic
employee's clinical \`risk_level\` survives restoration.

The tool **does not** upload to Google Drive, GitHub, or Railway itself and
does not grant access to the private database. It requires the owner to
provide authorized PostgreSQL connectivity and approved storage.

## Prerequisites

1. Use an approved administrative workstation or trusted, isolated runner.
2. Install Python 3.11+, **GnuPG**, and PostgreSQL command-line tools
   (\`pg_dump\`, \`pg_restore\`, \`psql\`, \`createdb\`). Client \`pg_dump\`
   must not be **older** than the database server major version.
   The staging Railway PostgreSQL service currently uses version **18**.
3. Use a securely authorized connection (private network or approved,
   controlled tunnel). Do not publish the database publicly just to back
   it up. Never commit \`DATABASE_URL\` or passwords.
4. Provide the source connection using the \`DATABASE_URL\` environment
   variable from a trusted secret manager/session. Avoid entering database
   passwords directly into terminal commands or screenshots.
5. Create a high-entropy backup passphrase **outside the repository** in a
   user-only readable file, e.g. under a protected secrets directory.
   Keep the passphrase in a **separate** approved secret manager, not beside
   the archive, and never send it through ChatGPT, GitHub or tickets.
6. Choose an **off-Railway** output directory (e.g. managed encrypted
   removable drive or approved institutional backup storage) with access
   limited to authorized administrators. Output files are \`.pgdump.gpg\`
   and \`.pgdump.gpg.sha256\`.

## One-time backup

From the checkout root (example only; do not paste secrets):

\`\`\`shell
python backend/ops/secure_pg_backup.py backup \
  --output-dir /secure/offsite/ohp-backups \
  --passphrase-file /secure/operator-secrets/ohp-backup-key
\`\`\`

On Windows PowerShell, use one line and absolute Windows paths:

\`\`\`powershell
python backend/ops/secure_pg_backup.py backup --output-dir "E:\OHP-Encrypted-Backups" --passphrase-file "C:\PrivateSecrets\ohp-backup-key"
\`\`\`

\`DATABASE_URL\` must already be configured securely in the current process.
After this command prints success, **move a second encrypted copy and the
manifest** to a separate controlled location. The secret must be stored
separately. Do not upload the encrypted backup as a GitHub Actions artifact.

## Required restore verification

Create a **new empty database**, distinct from source and not used by any
running service, on an isolated PostgreSQL instance. Configure
\`RESTORE_DATABASE_URL\` to that empty database through a protected session.

\`\`\`shell
python backend/ops/secure_pg_backup.py restore-verify \
  --archive /secure/offsite/ohp-backups/ohp-YYYYMMDDTHHMMSSZ-XXXXXXXX.pgdump.gpg \
  --passphrase-file /secure/operator-secrets/ohp-backup-key \
  --confirm-disposable
\`\`\`

The restore rejects a destination equal to the source database or a
destination with public tables. Do **not** use the actual production
database as \`RESTORE_DATABASE_URL\`. Retain the restore log: date,
operator, encrypted archive SHA-256, source environment, isolated
destination identifier, results, approved storage destination — **no**
employee names, identity numbers, database URLs or keys in the log.

The automated GitHub Actions integration performs this whole procedure
with **synthetic** employee and health-center records on isolated
PostgreSQL. It is proof of the method only, **not** a backup of Railway
staging or production data.

## Suggested daily operating procedure

After the first successful real staging backup, set up a task scheduler
on an **approved, continuously available** administrator-controlled
machine/runner with approved private DB access and encrypted external
storage. Every run must produce a new archive and checksum, alert on
failure, and periodically verify independent restoration. Do not assume
this script schedules itself; external availability and storage
approval are still prerequisites.

## Do not enable real employee upload until

- The prior publicly shared staging password is changed, and startup
  no longer resets it.
- An actual **staging** backup has been encrypted, copied outside the
  Railway project, and tested by restoration into a fresh database.
- Proper access authorization and data-handling policies for identities
  and phone numbers are documented.
- The 1,429 synthetic employee rows remain isolated from the original
  1,423 employee roster workspace.
- \`TEMP_ROSTER_UPLOAD_ENABLED\` stays \`false\` until the above checks
  are signed off. The unrelated \`WORKFORCE_IMPORT_ENABLED\` must remain
  \`false\`: no real import into the Employee or clinical tables.
