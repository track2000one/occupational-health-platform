"""Auditable, reversible governance of two exact Excel tabs.

Only 'مرجع_المراكز' and 'مراجعة_المراكز' are read from the uploaded workbook.
This never creates official health centers, organizational approvals, or employee
assignments; the original XLSX and employee identities are never persisted.
"""
from hashlib import sha256
from io import BytesIO
import json
import re
import unicodedata
import zipfile

from django.core import signing
from django.db import IntegrityError, transaction
from django.utils import timezone
from openpyxl import load_workbook
from rest_framework import permissions, status
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    AuditLog, HealthCenter, CenterFoundationBatch, CenterReferenceCandidate,
    CenterNameReviewCase, CenterFoundationAuditEvent,
)

MAX_UPLOAD = 8 * 1024 * 1024
MAX_EXPANDED = 35 * 1024 * 1024
TOKEN_SALT = 'ohp-center-foundation-source-reviewed-v1'
TOKEN_AGE = 600
CONFIRM = 'حفظ مرجع المراكز للمراجعة فقط'
REFERENCE_SHEET = 'مرجع_المراكز'
REVIEW_SHEET = 'مراجعة_المراكز'
REF_HEADERS = ['م', 'اسم المركز', 'القطاع الاستشاري المقترح', 'الرمز المؤقت', 'حالة اعتماد المرجع']
REVIEW_HEADERS = [
    'اسم المركز أو الحالة بالمصدر 01', 'عدد الصفوف', 'دون اسم موظف',
    'هوية غير صالحة', 'أمثلة أرقام صفوف المصدر',
    'المركز المعتمد بعد المراجعة', 'تعليمات',
]


def normalize(value):
    text = unicodedata.normalize('NFKC', str('' if value is None else value)).replace('\u0640', '')
    return re.sub(r'\s+', ' ', text).strip()


def name_key(value):
    return normalize(value).casefold()


def row_values(sheet, width):
    if sheet.max_row and sheet.max_row > 300:
        raise ValueError('ورقة مرجع/مراجعة المراكز تحتوي صفوفًا أكثر من المتوقع (300).')
    for number, line in enumerate(sheet.iter_rows(min_row=1, max_col=width, values_only=True), 1):
        yield number, [normalize(cell) for cell in line[:width]]


