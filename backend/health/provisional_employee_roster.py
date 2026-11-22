"""Fast administrative Excel roster (NOT a medical employee registration).

This workflow intentionally never writes Employee or clinical tables. It provides
an encrypted, searchable, reversible administrative workspace while old archived
identities undergo independent verification. No backup/restore bypass.
"""
import base64
from collections import Counter
from hashlib import sha256
import hmac
from io import BytesIO
import json
import re
from datetime import date

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from openpyxl import load_workbook
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .employee_import_classification import (
    OPTIONAL_COMPLETENESS_FIELDS, normalize_person_name,
)
from .employee_import_v2 import (
    MAX_FILE_SIZE, MAX_ROWS, MAX_COLUMNS, NORMALIZED, detect_header, heading, identity,
    is_masked_identity, text_cell,
)
from .employee_template_contract import (
    CANONICAL_HEADERS, GENDER_CHOICES, MARITAL_CHOICES,
)
from .employee_org_template_v4 import (
    HEADERS as V4_HEADERS, ORGANIZATION_COLUMNS, TOP_LEVELS,
    needs_source_org_review,
)
from .employee_import_v2_matching import source_profile
from .models import (
    AuditLog, Employee, ProvisionalEmployeeImportBatch,
    ProvisionalEmployeeRosterRow,
)

SHEET = 'Employees'
NO_CACHE = {'Cache-Control': 'private, no-store'}
MAX_QUERY = 100
PAGE_SIZE = 24
MAX_FIELD_VALUE = 255
EDITABLE = frozenset((
    'employee_number', 'email', 'mobile', 'national_address',
    'date_of_birth', 'birth_place', 'gender', 'marital_status',
    'nationality', 'job_title', 'current_job', 'appointment_date',
    'job_title_en', 'health_center', 'organization_unit',
))
# Explicit opt-in to temporary administrative data. Never enable clinical operations.
STATUSES = ('name_match', 'name_review', 'identifier_review', 'not_in_registry')


