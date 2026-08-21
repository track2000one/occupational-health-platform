from rest_framework import serializers
from .models import AuditLog, ClinicVisit, CommitteeReferral, Employee, HealthCenter, InjuryCase, LabTest, Vaccination
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