def parse_source(upload):
    if not upload or not upload.name.lower().endswith('.xlsx'):
        raise ValueError('الملف المطلوب Excel بصيغة .xlsx ويحتوي على ورقتي المرجع والمراجعة.')
    if upload.size > MAX_UPLOAD:
        raise ValueError('حجم الملف يتجاوز 8 MB.')
    data = upload.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise ValueError('حجم الملف يتجاوز 8 MB.')
    try:
        with zipfile.ZipFile(BytesIO(data)) as zipped:
            if sum(part.file_size for part in zipped.infolist()) > MAX_EXPANDED:
                raise ValueError('حجم محتويات Excel غير المضغوطة يتجاوز الحد المسموح.')
        book = load_workbook(BytesIO(data), read_only=True, data_only=True)
    except (zipfile.BadZipFile, OSError, KeyError, ValueError) as exc:
        raise ValueError('ملف Excel غير صالح أو غير آمن للقراءة.') from exc

    try:
        if REFERENCE_SHEET not in book.sheetnames or REVIEW_SHEET not in book.sheetnames:
            raise ValueError('لا بد من وجود ورقتي «مرجع_المراكز» و«مراجعة_المراكز» معًا.')

        reference = list(row_values(book[REFERENCE_SHEET], 5))
        review = list(row_values(book[REVIEW_SHEET], 7))
        if not reference or reference[0][1] != REF_HEADERS:
            raise ValueError('أسماء أعمدة ورقة «مرجع_المراكز» لا تطابق النموذج المعتمد.')
        if not review or review[0][1] != REVIEW_HEADERS:
            raise ValueError('أسماء أعمدة ورقة «مراجعة_المراكز» لا تطابق النموذج المعتمد.')

        refs, cases = [], []
        used_codes, used_names, used_numbers = set(), set(), set()
        for n, items in reference[1:]:
            if not any(items):
                continue
            seq, name, sector, code, note = items
            if not seq.isdigit() or int(seq) <= 0 or int(seq) in used_numbers:
                raise ValueError(f'رقم مرجع المركز في الصف {n} مفقود أو مكرر.')
            if not name or len(name) > 150 or not sector or len(sector) > 180:
                raise ValueError(f'اسم المركز أو القطاع غير صالح في الصف {n}.')
            if not re.fullmatch(r'TMP-C\d{3,6}', code):
                raise ValueError(f'الرمز المؤقت للصف {n} غير صالح؛ لا تستخدم رمزًا رسميًا.')
            if code in used_codes or name_key(name) in used_names:
                raise ValueError(f'اسم المركز أو رمزه مكرر في ورقة المرجع، الصف {n}.')
            if not note or len(note) > 250 or 'مسودة' not in note:
                raise ValueError(f'حالة اعتماد المركز في الصف {n} يجب أن تكون مسودة للمراجعة.')
            used_codes.add(code)
            used_names.add(name_key(name))
            used_numbers.add(int(seq))
            refs.append({
                'source_row': n, 'source_number': int(seq),
                'center_name': name, 'name_key': name_key(name),
                'proposed_sector': sector, 'provisional_code': code,
                'source_approval_note': note,
            })

        for n, items in review[1:]:
            if not any(items):
                continue
            label, count, no_name, invalid_id, samples, proposed, instruction = items
            if not label or len(label) > 180:
                raise ValueError(f'تسمية الحالة في الصف {n} غير صالحة.')
            counts = (count, no_name, invalid_id)
            if not all(re.fullmatch(r'\d+', x) for x in counts):
                raise ValueError(f'أعداد المراجعة في الصف {n} ليست أرقامًا غير سالبة.')
            cnt, nm, invalid = (int(x) for x in counts)
            if not cnt or nm > cnt or invalid > cnt:
                raise ValueError(f'أعداد المراجعة في الصف {n} غير متسقة.')
            if len(samples) > 250 or len(proposed) > 250 or len(instruction) > 3000:
                raise ValueError(f'النصوص في الصف {n} تتجاوز الحدود.')
            if samples and not re.fullmatch(r'\d+(?:\s*,\s*\d+)*', samples):
                raise ValueError(f'أمثلة أرقام الصفوف في الصف {n} ليست أرقام صفوف فقط.')
            cases.append({
                'source_row': n, 'raw_source_label': label,
                'normalized_key': name_key(label), 'source_row_count': cnt,
                'missing_employee_name_count': nm, 'invalid_identity_count': invalid,
                'sample_source_rows': samples,
                'source_resolution_note': proposed,
                'source_instruction': instruction,
            })

        if not refs or not cases or len(refs) > 200 or len(cases) > 200:
            raise ValueError('عدد السجلات في ورقتي المرجع والمراجعة غير متوقع.')
        return {
            'sha256': sha256(data).hexdigest(), 'filename': upload.name[:180],
            'references': refs, 'cases': cases,
            'total_review_rows': sum(case['source_row_count'] for case in cases),
        }
    finally:
        book.close()


def qualified(user, write=False):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    try:
        role = user.health_profile.role
    except Exception:
        role = ''
    return role in (('systemAdmin', 'ohManager') if write else
                    ('systemAdmin', 'ohManager', 'dataQuality', 'reportsOfficer'))


