from rest_framework import permissions, viewsets
from .models import AuditLog, ClinicVisit, CommitteeReferral, Employee, HealthCenter, InjuryCase, LabTest, Vaccination
from .serializers import AuditLogSerializer, ClinicVisitSerializer, CommitteeReferralSerializer, EmployeeSerializer, HealthCenterSerializer, InjuryCaseSerializer, LabTestSerializer, VaccinationSerializer
class IsAdminOrManagerForWrite(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS: return True
        return request.user and request.user.is_staff
class HealthCenterViewSet(viewsets.ModelViewSet): queryset=HealthCenter.objects.all().order_by('name'); serializer_class=HealthCenterSerializer; permission_classes=[permissions.IsAuthenticated]
class EmployeeViewSet(viewsets.ModelViewSet): queryset=Employee.objects.select_related('health_center').all().order_by('-created_at'); serializer_class=EmployeeSerializer; permission_classes=[permissions.IsAuthenticated,IsAdminOrManagerForWrite]; search_fields=['name','national_id','mobile','job_title']
class LabTestViewSet(viewsets.ModelViewSet): queryset=LabTest.objects.select_related('employee').all().order_by('-id'); serializer_class=LabTestSerializer; permission_classes=[permissions.IsAuthenticated]
class VaccinationViewSet(viewsets.ModelViewSet): queryset=Vaccination.objects.select_related('employee').all().order_by('-id'); serializer_class=VaccinationSerializer; permission_classes=[permissions.IsAuthenticated]
class ClinicVisitViewSet(viewsets.ModelViewSet): queryset=ClinicVisit.objects.select_related('employee').all().order_by('-id'); serializer_class=ClinicVisitSerializer; permission_classes=[permissions.IsAuthenticated]
class CommitteeReferralViewSet(viewsets.ModelViewSet): queryset=CommitteeReferral.objects.select_related('employee').all().order_by('-id'); serializer_class=CommitteeReferralSerializer; permission_classes=[permissions.IsAuthenticated]
class InjuryCaseViewSet(viewsets.ModelViewSet): queryset=InjuryCase.objects.select_related('employee').all().order_by('-id'); serializer_class=InjuryCaseSerializer; permission_classes=[permissions.IsAuthenticated]
class AuditLogViewSet(viewsets.ReadOnlyModelViewSet): queryset=AuditLog.objects.all().order_by('-created_at'); serializer_class=AuditLogSerializer; permission_classes=[permissions.IsAdminUser]
