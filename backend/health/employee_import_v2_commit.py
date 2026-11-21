"""Guarded V2 employee Excel import. Only unique new identities and verified fill-only
updates; no auto-revival, overwrite, center reassignment or clinical changes.
The workbook remains in request memory and never enters Git or permanent storage.
"""
import hashlib
import json
import re
from datetime import date

from django.conf import settings
from django.core import signing
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from rest_framework.response import Response

from .models import (AuditLog, DataImportBatch, Employee,
                     EmployeeProfileCompletionEvent)
from .employee_import_v2_matching import norm_text


TOKEN_SALT = 'employee-import-v2-controlled-commit'
TOKEN_MAX_AGE = 600
MAX_OPERATIONS = 1500
NATIONALITY_CODES = {
    'السعودية': 'SA', 'سعودي': 'SA', 'سعودية': 'SA',
    'مصر': 'EG', 'مصري': 'EG', 'مصرية': 'EG',
    'السودان': 'SD', 'سوداني': 'SD', 'سودانية': 'SD',
    'البحرين': 'BH', 'بحريني': 'BH', 'بحرينية': 'BH',
    'سوريا': 'SY', 'سوري': 'SY', 'سورية': 'SY',
    'كوبا': 'CU', 'كوبي': 'CU', 'كوبية': 'CU',
    'باكستان': 'PK', 'باكستاني': 'PK', 'باكستانية': 'PK',
    'الكويت': 'KW', 'كويتي': 'KW', 'كويتية': 'KW',
}
GENDERS = {
    'ذكر': 'male', 'ذكرى': 'male', 'male': 'male',
    'أنثى': 'female', 'انثى': 'female', 'female': 'female',
}
MARITAL = {
    'أعزب': 'single', 'اعزب': 'single', 'عزباء': 'single',
    'single': 'single', 'متزوج': 'married', 'متزوجة': 'married',
    'married': 'married', 'مطلق': 'divorced', 'مطلقة': 'divorced',
    'divorced': 'divorced', 'أرمل': 'widowed', 'أرملة': 'widowed',
    'widowed': 'widowed',
}
TEXT_LIMITS = {
    'employee_number': 40, 'email': 254, 'mobile': 30,
    'job_title': 150, 'current_job': 200, 'job_title_en': 150,
    'national_address': 255, 'birth_place': 120,
}


def normalized_employee_fields(row):
    fields = {}
    for field, limit in TEXT_LIMITS.items():
        value = str(row.get(field) or '').strip()
        if not value or len(value) > limit:
            continue
        if field == 'email':
            value = value.lower()
            try:
                validate_email(value)
            except ValidationError:
                continue
        fields[field] = value
    nationality = str(row.get('nationality') or '').strip()
    if nationality:
        value = NATIONALITY_CODES.get(nationality, '')
        if not value and len(nationality) == 2 and nationality.isalpha():
            value = nationality.upper()
        if value:
            fields['nationality'] = value
    gender = GENDERS.get(str(row.get('gender') or '').strip().casefold())
    if gender:
        fields['gender'] = gender
    marital = MARITAL.get(str(row.get('marital_status') or '').strip().casefold())
    if marital:
        fields['marital_status'] = marital
    for field in ('date_of_birth', 'appointment_date'):
        raw = str(row.get(field) or '').strip()
        if not raw:
            continue
        try:
            value = date.fromisoformat(raw[:10])
        except (ValueError, TypeError):
            continue
        if 1900 <= value.year <= date.today().year + (1 if field == 'appointment_date' else 0):
            fields[field] = value
    # Preserve source Hijri appointment dates verbatim; never pretend they are
    # Gregorian dates. Verified conversion can happen separately.
    raw_appointment = str(row.get('appointment_date') or '').strip()
    if re.fullmatch(r'1[34]\d{2}/\d{1,2}/\d{1,2}', raw_appointment):
        fields['roster_hijri_appointment_date'] = raw_appointment[:30]
    return fields


