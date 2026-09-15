from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Expected block not found in {path}: {old[:100]!r}')
    file_path.write_text(text.replace(old, new, 1), encoding='utf-8')


# Backend: keep startup work short and run Gunicorn with enough concurrency for UI/API traffic.
Path('backend/start.sh').write_text("""#!/bin/sh
set -e

echo \"[start] Running database migrations...\"
python manage.py migrate --noinput

echo \"[start] Creating or updating admin user...\"
python manage.py bootstrap_admin

WORKERS=\"${GUNICORN_WORKERS:-2}\"
THREADS=\"${GUNICORN_THREADS:-4}\"
TIMEOUT=\"${GUNICORN_TIMEOUT:-45}\"

echo \"[start] Starting gunicorn on port ${PORT:-8080} with ${WORKERS} workers x ${THREADS} threads...\"
exec gunicorn core.wsgi:application \\
  --bind 0.0.0.0:${PORT:-8080} \\
  --workers \"${WORKERS}\" \\
  --threads \"${THREADS}\" \\
  --timeout \"${TIMEOUT}\" \\
  --graceful-timeout 30 \\
  --keep-alive 5 \\
  --max-requests 1000 \\
  --max-requests-jitter 100 \\
  --access-logfile - \\
  --error-logfile -
""", encoding='utf-8')

Path('backend/Dockerfile').write_text("""FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \\
    && apt-get install -y --no-install-recommends gcc libpq-dev \\
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN python -m pip install --no-cache-dir --upgrade pip \\
    && python -m pip install --no-cache-dir -r /app/requirements.txt

COPY . /app
RUN python manage.py collectstatic --noinput \\
    && chmod +x /app/start.sh

ENTRYPOINT [\"/app/start.sh\"]
CMD []
""", encoding='utf-8')

replace_once(
    'backend/core/settings.py',
    """        conn_max_age=600,\n        ssl_require=not DEBUG,\n""",
    """        conn_max_age=600,\n        conn_health_checks=True,\n        ssl_require=not DEBUG,\n""",
)

# Frontend: cap stalled API calls and retry only safe reads once.
auth_path = Path('frontend/src/app/context/AuthContext.tsx')
auth = auth_path.read_text(encoding='utf-8')
marker = "let refreshInFlight: Promise<string> | null = null;\n"
if marker not in auth:
    raise SystemExit('AuthContext marker not found')
resilience = r'''

const SAFE_REQUEST_TIMEOUT_MS = 4000;
const WRITE_REQUEST_TIMEOUT_MS = 8000;
const RETRYABLE_STATUS_CODES = new Set([502, 503, 504]);

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithTimeout(input: RequestInfo | URL, options: RequestInit = {}, timeoutMs = WRITE_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const externalSignal = options.signal;
  const relayAbort = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener('abort', relayAbort, { once: true });

  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted && !externalSignal?.aborted) {
      throw new Error('تعذر الوصول إلى الخادم خلال المهلة المحددة. حاول مرة أخرى.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', relayAbort);
  }
}

async function resilientFetch(input: RequestInfo | URL, options: RequestInit = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const safeToRetry = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
  const attempts = safeToRetry ? 2 : 1;
  const timeoutMs = safeToRetry ? SAFE_REQUEST_TIMEOUT_MS : WRITE_REQUEST_TIMEOUT_MS;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(input, options, timeoutMs);
      if (safeToRetry && attempt === 0 && RETRYABLE_STATUS_CODES.has(response.status)) {
        await wait(250);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (!safeToRetry || attempt === attempts - 1) throw error;
      await wait(250);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('تعذر الاتصال بالخادم.');
}
'''
auth = auth.replace(marker, marker + resilience, 1)
auth = auth.replace("const response = await fetch(`${API_BASE_URL}/auth/token/refresh/`, {", "const response = await resilientFetch(`${API_BASE_URL}/auth/token/refresh/`, {", 1)
auth = auth.replace("let response = await fetch(input, withBearerToken(options, accessToken));", "let response = await resilientFetch(input, withBearerToken(options, accessToken));", 1)
auth = auth.replace("response = await fetch(input, withBearerToken(options, renewedAccessToken));", "response = await resilientFetch(input, withBearerToken(options, renewedAccessToken));", 1)
auth = auth.replace("const response = await fetch(`${API_BASE_URL}${path}`, {", "const response = await resilientFetch(`${API_BASE_URL}${path}`, {", 1)
auth_path.write_text(auth, encoding='utf-8')

# Health-center CRUD: use the successful API response immediately instead of forcing a second network round-trip.
page_path = Path('frontend/src/app/pages/HealthCentersPage.tsx')
page = page_path.read_text(encoding='utf-8')
old_save = """      if (editing) await request(`/health-centers/${editing.id}/`, { method: 'PATCH', body: JSON.stringify(payload) });\n      else await request('/health-centers/', { method: 'POST', body: JSON.stringify(payload) });\n      toast.success(isRtl ? 'تم حفظ بيانات المركز الصحي' : 'Health center saved');\n      setOpen(false); await load();\n"""
new_save = """      const saved = editing\n        ? await request<Center>(`/health-centers/${editing.id}/`, { method: 'PATCH', body: JSON.stringify(payload) })\n        : await request<Center>('/health-centers/', { method: 'POST', body: JSON.stringify(payload) });\n      setCenters(current => editing\n        ? current.map(center => center.id === saved.id ? saved : center)\n        : [saved, ...current]);\n      toast.success(isRtl ? 'تم حفظ بيانات المركز الصحي' : 'Health center saved');\n      setOpen(false);\n"""
if old_save not in page:
    raise SystemExit('HealthCenters save block not found')
page = page.replace(old_save, new_save, 1)
old_toggle = """      await request(`/health-centers/${center.id}/`, { method: 'PATCH', body: JSON.stringify({ is_active: !center.is_active }) });\n      toast.success(center.is_active ? (isRtl ? 'تم تعطيل المركز مع الاحتفاظ بالسجلات السابقة' : 'Center deactivated; historical records kept') : (isRtl ? 'تم تفعيل المركز' : 'Center activated'));\n      await load();\n"""
new_toggle = """      const updated = await request<Center>(`/health-centers/${center.id}/`, { method: 'PATCH', body: JSON.stringify({ is_active: !center.is_active }) });\n      setCenters(current => current.map(item => item.id === updated.id ? updated : item));\n      toast.success(center.is_active ? (isRtl ? 'تم تعطيل المركز مع الاحتفاظ بالسجلات السابقة' : 'Center deactivated; historical records kept') : (isRtl ? 'تم تفعيل المركز' : 'Center activated'));\n"""
if old_toggle not in page:
    raise SystemExit('HealthCenters toggle block not found')
page = page.replace(old_toggle, new_toggle, 1)
page_path.write_text(page, encoding='utf-8')
