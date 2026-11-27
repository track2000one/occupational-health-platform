"""Phase 2: explicit fill-only draft-card import for verified synthetic employees."""
from collections import Counter, defaultdict
from copy import deepcopy
from hashlib import sha256
import json

from django.core import signing
from django.db import IntegrityError, transaction
from rest_framework import permissions
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .health_data_import import (authorized, read_rows, normalized_value, text,
    identity_status, HEALTH_FIELDS, TARGETS, NO_CACHE, synthetic)
from .models import (Employee, EmployeeHealthCard, DataImportBatch, AuditLog,
    EmployeeHealthProfile, EmployeeHealthObservation, LabTest, LabScreening, Vaccination, VaccinationRecord,
    ClinicVisit, EmployeeClinicVisit, OccupationalClinicVisit, OccupationalHealthAssessment,
    CommitteeReferral, MedicalCommitteeCase, InjuryCase, NeedleStickExposure, ScreeningProgramRecord)

SALT = 'ohp-health-data-draft-fill-v1'
MAX_SELECTED = 2500
CONFIRM = 'استكمال مسودات الاختبار'
SPECIALIZED = (EmployeeHealthProfile, EmployeeHealthObservation, LabTest, LabScreening, Vaccination, VaccinationRecord,
    ClinicVisit, EmployeeClinicVisit, OccupationalClinicVisit, OccupationalHealthAssessment,
    CommitteeReferral, MedicalCommitteeCase, InjuryCase, NeedleStickExposure, ScreeningProgramRecord)
MASTER_HEALTH = ('latest_virtual_visit', 'latest_field_visit', 'lab_request', 'lab_request_date')


def plan_cards(rows, *, lock=False):
    ids = Counter(text(src.get('national_id')) for _, src in rows)
    staff_qs = Employee.objects.filter(national_id__in=list(ids)).order_by('pk')
    if lock:
        staff_qs = staff_qs.select_for_update()
    # Only exact QA identities may reach card and specialized-record queries.
    staff = {e.national_id: e for e in staff_qs if synthetic(e)}
    staff_ids = [e.pk for e in staff.values()]
    card_qs = EmployeeHealthCard.objects.filter(employee_id__in=staff_ids).order_by('pk')
    if lock:
        card_qs = card_qs.select_for_update()
    cards = {c.employee_id: c for c in card_qs}
    specialized_ids = set()
    for model in SPECIALIZED:
        qs = model.objects.filter(employee_id__in=staff_ids).order_by('pk')
        if lock:
            qs = qs.select_for_update()
        specialized_ids.update(qs.values_list('employee_id', flat=True))
    items, changes, facts = [], {}, []
    for row_number, source in rows:
        nid = text(source.get('national_id'))
        employee = staff.get(nid)
        # Never compare a non-QA employee's name, affiliation or saved values.
        # Use a generic unmatched result, indistinguishable from an absent identity.
        if employee is not None and not synthetic(employee):
            employee = None
        status = identity_status(source, employee, ids[nid] > 1)
        card = cards.get(employee.pk) if employee else None
        item = {'row': row_number, 'status': 'review', 'reason': status,
                'eligible_fields': [], 'conflict_fields': [], 'review_fields': [], 'matched_fields': []}
        items.append(item)
        facts.append([row_number, employee.pk if employee else None,
                      employee.updated_at.isoformat() if employee else None,
                      card.pk if card else None, card.updated_at.isoformat() if card else None,
                      card.is_approved if card else None])
        if status != 'matched':
            continue
        if card and card.is_approved:
            item['reason'] = 'approved_card'
            continue
        if employee.pk in specialized_ids or any(getattr(employee, key, None) for key in MASTER_HEALTH):
            item['reason'] = 'specialized_records'
            continue
        existing = card.data if card else {}
        if not isinstance(existing, dict) or any(not isinstance(v, dict) for v in existing.values()):
            item['reason'] = 'invalid_existing_card'
            continue
        proposed_data = deepcopy(existing)
        for key in HEALTH_FIELDS:
            value = source.get(key)
            if not text(value):
                continue
            try:
                proposed = normalized_value(key, value)
            except ValueError:
                item['review_fields'].append(key)
                continue
            section, target = TARGETS[key]
            old = existing.get(section, {}).get(target)
            if text(old):
                try:
                    same = normalized_value(key, old) == proposed
                except ValueError:
                    same = False
                item['matched_fields' if same else 'conflict_fields'].append(key)
                continue
            proposed_data.setdefault(section, {})[target] = proposed
            item['eligible_fields'].append(key)
        # A conflicting row is not partially imported. Resolve source conflicts first.
        if item['conflict_fields']:
            item.update(reason='card_conflict', eligible_fields=[])
        elif item['eligible_fields']:
            item.update(status='ready', reason='')
            changes[row_number] = (employee, card, proposed_data, item['eligible_fields'])
        elif item['review_fields']:
            item['reason'] = 'ambiguous_or_invalid'
        elif item['matched_fields']:
            item.update(status='unchanged', reason='same_card_values')
        else:
            item.update(status='unchanged', reason='no_values')
    # Bind the signed token to the proposed values and observed saved card state.
    # Raw clinical values and identifiers never leave the server in the token.
    payload = {'facts': facts, 'items': items,
               'changes': {str(row): data for row, (_, _, data, _) in changes.items()}}
    digest = sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str).encode()).hexdigest()
    return items, changes, digest