def _cipher():
    key = sha256(('OHP-ISOLATED-TEMP-ROSTER-V1:' + settings.SECRET_KEY).encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def _seal(payload):
    return _cipher().encrypt(json.dumps(
        payload, ensure_ascii=False, sort_keys=True,
    ).encode()).decode('ascii')


def _unseal(value):
    try:
        return json.loads(_cipher().decrypt(value.encode('ascii')).decode('utf-8'))
    except (InvalidToken, ValueError, UnicodeDecodeError):
        raise ValueError('تعذر قراءة الملف المؤقت المشفر، راجع مسؤول النظام.')


def _digest(nid):
    return hmac.new(
        settings.SECRET_KEY.encode(), ('OHP_TEMP_V1:' + nid).encode(),
        'sha256',
    ).hexdigest()


def _masked(value):
    return value[:2] + '••••' + value[-4:] if len(value) == 10 else '—'


def _authorized(user):
    if user.is_superuser:
        return True
    try:
        return user.health_profile.role == 'dataEntry'
    except Exception:
        return False


def _parse(upload):
    if not upload or not str(upload.name).lower().endswith('.xlsx'):
        raise ValueError('اختر ملف Excel بامتداد XLSX.')
    if upload.size > MAX_FILE_SIZE:
        raise ValueError('حجم الملف أكبر من 10 ميغابايت.')
    raw = upload.read(MAX_FILE_SIZE + 1)
    if not raw or len(raw) > MAX_FILE_SIZE:
        raise ValueError('الملف فارغ أو تجاوز الحجم المسموح.')
    try:
        book = load_workbook(BytesIO(raw), read_only=True, data_only=True)
    except Exception:
        raise ValueError('تعذرت قراءة ملف XLSX.')
    try:
        if SHEET not in book.sheetnames:
            raise ValueError('الملف يحتاج ورقة Employees المعتمدة.')
        sheet = book[SHEET]
        if sheet.max_row in (None, 1) or sheet.max_column in (None, 1):
            sheet.reset_dimensions()
        detected = detect_header(sheet)
        if not detected:
            raise ValueError('لم يتم العثور على أعمدة الاسم والهوية.')
        header_row, headers, mapping = detected
        names = [heading(cell) for cell in headers[:MAX_COLUMNS]]
        for key, aliases in NORMALIZED.items():
            if sum(1 for label in names if label in aliases) > 1:
                raise ValueError('يوجد عمود مكرر للبيان «' + key + '». راجع رؤوس الأعمدة.')
        strict_v3 = tuple(text_cell(v) for v in headers[:len(CANONICAL_HEADERS)]) == CANONICAL_HEADERS
        exact_v4 = tuple(text_cell(v) for v in headers[:len(V4_HEADERS)]) == V4_HEADERS
        # Only the full exact V4 contract may set the 13-source hierarchy.
        # Do not guess levels from similarly named columns in legacy files.
        if exact_v4 and len(headers) != len(V4_HEADERS):
            raise ValueError('ملف V4 يجب أن يتضمن 31 عمودًا بالترتيب المعتمد.')
        if 'name' not in mapping or 'national_id' not in mapping:
            raise ValueError('يلزم عمود اسم الموظف ورقم الهوية/الإقامة.')
        if len(headers) > MAX_COLUMNS and any(text_cell(v) for v in headers[MAX_COLUMNS:]):
            raise ValueError('الملف يتجاوز 120 عمودًا.')
        rows, seen = [], set()
        for number, values in enumerate(
            sheet.iter_rows(min_row=header_row + 1,
                            max_col=MAX_COLUMNS + 1, values_only=True),
            header_row + 1,
        ):
            if number - header_row > MAX_ROWS + 250:
                raise ValueError('عدد الصفوف يتجاوز الحد الآمن.')
            if any(text_cell(v) for v in values[MAX_COLUMNS:]):
                raise ValueError('الملف يتجاوز 120 عمودًا.')
            values = values[:MAX_COLUMNS]
            if not any(text_cell(v) for v in values):
                continue
            if len(rows) >= MAX_ROWS:
                raise ValueError('الملف يتجاوز 2500 موظف.')
            source = source_profile(values, mapping)
            if strict_v3:
                for field in ('date_of_birth', 'appointment_date'):
                    value = source.get(field, '')
                    if value:
                        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
                            raise ValueError(f'الصف {number}: تاريخ غير صحيح في «{field}». استخدم YYYY-MM-DD.')
                        try:
                            parsed = date.fromisoformat(value)
                        except ValueError:
                            raise ValueError(f'الصف {number}: تاريخ غير صحيح في «{field}».')
                        if parsed.year < 1900:
                            raise ValueError(f'الصف {number}: راجع التاريخ الميلادي في «{field}».')
                if source.get('gender') and source['gender'] not in GENDER_CHOICES:
                    raise ValueError(f'الصف {number}: استخدم ذكر أو أنثى في خانة الجنس.')
                if source.get('marital_status') and source['marital_status'] not in MARITAL_CHOICES:
                    raise ValueError(f'الصف {number}: اختر الحالة الاجتماعية من القائمة.')
                children = source.get('children_count') or ''
                if children and not (children.isdecimal() and 0 <= int(children) <= 30):
                    raise ValueError(f'الصف {number}: عدد الأطفال يجب أن يكون رقمًا صحيحًا بين 0 و30.')
            nid = identity(source['national_id'])
            if (is_masked_identity(source['national_id']) or len(nid) != 10
                    or not source['name'].strip()):
                raise ValueError(
                    f'الصف {number}: يلزم اسم الموظف ورقم هوية كامل من 10 أرقام.'
                )
            if nid in seen:
                raise ValueError(f'الصف {number}: رقم هوية مكرر في الملف.')
            if any(len(str(v)) > 500 for v in source.values()):
                raise ValueError(f'الصف {number}: إحدى قيم النص أطول من الحد.')
            if exact_v4:
                levels = {
                    key: text_cell(values[5 + index])
                    for index, (key, _label) in enumerate(ORGANIZATION_COLUMNS)
                }
                if any(not value or len(value) > 220 for value in levels.values()):
                    raise ValueError(f'الصف {number}: جميع مستويات هيكلة V4 مطلوبة؛ استخدم «لا ينطبق» للمستوى غير المعني.')
                if any(levels.get(key) != expected for key, expected in TOP_LEVELS.items()):
                    raise ValueError(f'الصف {number}: مستويات V4 العليا لا تطابق القالب المعتمد.')
                source['source_organizational_hierarchy'] = levels
                source['source_review_status'] = text_cell(values[18])[:255]
                source['source_review_notes'] = text_cell(values[19])[:500]
            seen.add(nid)
            source['national_id'] = nid
            rows.append((number, source))
        if not rows:
            raise ValueError('لا توجد صفوف موظفين قابلة للقراءة.')
        return raw, rows
    finally:
        book.close()


def _classify(rows):
    nids = [source['national_id'] for _, source in rows]
    originals = {
        obj.national_id: obj for obj in
        Employee.objects.filter(national_id__in=nids).only(
            'id', 'name', 'national_id', 'employee_number', 'email', 'is_archived',
        )
    }
    numbers = {src.get('employee_number', '').strip() for _, src in rows
               if src.get('employee_number', '').strip()}
    emails = {src.get('email', '').strip().casefold() for _, src in rows
              if src.get('email', '').strip()}
    owners = Employee.objects.none()
    if numbers or emails:
        condition = Q()
        if numbers:
            condition |= Q(employee_number__in=numbers)
        if emails:
            condition |= Q(email__in=emails)
        owners = Employee.objects.filter(condition).only(
            'national_id', 'employee_number', 'email',
        )
    number_owner = {}
    email_owner = {}
    for item in owners:
        if item.employee_number:
            number_owner.setdefault(item.employee_number.strip(), set()).add(item.national_id)
        if item.email:
            email_owner.setdefault(item.email.strip().casefold(), set()).add(item.national_id)
    seen_number = {}
    seen_email = {}
    classified = []
    for number, src in rows:
        nid = src['national_id']
        emp_num = src.get('employee_number', '').strip()
        email = src.get('email', '').strip().casefold()
        identifier_conflict = (
            any(v != nid for v in number_owner.get(emp_num, set())) if emp_num else False
        ) or (
            any(v != nid for v in email_owner.get(email, set())) if email else False
        )
        if emp_num and emp_num in seen_number and seen_number[emp_num] != nid:
            identifier_conflict = True
        if email and email in seen_email and seen_email[email] != nid:
            identifier_conflict = True
        if emp_num:
            seen_number[emp_num] = nid
        if email:
            seen_email[email] = nid
        original = originals.get(nid)
        if identifier_conflict:
            code = 'identifier_review'
        elif not original:
            code = 'not_in_registry'
        elif normalize_person_name(original.name) != normalize_person_name(src['name']):
            code = 'name_review'
        else:
            code = 'name_match'
        missing = [field for field in OPTIONAL_COMPLETENESS_FIELDS
                   if not str(src.get(field) or '').strip()]
        classified.append((number, src, code, missing))
    return classified


def _summary(batch):
    counts = dict(Counter(batch.rows.values_list('classification', flat=True)))
    return {
        'batch_id': batch.pk, 'total': batch.total_rows,
        'created_at': batch.created_at.isoformat(), 'counts': counts,
        'temporary_only': True, 'clinical_activated': 0,
    }


def _card(row, user):
    source = _unseal(row.sealed_payload)
    length = row.temporary_number_length
    # Never expose an unmasked ID or the encrypted source in JSON responses.
    result = {
        'id': row.pk, 'source_row': row.source_row, 'name': source.get('name', ''),
        'masked_id': _masked(source.get('national_id', '')),
        'center': source.get('health_center', ''),
        'organization_unit': source.get('organization_unit', ''),
        'job_title': source.get('job_title', ''),
        'source_organizational_hierarchy': source.get('source_organizational_hierarchy', {}),
        'source_review_status': source.get('source_review_status', ''),
        'source_review_required': needs_source_org_review(source.get('source_review_status', '')),

        'classification': row.classification,
        'missing_optional': row.missing_optional,
        'temporary_employee_number': (
            '0' * length if length and 'employee_number' in row.missing_optional else None
        ),
        'completed_at': row.updated_at.isoformat(),
        'temporary_only': True,
    }
    return result


class ProvisionalEmployeeImportView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        if not request.user.is_superuser:
            return Response({'detail': 'الاستيراد للمسؤول الأعلى فقط.'},
                            status=403, headers=NO_CACHE)
        try:
            raw, rows = _parse(request.FILES.get('file'))
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400, headers=NO_CACHE)
        file_sha = sha256(raw).hexdigest()
        existing = ProvisionalEmployeeImportBatch.objects.filter(file_sha256=file_sha).first()
        if existing:
            return Response({
                **_summary(existing), 'already_imported': True,
                'message': 'سبق استيراد الملف نفسه؛ لم تنشأ سجلات مكررة.',
            }, headers=NO_CACHE)
        latest = ProvisionalEmployeeImportBatch.objects.order_by('-created_at', '-pk').first()
        if latest:
            previous_digests = set(latest.rows.values_list('identity_digest', flat=True))
            overlap = sum(1 for _, source in rows if _digest(source['national_id']) in previous_digests)
            if overlap and str(request.data.get('confirm_new_batch') or '').lower() != 'true':
                return Response({
                    'detail': 'يتداخل الملف الجديد مع القائمة المؤقتة الحالية. افحص الملف ثم أكّد إنشاء دفعة مستقلة؛ لن تُدمج بيانات الدفعة السابقة تلقائيًا.',
                    'existing_identity_overlap': overlap,
                    'requires_explicit_new_batch_confirmation': True,
                }, status=409, headers=NO_CACHE)
        classified = _classify(rows)
        missing_number_rows = (
            number for number, _, _, missing in classified if 'employee_number' in missing
        )
        temporary_lengths = {
            number: length for length, number in enumerate(missing_number_rows, start=4)
        }
        with transaction.atomic():
            batch = ProvisionalEmployeeImportBatch.objects.create(
                file_sha256=file_sha, file_name=str(request.FILES['file'].name)[:255],
                sheet_name=SHEET, total_rows=len(classified), created_by=request.user,
            )
            ProvisionalEmployeeRosterRow.objects.bulk_create([
                ProvisionalEmployeeRosterRow(
                    batch=batch, source_row=number,
                    identity_digest=_digest(src['national_id']),
                    sealed_payload=_seal(src), classification=kind,
                    missing_optional=missing,
                    temporary_number_length=temporary_lengths.get(number),
                )
                for number, src, kind, missing in classified
            ], batch_size=200)
            AuditLog.objects.create(
                user=str(request.user), action='provisional_employee_roster_uploaded',
                model_name='ProvisionalEmployeeImportBatch', record_id=str(batch.pk),
            )
        return Response({
            **_summary(batch), 'already_imported': False,
            'message': 'ظهرت البطاقات الإدارية المؤقتة دون تعديل سجل الموظفين الطبي.',
        }, status=201, headers=NO_CACHE)


