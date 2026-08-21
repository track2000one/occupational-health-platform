FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN python -m pip install --no-cache-dir --upgrade pip \
    && python -m pip install --no-cache-dir -r /app/requirements.txt

COPY . /app

CMD python manage.py migrate \
    && python manage.py bootstrap_admin \
    && python manage.py collectstatic --noinput \
    && gunicorn core.wsgi:application --bind 0.0.0.0:${PORT:-8000}
