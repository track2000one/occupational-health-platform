"""Conservative, read-only employee name comparison for provisional Excel cards.

Compares the imported name with the *same national ID's* existing original
Employee record; never looks for an alternate identity by fuzzy matching.
All categories are review suggestions, NOT proof of identity or eligibility
to restore archived employees or access clinical data.
"""
from collections import Counter
from difflib import SequenceMatcher
import re
import unicodedata

from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .employee_import_classification import normalize_person_name
from .models import Employee, ProvisionalEmployeeImportBatch
from .provisional_employee_roster import NO_CACHE, _masked, _unseal

PAGE_SIZE = 25
MAX_PAGE = 100
CATEGORIES = (
    'format_variation',
    'token_order_variation',
    'genealogy_particle_variation',
    'incomplete_name',
    'minor_spelling_variation',
    'substantial_difference',
    'missing_original',
)

NAME_PARTICLES = frozenset(('بن', 'ابن', 'بنت'))


def _words(value):
    normal = normalize_person_name(value)
    # Name punctuation and zero-width formatting must not create phantom tokens.
    normal = unicodedata.normalize('NFKC', normal)
    normal = re.sub(r'[\u200b-\u200f\u2060\ufeff]', '', normal)
    return [part for part in re.split(r'[^\w\u0600-\u06ff]+', normal) if part]


def _is_contiguous_subsequence(shorter, longer):
    size = len(shorter)
    return size > 0 and any(longer[i:i + size] == shorter
                            for i in range(len(longer) - size + 1))


def classify_name(incoming, existing):
    """Compare *names*, not identities; ordered from literal to conservative."""
    if not str(existing or '').strip():
        return 'missing_original'

    a, b = _words(incoming), _words(existing)
    if not a or not b:
        return 'substantial_difference'
    if a == b or ''.join(a) == ''.join(b):
        return 'format_variation'
    if len(a) >= 2 and len(a) == len(b) and sorted(a) == sorted(b):
        return 'token_order_variation'
    non_particle_a = [part for part in a if part not in NAME_PARTICLES]
    non_particle_b = [part for part in b if part not in NAME_PARTICLES]
    if (len(non_particle_a) >= 2 and non_particle_a == non_particle_b
            and a != b):
        return 'genealogy_particle_variation'
    shorter, longer = (a, b) if len(a) < len(b) else (b, a)
    if (len(longer) > len(shorter) >= 2
            and len(longer) - len(shorter) <= 2
            and _is_contiguous_subsequence(shorter, longer)):
        return 'incomplete_name'

    # A very narrow spelling *hint*: exactly one similar token differs
    # across a name with at least three ordered tokens, not a different surname
    # or a reordering. This is never actionable without human verification.
    if len(a) == len(b) and len(a) >= 3:
        changed = [(word_a, word_b) for word_a, word_b in zip(a, b)
                   if word_a != word_b]
        if len(changed) == 1:
            old, new = changed[0]
            ratio = SequenceMatcher(None, old, new, autojunk=False).ratio()
            entire = SequenceMatcher(
                None, ' '.join(a), ' '.join(b), autojunk=False,
            ).ratio()
            if min(len(old), len(new)) >= 5 and ratio >= 0.86 and entire >= 0.94:
                return 'minor_spelling_variation'
    return 'substantial_difference'


def review_names(batch, *, category='', page=1):
    if category and category not in CATEGORIES:
        raise ValueError('نوع اختلاف الاسم غير معروف.')
    if not isinstance(page, int) or not 1 <= page <= MAX_PAGE:
        raise ValueError('رقم الصفحة غير صالح.')

    # A row is included only when its *current* provisional classification is
    # name_review. The original Employee is resolved by exact national ID.
    rows = list(batch.rows.filter(classification='name_review').only(
        'source_row', 'sealed_payload',
    ).order_by('source_row'))
    decrypted = [(row, _unseal(row.sealed_payload)) for row in rows]
    original_by_nid = {
        employee.national_id: employee.name
        for employee in Employee.objects.filter(
            national_id__in=[
                str(profile.get('national_id') or '')
                for _, profile in decrypted
            ]
        ).only('national_id', 'name')
    }

    counts = Counter()
    selected = []
    for row, profile in decrypted:
        national_id = str(profile.get('national_id') or '')
        incoming_name = str(profile.get('name') or '').strip()
        old_name = original_by_nid.get(national_id)
        detected = classify_name(incoming_name, old_name)
        counts[detected] += 1
        if not category or detected == category:
            selected.append({
                'source_row': row.source_row,
                'masked_id': _masked(national_id),
                'excel_name': incoming_name,
                'original_name': old_name or '',
                'category': detected,
                'requires_human_verification': True,
                'is_approved': False,
                'original_employee_modified': False,
            })

    start = (page - 1) * PAGE_SIZE
    return {
        'mode': 'provisional_employee_name_review_read_only',
        'batch_id': batch.pk,
        'total_name_review_rows': len(rows),
        'category_counts': {name: counts[name] for name in CATEGORIES},
        'filtered_count': len(selected),
        'page': page,
        'page_size': PAGE_SIZE,
        'items': selected[start:start + PAGE_SIZE],
        'auto_approved': 0,
        'original_employee_modified': False,
        'clinical_records_modified': False,
        'notice': (
            'تصنيف أولي للمقارنة فقط؛ حتى الاختلافات الشكلية وترتيب الأسماء '
            'تستلزم التحقق من الهوية والحالة الوظيفية من جهة موثوقة. '
            'لم تُعدَّل الأسماء أو السجلات الأصلية.'
        ),
    }


class ProvisionalEmployeeNameReviewView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not request.user.is_superuser:
            return Response({'detail': 'مراجعة الأسماء للمسؤول الأعلى فقط.'},
                            status=403, headers=NO_CACHE)
        try:
            category = str(request.query_params.get('category') or '').strip()
            page = int(request.query_params.get('page') or 1)
            batch = ProvisionalEmployeeImportBatch.objects.order_by(
                '-created_at', '-pk',
            ).first()
            if not batch:
                return Response({
                    'mode': 'provisional_employee_name_review_read_only',
                    'batch_id': None, 'total_name_review_rows': 0,
                    'category_counts': {}, 'items': [], 'auto_approved': 0,
                    'notice': 'لا توجد دفعة موظفين مؤقتة.',
                }, headers=NO_CACHE)
            result = review_names(batch, category=category, page=page)
        except (ValueError, TypeError):
            return Response({'detail': 'نوع الفلترة أو رقم الصفحة غير صالح.'},
                            status=400, headers=NO_CACHE)
        return Response(result, headers=NO_CACHE)