def batch_payload(batch):
    refs = list(batch.references.order_by('source_number').values(
        'id', 'source_row', 'source_number', 'center_name',
        'proposed_sector', 'provisional_code', 'source_approval_note',
        'center_verification', 'sector_verification',
        'employee_assignment_verification', 'mapped_center_id',
        'center_approval_reference', 'sector_approval_reference',
    ))
    reviews = list(batch.review_cases.order_by('-source_row_count', 'source_row').values(
        'id', 'source_row', 'raw_source_label', 'source_row_count',
        'missing_employee_name_count', 'invalid_identity_count',
        'sample_source_rows', 'source_resolution_note', 'source_instruction',
        'decision', 'mapped_reference_id', 'decision_reason',
        'evidence_reference', 'reviewed_at',
    ))
    return {
        'batch_id': batch.pk,
        'source_file_sha256': batch.source_sha256,
        'imported_at': batch.created_at.isoformat(),
        'imported_by': batch.created_by.get_username() if batch.created_by else '',
        'reference_count': len(refs), 'review_count': len(reviews),
        'unresolved_source_rows': sum(x['source_row_count'] for x in reviews
                                      if x['decision'] == 'pending'),
        'references': refs, 'review_cases': reviews,
        'audit_event_count': batch.audit_events.count(),
    }


class CenterFoundationRegistryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not qualified(request.user):
            return Response({'detail': 'Not permitted to read center foundation records.'},
                            status=status.HTTP_403_FORBIDDEN)
        batches = list(CenterFoundationBatch.objects.order_by('-created_at')[:12].values(
            'id', 'source_sha256', 'reference_count', 'review_count', 'created_at',
        ))
        selected = request.query_params.get('batch_id')
        try:
            batch = (
                CenterFoundationBatch.objects.select_related('created_by').get(pk=int(selected))
                if selected else
                CenterFoundationBatch.objects.select_related('created_by').order_by('-created_at').first()
            )
        except (TypeError, ValueError, CenterFoundationBatch.DoesNotExist):
            return Response({'detail': 'Import batch not found.'}, status=404)
        return Response({
            'batches': batches,
            'current': batch_payload(batch) if batch else None,
        }, headers={'Cache-Control': 'private, no-store'})


class CenterFoundationImportView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        if not qualified(request.user, write=True):
            return Response({'detail': 'Center foundation import requires an authorized administrator.'},
                            status=status.HTTP_403_FORBIDDEN)
        action = str(request.data.get('action') or 'preview')
        if action not in ('preview', 'commit'):
            return Response({'detail': 'Unknown action.'}, status=400)
        try:
            source = parse_source(request.FILES.get('file'))
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        old = CenterFoundationBatch.objects.filter(source_sha256=source['sha256']).first()
        common = {
            'references': source['references'], 'review_cases': source['cases'],
            'reference_count': len(source['references']),
            'review_count': len(source['cases']),
            'unresolved_source_rows': source['total_review_rows'],
            'existing_batch_id': old.pk if old else None,
            'mode': 'preview',
        }
        if action == 'preview':
            return Response({
                **common,
                'preview_token': signing.dumps({
                    'sha256': source['sha256'], 'user_id': request.user.pk,
                    'reference_count': len(source['references']),
                    'review_count': len(source['cases']),
                }, salt=TOKEN_SALT),
                'notice': 'Review only; employee rows, official centers and hierarchy are not imported.',
            }, headers={'Cache-Control': 'private, no-store'})
        if request.data.get('confirm_text') != CONFIRM or str(
            request.data.get('confirmed') or '').lower() != 'true':
            return Response({'detail': 'Explicit draft-only confirmation is required.'}, status=400)
        try:
            signed = signing.loads(
                request.data.get('preview_token'), salt=TOKEN_SALT, max_age=TOKEN_AGE,
            )
        except (signing.BadSignature, signing.SignatureExpired, TypeError, ValueError):
            return Response({'detail': 'Preview invalid or expired. Preview again.'}, status=409)
        if not isinstance(signed, dict) or any([
            signed.get('sha256') != source['sha256'],
            signed.get('user_id') != request.user.pk,
            signed.get('reference_count') != len(source['references']),
            signed.get('review_count') != len(source['cases']),
        ]):
            return Response({'detail': 'File or account changed after preview.'}, status=409)
        if old:
            return Response({'detail': 'This source has already been imported; review the existing batch.',
                             'batch_id': old.pk}, status=409)
        try:
            with transaction.atomic():
                batch = CenterFoundationBatch.objects.create(
                    source_sha256=source['sha256'],
                    source_filename=source['filename'],
                    reference_count=len(source['references']),
                    review_count=len(source['cases']),
                    created_by=request.user,
                )
                CenterReferenceCandidate.objects.bulk_create([
                    CenterReferenceCandidate(batch=batch, **record)
                    for record in source['references']
                ])
                CenterNameReviewCase.objects.bulk_create([
                    CenterNameReviewCase(batch=batch, **record)
                    for record in source['cases']
                ])
                CenterFoundationAuditEvent.objects.create(
                    batch=batch, entity_type='batch', action='draft_import',
                    prior_state={},
                    new_state={
                        'references': len(source['references']),
                        'review_cases': len(source['cases']),
                        'unresolved_source_rows': source['total_review_rows'],
                        'official_centers_created': 0,
                        'employees_modified': 0,
                    },
                    performed_by=request.user,
                )
                AuditLog.objects.create(
                    user=str(request.user), action='center_foundation_draft_import',
                    model_name='CenterFoundationBatch', record_id=str(batch.pk),
                )
        except IntegrityError:
            return Response({'detail': 'Source already imported in another request.'}, status=409)
        return Response({
            'mode': 'draft_saved', 'batch_id': batch.pk,
            'reference_count': batch.reference_count,
            'review_count': batch.review_count,
            'unresolved_source_rows': source['total_review_rows'],
            'official_centers_created': 0, 'employees_modified': 0,
        }, headers={'Cache-Control': 'private, no-store'})


