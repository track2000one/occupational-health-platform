"""Explicit admin-only edit of a conflicting employee number in the temporary roster.

GET -> fetch the current temporary value (only to the authenticated superuser).
POST preview -> validate unique proposed number, return signed short-lived preview.
POST commit -> verify human HR evidence, fresh preview, serialize with row lock,
recheck all uniqueness conditions, and edit ONLY encrypted provisional data.

Never writes Employee, clinical records, nationality, identity, archive or center.
"""
from hashlib import sha256
import hmac
import re

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.db.models import Q
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .employee_import_classification import OPTIONAL_COMPLETENESS_FIELDS, normalize_person_name
from .models import (
    AuditLog, Employee, ProvisionalEmployeeImportBatch,
    ProvisionalEmployeeNumberCorrectionEvent, ProvisionalEmployeeRosterRow,
)
from .provisional_employee_roster import (
    NO_CACHE, _classify, _masked, _seal, _unseal,
)

PREVIEW_SALT = 'provisional-employee-number-edit-v1'
PREVIEW_AGE_SECONDS = 600
FIELD = 'employee_number'


def _digest(value):
    return hmac.new(
        settings.SECRET_KEY.encode('utf-8'),
        ('OHP_TEMP_NUMBER_EDIT:' + value).encode('utf-8'),
        'sha256',
    ).hexdigest()


def _revision(row):
    return sha256(row.sealed_payload.encode('ascii')).hexdigest()


def _mask_number(value):
    if not value:
        return '—'
    return '••••' + value[-2:]


def _fetch_row(pk, locked=False):
    batch_qs = ProvisionalEmployeeImportBatch.objects.order_by('-created_at', '-pk')
    batch = (batch_qs.select_for_update() if locked else batch_qs).first()
    if not batch:
        raise ValueError('لا توجد دفعة مؤقتة نشطة.')
    q = ProvisionalEmployeeRosterRow.objects
    row = (q.select_for_update() if locked else q).filter(pk=pk, batch=batch).first()
    if row is None:
        raise ValueError('البطاقة غير موجودة في الدفعة الحالية.')
    if row.classification != 'identifier_review':
        raise ValueError('التحرير المخصص متاح فقط للبطاقات ذات تعارض المعرّفات.')
    return batch, row


def _valid_number(raw):
    # Single specific field only. Do not allow blank/replacing national ID.
    if not isinstance(raw, str):
        raise ValueError('الرقم الوظيفي الجديد مطلوب.')
    number = raw.strip()
    if not 1 <= len(number) <= 40 or not re.fullmatch(r'[\w./-]+', number, re.UNICODE):
        raise ValueError('أدخل الرقم الوظيفي الصحيح دون مسافات، بحد أقصى 40 حرفًا.')
    return number


def _check_candidate(batch, row, source, value):
    previous = str(source.get(FIELD) or '').strip()
    if value.casefold() == previous.casefold():
        raise ValueError('الرقم المدخل يطابق الرقم الحالي؛ لا يوجد تعديل.')
    nid = str(source.get('national_id') or '')
    if (Employee.objects.filter(employee_number__iexact=value)
            .exclude(national_id=nid).exists()):
        raise ValueError('الرقم الوظيفي مستخدم بالفعل في السجل الأصلي لهوية مختلفة. لا يمكن حفظه.')

    # Cross-check every row in this current batch against a different ID,
    # including rows that were not originally flagged as conflicts.
    for other in batch.rows.exclude(pk=row.pk).only('sealed_payload').iterator(chunk_size=200):
        record = _unseal(other.sealed_payload)
        if (str(record.get(FIELD) or '').strip().casefold() == value.casefold()
                and str(record.get('national_id') or '') != nid):
            raise ValueError('الرقم الوظيفي مكرر في ملف الاستيراد لهوية أخرى. لا يمكن حفظه.')

    # Do not declare resolution when email remains in conflict.
    email = str(source.get('email') or '').strip().casefold()
    email_conflict = False
    if email:
        email_conflict = Employee.objects.filter(
            email__iexact=email,
        ).exclude(national_id=nid).exists()
        if not email_conflict:
            for other in batch.rows.exclude(pk=row.pk).only('sealed_payload').iterator(chunk_size=200):
                record = _unseal(other.sealed_payload)
                if (str(record.get('email') or '').strip().casefold() == email
                        and str(record.get('national_id') or '') != nid):
                    email_conflict = True
                    break

    original = Employee.objects.filter(national_id=nid).only('name').first()
    if email_conflict:
        next_classification = 'identifier_review'
    elif original is None:
        next_classification = 'not_in_registry'
    elif normalize_person_name(original.name) != normalize_person_name(source.get('name', '')):
        next_classification = 'name_review'
    else:
        next_classification = 'name_match'
    return next_classification


