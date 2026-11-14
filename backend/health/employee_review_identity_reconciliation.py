"""Read-only inventory of stored employee-import reviews against existing identities.

Never creates/restores employees, edits source payloads or returns identity values.
This is an administrative diagnostic, not an authorization to bulk-update staff.
"""
from collections import Counter, defaultdict
import unicodedata

from django.http import HttpResponse
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .employee_import_classification import normalize_person_name
from .models import Employee, EmployeeImportReview


MAX_REVIEW_CARDS = 10000
FILL_ONLY_FIELDS = (
    'employee_number', 'email', 'mobile', 'national_address', 'date_of_birth',
    'birth_place', 'gender', 'marital_status', 'nationality', 'job_title',
    'job_title_en', 'current_job', 'appointment_date',
)


def normalized_national_id(value):
    if value is None:
        return ''
    return ''.join(
        str(unicodedata.digit(char))
        for char in str(value)
        if char.isdecimal()
    )


def has_value(value):
    return value is not None and str(value).strip() != ''


def snapshot_review_reconciliation():
    reviews = list(EmployeeImportReview.objects.filter(
        status__in=('pending', 'conflict'),
    ).order_by('-updated_at', '-pk').values(
        'pk', 'employee_payload',
    )[:MAX_REVIEW_CARDS + 1])
    if len(reviews) > MAX_REVIEW_CARDS:
        return None

    by_identity = defaultdict(list)
    invalid_identity_cards = 0
    for review in reviews:
        payload = review['employee_payload']
        if not isinstance(payload, dict):
            invalid_identity_cards += 1
            continue
        identity = normalized_national_id(payload.get('national_id'))
        if len(identity) != 10:
            invalid_identity_cards += 1
            continue
        by_identity[identity].append(payload)

    records = {
        e.national_id: e for e in Employee.objects.filter(
            national_id__in=list(by_identity.keys()),
        ).only('pk', 'national_id', 'name', 'is_archived', *FILL_ONLY_FIELDS)
    }

    counts = Counter()
    fill_field_counts = Counter()
    extra_cards = 0

    for identity, candidates in by_identity.items():
        if len(candidates) > 1:
            counts['multiple_reviews_for_identity'] += 1
            extra_cards += len(candidates) - 1
        employee = records.get(identity)
        if not employee:
            counts['identity_not_in_registry'] += 1
            continue

        if employee.is_archived:
            counts['matched_archived'] += 1
        else:
            counts['matched_active'] += 1

        # Multiple review versions require checking source provenance before
        # any completion. Use the most recent solely for summary diagnostics.
        candidate = candidates[0]
        if (not candidate.get('name') or
                normalize_person_name(candidate['name']) != normalize_person_name(employee.name)):
            counts['different_or_missing_name'] += 1
            continue
        if any(
            has_value(candidate.get(key)) and has_value(getattr(employee, key)) and
            str(candidate[key]).strip().lower() != str(getattr(employee, key)).strip().lower()
            for key in ('employee_number', 'email')
        ):
            counts['different_unique_fields'] += 1
            continue

        if len(candidates) > 1:
            counts['matched_name_but_multiple_sources'] += 1
            continue
        if employee.is_archived:
            counts['archived_requires_verified_restore'] += 1
            continue

        available = [
            field for field in FILL_ONLY_FIELDS
            if has_value(candidate.get(field)) and not has_value(getattr(employee, field))
        ]
        if available:
            counts['active_possible_fill_only'] += 1
            fill_field_counts.update(available)
        else:
            counts['active_no_empty_fields_to_fill'] += 1

    return {
        'mode': 'read_only',
        'review_cards': len(reviews),
        'unique_valid_identities': len(by_identity),
        'invalid_identity_cards': invalid_identity_cards,
        'repeated_review_cards': extra_cards,
        'matched_active': counts['matched_active'],
        'matched_archived': counts['matched_archived'],
        'identity_not_in_registry': counts['identity_not_in_registry'],
        'different_or_missing_name': counts['different_or_missing_name'],
        'different_unique_fields': counts['different_unique_fields'],
        'multiple_reviews_for_identity': counts['multiple_reviews_for_identity'],
        'matched_name_but_multiple_sources': counts['matched_name_but_multiple_sources'],
        'archived_requires_verified_restore': counts['archived_requires_verified_restore'],
        'active_possible_fill_only': counts['active_possible_fill_only'],
        'active_no_empty_fields_to_fill': counts['active_no_empty_fields_to_fill'],
        'possible_fill_fields': dict(fill_field_counts),
        'notice_ar': (
            'فحص قراءة فقط: الأعداد حسب الهويات الفريدة؛ البطاقات المتكررة محسوبة '
            'بصورة مستقلة. لا يتم تحديث أو استعادة أو إنشاء أي موظف.'
        ),
    }


class EmployeeReviewIdentityReconciliationPreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not request.user.is_superuser:
            return Response(
                {'detail': 'هذه المعاينة متاحة للمسؤول الأعلى فقط.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        summary = snapshot_review_reconciliation()
        if summary is None:
            return Response(
                {'detail': 'عدد بطاقات المراجعة كبير؛ يلزم تدقيقها على دفعات.'},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(summary, headers={'Cache-Control': 'private, no-store'})