class ProvisionalEmployeeRosterView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _authorized(request.user):
            return Response({'detail': 'لا تملك صلاحية استعراض القائمة المؤقتة.'},
                            status=403, headers=NO_CACHE)
        batch = ProvisionalEmployeeImportBatch.objects.order_by('-created_at', '-pk').first()
        if not batch:
            return Response({'batch': None, 'total': 0, 'items': []}, headers=NO_CACHE)
        search = str(request.query_params.get('search') or '').strip()
        if len(search) > MAX_QUERY or (search and any(ch.isdecimal() for ch in search)):
            return Response({'detail': 'استخدم البحث بالاسم فقط. لا تضع رقم الهوية في رابط الطلب.'},
                            status=400, headers=NO_CACHE)
        category = str(request.query_params.get('classification') or '').strip()
        if category and category not in STATUSES:
            return Response({'detail': 'حالة تصنيف غير معروفة.'}, status=400, headers=NO_CACHE)
        completeness = str(request.query_params.get('completeness') or '').strip()
        if completeness not in ('', 'missing', 'complete'):
            return Response({'detail': 'فلتر اكتمال البيانات غير معروف.'}, status=400, headers=NO_CACHE)
        try:
            page = max(1, int(request.query_params.get('page') or 1))
        except (TypeError, ValueError):
            page = 1
        page = min(page, 100)
        rows = batch.rows.all()
        if category:
            rows = rows.filter(classification=category)
        if completeness == 'missing':
            rows = rows.exclude(missing_optional=[])
        elif completeness == 'complete':
            rows = rows.filter(missing_optional=[])
        if search:
            # Deliberately decrypt only inside authorized server-side work,
            # never expose full IDs in URL/query parameters.
            filtered = [row for row in rows.iterator(chunk_size=200)
                        if search.casefold() in _unseal(row.sealed_payload).get('name', '').casefold()]
            total = len(filtered)
            selection = filtered[(page - 1) * PAGE_SIZE:page * PAGE_SIZE]
        else:
            total = rows.count()
            selection = list(rows[(page - 1) * PAGE_SIZE:page * PAGE_SIZE])
        return Response({
            'batch': _summary(batch), 'total': total, 'page': page,
            'page_size': PAGE_SIZE,
            'items': [_card(row, request.user) for row in selection],
        }, headers=NO_CACHE)


class ProvisionalEmployeeCompletionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        if not _authorized(request.user):
            return Response({'detail': 'ليس لديك صلاحية استكمال البطاقة.'},
                            status=403, headers=NO_CACHE)
        if request.data.get('identity_checked') is not True:
            return Response({'detail': 'يلزم التحقق من هوية صاحب البطاقة.'},
                            status=400, headers=NO_CACHE)
        reason = str(request.data.get('reason') or '').strip()
        if not 10 <= len(reason) <= 500:
            return Response({'detail': 'يلزم سبب توثيقي من 10 إلى 500 حرف.'},
                            status=400, headers=NO_CACHE)
        fields = request.data.get('fields')
        if (not isinstance(fields, dict) or not fields
                or any(key not in EDITABLE for key in fields)
                or any(not isinstance(v, str) or not v.strip()
                       or len(v.strip()) > MAX_FIELD_VALUE for v in fields.values())):
            return Response({'detail': 'الحقول المرسلة غير صالحة.'},
                            status=400, headers=NO_CACHE)
        employee_number = fields.get('employee_number', '').strip()
        if employee_number and not employee_number.strip('0'):
            return Response({'detail': 'أدخل الرقم الوظيفي الفعلي.'},
                            status=400, headers=NO_CACHE)
        with transaction.atomic():
            try:
                row = ProvisionalEmployeeRosterRow.objects.select_for_update().get(pk=pk)
            except ProvisionalEmployeeRosterRow.DoesNotExist:
                return Response({'detail': 'البطاقة غير موجودة.'}, status=404, headers=NO_CACHE)
            source = _unseal(row.sealed_payload)
            if any(str(source.get(key) or '').strip() for key in fields):
                return Response({'detail': 'يمكن استكمال الحقول الفارغة فقط دون استبدال المصدر.'},
                                status=409, headers=NO_CACHE)
            source.update({key: value.strip() for key, value in fields.items()})
            row.sealed_payload = _seal(source)
            row.missing_optional = [key for key in OPTIONAL_COMPLETENESS_FIELDS
                                    if not str(source.get(key) or '').strip()]
            row.last_completed_by = request.user
            row.last_completion_reason = reason
            row.save(update_fields=[
                'sealed_payload', 'missing_optional', 'last_completed_by',
                'last_completion_reason', 'updated_at',
            ])
            AuditLog.objects.create(
                user=str(request.user), action='provisional_employee_roster_completed',
                model_name='ProvisionalEmployeeRosterRow', record_id=str(row.pk),
            )
        return Response({
            'notice': 'تم استكمال البيانات الإدارية المؤقتة فقط؛ لم يتغير ملف الموظف الصحي.',
            'item': _card(row, request.user),
        }, headers=NO_CACHE)


