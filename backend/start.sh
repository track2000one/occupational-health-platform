#!/bin/sh
set -e

echo "[start] Running database migrations..."
python manage.py migrate --noinput

echo "[start] Creating or updating admin user..."
python manage.py bootstrap_admin

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
