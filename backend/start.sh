#!/bin/sh
set -e

echo "[start] Running database migrations..."
python manage.py migrate

echo "[start] Creating or updating admin user..."
python manage.py bootstrap_admin

echo "[start] Collecting static files..."
python manage.py collectstatic --noinput

echo "[start] Starting gunicorn on port ${PORT:-8080}..."
exec gunicorn core.wsgi:application --bind 0.0.0.0:${PORT:-8080} --access-logfile - --error-logfile -