class ProvisionalEmployeeLookupView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _authorized(request.user):
            return Response({'detail': 'ليس لديك صلاحية الاستعلام.'},
                            status=403, headers=NO_CACHE)
        nid = identity(request.data.get('national_id'))
        if len(nid) != 10:
            return Response({'detail': 'أدخل رقم هوية كاملًا من 10 أرقام.'},
                            status=400, headers=NO_CACHE)
        # Never auto-link temporary records to health files.
        original = Employee.objects.filter(national_id=nid).only('id', 'is_archived').first()
        current_batch = ProvisionalEmployeeImportBatch.objects.order_by('-created_at', '-pk').first()
        temp = (current_batch.rows.filter(identity_digest=_digest(nid)).first()
                if current_batch else None)
        return Response({
            'masked_id': _masked(nid),
            'original_record': 'archived' if original and original.is_archived
                               else 'active' if original else 'none',
            'temporary_match': bool(temp),
            'verification_required': True,
            'clinical_link_allowed_from_temporary': False,
        }, headers=NO_CACHE)


class ProvisionalEmployeeBatchRemovalView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        if not request.user.is_superuser:
            return Response({'detail': 'الحذف الإداري للمسؤول الأعلى فقط.'},
                            status=403, headers=NO_CACHE)
        reason = str(request.data.get('reason') or '').strip()
        if request.data.get('confirmed') is not True or len(reason) < 10:
            return Response({'detail': 'يلزم التأكيد وسبب توثيقي.'}, status=400, headers=NO_CACHE)
        with transaction.atomic():
            batch = ProvisionalEmployeeImportBatch.objects.select_for_update().filter(pk=pk).first()
            if not batch:
                return Response({'detail': 'الدفعة غير موجودة.'}, status=404, headers=NO_CACHE)
            count = batch.rows.count()
            batch.delete()  # Only temporary rows. Employee and medical tables remain untouched.
            AuditLog.objects.create(
                user=str(request.user), action='provisional_employee_roster_batch_removed',
                model_name='ProvisionalEmployeeImportBatch', record_id=str(pk),
            )
        return Response({
            'removed_temporary_rows': count,
            'notice': 'حُذفت الدفعة الإدارية المؤقتة فقط دون تغيير أي سجل موظف أصلي.',
        }, headers=NO_CACHE)
