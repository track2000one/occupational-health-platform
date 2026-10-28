"""Temporary, encrypted 19-column Excel workspace. No Employee/clinical writes.

Every request is restricted to a superuser in the isolated staging project.
Uploading the original workbook is disabled by default and requires a separate
Fernet key. Never emit PII in logs or unauthenticated responses.
"""
from collections import Counter
from datetime import timedelta
import hashlib
import json
import os
import re

from cryptography.fernet import Fernet, InvalidToken
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AuditLog, TemporaryWorkforceSnapshot
from .workforce_import import workbook_from_upload
from .workforce_preview import EXPECTED_COLUMNS, MAX_ROWS, norm

STAGING_PROJECT_ID = 'cf4b2162-5236-4f92-b010-165f505fe2c2'
MAX_PAYLOAD_LENGTH = 6 * 1024 * 1024
RETENTION_DAYS = 30


def is_isolated_staging():
    return (os.getenv('STAGING_MODE', '').lower() == 'true'
            and os.getenv('RAILWAY_PROJECT_ID', '') == STAGING_PROJECT_ID)


def get_cipher():
    value = os.getenv('TEMP_ROSTER_ENCRYPTION_KEY', '').strip()
    if not value:
        raise ValueError('A separate temporary-roster encryption key must be configured.')
    try:
        return Fernet(value.encode('ascii'))
    except (ValueError, TypeError) as exc:
        raise ValueError('Temporary-roster encryption configuration is invalid.') from exc


def preserve_value(value):
    """Keep original text and column order, avoiding lossy conversion to a person model."""
    if value is None:
        return ''
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    if hasattr(value, 'isoformat'):
        return value.isoformat()
    return str(value)


