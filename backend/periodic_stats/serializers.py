from rest_framework import serializers

from .models import DailyStatistic, Indicator, Initiative, ReferenceDocument, WorkforceMember, WorkforceTarget


class IndicatorSerializer(serializers.ModelSerializer):
    annual_target = serializers.IntegerField(read_only=True, allow_null=True)

    class Meta:
        model = Indicator
        fields = '__all__'


class DailyStatisticSerializer(serializers.ModelSerializer):
    indicator_detail = IndicatorSerializer(source='indicator', read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = DailyStatistic
        fields = '__all__'
        read_only_fields = ('created_by', 'created_at', 'updated_at')


class WorkforceTargetSerializer(serializers.ModelSerializer):
    member_name = serializers.CharField(source='member.name', read_only=True)

    class Meta:
        model = WorkforceTarget
        fields = '__all__'


class WorkforceMemberSerializer(serializers.ModelSerializer):
    targets = WorkforceTargetSerializer(many=True, read_only=True)

    class Meta:
        model = WorkforceMember
        fields = '__all__'


class InitiativeSerializer(serializers.ModelSerializer):
    year = serializers.SerializerMethodField()
    quarter = serializers.SerializerMethodField()

    class Meta:
        model = Initiative
        fields = '__all__'
        read_only_fields = ('created_by', 'created_at', 'updated_at')

    def get_year(self, obj):
        return obj.start_date.year

    def get_quarter(self, obj):
        return ((obj.start_date.month - 1) // 3) + 1


class ReferenceDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReferenceDocument
        fields = '__all__'
