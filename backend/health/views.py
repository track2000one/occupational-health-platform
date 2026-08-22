from django.contrib.auth import get_user_model
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from .models import AuditLog, ClinicVisit, CommitteeReferral, Employee, HealthCenter, InjuryCase, LabTest, Vaccination
from .serializers import AuditLogSerializer, ClinicVisitSerializer, CommitteeReferralSerializer, EmployeeSerializer, HealthCenterSerializer, InjuryCaseSerializer, LabTestSerializer, PlatformUserSerializer, VaccinationSerializer


class IsAdminOrManagerForWrite(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS: return True
        return request.user and request.user.is_staff


class UserViewSet(viewsets.ModelViewSet):
    serializer_class = PlatformUserSerializer
    queryset = get_user_model().objects.select_related('health_profile', 'health_profile__health_center').all().order_by('-date_joined')
    search_fields = ['username', 'email', 'first_name', 'health_profile__national_id', 'health_profile__employee_number', 'health_profile__medical_record_number']

    def get_permissions(self):
        if self.action == 'me':
            return [permissions.IsAuthenticated()]
        return [permissions.IsAdminUser()]

    @action(detail=False, methods=['get'])
    def me(self, request):
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def reset_password(self, request, pk=None):
        target = self.get_object()
        password = request.data.get('password')
        if not password or len(str(password)) < 6:
            return Response({'password': 'Password must be at least 6 characters.'}, status=status.HTTP_400_BAD_REQUEST)
        target.set_password(password)
        target.save(update_fields=['password'])
        AuditLog.objects.create(user=str(request.user), action='reset_password', model_name='User', record_id=str(target.id))
        return Response({'status': 'password_reset'})

    def perform_destroy(self, instance):
        if instance == self.request.user:
            raise ValidationError({'detail': 'You cannot delete your current account.'})
        AuditLog.objects.create(user=str(self.request.user), action='delete_user', model_name='User', record_id=str(instance.id))
        instance.delete()


class HealthCenterViewSet(viewsets.ModelViewSet): queryset=HealthCenter.objects.all().order_by('name'); serializer_class=HealthCenterSerializer; permission_classes=[permissions.IsAuthenticated]
class EmployeeViewSet(viewsets.ModelViewSet): queryset=Employee.objects.select_related('health_center').all().order_by('-created_at'); serializer_class=EmployeeSerializer; permission_classes=[permissions.IsAuthenticated,IsAdminOrManagerForWrite]; search_fields=['name','national_id','mobile','job_title']
class LabTestViewSet(viewsets.ModelViewSet): queryset=LabTest.objects.select_related('employee').all().order_by('-id'); serializer_class=LabTestSerializer; permission_classes=[permissions.IsAuthenticated]
class VaccinationViewSet(viewsets.ModelViewSet): queryset=Vaccination.objects.select_related('employee').all().order_by('-id'); serializer_class=VaccinationSerializer; permission_classes=[permissions.IsAuthenticated]
class ClinicVisitViewSet(viewsets.ModelViewSet): queryset=ClinicVisit.objects.select_related('employee').all().order_by('-id'); serializer_class=ClinicVisitSerializer; permission_classes=[permissions.IsAuthenticated]
class CommitteeReferralViewSet(viewsets.ModelViewSet): queryset=CommitteeReferral.objects.select_related('employee').all().order_by('-id'); serializer_class=CommitteeReferralSerializer; permission_classes=[permissions.IsAuthenticated]
class InjuryCaseViewSet(viewsets.ModelViewSet): queryset=InjuryCase.objects.select_related('employee').all().order_by('-id'); serializer_class=InjuryCaseSerializer; permission_classes=[permissions.IsAuthenticated]
class AuditLogViewSet(viewsets.ReadOnlyModelViewSet): queryset=AuditLog.objects.all().order_by('-created_at'); serializer_class=AuditLogSerializer; permission_classes=[permissions.IsAdminUser]
