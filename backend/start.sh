#!/bin/sh
set -e

echo "[start] Running database migrations..."
python manage.py migrate --noinput

echo "[start] Creating or updating admin user..."
python manage.py bootstrap_admin

if [ "${STAGING_MODE:-false}" = "true" ]; then
  python manage.py purge_temporary_workforce
fi

if [ "${STAGING_MODE:-false}" = "true" ] && [ "${SEED_STAGING_SYNTHETIC:-false}" = "true" ]; then
  echo "[start] Seeding synthetic-only staging employees..."
  python manage.py seed_staging_synthetic
fi

if [ "${STAGING_MODE:-false}" = "true" ] && [ "${SEED_STAGING_LOAD_DATA:-false}" = "true" ]; then
  echo "[start] Creating isolated, synthetic workforce load-test dataset..."
  python manage.py seed_staging_load
fi

# Explicit, Staging-only, replay-safe import of reviewed organizational proposals.
# The actual organization names arrive as a private Railway environment variable,
# never as a file committed to the public source repository.
if [ "${OHP_ORG_DRAFTS_ZLIB_B64:-}" != "" ]; then
  echo "[start] Loading reviewed organizational draft references (no approvals or employee writes)..."
  python manage.py load_staging_org_drafts
fi

WORKERS="${GUNICORN_WORKERS:-2}"
THREADS="${GUNICORN_THREADS:-4}"
TIMEOUT="${GUNICORN_TIMEOUT:-45}"

echo "[start] Starting gunicorn on port ${PORT:-8080} with ${WORKERS} workers x ${THREADS} threads..."
exec gunicorn core.wsgi:application \
  --bind 0.0.0.0:${PORT:-8080} \
  --workers "${WORKERS}" \
  --threads "${THREADS}" \
  --timeout "${TIMEOUT}" \
  --graceful-timeout 30 \
  --keep-alive 5 \
  --max-requests 1000 \
  --max-requests-jitter 100 \
  --access-logfile - \
  --error-logfile -
