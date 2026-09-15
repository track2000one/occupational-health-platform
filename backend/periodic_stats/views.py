import hashlib
from datetime import date
from urllib.parse import quote

from django.db.models import Sum
from django.db.models.functions import ExtractMonth
from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DailyStatistic, EvidenceAttachment, Indicator, Initiative, ReferenceDocument, WorkforceMember, WorkforceTarget
from .serializers import (
    DailyStatisticSerializer,
    EvidenceAttachmentSerializer,
    IndicatorSerializer,
    InitiativeSerializer,
    ReferenceDocumentSerializer,
    WorkforceMemberSerializer,
    WorkforceTargetSerializer,
)


EVIDENCE_MAX_BYTES = 10 * 1024 * 1024
EVIDENCE_ALLOWED_TYPES = {
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
}


def _int_param(request, name, default, minimum, maximum):
    try:
        value = int(request.query_params.get(name, default))
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


def _detect_evidence_content_type(data):
    if data.startswith(b'%PDF-'):
        return 'application/pdf'
    if data.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    if len(data) >= 12 and data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'image/webp'
    return None


class IndicatorViewSet(viewsets.ModelViewSet):
    queryset = Indicator.objects.all()
    serializer_class = IndicatorSerializer
    permission_classes = [IsAuthenticated]


class DailyStatisticViewSet(viewsets.ModelViewSet):
    serializer_class = DailyStatisticSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = DailyStatistic.objects.select_related('indicator', 'created_by').all()
        year = self.request.query_params.get('year')
        month = self.request.query_params.get('month')
        indicator = self.request.query_params.get('indicator')
        if year and str(year).isdigit():
            queryset = queryset.filter(date__year=int(year))
        if month and str(month).isdigit():
            queryset = queryset.filter(date__month=int(month))
        if indicator and str(indicator).isdigit():
            queryset = queryset.filter(indicator_id=int(indicator))
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class WorkforceMemberViewSet(viewsets.ModelViewSet):
    serializer_class = WorkforceMemberSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = WorkforceMember.objects.prefetch_related('targets').all()
        category = self.request.query_params.get('category')
        if category in {WorkforceMember.Category.DOCTOR, WorkforceMember.Category.NURSING}:
            queryset = queryset.filter(category=category)
        return queryset


class WorkforceTargetViewSet(viewsets.ModelViewSet):
    serializer_class = WorkforceTargetSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = WorkforceTarget.objects.select_related('member').all()
        member = self.request.query_params.get('member')
        if member and str(member).isdigit():
            queryset = queryset.filter(member_id=int(member))
        return queryset


class InitiativeViewSet(viewsets.ModelViewSet):
    serializer_class = InitiativeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Initiative.objects.select_related('created_by').prefetch_related('attachments').all()
        year = self.request.query_params.get('year')
        quarter = self.request.query_params.get('quarter')
        if year and str(year).isdigit():
            queryset = queryset.filter(start_date__year=int(year))
        if quarter and str(quarter).isdigit():
            q = max(1, min(4, int(quarter)))
            queryset = queryset.filter(start_date__month__gte=((q - 1) * 3) + 1, start_date__month__lte=q * 3)
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class ReferenceDocumentViewSet(viewsets.ModelViewSet):
    serializer_class = ReferenceDocumentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ReferenceDocument.objects.prefetch_related('attachments').all()


