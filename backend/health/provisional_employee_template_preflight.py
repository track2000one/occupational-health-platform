"""Read-only preflight for the canonical occupational-health employee Excel import.

Never returns identities, names, emails, phone numbers or raw row values.
Never writes original Employee, archived/clinical records or temporary cards.
"""
from collections import Counter
from hashlib import sha256
from io import BytesIO

from openpyxl import load_workbook
from rest_framework import permissions
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .employee_template_contract import (
    CANONICAL_FIELDS, CANONICAL_HEADERS, REQUIRED_FIELDS, TEMPLATE_VERSION,
)
from .employee_org_template_v4 import (
    HEADERS as V4_HEADERS, needs_source_org_review,
)
from .employee_import_v2 import MAX_COLUMNS, NORMALIZED, detect_header, heading, text_cell
from .employee_import_classification import OPTIONAL_COMPLETENESS_FIELDS
from .models import ProvisionalEmployeeImportBatch
from .provisional_employee_roster import (
    NO_CACHE, _classify, _digest, _parse,
)


class ProvisionalEmployeeTemplatePreflightView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        if not request.user.is_superuser:
            return Response({'detail': 'فحص ملفات الاستيراد للمسؤول الأعلى فقط.'},
                            status=403, headers=NO_CACHE)
        try:
            raw, rows = _parse(request.FILES.get('file'))
        except ValueError as exc:
            return Response({'detail': str(exc), 'ready': False},
                            status=400, headers=NO_CACHE)
        book = load_workbook(BytesIO(raw), read_only=True, data_only=True)
        try:
            sheet = book['Employees']
            if sheet.max_row in (None, 1) or sheet.max_column in (None, 1):
                sheet.reset_dimensions()
            header_row, header_cells, mapping = detect_header(sheet)
            safe_labels = {key: label for key, label in CANONICAL_FIELDS}
            header_names = [heading(x) for x in header_cells[:MAX_COLUMNS]]
            unrecognized_headers = sum(
                1 for label in header_names if label
                and not any(label in aliases for aliases in NORMALIZED.values())
            )
            is_v3 = (tuple(text_cell(x) for x in
                           header_cells[:len(CANONICAL_HEADERS)])
                     == CANONICAL_HEADERS)
            is_v4 = (tuple(text_cell(x) for x in
                           header_cells[:len(V4_HEADERS)])
                     == V4_HEADERS)
        finally:
            book.close()

        counts = Counter(code for _, _, code, _ in _classify(rows))
        missing = Counter()
        for _, source in rows:
            missing.update(
                key for key in OPTIONAL_COMPLETENESS_FIELDS
                if not str(source.get(key) or '').strip()
            )

        fingerprint = sha256(raw).hexdigest()
        same_file = ProvisionalEmployeeImportBatch.objects.filter(
            file_sha256=fingerprint,
        ).exists()
        latest = ProvisionalEmployeeImportBatch.objects.order_by(
            '-created_at', '-pk'
        ).first()
        overlap = 0
        if latest and not same_file:
            known = set(latest.rows.values_list('identity_digest', flat=True))
            overlap = sum(
                1 for _, source in rows
                if _digest(source['national_id']) in known
            )
        return Response({
            'mode': 'canonical_employee_excel_preflight_read_only',
            'ready': True,
            'schema_version': 'OHP-EMPLOYEE-ORGANIZATIONAL-V4' if is_v4 else
                              TEMPLATE_VERSION if is_v3 else 'compatible_legacy',
            'organizational_source_levels_preserved': 13 if is_v4 else 0,
            'source_review_required_count': (
                sum(needs_source_org_review(source.get('source_review_status'))
                    for _, source in rows) if is_v4 else 0
            ),
            'canonical_column_count': len(CANONICAL_HEADERS),
            'recognized_columns': [
                {'key': key, 'label': safe_labels[key]}
                for key in mapping if key in safe_labels
            ],
            'recognized_count': len(mapping),
            'unrecognized_column_count': unrecognized_headers,
            'missing_known_headers': [
                safe_labels[key] for key, _ in CANONICAL_FIELDS if key not in mapping
            ],
            'required_fields_recognized': all(key in mapping for key in REQUIRED_FIELDS),
            'header_row': header_row,
            'valid_rows': len(rows),
            'classification_counts': dict(counts),
            'optional_missing_counts': dict(missing),
            'same_file_already_imported': same_file,
            'overlap_with_latest_import': overlap,
            'requires_explicit_new_batch_confirmation': bool(overlap and not same_file),
            'will_create_separate_batch': not same_file,
            'medical_or_original_records_modified': False,
            'note': (
                ('ستُحفظ مستويات الهيكلة الثلاثة عشر وملاحظات المراجعة في البطاقات المشفرة، '
                 'دون اعتماد التبعيات أو إنشاء سجلات طبية. '
                 if is_v4 else 'الملف قابل للقراءة؛ فحص المعاينة لا ينشئ موظفين أو يغير سجلاتهم. ') +
                'الدفعة الجديدة لا تدمج تلقائيًا بيانات الدفعة السابقة؛ راجع التداخل قبل الاستيراد.'
            ),
        }, headers=NO_CACHE)