class ProvisionalEmployeeNumberEditView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _guard(self, request):
        return request.user.is_superuser

    def get(self, request, pk):
        if not self._guard(request):
            return Response({'detail': 'تحرير المعرّفات للمسؤول الأعلى فقط.'},
                            status=403, headers=NO_CACHE)
        try:
            batch, row = _fetch_row(pk)
            source = _unseal(row.sealed_payload)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=409, headers=NO_CACHE)
        return Response({
            'batch_id': batch.pk, 'source_row': row.source_row,
            'name': source.get('name', ''),
            'masked_id': _masked(str(source.get('national_id') or '')),
            'current_employee_number': str(source.get(FIELD) or ''),
            'revision': _revision(row),
            'temporary_only': True,
        }, headers=NO_CACHE)

    def post(self, request, pk):
        if not self._guard(request):
            return Response({'detail': 'تحرير المعرّفات للمسؤول الأعلى فقط.'},
                            status=403, headers=NO_CACHE)
        action = request.data.get('action')
        if action not in ('preview', 'commit'):
            return Response({'detail': 'اختر المعاينة أو الحفظ.'},
                            status=400, headers=NO_CACHE)
        try:
            new_number = _valid_number(request.data.get('employee_number'))
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400, headers=NO_CACHE)

        if action == 'preview':
            try:
                batch, row = _fetch_row(pk)
                source = _unseal(row.sealed_payload)
                status_after = _check_candidate(batch, row, source, new_number)
            except ValueError as exc:
                return Response({'detail': str(exc)}, status=409, headers=NO_CACHE)
            token = signing.dumps({
                'batch': batch.pk, 'row': row.pk, 'user': request.user.pk,
                'revision': _revision(row), 'number_digest': _digest(new_number),
            }, salt=PREVIEW_SALT)
            return Response({
                'status': 'preview_only',
                'source_row': row.source_row,
                'masked_new_number': _mask_number(new_number),
                'next_classification': status_after,
                'preview_token': token,
                'temporary_only': True,
                'notice': 'المعاينة لا تحفظ أي تعديل؛ لا يعتمد الموظف تلقائيًا.',
            }, headers=NO_CACHE)

        token = request.data.get('preview_token')
        try:
            if not isinstance(token, str):
                raise signing.BadSignature('missing')
            proof = signing.loads(
                token, salt=PREVIEW_SALT, max_age=PREVIEW_AGE_SECONDS,
            )
        except (signing.BadSignature, signing.SignatureExpired):
            return Response({'detail': 'انتهت صلاحية المعاينة. أعد الفحص قبل الحفظ.'},
                            status=409, headers=NO_CACHE)
        if (request.data.get('confirmed') is not True or
                request.data.get('verified_hr_document') is not True):
            return Response({'detail': 'يلزم تأكيد صحة الرقم من مصدر الموارد البشرية.'},
                            status=400, headers=NO_CACHE)
        reference = request.data.get('evidence_reference')
        reason = request.data.get('reason')
        if (not isinstance(reference, str) or
                not 8 <= len(reference.strip()) <= 150 or
                not isinstance(reason, str) or not 10 <= len(reason.strip()) <= 500):
            return Response({'detail': 'يلزم مرجع تحقق إداري وسبب للتعديل (10 أحرف فأكثر).'},
                            status=400, headers=NO_CACHE)
        if (proof.get('row') != pk or proof.get('user') != request.user.pk or
                proof.get('number_digest') != _digest(new_number)):
            return Response({'detail': 'البيانات لا تطابق المعاينة السابقة.'},
                            status=409, headers=NO_CACHE)

        with transaction.atomic():
            try:
                batch, row = _fetch_row(pk, locked=True)
                if batch.pk != proof.get('batch') or _revision(row) != proof.get('revision'):
                    raise ValueError('تغيرت البطاقة بعد المعاينة. أعد فحصها قبل الحفظ.')
                source = _unseal(row.sealed_payload)
                status_after = _check_candidate(batch, row, source, new_number)
            except ValueError as exc:
                return Response({'detail': str(exc)}, status=409, headers=NO_CACHE)

            old_number = str(source.get(FIELD) or '').strip()
            source[FIELD] = new_number
            row.sealed_payload = _seal(source)
            row.classification = status_after
            row.missing_optional = [
                key for key in OPTIONAL_COMPLETENESS_FIELDS
                if not str(source.get(key) or '').strip()
            ]
            row.last_completed_by = request.user
            row.last_completion_reason = reason.strip()
            row.save(update_fields=[
                'sealed_payload', 'classification', 'missing_optional',
                'last_completed_by', 'last_completion_reason', 'updated_at',
            ])
            ProvisionalEmployeeNumberCorrectionEvent.objects.create(
                row=row, batch_sha256=batch.file_sha256,
                source_row=row.source_row,
                old_number_digest=_digest(old_number),
                new_number_digest=_digest(new_number),
                evidence_reference=reference.strip(), reason=reason.strip(),
                performed_by=request.user,
            )
            AuditLog.objects.create(
                user=str(request.user),
                action='provisional_employee_number_corrected',
                model_name='ProvisionalEmployeeRosterRow',
                record_id=str(row.pk),
            )

        return Response({
            'saved': True, 'source_row': row.source_row,
            'masked_new_number': _mask_number(new_number),
            'classification': row.classification,
            'temporary_only': True, 'original_employee_modified': False,
            'medical_records_modified': False,
            'notice': 'تم تعديل الرقم الوظيفي في البطاقة المؤقتة فقط دون تغيير السجل الأصلي.',
        }, headers=NO_CACHE)
