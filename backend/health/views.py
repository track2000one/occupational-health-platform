from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from .importers import process_excel_import
from .models import AuditLog, ClinicVisit, CommitteeReferral, DataImportBatch, Employee, HealthCenter, InjuryCase, LabTest, Vaccination
from .serializers import AuditLogSerializer, ClinicVisitSerializer, CommitteeReferralSerializer, DataImportBatchSerializer, EmployeeSerializer, HealthCenterSerializer, InjuryCaseSerializer, LabTestSerializer, PlatformUserSerializer, VaccinationSerializer


class IsAdminOrManagerForWrite(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS: return True
        return request.user and request.user.is_staff


def truthy(value):
    return str(value).lower() in ('1','true','yes','y','commit')


def imported_total_from_summary(summary):
    return sum(value for key, value in summary.items() if key.startswith('imported_') and isinstance(value, int))


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

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance == request.user:
            raise ValidationError({'detail': 'You cannot delete your current account.'})

        deleted_id = str(instance.id)
        deleted_username = instance.username
        deleted_email = instance.email

        with transaction.atomic():
            AuditLog.objects.create(
                user=str(request.user),
                action='delete_user',
                model_name='User',
                record_id=deleted_id,
            )
            instance.delete()

        return Response(
            {
                'status': 'deleted',
                'id': deleted_id,
                'username': deleted_username,
                'email': deleted_email,
                'message': 'User was deleted from Django auth_user and related UserProfile data.',
            },
            status=status.HTTP_200_OK,
        )


class ExcelImportViewSet(viewsets.ReadOnlyModelViewSet):
    queryset=DataImportBatch.objects.select_related('created_by').all()
    serializer_class=DataImportBatchSerializer
    permission_classes=[permissions.IsAdminUser]

    @action(detail=False, methods=['post'])
    def upload(self, request):
        uploaded=request.FILES.get('file')
        if not uploaded:
            return Response({'file':'Excel file is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if uploaded.size > 20 * 1024 * 1024:
            return Response({'file':'Maximum allowed file size is 20 MB.'}, status=status.HTTP_400_BAD_REQUEST)
        if not uploaded.name.lower().endswith(('.xlsx','.xlsm','.xltx','.xltm')):
            return Response({'file':'Only Excel .xlsx/.xlsm files are allowed.'}, status=status.HTTP_400_BAD_REQUEST)

        commit=truthy(request.data.get('commit'))
        sheet_name=str(request.data.get('sheetName') or '').strip()
        try:
            result=process_excel_import(uploaded, sheet_name=sheet_name, commit=commit, user=request.user)
            summary=result['summary']
            batch=DataImportBatch.objects.create(
                file_name=uploaded.name,
                sheet_name=result.get('sheet_name',''),
                mode='commit' if commit else 'preview',
                status='committed' if commit else 'validated',
                total_rows=summary.get('total_rows',0),
                valid_rows=summary.get('valid_rows',0),
                duplicate_rows=summary.get('duplicate_rows',0),
                imported_records=imported_total_from_summary(summary),
                skipped_rows=summary.get('skipped_rows',0),
                errors_count=summary.get('errors_count',0),
                summary=result,
                created_by=request.user,
            )
            AuditLog.objects.create(user=str(request.user), action='excel_import_commit' if commit else 'excel_import_preview', model_name='DataImportBatch', record_id=str(batch.id))
            result['batch_id']=batch.id
            return Response(result)
        except Exception as exc:
            batch=DataImportBatch.objects.create(
                file_name=uploaded.name,
                sheet_name=sheet_name,
                mode='commit' if commit else 'preview',
                status='failed',
                errors_count=1,
                summary={'error': str(exc)},
                created_by=request.user,
            )
            AuditLog.objects.create(user=str(request.user), action='excel_import_failed', model_name='DataImportBatch', record_id=str(batch.id))
            return Response({'detail': str(exc), 'batch_id': batch.id}, status=status.HTTP_400_BAD_REQUEST)


class HealthCenterViewSet(viewsets.ModelViewSet): queryset=HealthCenter.objects.all().order_by('name'); serializer_class=HealthCenterSerializer; permission_classes=[permissions.IsAuthenticated]
class EmployeeViewSet(viewsets.ModelViewSet): queryset=Employee.objects.select_related('health_center').all().order_by('-created_at'); serializer_class=EmployeeSerializer; permission_classes=[permissions.IsAuthenticated,IsAdminOrManagerForWrite]; search_fields=['name','national_id','mobile','job_title']
class LabTestViewSet(viewsets.ModelViewSet): queryset=LabTest.objects.select_related('employee').all().order_by('-id'); serializer_class=LabTestSerializer; permission_classes=[permissions.IsAuthenticated]
class VaccinationViewSet(viewsets.ModelViewSet): queryset=Vaccination.objects.select_related('employee').all().order_by('-id'); serializer_class=VaccinationSerializer; permission_classes=[permissions.IsAuthenticated]
class ClinicVisitViewSet(viewsets.ModelViewSet): queryset=ClinicVisit.objects.select_related('employee').all().order_by('-id'); serializer_class=ClinicVisitSerializer; permission_classes=[permissions.IsAuthenticated]
class CommitteeReferralViewSet(viewsets.ModelViewSet): queryset=CommitteeReferral.objects.select_related('employee').all().order_by('-id'); serializer_class=CommitteeReferralSerializer; permission_classes=[permissions.IsAuthenticated]
class InjuryCaseViewSet(viewsets.ModelViewSet): queryset=InjuryCase.objects.select_related('employee').all().order_by('-id'); serializer_class=InjuryCaseSerializer; permission_classes=[permissions.IsAuthenticated]
class AuditLogViewSet(viewsets.ReadOnlyModelViewSet): queryset=AuditLog.objects.all().order_by('-created_at'); serializer_class=AuditLogSerializer; permission_classes=[permissions.IsAdminUser]