class EvidenceAttachmentViewSet(viewsets.ModelViewSet):
    serializer_class = EvidenceAttachmentSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_queryset(self):
        queryset = EvidenceAttachment.objects.select_related('initiative', 'reference_document', 'uploaded_by').all()
        if self.action != 'list':
            return queryset

        owner_type = self.request.query_params.get('owner_type')
        owner_id = self.request.query_params.get('owner_id')
        if not owner_id or not str(owner_id).isdigit():
            return queryset.none()
        owner_id = int(owner_id)
        if owner_type == EvidenceAttachment.OwnerType.INITIATIVE:
            return queryset.filter(owner_type=owner_type, initiative_id=owner_id)
        if owner_type == EvidenceAttachment.OwnerType.REFERENCE_DOCUMENT:
            return queryset.filter(owner_type=owner_type, reference_document_id=owner_id)
        return queryset.none()

    def create(self, request, *args, **kwargs):
        uploaded = request.FILES.get('file')
        owner_type = str(request.data.get('owner_type') or '').strip()
        owner_id = str(request.data.get('owner_id') or '').strip()
        description = str(request.data.get('description') or '').strip()[:500]

        if not uploaded:
            return Response({'file': ['A file is required.']}, status=status.HTTP_400_BAD_REQUEST)
        if owner_type not in EvidenceAttachment.OwnerType.values:
            return Response({'owner_type': ['Invalid attachment owner type.']}, status=status.HTTP_400_BAD_REQUEST)
        if not owner_id.isdigit():
            return Response({'owner_id': ['A valid owner ID is required.']}, status=status.HTTP_400_BAD_REQUEST)
        if uploaded.size <= 0:
            return Response({'file': ['The selected file is empty.']}, status=status.HTTP_400_BAD_REQUEST)
        if uploaded.size > EVIDENCE_MAX_BYTES:
            return Response({'file': ['Maximum file size is 10 MB.']}, status=status.HTTP_400_BAD_REQUEST)

        data = uploaded.read(EVIDENCE_MAX_BYTES + 1)
        if len(data) > EVIDENCE_MAX_BYTES:
            return Response({'file': ['Maximum file size is 10 MB.']}, status=status.HTTP_400_BAD_REQUEST)
        detected_type = _detect_evidence_content_type(data)
        if detected_type not in EVIDENCE_ALLOWED_TYPES:
            return Response({'file': ['Only PDF, JPEG, PNG and WebP files are allowed.']}, status=status.HTTP_400_BAD_REQUEST)

        owner_id_int = int(owner_id)
        owner_kwargs = {'initiative': None, 'reference_document': None}
        if owner_type == EvidenceAttachment.OwnerType.INITIATIVE:
            try:
                owner_kwargs['initiative'] = Initiative.objects.get(pk=owner_id_int)
            except Initiative.DoesNotExist:
                return Response({'owner_id': ['Initiative not found.']}, status=status.HTTP_404_NOT_FOUND)
        else:
            try:
                owner_kwargs['reference_document'] = ReferenceDocument.objects.get(pk=owner_id_int)
            except ReferenceDocument.DoesNotExist:
                return Response({'owner_id': ['Reference document not found.']}, status=status.HTTP_404_NOT_FOUND)

        checksum = hashlib.sha256(data).hexdigest()
        duplicate_query = EvidenceAttachment.objects.filter(owner_type=owner_type, checksum_sha256=checksum)
        if owner_type == EvidenceAttachment.OwnerType.INITIATIVE:
            duplicate_query = duplicate_query.filter(initiative_id=owner_id_int)
        else:
            duplicate_query = duplicate_query.filter(reference_document_id=owner_id_int)
        existing = duplicate_query.first()
        if existing:
            return Response(
                {'detail': 'This file is already attached to the selected record.', 'attachment': EvidenceAttachmentSerializer(existing).data},
                status=status.HTTP_409_CONFLICT,
            )

        safe_name = str(uploaded.name or 'evidence').replace('\\', '/').split('/')[-1].strip()[:255] or 'evidence'
        attachment = EvidenceAttachment.objects.create(
            owner_type=owner_type,
            file_name=safe_name,
            content_type=detected_type,
            byte_size=len(data),
            file_data=data,
            checksum_sha256=checksum,
            description=description,
            uploaded_by=request.user,
            **owner_kwargs,
        )
        return Response(EvidenceAttachmentSerializer(attachment).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='content')
    def content(self, request, pk=None):
        attachment = self.get_object()
        response = HttpResponse(bytes(attachment.file_data), content_type=attachment.content_type)
        response['Content-Length'] = str(attachment.byte_size)
        response['Content-Disposition'] = f"inline; filename*=UTF-8''{quote(attachment.file_name)}"
        response['Cache-Control'] = 'private, max-age=300'
        response['X-Content-Type-Options'] = 'nosniff'
        return response


class PeriodicStatisticsSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = date.today()
        year = _int_param(request, 'year', today.year, 2000, 2100)
        month = _int_param(request, 'month', today.month, 1, 12)
        quarter = _int_param(request, 'quarter', ((today.month - 1) // 3) + 1, 1, 4)

        indicators = list(Indicator.objects.filter(is_active=True).order_by('sort_order', 'id'))
        year_entries = DailyStatistic.objects.filter(date__year=year)
        aggregates = (
            year_entries
            .annotate(month_number=ExtractMonth('date'))
            .values('indicator_id', 'month_number')
            .annotate(total=Sum('count'))
        )
        monthly_map = {(row['indicator_id'], int(row['month_number'])): int(row['total'] or 0) for row in aggregates}

        rows = []
        total_by_month = [0] * 12
        total_annual_target = 0
        total_annual_achieved = 0
        selected_month_total = 0
        selected_quarter_total = 0
        injury_total = 0

        for indicator in indicators:
            monthly = [monthly_map.get((indicator.id, m), 0) for m in range(1, 13)]
            quarterly_achieved = [sum(monthly[q * 3:(q + 1) * 3]) for q in range(4)]
            targets = [indicator.q1_target, indicator.q2_target, indicator.q3_target, indicator.q4_target]
            quarterly = []
            for idx in range(4):
                target = targets[idx] if indicator.is_targeted else None
                achieved = quarterly_achieved[idx]
                percentage = round((achieved / target) * 100, 1) if target else None
                quarterly.append({'quarter': idx + 1, 'target': target, 'achieved': achieved, 'percentage': percentage})

            annual_achieved = sum(monthly)
            annual_target = indicator.annual_target
            annual_percentage = round((annual_achieved / annual_target) * 100, 1) if annual_target else None
            rows.append({
                **IndicatorSerializer(indicator).data,
                'monthly': monthly,
                'quarterly': quarterly,
                'annual_achieved': annual_achieved,
                'annual_percentage': annual_percentage,
            })

            for idx, value in enumerate(monthly):
                total_by_month[idx] += value
            selected_month_total += monthly[month - 1]
            selected_quarter_total += quarterly_achieved[quarter - 1]
            if indicator.is_targeted and annual_target:
                total_annual_target += annual_target
                total_annual_achieved += annual_achieved
            if indicator.code == 'occupational-injury':
                injury_total = annual_achieved


        applicable_documents = ReferenceDocument.objects.exclude(status=ReferenceDocument.Status.NOT_APPLICABLE)
        applicable_count = applicable_documents.count()
        available_count = applicable_documents.filter(status=ReferenceDocument.Status.AVAILABLE).count()
        document_compliance = round((available_count / applicable_count) * 100, 1) if applicable_count else 100.0

        return Response({
            'year': year,
            'month': month,
            'quarter': quarter,
            'month_names_ar': ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
            'total_by_month': total_by_month,
            'indicators': rows,
            'totals': {
                'selected_month': selected_month_total,
                'selected_quarter': selected_quarter_total,
                'annual_achieved': sum(total_by_month),
                'annual_target': total_annual_target,
                'annual_targeted_achieved': total_annual_achieved,
                'annual_percentage': round((total_annual_achieved / total_annual_target) * 100, 1) if total_annual_target else 0,
                'occupational_injuries': injury_total,
                'document_compliance': document_compliance,
                'doctors': WorkforceMember.objects.filter(category=WorkforceMember.Category.DOCTOR, is_active=True).count(),
                'nursing': WorkforceMember.objects.filter(category=WorkforceMember.Category.NURSING, is_active=True).count(),
            },
        }, status=status.HTTP_200_OK)