def load_original_roster(upload):
    content, workbook = workbook_from_upload(upload)
    try:
        sheet = workbook.active
        if sheet.max_row and sheet.max_row > MAX_ROWS + 10:
            raise ValueError('Workbook contains too many rows.')
        header = [norm(c) for c in next(sheet.iter_rows(
            min_row=1, max_row=1, max_col=19, values_only=True))]
        if header != [norm(c) for c in EXPECTED_COLUMNS]:
            raise ValueError('Expected original 19-column roster: A through S.')
        rows = []
        missing_organization = []
        invalid_identity = []
        seen_ids = set()
        repeated_ids = []
        for number, original in enumerate(sheet.iter_rows(
            min_row=2, max_col=19, values_only=True), start=2
        ):
            cells = [preserve_value(value) for value in original]
            if not any(value.strip() for value in cells):
                continue
            if len(rows) >= MAX_ROWS:
                raise ValueError('Workbook exceeds the safe employee limit.')
            if any(len(value) > 4096 for value in cells):
                raise ValueError('An Excel field exceeds the safe text limit.')
            if not cells[0].strip() or not cells[1].strip():
                missing_organization.append(number)
            identity = re.sub(r'\D', '', cells[7])
            if not re.fullmatch(r'\d{10}', identity):
                invalid_identity.append(number)
            if identity in seen_ids:
                repeated_ids.append(number)
            seen_ids.add(identity)
            rows.append({'excel_row': number, 'values': cells})
        if not rows:
            raise ValueError('The workbook contains no employee rows.')
        data = json.dumps({'columns': EXPECTED_COLUMNS, 'rows': rows},
                          ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        if len(data) > MAX_PAYLOAD_LENGTH:
            raise ValueError('Temporary roster exceeds safe in-memory limits.')
        summary = {
            'rows': len(rows),
            'columns': 19,
            'groups': len({(r['values'][0], r['values'][1]) for r in rows}),
            'source_statuses': dict(Counter(r['values'][14] for r in rows)),
            'missing_organization_rows': missing_organization[:100],
            'invalid_identity_rows': invalid_identity[:100],
            'repeated_identity_rows': repeated_ids[:100],
            'requires_review': bool(missing_organization or invalid_identity or repeated_ids),
        }
        return hashlib.sha256(content).hexdigest(), data, summary
    finally:
        workbook.close()


class TemporaryWorkforceView(APIView):
    permission_classes = [permissions.IsAdminUser]
    parser_classes = [MultiPartParser, FormParser]

    def dispatch(self, request, *args, **kwargs):
        response = super().dispatch(request, *args, **kwargs)
        response['Cache-Control'] = 'no-store, private, max-age=0'
        response['Pragma'] = 'no-cache'
        response['X-Robots-Tag'] = 'noindex, nofollow'
        return response

    def authorize(self, request):
        if not request.user.is_superuser:
            return Response({'detail': 'Restricted to a platform superuser.'}, status=403)
        if not is_isolated_staging():
            return Response({'detail': 'Temporary roster is restricted to isolated staging.'}, status=423)
        try:
            cipher = get_cipher()
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=503)
        return cipher

    def get(self, request):
        cipher = self.authorize(request)
        if isinstance(cipher, Response):
            return cipher
        snapshot = TemporaryWorkforceSnapshot.objects.order_by('-created_at').first()
        if not snapshot:
            return Response({'exists': False, 'upload_enabled':
                             os.getenv('TEMP_ROSTER_UPLOAD_ENABLED', '').lower() == 'true'})
        if snapshot.expires_at <= timezone.now():
            return Response({'detail': 'Temporary roster expired; request authorized deletion.'},
                            status=410)
        try:
            raw = cipher.decrypt(bytes(snapshot.encrypted_rows))
            data = json.loads(raw)
        except (InvalidToken, ValueError, TypeError):
            return Response({'detail': 'Unable to decrypt temporary roster.'}, status=503)
        all_rows = data['rows']
        search = str(request.query_params.get('search') or '').strip().casefold()[:100]
        source = str(request.query_params.get('source_status') or '').strip()
        if search:
            # Only the superuser can search and decrypt full personnel information.
            all_rows = [row for row in all_rows if any(
                search in row['values'][index].casefold()
                for index in (0, 2, 6, 7, 8, 13, 17)
            )]
        if source:
            all_rows = [r for r in all_rows if r['values'][14] == source]
        try:
            page = max(1, int(request.query_params.get('page', '1')))
        except ValueError:
            page = 1
        page = min(page, max(1, (len(all_rows) + 24) // 25))
        rows = all_rows[(page - 1) * 25:page * 25]
        return Response({
            'exists': True, 'id': snapshot.pk, 'columns': data['columns'],
            'summary': snapshot.summary, 'count': len(all_rows), 'page': page,
            'page_size': 25, 'rows': rows,
            'expires_at': snapshot.expires_at.isoformat(),
            'upload_enabled': os.getenv('TEMP_ROSTER_UPLOAD_ENABLED', '').lower() == 'true',
        })

    def post(self, request):
        cipher = self.authorize(request)
        if isinstance(cipher, Response):
            return cipher
        if os.getenv('TEMP_ROSTER_UPLOAD_ENABLED', '').lower() != 'true':
            return Response({'detail': 'Real employee upload is locked until access and backup review.'},
                            status=423)
        if TemporaryWorkforceSnapshot.objects.exists():
            return Response({'detail': 'Existing temporary roster must be removed explicitly first.'},
                            status=409)
        try:
            digest, data, summary = load_original_roster(request.FILES.get('file'))
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        with transaction.atomic():
            snapshot = TemporaryWorkforceSnapshot.objects.create(
                file_sha256=digest, encrypted_rows=cipher.encrypt(data),
                summary=summary, created_by=request.user,
                expires_at=timezone.now() + timedelta(days=RETENTION_DAYS),
            )
            AuditLog.objects.create(
                user=str(request.user), action='temporary_workforce_roster_uploaded',
                model_name='TemporaryWorkforceSnapshot', record_id=str(snapshot.pk),
            )
        return Response({'id': snapshot.pk, 'summary': summary,
                         'expires_at': snapshot.expires_at.isoformat(),
                         'stored_encrypted': True, 'employee_core_modified': 0},
                        status=status.HTTP_201_CREATED)

    def delete(self, request):
        cipher = self.authorize(request)
        if isinstance(cipher, Response):
            return cipher
        if str(request.data.get('confirm') or '') != 'DELETE_TEMP_ROSTER':
            return Response({'detail': 'Explicit temporary-roster removal confirmation is required.'},
                            status=400)
        with transaction.atomic():
            ids = list(TemporaryWorkforceSnapshot.objects.values_list('pk', flat=True))
            TemporaryWorkforceSnapshot.objects.all().delete()
            AuditLog.objects.create(
                user=str(request.user), action='temporary_workforce_roster_deleted',
                model_name='TemporaryWorkforceSnapshot', record_id=','.join(map(str, ids)),
            )
        return Response({'temporary_snapshots_deleted': len(ids),
                         'employee_core_modified': 0})