def registry_fingerprint(plan):
    """Canonical preview-state fingerprint; not a substitute for DB unique indexes."""
    employee_ids = [r['employee_pk'] for r in plan['_internal_planned_rows'] if r['employee_pk']]
    staff = Employee.objects.filter(pk__in=employee_ids).order_by('pk')
    state = [{
        'pk': e.pk, 'name': e.name, 'national_id': e.national_id,
        'employee_number': e.employee_number, 'email': e.email,
        'is_archived': e.is_archived, 'employment_status': e.employment_status,
        'center': e.health_center_id, 'unit': e.organization_unit_id,
        'registration_status': e.registration_status,
        'source_organizational_hierarchy': e.source_organizational_hierarchy,
        'fields': {
            k: str(getattr(e, k, '') or '')
            for k in ('nationality', 'mobile', 'job_title', 'job_title_en',
                      'current_job', 'national_address', 'birth_place', 'gender',
                      'marital_status', 'date_of_birth', 'appointment_date')
        },
        'updated_at': e.updated_at.isoformat(),
    } for e in staff]
    action_facts = [{
        'source_row': p['row']['_row'],
        'status': p['kind'],
        'employee_pk': p['employee_pk'],
        'center_id': p['approved_center_id'],
        'organization_id': p['approved_unit_id'],
        'missing': p['missing_fields'],
    } for p in plan['_internal_planned_rows']]
    payload = {'counts': plan['registry_counts'], 'state': state, 'actions': action_facts}
    return hashlib.sha256(json.dumps(
        payload, sort_keys=True, ensure_ascii=False, default=str,
    ).encode('utf-8')).hexdigest()


def planned_action_counts(plan):
    counts = {'create': 0, 'fill_only': 0, 'provisional': 0}
    for operation in plan['_internal_planned_rows']:
        if operation['employee_pk'] is None:
            counts['create'] += 1
            if operation['kind'] != 'new_candidate' or operation['missing_fields']:
                counts['provisional'] += 1
        else:
            counts['fill_only'] += 1
    return counts


def preview_commit_info(plan, file_sha, sheet, user_id):
    fingerprint = registry_fingerprint(plan)
    counts = planned_action_counts(plan)
    token = signing.dumps({
        'file_sha256': file_sha,
        'sheet': sheet, 'user': user_id,
        'fingerprint': fingerprint, 'counts': counts,
    }, salt=TOKEN_SALT)
    return {
        'safe_import_candidate_counts': counts,
        'requires_manual_review': plan['rows_total'] - counts['create'] - counts['fill_only'],
        'commit_token': token,
        'confirm_phrase': f"اعتماد {counts['create'] + counts['fill_only']} سجل",
        'commit_available': bool(getattr(settings, 'EMPLOYEE_IMPORT_V2_COMMIT_ENABLED', False)),
        'commit_notice': ('لن تُستعاد السجلات المؤرشفة تلقائيًا، ولن يُستبدل أي حقل ممتلئ '
                          'أو يُنقل موظف إلى مركز مختلف. تُحفظ الهويات الجديدة '
                          'بشكل مبدئي إذا لم يُعتمد مركزها أو نقصت بياناتها.'),
    }


