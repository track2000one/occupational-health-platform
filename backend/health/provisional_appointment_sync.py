"""Explicit staging-only fill of appointment dates from a reviewed temporary batch."""
from collections import Counter, defaultdict
from datetime import date
import json
import os
import re
import unicodedata

from django.db import transaction
from django.utils.crypto import salted_hmac, constant_time_compare
from hijridate import Hijri
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .employee_import_classification import normalize_person_name
from .models import (AuditLog, Employee, EmployeeProfileCompletionEvent,
                     ProvisionalEmployeeImportBatch, ProvisionalEmployeeRosterRow)
from .organization_structure import STAGING_PROJECT
from .provisional_employee_roster import NO_CACHE, _unseal, _digest

MAX_ROWS = 2500
MAX_REGISTRY = 10000
STATUSES = ('ready', 'matched', 'conflict', 'unmatched', 'missing', 'review')


def text(value):
    return str(value or '').strip()


def parse_appointment(raw):
    """Strict four-digit year/month/day; never infer ambiguous day/month ordering."""
    value = unicodedata.normalize('NFKC', text(raw))
    value = ''.join(str(unicodedata.digit(c)) if c.isdecimal() else c for c in value)
    match = re.fullmatch(r'(\d{4})([-/])(\d{1,2})\2(\d{1,2})(?: 00:00:00)?', value)
    if not match:
        raise ValueError('invalid date')
    year, month, day = map(int, (match[1], match[3], match[4]))
    if 1343 <= year <= 1500:
        converted = Hijri(year, month, day).to_gregorian()
        return date(converted.year, converted.month, converted.day), f'{year:04d}/{month:02d}/{day:02d}'
    if 1900 <= year <= date.today().year:
        return date(year, month, day), ''
    raise ValueError('unsupported year')


def build_plan(rows, employees):
    originals = {e.national_id: e for e in employees}
    numbers, emails = defaultdict(set), defaultdict(set)
    source_numbers, source_emails, source_ids = defaultdict(set), defaultdict(set), Counter()
    for e in employees:
        if text(e.employee_number):
            numbers[text(e.employee_number)].add(e.national_id)
        if text(e.email):
            emails[text(e.email).casefold()].add(e.national_id)
    snapshots = [(row, _unseal(row.sealed_payload)) for row in rows]
    for row, src in snapshots:
        nid = text(src.get('national_id'))
        source_ids[nid] += 1
        if text(src.get('employee_number')):
            source_numbers[text(src['employee_number'])].add(nid)
        if text(src.get('email')):
            source_emails[text(src['email']).casefold()].add(nid)
    items, changes = [], {}
    for row, src in snapshots:
        nid, raw = text(src.get('national_id')), text(src.get('appointment_date'))
        item = {'row_id': row.pk, 'source_row': row.source_row, 'status': 'review',
                'reason': '', 'source_date': '', 'proposed_date': '', 'current_date': ''}
        items.append(item)
        if not raw:
            item.update(status='missing', reason='source_missing')
            continue
        try:
            proposed, hijri = parse_appointment(raw)
        except (ValueError, OverflowError):
            item['reason'] = 'invalid_date'
            continue
        item.update(source_date=hijri or proposed.isoformat(), proposed_date=proposed.isoformat())
        e = originals.get(nid)
        if not e:
            item.update(status='unmatched', reason='no_identity_match')
            continue
        num, email = text(src.get('employee_number')), text(src.get('email')).casefold()
        if (not re.fullmatch(r'\d{10}', nid) or row.identity_digest != _digest(nid) or source_ids[nid] != 1
                or row.classification != 'name_match' or not normalize_person_name(src.get('name'))
                or normalize_person_name(e.name) != normalize_person_name(src.get('name'))
                or (num and ((text(e.employee_number) and text(e.employee_number) != num)
                             or (numbers[num] | source_numbers[num]) - {nid}))
                or (email and ((text(e.email) and text(e.email).casefold() != email)
                               or (emails[email] | source_emails[email]) - {nid}))):
            item['reason'] = 'identity_review'
            continue
        if (e.is_archived or e.employment_status != Employee.EmploymentStatus.ACTIVE
                or e.registration_status != 'verified'):
            item['reason'] = 'inactive_or_unverified'
            continue
        if proposed > date.today() or (e.date_of_birth and proposed <= e.date_of_birth):
            item['reason'] = 'invalid_date'
            continue
        item['current_date'] = e.appointment_date.isoformat() if e.appointment_date else ''
        stored_hijri = text(e.roster_hijri_appointment_date)
        if stored_hijri:
            try:
                old_date, old_hijri = parse_appointment(stored_hijri)
            except (ValueError, OverflowError):
                item.update(status='conflict', reason='existing_date_conflict')
                continue
            if not old_hijri or old_date != proposed:
                item.update(status='conflict', reason='existing_date_conflict')
                continue
        if e.appointment_date:
            item.update(status='matched' if e.appointment_date == proposed else 'conflict',
                        reason='' if e.appointment_date == proposed else 'existing_date_conflict')
            continue
        item['status'] = 'ready'
        changes[row.pk] = (e, proposed, hijri if not stored_hijri else '')
    return items, changes


