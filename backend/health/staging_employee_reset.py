"""Isolated Staging test-card reset; never performs a general employee deletion.

A two-step signed preview and revalidation protects genuine/unknown employees,
health cards and employment history from accidental loss. Production is barred.
"""
from collections import Counter
from hashlib import sha256
import json
import os
import re

from django.core import signing
from django.db import transaction
from django.db.models import Q
from django.db.models.deletion import ProtectedError, RestrictedError
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AuditLog, Employee


STAGING_PROJECT_ID = 'cf4b2162-5236-4f92-b010-165f505fe2c2'
CONFIRM_PHRASE = 'تصفير بطاقات الاختبار'
TOKEN_SALT = 'ohp-staging-synthetic-employee-reset-v1'
MAX_AGE_SECONDS = 600
SCOPES = {'all_synthetic', 'load_only', 'examples_only'}
MAX_CANDIDATES = 5000
QA_EXAMPLES = {
    'OHP-QA-01': ('9990000001', 'تجريبي — موظف نشط ١'),
    'OHP-QA-02': ('9990000002', 'تجريبي — موظفة نشطة ٢'),
    'OHP-QA-03': ('9990000003', 'تجريبي — موظف نشط ٣'),
    'OHP-QA-04': ('9990000004', 'تجريبي — موظفة متقاعدة'),
    'OHP-QA-05': ('9990000005', 'تجريبي — موظف تحت المراجعة'),
    'OHP-QA-06': ('9990000006', 'تجريبي — موظف منقول خارج الجهة'),
}


def is_verified_synthetic(employee):
    """All independent seed identifiers must match EXACTLY, never a prefix alone."""
    number = employee.employee_number or ''
    identity = employee.national_id or ''
    email = (employee.email or '').lower()
    if re.fullmatch(r'OHP-LOAD-[0-9]{4}', number):
        index = int(number[-4:])
        return (
            1 <= index <= 1423
            and identity == f'9991{index:06d}'
            and email == f'qa-load-{index:04d}@example.invalid'
            and employee.name == f'موظف تجريبي رقم {index:04d}'
            and employee.health_center.code == f'QA-C{((index - 1) * 37 % 131) % 25 + 1:02d}'
        )
    if number in QA_EXAMPLES:
        expected_id, expected_name = QA_EXAMPLES[number]
        return (identity == expected_id and employee.name == expected_name
                and email == number.lower() + '@example.invalid')
    return False


def verified_candidates(scope):
    possible = Employee.objects.select_related('health_center').filter(
        Q(employee_number__startswith='OHP-LOAD-')
        | Q(employee_number__startswith='OHP-QA-')
    ).order_by('pk')
    checked = list(possible)
    if len(checked) > MAX_CANDIDATES:
        raise ValueError('Too many QA-marked employee rows; manual safety inspection required.')
    verified = [item for item in checked if is_verified_synthetic(item)]
    if scope == 'load_only':
        verified = [item for item in verified if item.employee_number.startswith('OHP-LOAD-')]
    elif scope == 'examples_only':
        verified = [item for item in verified if item.employee_number.startswith('OHP-QA-')]
    return verified


def linked_employee_ids(ids):
    """Do not erase any test employee with *any* clinical or history relations.

    All auto-created reverse relationships are checked, including import review
    references and protected historical changes. This deliberately leaves
    clinically modified QA employees untouched for manual review.
    """
    blocked = set()
    if not ids:
        return blocked
    for rel in Employee._meta.get_fields(include_hidden=True):
        if not getattr(rel, 'auto_created', False) or getattr(rel, 'concrete', False):
            continue
        field = getattr(rel, 'field', None)
        model = getattr(rel, 'related_model', None)
        if not field or not model or not getattr(field, 'attname', None):
            continue
        blocked.update(model._base_manager.filter(
            **{field.attname + '__in': ids}
        ).values_list(field.attname, flat=True).distinct())
    return blocked


