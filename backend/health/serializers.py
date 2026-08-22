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

IDENTITY_FIELD_LABELS = {
    'national_id': 'National ID / Registry number already exists.',
    'employee_number': 'Employee number already exists.',
    'medical_record_number': 'Medical record number already exists.',
}


def clean_optional_identifier(value):
    if value is None:
        return None
    value = str(value).strip()
    return value or None


class PlatformUserSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(read_only=True)
    name = serializers.CharField(required=True, allow_blank=False)
    email = serializers.EmailField(required=True)
    role = serializers.ChoiceField(choices=UserProfile.ROLE_CHOICES, required=False, default='employee')
    personType = serializers.ChoiceField(choices=UserProfile.PERSON_TYPE_CHOICES, required=False, default='employee')
    healthCenterId = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    nationalId = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    employeeNumber = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    medicalRecordNumber = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    phone = serializers.CharField(required=False, allow_blank=True)
    department = serializers.CharField(required=False, allow_blank=True)
    jobTitle = serializers.CharField(required=False, allow_blank=True)
    specialty = serializers.CharField(required=False, allow_blank=True)
    licenseNumber = serializers.CharField(required=False, allow_blank=True)
    isActive = serializers.BooleanField(required=False, default=True)
    isStaff = serializers.BooleanField(read_only=True)
    isSuperuser = serializers.BooleanField(read_only=True)
    lastLogin = serializers.DateTimeField(read_only=True)
    permissions = serializers.SerializerMethodField()
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, min_length=6)

    class Meta:
        model = get_user_model()
        fields = [
            'id', 'username', 'name', 'email', 'role', 'personType', 'healthCenterId',
            'nationalId', 'employeeNumber', 'medicalRecordNumber', 'phone', 'department',
            'jobTitle', 'specialty', 'licenseNumber', 'isActive', 'isStaff', 'isSuperuser',
            'lastLogin', 'permissions', 'password'
        ]
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
            'personType': profile.person_type,
            'healthCenterId': str(profile.health_center_id) if profile.health_center_id else '',
            'healthCenterName': profile.health_center.name if profile.health_center_id else '',
            'nationalId': profile.national_id or '',
            'employeeNumber': profile.employee_number or '',
            'medicalRecordNumber': profile.medical_record_number or '',
            'phone': profile.phone,
            'department': profile.department,
            'jobTitle': profile.job_title,
            'specialty': profile.specialty,
            'licenseNumber': profile.license_number,
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

    def _check_unique_profile_field(self, field_name, value, user_instance=None):
        value = clean_optional_identifier(value)
        if not value:
            return None
        qs = UserProfile.objects.filter(**{field_name: value})
        if user_instance is not None:
            qs = qs.exclude(user=user_instance)
        if qs.exists():
            public_name = {
                'national_id': 'nationalId',
                'employee_number': 'employeeNumber',
                'medical_record_number': 'medicalRecordNumber',
            }[field_name]
            raise serializers.ValidationError({public_name: IDENTITY_FIELD_LABELS[field_name]})
        return value

    def _profile_values(self, data, instance=None, partial=False):
        sentinel = object()
        values = {}
        mapping = {
            'personType': 'person_type',
            'nationalId': 'national_id',
            'employeeNumber': 'employee_number',
            'medicalRecordNumber': 'medical_record_number',
            'phone': 'phone',
            'department': 'department',
            'jobTitle': 'job_title',
            'specialty': 'specialty',
            'licenseNumber': 'license_number',
        }
        for incoming, model_field in mapping.items():
            raw = data.pop(incoming, sentinel)
            if raw is sentinel:
                if partial:
                    continue
                raw = '' if model_field not in ('person_type', 'national_id', 'employee_number', 'medical_record_number') else None
            if model_field in ('national_id', 'employee_number', 'medical_record_number'):
                raw = self._check_unique_profile_field(model_field, raw, instance)
            else:
                raw = '' if raw is None else str(raw).strip()
            values[model_field] = raw
        return values

    def create(self, validated_data):
        User = get_user_model()
        password = validated_data.pop('password', None)
        role = validated_data.pop('role', 'employee')
        health_center_id = validated_data.pop('healthCenterId', None)
        profile_values = self._profile_values(validated_data)
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
        UserProfile.objects.update_or_create(
            user=user,
            defaults={
                'role': role,
                'health_center': self._resolve_health_center(health_center_id),
                **profile_values,
            }
        )
        AuditLog.objects.create(user=str(self.context.get('request').user), action='create_user', model_name='User', record_id=str(user.id))
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        role = validated_data.pop('role', None)
        health_center_id = validated_data.pop('healthCenterId', None)
        profile_values = self._profile_values(validated_data, instance=instance, partial=True)
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
        for key, value in profile_values.items():
            setattr(profile, key, value)
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
