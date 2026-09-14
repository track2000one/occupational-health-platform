from datetime import date

from django.db.models import Sum
from django.db.models.functions import ExtractMonth
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DailyStatistic, Indicator, Initiative, ReferenceDocument, WorkforceMember, WorkforceTarget
from .serializers import (
    DailyStatisticSerializer,
    IndicatorSerializer,
    InitiativeSerializer,
    ReferenceDocumentSerializer,
    WorkforceMemberSerializer,
    WorkforceTargetSerializer,
)


def _int_param(request, name, default, minimum, maximum):
    try:
        value = int(request.query_params.get(name, default))
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


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
        queryset = Initiative.objects.select_related('created_by').all()
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
    queryset = ReferenceDocument.objects.all()
    serializer_class = ReferenceDocumentSerializer
    permission_classes = [IsAuthenticated]


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

        quarter_start_month = ((quarter - 1) * 3) + 1
        initiatives_count = Initiative.objects.filter(
            start_date__year=year,
            start_date__month__gte=quarter_start_month,
            start_date__month__lte=quarter_start_month + 2,
        ).count()

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
                'initiatives_quarter': initiatives_count,
                'document_compliance': document_compliance,
                'doctors': WorkforceMember.objects.filter(category=WorkforceMember.Category.DOCTOR, is_active=True).count(),
                'nursing': WorkforceMember.objects.filter(category=WorkforceMember.Category.NURSING, is_active=True).count(),
            },
        }, status=status.HTTP_200_OK)