class CenterFoundationDecisionView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser]

    def post(self, request):
        if not qualified(request.user, write=True):
            return Response({'detail': 'Review requires an authorized administrator.'},
                            status=status.HTTP_403_FORBIDDEN)
        action = request.data.get('action')
        try:
            batch_id = int(request.data.get('batch_id'))
            entry_id = int(request.data.get('entry_id'))
        except (TypeError, ValueError):
            return Response({'detail': 'Choose a valid batch and record.'}, status=400)
        reason = normalize(request.data.get('reason'))
        evidence = normalize(request.data.get('evidence_reference'))
        if len(reason) < 10 or len(reason) > 1000:
            return Response({'reason': 'Specify the documented review reason (10–1000 characters).'},
                            status=400)
        if len(evidence) > 250:
            return Response({'evidence_reference': 'Reference is too long.'}, status=400)
        with transaction.atomic():
            batch = CenterFoundationBatch.objects.filter(pk=batch_id).first()
            if not batch:
                return Response({'detail': 'Batch not found.'}, status=404)
            if action == 'classify':
                item = CenterNameReviewCase.objects.select_for_update().filter(
                    pk=entry_id, batch=batch,
                ).first()
                if not item:
                    return Response({'detail': 'Review case not found.'}, status=404)
                decision = request.data.get('decision')
                if decision not in dict(CenterNameReviewCase.Decision.choices):
                    return Response({'detail': 'Invalid classification.'}, status=400)
                if decision == CenterNameReviewCase.Decision.PENDING:
                    return Response({'detail': 'Choose a reviewed classification.'}, status=400)
                target = None
                if decision in (CenterNameReviewCase.Decision.ALIAS, CenterNameReviewCase.Decision.BRANCH):
                    try:
                        target = CenterReferenceCandidate.objects.get(
                            pk=int(request.data.get('reference_id')), batch=batch,
                        )
                    except (CenterReferenceCandidate.DoesNotExist, TypeError, ValueError):
                        return Response({'detail': 'Select a reference center from this batch.'}, status=400)
                    if not evidence or len(evidence) < 3:
                        return Response({'detail': 'Evidence is required to classify an alias or branch.'}, status=400)
                if decision == CenterNameReviewCase.Decision.ALIAS and                         item.raw_source_label == '(فارغ في المصدر)':
                    return Response({'detail': 'Blank source values cannot be approved as center aliases.'},
                                    status=400)
                if (item.decision == decision and item.mapped_reference_id == (
                        target.pk if target else None) and item.decision_reason == reason and
                        item.evidence_reference == evidence):
                    return Response({'detail': 'No decision change.'}, status=409)
                before = {
                    'decision': item.decision,
                    'mapped_reference_id': item.mapped_reference_id,
                    'reason': item.decision_reason, 'evidence': item.evidence_reference,
                }
                item.decision = decision
                item.mapped_reference = target
                item.decision_reason = reason
                item.evidence_reference = evidence
                item.reviewed_by = request.user
                item.reviewed_at = timezone.now()
                item.save()
                after = {
                    'decision': item.decision,
                    'mapped_reference_id': item.mapped_reference_id,
                    'reason': item.decision_reason, 'evidence': item.evidence_reference,
                }
                entity_type = 'name_review'
            elif action in ('verify_center', 'verify_sector'):
                if not request.user.is_superuser:
                    return Response({'detail': 'Official verification requires a superuser.'},
                                    status=status.HTTP_403_FORBIDDEN)
                if not evidence or len(evidence) < 3:
                    return Response({'detail': 'A documented official approval reference is required.'},
                                    status=400)
                item = CenterReferenceCandidate.objects.select_for_update().filter(
                    pk=entry_id, batch=batch,
                ).first()
                if not item:
                    return Response({'detail': 'Reference record not found.'}, status=404)
                before = {
                    'center_verification': item.center_verification,
                    'sector_verification': item.sector_verification,
                    'mapped_center_id': item.mapped_center_id,
                    'center_approval_reference': item.center_approval_reference,
                    'sector_approval_reference': item.sector_approval_reference,
                }
                if action == 'verify_center':
                    try:
                        target = HealthCenter.objects.get(
                            pk=int(request.data.get('center_id')), is_active=True,
                        )
                    except (TypeError, ValueError, HealthCenter.DoesNotExist):
                        return Response({'detail': 'Select an existing active center.'}, status=400)
                    if CenterReferenceCandidate.objects.filter(
                        batch=batch, center_verification='verified',
                        mapped_center=target,
                    ).exclude(pk=item.pk).exists():
                        return Response({'detail': 'Center is already verified against another proposal.'},
                                        status=409)
                    item.center_verification = 'verified'
                    item.mapped_center = target
                    item.center_approval_reference = evidence
                else:
                    item.sector_verification = 'verified'
                    item.sector_approval_reference = evidence
                item.reviewed_by = request.user
                item.reviewed_at = timezone.now()
                item.save()
                after = {
                    'center_verification': item.center_verification,
                    'sector_verification': item.sector_verification,
                    'mapped_center_id': item.mapped_center_id,
                    'center_approval_reference': item.center_approval_reference,
                    'sector_approval_reference': item.sector_approval_reference,
                }
                if before == after:
                    return Response({'detail': 'Already verified with the same reference.'},
                                    status=409)
                entity_type = 'reference'
            else:
                return Response({'detail': 'Unknown review action.'}, status=400)
            CenterFoundationAuditEvent.objects.create(
                batch=batch, entity_type=entity_type, entity_id=item.pk,
                action=action, prior_state=before, new_state=after,
                evidence_reference=evidence, performed_by=request.user,
            )
            AuditLog.objects.create(
                user=str(request.user), action='center_foundation_' + action,
                model_name=type(item).__name__, record_id=str(item.pk),
            )
        return Response({'saved': True, 'entity_id': item.pk, 'action': action,
                         'batch_id': batch.pk}, headers={'Cache-Control': 'private, no-store'})
