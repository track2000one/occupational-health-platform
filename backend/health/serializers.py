from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import AuditLog, ClinicVisit, CommitteeReferral, Employee, HealthCenter, InjuryCase, LabTest, UserProfile, Vaccination


ROLE_PERMISSIONS = {
    'systemAdmin': ['manage:users', 'manage:roles', 'manage:settings', 'view:auditLogs'],
    'ohManager': ['view:dashboard', 'view:employees', 'view:reports', 'view:auditLogs'],
    'ohDoctor': ['view:employees', 'view:labTests', 'view:vaccinations', 'view:committee'],
    'clinicDoctor': ['view:employees', 'view:clinicVisits', 'create:clinicVisit'],
    'labOfficer': ['view:labTests', 'update:labResult'],
    'vaccinationOfficer': ['view:vaccinations', 'create:vaccination'],
    'needleStickOfficer': ['view:needleStick', 'update:needleStick'],
    'medicalCommitteeOfficer': ['view:committee', 'update:committeeDecision'],
    'campaignOfficer': ['view:campaigns', 'create:campaign'],
    'centerManager': ['view:dashboard', 'view:employees:ownCenter', 'view:reports:ownCenter'],
    'executive': ['view:dashboard', 'view:kpi', 'view:reports'],
    'employee': ['view:ownProfile'],
    'dataEntry': ['create:employee', 'update:employee:basic'],
    'dataQuality': ['view:dataQuality', 'update:dataQuality'],
    'reportsOfficer': ['view:reports', 'export:reports'],
    'techSupport': ['reset:passwords', 'view:userTechnical'],
}


class PlatformUserSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(read_only=True)
    name = serializers.CharField(required=True, allow_blank=False)
    email = serializers.EmailField(required=True)
    role = serializers.ChoiceField(choices=UserProfile.ROLE_CHOICES, required=False, default='employee')
    healthCenterId = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    isActive = serializers.BooleanField(required=False, default=True)
    isStaff = serializers.BooleanField(read_only=True)
    isSuperuser = serializers.BooleanField(read_only=True)
    lastLogin = serializers.DateTimeField(read_only=True)
    permissions = serializers.SerializerMethodField()
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, min_length=6)

    class Meta:
        model = get_user_model()
        fields = ['id', 'username', 'name', 'email', 'role', 'healthCenterId', 'isActive', 'isStaff', 'isSuperuser', 'lastLogin', 'permissions', 'password']
        read_only_fields = ['id', 'username', 'isStaff', 'isSuperuser', 'lastLogin', 'permissions']

    def _profile(self, obj):
        profile, _ = UserProfile.objects.get_or_create(user=obj)
        return profile

    def get_permissions(self, obj):
        role = self._profile(obj).role
        return ROLE_PERMISSIONS.get(role, [])

    def to_representation(self, instance):
        profile = self._profile(instance)
        return {
            'id': str(instance.id),
            'username': instance.username,
            'name': instance.first_name or instance.get_full_name() or instance.username,
            'email': instance.email,
            'role': profile.role,
            'healthCenterId': str(profile.health_center_id) if profile.health_center_id else '',
            'healthCenterName': profile.health_center.name if profile.health_center_id else '',
            'isActive': instance.is_active,
            'isStaff': instance.is_staff,
            'isSuperuser': instance.is_superuser,
            'lastLogin': instance.last_login,
            'permissions': self.get_permissions(instance),
        }

    def _resolve_health_center(self, health_center_id):
        if not health_center_id:
            return None
        try:
            return HealthCenter.objects.get(pk=health_center_id)
        except HealthCenter.DoesNotExist:
            raise serializers.ValidationError({'healthCenterId': 'Invalid health center.'})

    def create(self, validated_data):
        User = get_user_model()
        password = validated_data.pop('password', None)
        role = validated_data.pop('role', 'employee')
        health_center_id = validated_data.pop('healthCenterId', None)
        name = validated_data.pop('name')
        email = validated_data.pop('email').lower().strip()
        is_active = validated_data.pop('isActive', True)

        if User.objects.filter(email__iexact=email).exists() or User.objects.filter(username__iexact=email).exists():
            raise serializers.ValidationError({'email': 'A user with this email already exists.'})

        user = User(username=email, email=email, first_name=name, is_active=is_active)
        if role == 'systemAdmin':
            user.is_staff = True
            user.is_superuser = True
        elif role in ('ohManager', 'techSupport'):
            user.is_staff = True
        user.set_password(password or User.objects.make_random_password())
        user.save()
        UserProfile.objects.update_or_create(user=user, defaults={'role': role, 'health_center': self._resolve_health_center(health_center_id)})
        AuditLog.objects.create(user=str(self.context.get('request').user), action='create_user', model_name='User', record_id=str(user.id))
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        role = validated_data.pop('role', None)
        health_center_id = validated_data.pop('healthCenterId', None)
        name = validated_data.pop('name', None)
        email = validated_data.pop('email', None)
        is_active = validated_data.pop('isActive', None)

        if name is not None:
            instance.first_name = name
        if email is not None:
            email = email.lower().strip()
            User = get_user_model()
            duplicate = User.objects.filter(email__iexact=email).exclude(pk=instance.pk).exists() or User.objects.filter(username__iexact=email).exclude(pk=instance.pk).exists()
            if duplicate:
                raise serializers.ValidationError({'email': 'A user with this email already exists.'})
            instance.email = email
            instance.username = email
        if is_active is not None:
            instance.is_active = is_active
        if role is not None:
            instance.is_staff = role in ('systemAdmin', 'ohManager', 'techSupport')
            instance.is_superuser = role == 'systemAdmin'
        if password:
            instance.set_password(password)
        instance.save()

        profile = self._profile(instance)
        if role is not None:
            profile.role = role
        if health_center_id is not None:
            profile.health_center = self._resolve_health_center(health_center_id)
        profile.save()
        AuditLog.objects.create(user=str(self.context.get('request').user), action='update_user', model_name='User', record_id=str(instance.id))
        return instance


class HealthCenterSerializer(serializers.ModelSerializer):
    class Meta: model=HealthCenter; fields='__all__'
class EmployeeSerializer(serializers.ModelSerializer):
    health_center_name=serializers.CharField(source='health_center.name',read_only=True)
    class Meta: model=Employee; fields='__all__'
class LabTestSerializer(serializers.ModelSerializer):
    class Meta: model=LabTest; fields='__all__'
class VaccinationSerializer(serializers.ModelSerializer):
    class Meta: model=Vaccination; fields='__all__'
class ClinicVisitSerializer(serializers.ModelSerializer):
    class Meta: model=ClinicVisit; fields='__all__'
class CommitteeReferralSerializer(serializers.ModelSerializer):
    class Meta: model=CommitteeReferral; fields='__all__'
class InjuryCaseSerializer(serializers.ModelSerializer):
    class Meta: model=InjuryCase; fields='__all__'
class AuditLogSerializer(serializers.ModelSerializer):
    class Meta: model=AuditLog; fields='__all__'
