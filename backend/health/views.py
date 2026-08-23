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


def _is_missing_identity_error(error):
    reason = str(error.get('reason', '')).lower()
    return 'missing employee name or national id' in reason


def _cleanup_sheet_result(result):
    """Treat trailing worksheet artifacts as ignored rows instead of blocking errors.

    Excel exports often contain formulas, notes, or summary rows after the real data.
    If all visible errors are only missing name/national ID and they start after most
    of the detected data region, they are classified as ignored_non_data_rows.
    """
    summary = result.get('summary') or {}
    errors = result.get('errors') or []
    errors_count = int(summary.get('errors_count') or 0)
    valid_rows = int(summary.get('valid_rows') or 0)
    duplicate_rows = int(summary.get('duplicate_rows') or 0)
    total_rows = int(summary.get('total_rows') or 0)

    if not errors_count or not errors:
        return result

    first_error_row = min((int(error.get('row') or 0) for error in errors), default=0)
    only_missing_identity = all(_is_missing_identity_error(error) for error in errors)

    # In the user's current Database sheet the usable data ends around row 1700+,
    # while formula/blank worksheet artifacts continue after that. The old rule
    # expected errors to start after valid+duplicates, which was too strict because
    # duplicates are reported separately and can be interleaved near the tail.
    data_rows = max(valid_rows + duplicate_rows, valid_rows, 1)
    tail_by_valid_region = first_error_row >= int(data_rows * 0.92)
    tail_by_total_region = total_rows > 0 and first_error_row >= int(total_rows * 0.75)
    enough_real_data_before_error = valid_rows >= 25 and first_error_row > valid_rows
    is_tail_region = first_error_row > 0 and enough_real_data_before_error and (tail_by_valid_region or tail_by_total_region)

    if only_missing_identity and is_tail_region:
        ignored = errors_count
        summary['ignored_non_data_rows'] = int(summary.get('ignored_non_data_rows') or 0) + ignored
        summary['errors_count'] = 0
        summary['skipped_rows'] = max(0, int(summary.get('skipped_rows') or 0) - ignored)
        result['errors'] = []
        result['ignored_errors'] = errors[:50]
        result['data_quality_note'] = (
            'Trailing worksheet rows without employee identity were ignored as non-data rows. '
            'Duplicates are still shown separately for review before commit.'
        )
        result['data_quality_note_ar'] = (
            'تم تجاهل صفوف نهاية الشيت التي لا تحتوي على اسم أو رقم هوية باعتبارها صفوف غير بيانات. '
            'التكرارات ما زالت ظاهرة للمراجعة قبل الحفظ.'
        )
    return result


def normalize_import_result(result):
    if result.get('sheet_results'):
        cleaned_items = []
        aggregate = result.get('summary') or {}
        aggregate_ignored = 0
        aggregate_errors = 0
        aggregate_skipped = 0
        for item in result.get('sheet_results', []):
            cleaned = _cleanup_sheet_result(item)
            cleaned_items.append(cleaned)
            item_summary = cleaned.get('summary') or {}
            aggregate_ignored += int(item_summary.get('ignored_non_data_rows') or 0)
            aggregate_errors += int(item_summary.get('errors_count') or 0)
            aggregate_skipped += int(item_summary.get('skipped_rows') or 0)
        result['sheet_results'] = cleaned_items
        if aggregate_ignored:
            aggregate['ignored_non_data_rows'] = aggregate_ignored
            aggregate['errors_count'] = aggregate_errors
            aggregate['skipped_rows'] = aggregate_skipped
            result['errors'] = [err for item in cleaned_items for err in item.get('errors', [])][:50]
            result['data_quality_note'] = 'Non-data worksheet rows were ignored. Review duplicates before committing.'
            result['data_quality_note_ar'] = 'تم تجاهل صفوف غير البيانات داخل الشيتات. راجع التكرارات قبل الحفظ.'
        return result
    return _cleanup_sheet_result(result)


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
            result=normalize_import_result(result)
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
class EmployeeViewSet(viewsets.ModelViewSet): queryset=Employee.objects.select_related('health_center').all().order_by('-created_at'); serializer_class=EmployeeSerializer; permission_classes=[permissions.IsAuthenticated,IsAdminOrManagerForWrite]; search_fields=['name','email','employee_number','national_id','mobile','job_title','birth_place','national_address']
class LabTestViewSet(viewsets.ModelViewSet): queryset=LabTest.objects.select_related('employee').all().order_by('-id'); serializer_class=LabTestSerializer; permission_classes=[permissions.IsAuthenticated]
class VaccinationViewSet(viewsets.ModelViewSet): queryset=Vaccination.objects.select_related('employee').all().order_by('-id'); serializer_class=VaccinationSerializer; permission_classes=[permissions.IsAuthenticated]
class ClinicVisitViewSet(viewsets.ModelViewSet): queryset=ClinicVisit.objects.select_related('employee').all().order_by('-id'); serializer_class=ClinicVisitSerializer; permission_classes=[permissions.IsAuthenticated]
class CommitteeReferralViewSet(viewsets.ModelViewSet): queryset=CommitteeReferral.objects.select_related('employee').all().order_by('-id'); serializer_class=CommitteeReferralSerializer; permission_classes=[permissions.IsAuthenticated]
class InjuryCaseViewSet(viewsets.ModelViewSet): queryset=InjuryCase.objects.select_related('employee').all().order_by('-id'); serializer_class=InjuryCaseSerializer; permission_classes=[permissions.IsAuthenticated]
class AuditLogViewSet(viewsets.ReadOnlyModelViewSet): queryset=AuditLog.objects.all().order_by('-created_at'); serializer_class=AuditLogSerializer; permission_classes=[permissions.IsAdminUser]
