# Occupational Health Platform

منصة إدارة الصحة المهنية للموظفين بنظام Monorepo.

## Structure

- `frontend`: React + Vite + TypeScript + Tailwind CSS
- `backend`: Django + Django REST Framework + PostgreSQL + JWT, ready for Railway

## Local Frontend

```bash
cd frontend
npm install
npm run dev
```

## Local Backend

```bash
cd backend
python -m venv .venv
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

## Railway Backend

Create a Railway service from GitHub and set:

```text
Root Directory: backend
```

Add Railway PostgreSQL and set environment variables from `backend/.env.example`.