def fingerprint(batch, rows, employees, items, user_id):
    data = {'batch': batch.pk, 'sha': batch.file_sha256, 'user': user_id,
            'rows': [[r.pk, r.identity_digest, r.classification, r.sealed_payload, r.updated_at.isoformat()] for r in rows],
            'registry': [[e.pk, e.national_id, e.name, e.employee_number, e.email, e.is_archived,
                e.employment_status, e.registration_status, str(e.date_of_birth), str(e.appointment_date),
                e.roster_hijri_appointment_date, e.updated_at.isoformat()] for e in employees],
            'items': items}
    return salted_hmac('ohp-appointment-sync-v1', json.dumps(data, sort_keys=True, ensure_ascii=False),
                       algorithm='sha256').hexdigest()


class ProvisionalAppointmentSyncView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request):
        def reply(data, status=200):
            return Response(data, status=status, headers=NO_CACHE)
        if not request.user.is_superuser:
            return reply({'detail': 'صلاحية المسؤول الأعلى مطلوبة.'}, 403)
        if os.getenv('STAGING_MODE', '').lower() != 'true' or os.getenv('RAILWAY_PROJECT_ID') != STAGING_PROJECT:
            return reply({'detail': 'هذه العملية متاحة في البيئة التجريبية المعزولة فقط.'}, 403)
        action, batch_id = request.data.get('action'), request.data.get('batch_id')
        if action not in ('preview', 'apply') or type(batch_id) is not int:
            return reply({'detail': 'حدد الدفعة والإجراء الصحيحين.'}, 400)
        with transaction.atomic():
            batches = ProvisionalEmployeeImportBatch.objects
            rows_qs = ProvisionalEmployeeRosterRow.objects
            employees_qs = Employee.objects.order_by('pk')
            if action == 'apply':
                batches = batches.select_for_update()
                rows_qs = rows_qs.select_for_update()
                employees_qs = employees_qs.select_for_update()
            batch = batches.filter(pk=batch_id).first()
            if batch is None:
                return reply({'detail': 'الدفعة المؤقتة غير موجودة.'}, 404)
            rows = list(rows_qs.filter(batch=batch).order_by('source_row')[:MAX_ROWS + 1])
            employees = list(employees_qs[:MAX_REGISTRY + 1])
            if len(rows) > MAX_ROWS or len(employees) > MAX_REGISTRY:
                return reply({'detail': 'تجاوز نطاق المعالجة الآمن.'}, 400)
            try:
                items, changes = build_plan(rows, employees)
            except ValueError:
                return reply({'detail': 'تعذر قراءة الدفعة المؤقتة المشفرة.'}, 409)
            token = fingerprint(batch, rows, employees, items, request.user.pk)
            counts = Counter(item['status'] for item in items)
            if action == 'preview':
                return reply({'batch_id': batch.pk, 'total': len(items), 'counts': {s: counts[s] for s in STATUSES},
                              'rows': items, 'preview_token': token})
            supplied = request.data.get('preview_token')
            if not isinstance(supplied, str) or not constant_time_compare(supplied, token):
                return reply({'detail': 'تغيرت البيانات منذ المعاينة. أعد الفحص.'}, 409)
            ids, reason = request.data.get('row_ids'), request.data.get('reason')
            if (not isinstance(ids, list) or not ids or len(ids) > MAX_ROWS
                    or any(type(i) is not int for i in ids) or len(ids) != len(set(ids))
                    or not set(ids).issubset(changes)):
                return reply({'detail': 'اختر السجلات المؤهلة فقط.'}, 400)
            if (request.data.get('confirmed') is not True or not isinstance(reason, str)
                    or not 10 <= len(reason.strip()) <= 350):
                return reply({'detail': 'يلزم توثيق السبب والإقرار بمراجعة المصدر والهوية والتاريخ.'}, 400)
            row_by_id = {r.pk: r for r in rows}
            for pk in ids:
                e, proposed, hijri = changes[pk]
                e.appointment_date = proposed
                fields = ['appointment_date']
                if hijri:
                    e.roster_hijri_appointment_date = hijri
                    fields.append('roster_hijri_appointment_date')
                e.save(update_fields=[*fields, 'years_of_experience', 'updated_at'])
                EmployeeProfileCompletionEvent.objects.create(
                    employee=e, changed_fields=fields,
                    reason=f"دفعة مؤقتة {batch.pk}، صف {row_by_id[pk].source_row}: {reason.strip()}",
                    identity_checked=True, previous_center_id=e.health_center_id,
                    resulting_center_id=e.health_center_id, performed_by=request.user)
            AuditLog.objects.create(user=str(request.user), action='appointment_date_bulk_completion',
                                    model_name='Employee', record_id=f'batch:{batch.pk}:{token[:16]}')
            return reply({'updated_count': len(ids), 'batch_id': batch.pk})
