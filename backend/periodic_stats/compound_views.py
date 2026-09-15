import hashlib
import json

from django.db import transaction
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import EvidenceAttachment
from .serializers import InitiativeSerializer, ReferenceDocumentSerializer


MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_BATCH_BYTES = 50 * 1024 * 1024
MAX_FILES_PER_BATCH = 15
ALLOWED_TYPES = {
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
}


def _detect_content_type(data):
    if data.startswith(b'%PDF-'):
        return 'application/pdf'
    if data.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    if len(data) >= 12 and data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'image/webp'
    return None


def _parse_payload(request):
    raw_payload = request.data.get('payload')
    if not raw_payload:
        return None, Response({'payload': ['Payload is required.']}, status=status.HTTP_400_BAD_REQUEST)
    try:
        payload = json.loads(raw_payload)
    except (TypeError, ValueError, json.JSONDecodeError):
        return None, Response({'payload': ['Payload must be valid JSON.']}, status=status.HTTP_400_BAD_REQUEST)
    if not isinstance(payload, dict):
        return None, Response({'payload': ['Payload must be a JSON object.']}, status=status.HTTP_400_BAD_REQUEST)
    return payload, None


def _validate_files(request):
    uploads = request.FILES.getlist('files')
    if len(uploads) > MAX_FILES_PER_BATCH:
        return None, Response(
            {'files': [f'Maximum {MAX_FILES_PER_BATCH} files are allowed in one save.']},
            status=status.HTTP_400_BAD_REQUEST,
        )

    prepared = []
    seen_checksums = set()
    total_bytes = 0
    for uploaded in uploads:
        if uploaded.size <= 0:
            return None, Response({'files': [f'{uploaded.name}: file is empty.']}, status=status.HTTP_400_BAD_REQUEST)
        if uploaded.size > MAX_FILE_BYTES:
            return None, Response({'files': [f'{uploaded.name}: maximum file size is 10 MB.']}, status=status.HTTP_400_BAD_REQUEST)

        data = uploaded.read(MAX_FILE_BYTES + 1)
        if len(data) > MAX_FILE_BYTES:
            return None, Response({'files': [f'{uploaded.name}: maximum file size is 10 MB.']}, status=status.HTTP_400_BAD_REQUEST)

        detected_type = _detect_content_type(data)
        if detected_type not in ALLOWED_TYPES:
            return None, Response(
                {'files': [f'{uploaded.name}: only PDF, JPEG, PNG and WebP are allowed.']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        total_bytes += len(data)
        if total_bytes > MAX_BATCH_BYTES:
            return None, Response(
                {'files': ['Total attachment size for one save cannot exceed 50 MB.']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        checksum = hashlib.sha256(data).hexdigest()
        if checksum in seen_checksums:
            return None, Response(
                {'files': [f'{uploaded.name}: duplicate file in the selected batch.']},
                status=status.HTTP_400_BAD_REQUEST,
            )
        seen_checksums.add(checksum)
        safe_name = str(uploaded.name or 'evidence').replace('\\', '/').split('/')[-1].strip()[:255] or 'evidence'
        prepared.append({
            'file_name': safe_name,
            'content_type': detected_type,
            'byte_size': len(data),
            'file_data': data,
            'checksum_sha256': checksum,
        })
    return prepared, None


def _create_attachments(*, prepared_files, owner_type, user, initiative=None, reference_document=None):
    return [
        EvidenceAttachment.objects.create(
            owner_type=owner_type,
            initiative=initiative,
            reference_document=reference_document,
            uploaded_by=user,
            **prepared,
        )
        for prepared in prepared_files
    ]


class InitiativeWithAttachmentsCreateView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        payload, error_response = _parse_payload(request)
        if error_response:
            return error_response
        prepared_files, error_response = _validate_files(request)
        if error_response:
            return error_response

        serializer = InitiativeSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            initiative = serializer.save(created_by=request.user)
            _create_attachments(
                prepared_files=prepared_files,
                owner_type=EvidenceAttachment.OwnerType.INITIATIVE,
                user=request.user,
                initiative=initiative,
            )
        initiative.refresh_from_db()
        return Response(InitiativeSerializer(initiative).data, status=status.HTTP_201_CREATED)


class ReferenceDocumentWithAttachmentsCreateView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        payload, error_response = _parse_payload(request)
        if error_response:
            return error_response
        prepared_files, error_response = _validate_files(request)
        if error_response:
            return error_response

        serializer = ReferenceDocumentSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            reference_document = serializer.save()
            _create_attachments(
                prepared_files=prepared_files,
                owner_type=EvidenceAttachment.OwnerType.REFERENCE_DOCUMENT,
                user=request.user,
                reference_document=reference_document,
            )
        reference_document.refresh_from_db()
        return Response(ReferenceDocumentSerializer(reference_document).data, status=status.HTTP_201_CREATED)