def make_snapshot(scope):
    verified = verified_candidates(scope)
    marked = Employee.objects.filter(
        Q(employee_number__startswith='OHP-LOAD-') |
        Q(employee_number__startswith='OHP-QA-')
    ).count()
    total = Employee.objects.count()
    ids = [employee.pk for employee in verified]
    protected = linked_employee_ids(ids)
    eligible = [employee for employee in verified if employee.pk not in protected]
    category = Counter(
        'load' if item.employee_number.startswith('OHP-LOAD-') else 'examples'
        for item in eligible
    )
    source = {
        'scope': scope, 'total': total, 'marked': marked,
        'rows': [[e.pk, e.employee_number, e.updated_at.isoformat()] for e in verified],
        'linked': sorted(protected),
    }
    digest = sha256(json.dumps(source, ensure_ascii=False,
                               separators=(',', ':'), sort_keys=True).encode()).hexdigest()
    return {
        'scope': scope,
        'total_employees': total,
        'marked_test_records': marked,
        'verified_test_records': len(verified),
        'eligible_count': len(eligible),
        'eligible_load_count': category['load'],
        'eligible_example_count': category['examples'],
        'excluded_with_related_records': len(protected),
        'excluded_unverified_markers': marked - (len(verified) if scope == 'all_synthetic'
                                                  else sum(is_verified_synthetic(e) for e in
                                                           Employee.objects.select_related('health_center').filter(
                                                               Q(employee_number__startswith='OHP-LOAD-') |
                                                               Q(employee_number__startswith='OHP-QA-')
                                                           ))),
        'other_records_to_keep': total - len(eligible),
        'eligible_ids': [employee.pk for employee in eligible],
        'fingerprint': digest,
    }


class StagingEmployeeCardResetView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request):
        if not request.user.is_superuser:
            return Response({'detail': 'Only a superuser may reset synthetic QA cards.'},
                            status=status.HTTP_403_FORBIDDEN)
        if (os.environ.get('STAGING_MODE', '').lower() != 'true' or
                os.environ.get('RAILWAY_PROJECT_ID') != STAGING_PROJECT_ID):
            return Response({'detail': 'This operation is only available in isolated Staging.'},
                            status=status.HTTP_403_FORBIDDEN)
        action = request.data.get('action')
        scope = request.data.get('scope', 'all_synthetic')
        if action not in ('preview', 'reset') or scope not in SCOPES:
            return Response({'detail': 'Invalid action or synthetic-data scope.'}, status=400)
        try:
            # Locked rows make the preview-to-delete invariants stable during confirm.
            with transaction.atomic():
                if action == 'reset':
                    list(Employee.objects.select_for_update().order_by('pk').values_list('pk', flat=True))
                snapshot = make_snapshot(scope)
                if action == 'preview':
                    payload = {
                        'scope': scope,
                        'fingerprint': snapshot['fingerprint'],
                    }
                    preview_token = signing.dumps(payload, salt=TOKEN_SALT)
                    return Response({
                        'mode': 'preview',
                        **{key: value for key, value in snapshot.items()
                           if key not in ('fingerprint', 'eligible_ids')},
                        'preview_token': preview_token,
                    }, headers={'Cache-Control': 'no-store'})
                if request.data.get('confirm_text') != CONFIRM_PHRASE or request.data.get('acknowledge_irreversible') is not True:
                    return Response({'detail': 'Explicit reset phrase and irreversible-action acknowledgement are required.'},
                                    status=400)
                token = request.data.get('preview_token')
                try:
                    previous = signing.loads(token, salt=TOKEN_SALT, max_age=MAX_AGE_SECONDS)
                except (signing.BadSignature, signing.SignatureExpired, TypeError, ValueError):
                    return Response({'detail': 'Reset preview expired or invalid. Preview again.'}, status=409)
                if (not isinstance(previous, dict)
                        or previous.get('scope') != scope
                        or previous.get('fingerprint') != snapshot['fingerprint']):
                    return Response({'detail': 'Employee records changed since preview. Preview again.'}, status=409)
                if not snapshot['eligible_ids']:
                    return Response({'detail': 'No verified test cards are eligible for reset.'}, status=409)
                count = len(snapshot['eligible_ids'])
                deleted, _ = Employee.objects.filter(pk__in=snapshot['eligible_ids']).delete()
                # The strict no-related-record condition means only Employee objects
                # should have been removed. Reject unexpected cascading deletion.
                if deleted != count:
                    raise RuntimeError('Unexpected related data deletion; transaction rolled back.')
                AuditLog.objects.create(
                    user=str(request.user),
                    action='staging_synthetic_employee_cards_reset',
                    model_name='Employee',
                    record_id=f'qa:{count}',
                )
                return Response({
                    'mode': 'reset',
                    'deleted_test_cards': count,
                    'remaining_employee_cards': Employee.objects.count(),
                    'notice': 'Only seed-verified Staging employee cards without related records were removed.',
                }, headers={'Cache-Control': 'no-store'})
        except (ProtectedError, RestrictedError, ValueError, RuntimeError) as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_409_CONFLICT)
