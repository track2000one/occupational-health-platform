# Occupational Health — isolated staging QA

This project's staging project is **separate** from the production Railway project.

- Railway project: `occupational-health-staging`
- Environment: `staging`
- Backend: `https://occupational-staging-backend-staging.up.railway.app/health/`
- Frontend: `https://occupational-staging-frontend-staging.up.railway.app/`
- Database: independently provisioned PostgreSQL with its **own** volume.
- Deployment: pinned feature-branch commit, never production branch.
- Backend variable `WORKFORCE_IMPORT_ENABLED=false` means even a superuser
  cannot commit an XLSX import until separately authorized.
- `STAGING_MODE=true` and `SEED_STAGING_SYNTHETIC=true` opt into 6 visibly
  synthetic employee examples (with 999-prefixed dummy IDs and `example.invalid`
  addresses) at startup. Seeder refuses to run if any non-QA employee exists.
  It is idempotent.
- Use `STAGING_MODE=false` or omit both flags entirely in production.
- Staging login uses a separately generated administrator and a temporary password.
  **Never commit, email, or put any password into this repository.**
- The admin bootstrap command must not be left with an active password variable
  after the first launch. Configure `DJANGO_SUPERUSER_PASSWORD` as an empty
  string and ensure subsequent boot logs show 'skipping superuser bootstrap'.
  The account survives because the isolated PostgreSQL volume persists.
- Restrict CORS to the exact frontend origin. Avoid wildcard Railway subdomains.
- The Django Railway health check requires `healthcheck.railway.app` in
  `ALLOWED_HOSTS`. The endpoint itself is `/health/`.
- CI checks backend migrations, new-only workforce import gates, real JWT
  restrictions, synthetic seeding, a separate PostgreSQL backup/restore drill,
  and anonymous live staging endpoints/CORS. CI uses no sensitive data.

## Manual QA sequence (synthetic records only)

1. Sign in to the **staging** frontend with the staging-only administrator.
2. Confirm a staging warning is visible on login and inside the dashboard.
3. Open Employees and confirm exactly six QA employee rows with `OHP-QA-`
   numbers unless additional deliberate QA records were created.
4. Filter lifecycle by active, retired, transferred, under-review statuses.
5. Open Health Centers and confirm bootstrap centers appear.
6. Open Workforce Roster Preview and Import Plans. Avoid uploading actual
   employees or medical files. Test imports using tiny synthetic XLSX fixtures.
7. Confirm unauthenticated access to private API endpoints returns 401/403.
8. Repeat the same staging rollout; the synthetic seed must remain at six.
9. Review Railway service logs for exceptions and unexpected data mutations.

## Production release gate

A successful staging test **does not** prove production backups exist.
Before importing real employees, verify a *separate encrypted production backup*,
a successful independent restore drill, signed health-center mapping approvals,
and a documented authorization. Do not expose staging without access controls
or use production exports for QA. npm dependency vulnerability alerts must be
reviewed prior to handling real health/identity data.