class HealthDataCardCommitView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        def reply(data, status=200):
            return Response(data, status=status, headers=NO_CACHE)
        if not authorized(request):
            return reply({'detail': 'متاح للمسؤول الأعلى في Staging فقط.'}, 403)
        if request.data.get('synthetic_confirmed') != 'true':
            return reply({'detail': 'أقر باستخدام بيانات اصطناعية فقط.'}, 400)
        action = request.data.get('action')
        if action not in ('preview', 'apply'):
            return reply({'detail': 'إجراء غير صالح.'}, 400)
        upload = request.FILES.get('file')
        try:
            rows = read_rows(upload)
            upload.seek(0)
            file_digest = sha256(upload.read()).hexdigest()
        except (ValueError, OSError) as exc:
            return reply({'detail': str(exc)}, 400)
        try:
            with transaction.atomic():
                items, changes, digest = plan_cards(rows, lock=action == 'apply')
                token_data = {'user': request.user.pk, 'file': file_digest, 'plan': digest}
                if action == 'preview':
                    counts = Counter(i['status'] for i in items)
                    return reply({'rows': items, 'total': len(items), 'counts': {k: counts[k] for k in ('ready','review','unchanged')},
                                  'eligible_values': sum(len(v[3]) for v in changes.values()),
                                  'preview_token': signing.dumps(token_data, salt=SALT),
                                  'synthetic_only': True, 'draft_only': True})
                try:
                    supplied = signing.loads(request.data.get('preview_token', ''), salt=SALT, max_age=600)
                except signing.BadSignature:
                    return reply({'detail': 'انتهت المعاينة أو رمزها غير صالح. أعد الفحص.'}, 409)
                if supplied != token_data:
                    return reply({'detail': 'تغير الملف أو السجلات بعد المعاينة. أعد الفحص.'}, 409)
                try:
                    selected = json.loads(request.data.get('selected_rows', '[]'))
                except (ValueError, TypeError):
                    return reply({'detail': 'تحديد الصفوف غير صالح.'}, 400)
                reason = text(request.data.get('reason'))
                if (not isinstance(selected, list) or not selected or len(selected) > MAX_SELECTED
                        or any(type(r) is not int for r in selected) or len(set(selected)) != len(selected)
                        or not set(selected).issubset(changes) or request.data.get('confirmation') != CONFIRM
                        or not 10 <= len(reason) <= 350):
                    return reply({'detail': 'حدد الصفوف المؤهلة واكتب سبب الاستكمال وعبارة التأكيد.'}, 400)
                audit_rows = []
                for row in selected:
                    employee, card, data, fields = changes[row]
                    if card is None:
                        card = EmployeeHealthCard.objects.create(employee=employee, data=data,
                            created_by=request.user, updated_by=request.user, is_approved=False)
                    else:
                        card.data = data
                        card.updated_by = request.user
                        card.save(update_fields=['data', 'updated_by', 'updated_at'])
                    audit_rows.append({'row': row, 'card_id': card.pk, 'fields': fields})
                    AuditLog.objects.create(user=str(request.user), action='health_data_draft_fill',
                        model_name='EmployeeHealthCard', record_id=str(card.pk))
                count = sum(len(r['fields']) for r in audit_rows)
                batch = DataImportBatch.objects.create(file_name='HealthData V1 (synthetic)',
                    sheet_name='HealthData', mode='commit', status='committed',
                    total_rows=len(rows), valid_rows=len(changes), imported_records=len(selected),
                    skipped_rows=len(rows)-len(selected), created_by=request.user,
                    summary={'workflow': 'health_data_draft_fill_v1', 'file_sha256': file_digest,
                             'reason': reason, 'changed_values': count, 'rows': audit_rows})
                return reply({'updated_cards': len(selected), 'updated_values': count,
                              'batch_id': batch.pk, 'draft_only': True})
        except IntegrityError:
            return reply({'detail': 'تغير سجل أثناء الحفظ؛ لم تُعتمد الدفعة. أعد الفحص.'}, 409)