def commit_safe_plan(request, plan, file_sha, sheet, sheet_rows):
    if not getattr(settings, 'EMPLOYEE_IMPORT_V2_COMMIT_ENABLED', False):
        return Response({'detail': 'الاعتماد لم يُفعّل في بيئة التشغيل الحالية.'}, status=403)
    try:
        parsed = signing.loads(request.data.get('commit_token'), salt=TOKEN_SALT,
                               max_age=TOKEN_MAX_AGE)
    except (signing.BadSignature, signing.SignatureExpired, ValueError, TypeError):
        return Response({'detail': 'انتهت صلاحية الفحص، أعد معاينة الملف.'}, status=409)
    counts = planned_action_counts(plan)
    reason = str(request.data.get('reason') or '').strip()
    expected_phrase = f"اعتماد {counts['create'] + counts['fill_only']} سجل"
    if (request.data.get('confirm_phrase') != expected_phrase
            or request.data.get('confirmed') != 'true'
            or request.data.get('identity_checked') != 'true'
            or not 20 <= len(reason) <= 500):
        return Response({'detail': 'يلزم التأكد من النطاق، وعبارة الاعتماد والمبرر.'},
                        status=400)
    if (not isinstance(parsed, dict)
            or parsed.get('file_sha256') != file_sha
            or parsed.get('sheet') != sheet
            or parsed.get('user') != request.user.pk
            or parsed.get('counts') != counts):
        return Response({'detail': 'الملف أو النطاق أو المسؤول مختلف عن الفحص.'}, status=409)
    if not 0 < counts['create'] + counts['fill_only'] <= MAX_OPERATIONS:
        return Response({'detail': 'لا توجد سجلات مؤهلة أو تجاوز العدد حد الدفعة.'},
                        status=409)

    from .employee_import_v2_matching import registry_match
    try:
        with transaction.atomic():
            # Lock all matching records before rebuilding the plan.
            from .employee_import_v2 import identity
            nids = [identity(row['national_id'])
                    for row in sheet_rows]
            list(Employee.objects.select_for_update().filter(
                national_id__in=nids).order_by('pk').values_list('pk', flat=True))
            current_plan = registry_match(sheet_rows)
            if registry_fingerprint(current_plan) != parsed.get('fingerprint'):
                return Response({'detail': 'تغيّرت قاعدة الموظفين بعد المعاينة؛ أعد الفحص.'},
                                status=409)
            if DataImportBatch.objects.filter(
                mode='commit', status='committed',
                summary__v2_source_sha256=file_sha,
            ).exists():
                return Response({'detail': 'سبق اعتماد هذا الملف؛ لن يُعاد تنفيذه.'},
                                status=409)

            created = updated = provisional = 0
            for operation in current_plan['_internal_planned_rows']:
                row = operation['row']
                fields = normalized_employee_fields(row)
                center_id = operation['approved_center_id']
                unit_id = operation['approved_unit_id']
                if operation['employee_pk'] is None:
                    # All unapproved proposed affiliations stay unassigned.
                    is_provisional = bool(
                        operation['kind'] != 'new_candidate'
                        or operation['missing_fields']
                        or not center_id
                    )
                    employee = Employee.objects.create(
                        national_id=operation['national_id'],
                        name=row['name'].strip()[:200],
                        health_center_id=center_id,
                        organization_unit_id=unit_id,
                        source_center_name=str(row.get('health_center') or '')[:200],
                        registration_status=('provisional' if is_provisional else 'verified'),
                        source_organizational_hierarchy=dict(row.get('_org_v4') or {}),
                        **fields,
                    )
                    created += 1
                    provisional += int(is_provisional)
                else:
                    employee = Employee.objects.get(pk=operation['employee_pk'])
                    # Never revive archived staff, never overwrite existing values.
                    if employee.is_archived or norm_text(employee.name) != norm_text(row['name']):
                        raise ValueError('تغيّرت سلامة الهوية في سجل قائم؛ أعد الفحص')
                    changed = []
                    for field, value in fields.items():
                        present = getattr(employee, field, None)
                        if not present:
                            setattr(employee, field, value)
                            changed.append(field)
                    if center_id and not employee.health_center_id:
                        employee.health_center_id = center_id
                        changed.append('health_center')
                    if unit_id and not employee.organization_unit_id:
                        employee.organization_unit_id = unit_id
                        changed.append('organization_unit')
                    incoming_hierarchy = row.get('_org_v4') or {}
                    if incoming_hierarchy:
                        original_hierarchy = employee.source_organizational_hierarchy or {}
                        if any(
                            norm_text(original_hierarchy[key]) != norm_text(value)
                            for key, value in incoming_hierarchy.items()
                            if original_hierarchy.get(key)
                        ):
                            raise ValueError('تعارضت تبعية تنظيمية موجودة؛ يلزم فحص فردي')
                        additions = {
                            key: value for key, value in incoming_hierarchy.items()
                            if not original_hierarchy.get(key)
                        }
                        if additions:
                            employee.source_organizational_hierarchy = {
                                **original_hierarchy, **additions,
                            }
                            changed.append('source_organizational_hierarchy')
                    if not employee.source_center_name and row.get('health_center'):
                        employee.source_center_name = str(row['health_center'])[:200]
                        changed.append('source_center_name')
                    if changed:
                        employee.save(update_fields=[*changed, 'updated_at'])
                        EmployeeProfileCompletionEvent.objects.create(
                            employee=employee, changed_fields=changed,
                            reason=reason, identity_checked=True,
                            resulting_center=employee.health_center,
                            performed_by=request.user,
                        )
                        updated += 1

            total = current_plan['rows_total']
            batch = DataImportBatch.objects.create(
                file_name='employee-import-v2.xlsx',
                sheet_name=sheet,
                mode='commit', status='committed',
                total_rows=total, valid_rows=created + updated,
                imported_records=created + updated,
                skipped_rows=total - created - updated,
                summary={
                    'v2_source_sha256': file_sha,
                    'created': created, 'updated': updated,
                    'provisional': provisional,
                    'blocked_by_classification': dict(current_plan['registry_counts']),
                    'approved_by_user_id': request.user.pk,
                },
                created_by=request.user,
            )
            AuditLog.objects.create(
                user=str(request.user), action='employee_import_v2_controlled_commit',
                model_name='DataImportBatch', record_id=str(batch.pk),
            )
    except (IntegrityError, ValueError):
        return Response({
            'detail': 'تعارضت بيانات أحد الموظفين أثناء الحفظ؛ أُلغيت الدفعة كاملة دون إدخال جزئي.',
        }, status=409)
    return Response({
        'mode': 'employee_import_v2_committed',
        'created': created, 'filled': updated,
        'provisional': provisional,
        'skipped': total - created - updated,
        'archived_restored': 0,
        'existing_overwritten': 0,
        'batch_id': batch.pk,
        'notice': 'تمت إضافة الهويات الجديدة واستكمال حقول فارغة فقط. لم تُستعد أي بطاقة مؤرشفة.',
    }, headers={'Cache-Control': 'private, no-store'})
