from rest_framework import serializers

from .models import DailyStatistic, EvidenceAttachment, Indicator, Initiative, ReferenceDocument, WorkforceMember, WorkforceTarget


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


class EvidenceAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.username', read_only=True)
    is_image = serializers.BooleanField(read_only=True)

    class Meta:
        model = EvidenceAttachment
        fields = (
            'id', 'owner_type', 'initiative', 'reference_document', 'file_name',
            'content_type', 'byte_size', 'checksum_sha256', 'description',
            'uploaded_by_name', 'created_at', 'is_image',
        )
        read_only_fields = fields


class InitiativeSerializer(serializers.ModelSerializer):
    year = serializers.SerializerMethodField()
    quarter = serializers.SerializerMethodField()
    total_beneficiaries = serializers.IntegerField(read_only=True)
    attachments = EvidenceAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Initiative
        fields = '__all__'
        read_only_fields = ('created_by', 'created_at', 'updated_at')

    def get_year(self, obj):
        return obj.start_date.year

    def get_quarter(self, obj):
        return ((obj.start_date.month - 1) // 3) + 1

    def validate_activities(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('Activities must be a list.')
        cleaned = []
        for index, activity in enumerate(value, start=1):
            if not isinstance(activity, dict):
                raise serializers.ValidationError(f'Activity {index} must be an object.')
            title = str(activity.get('title') or '').strip()
            objective = str(activity.get('objective') or '').strip()
            try:
                beneficiary_count = max(0, int(activity.get('beneficiary_count') or 0))
            except (TypeError, ValueError):
                raise serializers.ValidationError(f'Invalid beneficiary count in activity {index}.')
            if not title and not objective and beneficiary_count == 0:
                continue
            cleaned.append({
                'title': title,
                'objective': objective,
                'beneficiary_count': beneficiary_count,
            })
        return cleaned

    def validate_team_members(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('Team members must be a list.')
        return [str(item).strip() for item in value if str(item).strip()]

    def validate_evidence_links(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('Evidence links must be a list.')
        return [str(item).strip() for item in value if str(item).strip()]

    def validate(self, attrs):
        activities = attrs.get('activities')
        if activities:
            attrs['beneficiaries'] = sum(int(item.get('beneficiary_count') or 0) for item in activities)
        if attrs.get('redcap_uploaded') and not attrs.get('redcap_upload_date'):
            raise serializers.ValidationError({'redcap_upload_date': 'Upload date is required when REDCap is marked as uploaded.'})
        return attrs


class ReferenceDocumentSerializer(serializers.ModelSerializer):
    attachments = EvidenceAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = ReferenceDocument
        fields = '__all__'

    def validate_evidence_links(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('Evidence links must be a list.')
        return [str(item).strip() for item in value if str(item).strip()]

    def validate(self, attrs):
        status_value = attrs.get('status', getattr(self.instance, 'status', ReferenceDocument.Status.AVAILABLE))
        reason = str(attrs.get('reason', getattr(self.instance, 'reason', '')) or '').strip()
        if status_value in {ReferenceDocument.Status.UNAVAILABLE, ReferenceDocument.Status.NOT_APPLICABLE} and not reason:
            raise serializers.ValidationError({'reason': 'Reason is required when the document is unavailable or not applicable.'})
        return attrs
