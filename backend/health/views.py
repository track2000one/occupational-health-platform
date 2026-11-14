import json
import uuid
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from .importers import process_excel_import
from .models import AuditLog, ClinicVisit, CommitteeReferral, DataImportBatch, Employee, EmployeeArchiveEvent, EmployeeEmploymentChange, EmployeeHealthCard, EmployeeImportReview, EmployeeProfileCompletionEvent, HealthCenter, HealthCenterProfileAuditEvent, OrganizationUnit, InjuryCase, LabTest, OccupationalHealthAssessment, Vaccination
from .serializers import AuditLogSerializer, ClinicVisitSerializer, CommitteeReferralSerializer, DataImportBatchSerializer, EmployeeHealthCardSerializer, EmployeeImportReviewSerializer, EmployeeSerializer, HealthCenterSerializer, InjuryCaseSerializer, LabTestSerializer, OccupationalHealthAssessmentSerializer, PlatformUserSerializer, VaccinationSerializer


class IsAdminOrManagerForWrite(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        if not request.user:
            return False
        if getattr(view, 'action', '') == 'complete_profile':
            if request.user.is_superuser or request.user.is_staff:
                return True
            try:
                role = request.user.health_profile.role
            except Exception:
                role = ''
            return role in {'ohManager', 'clinicDoctor', 'ohDoctor', 'dataEntry'}
        if getattr(view, 'action', '') == 'health_card':
            if request.user.is_superuser:
                return True
            try:
                role = request.user.health_profile.role
            except Exception:
                role = ''
            return request.user.is_staff or role in {
                'ohManager', 'ohDoctor', 'clinicDoctor', 'dataEntry'
            }
        return request.user.is_staff


class CanManageHealthCenters(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        if request.user.is_superuser or request.user.is_staff:
            return True
        try:
            return request.user.health_profile.role == 'ohManager'
        except Exception:
            return False


class CanManageOccupationalHealthAssessments(permissions.BasePermission):
    """Allow authenticated reads and restrict clinical writes to approved roles."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        if request.user.is_superuser or request.user.is_staff:
            return True
        try:
            role = request.user.health_profile.role
        except Exception:
            role = ''
        return role in {'ohManager', 'ohDoctor', 'clinicDoctor', 'dataEntry'}


def truthy(value):
    return str(value).lower() in ('1','true','yes','y','commit')


def imported_total_from_summary(summary):
    return sum(value for key, value in summary.items() if key.startswith('imported_') and isinstance(value, int))


def serialize_date(value):
    return value.isoformat() if value else None


def serialize_decimal(value):
    return str(value) if value is not None else ''


def safe_text(value, default=''):
    if value is None:
        return default
    return str(value)


HEALTH_CARD_SECTIONS = (
    'personal', 'employment', 'physical', 'conditions', 'mental',
    'follow_up', 'vaccinations', 'recommendations', 'additional',
)


def merge_health_card_data(defaults, saved):
    merged = {}
    saved = saved if isinstance(saved, dict) else {}
    for section in HEALTH_CARD_SECTIONS:
        base = defaults.get(section, {})
        override = saved.get(section, {})
        merged[section] = {
            **(base if isinstance(base, dict) else {}),
            **(override if isinstance(override, dict) else {}),
        }
    return merged


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


class HealthCardVerificationView(APIView):
    """Public, privacy-minimised health-card authenticity check used by the QR code."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request, token):
        card = EmployeeHealthCard.from_verification_token(token)
        if not card:
            return Response(
                {
                    'valid': False,
                    'status': 'invalid',
                    'message_ar': 'رمز التحقق غير صالح أو أن البطاقة لم تعد متاحة.',
                    'message_en': 'The verification code is invalid or the card is no longer available.',
                },
                status=status.HTTP_404_NOT_FOUND,
                headers={'Cache-Control': 'no-store'},
            )

        employee = card.employee
        center = employee.health_center
        employee_number = str(employee.employee_number or '')
        masked_employee_number = (f'••••{employee_number[-4:]}' if employee_number else '')
        verification_status = 'approved' if card.is_approved else 'pending'
        return Response(
            {
                'valid': True,
                'status': verification_status,
                'is_approved': bool(card.is_approved),
                'card_number': card.card_number,
                'employee_name': employee.name,
                'employee_number_masked': masked_employee_number,
                'health_center_name_ar': center.name_ar or center.name,
                'health_center_name_en': center.name_en or center.name,
                'issue_date': card.issue_date.isoformat() if card.issue_date else None,
                'next_review_date': card.next_review_date.isoformat() if card.next_review_date else None,
                'updated_at': card.updated_at.isoformat() if card.updated_at else None,
                'message_ar': (
                    'تم التحقق من البطاقة واعتمادها.'
                    if card.is_approved
                    else 'تم التحقق من البطاقة، وحالة الاعتماد ما زالت قيد المراجعة.'
                ),
                'message_en': (
                    'The card is authentic and approved.'
                    if card.is_approved
                    else 'The card is authentic; approval is still pending.'
                ),
                'privacy_notice_ar': 'صفحة التحقق لا تعرض أي تشخيصات أو بيانات صحية سرية.',
                'privacy_notice_en': 'The verification page does not expose diagnoses or confidential health data.',
            },
            headers={'Cache-Control': 'no-store'},
        )

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
            AuditLog.objects.create(user=str(request.user), action='delete_user', model_name='User', record_id=deleted_id)
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
        employee_import_mode=str(request.data.get('employeeImportMode') or '').strip().lower()
        field_mapping=None
        try:
            center_corrections=json.loads(str(request.data.get('centerCorrections') or '{}'))
            if not isinstance(center_corrections, dict) or any(
                not str(row).isdigit() or not str(center).isdigit()
                for row, center in center_corrections.items()
            ):
                raise ValueError()
        except (TypeError, ValueError):
            return Response({'detail':'Invalid health center corrections.'}, status=status.HTTP_400_BAD_REQUEST)
        raw_mapping=request.data.get('fieldMapping')
        if raw_mapping:
            try:
                field_mapping=json.loads(str(raw_mapping))
            except (TypeError, ValueError, json.JSONDecodeError):
                return Response({'fieldMapping':'Field mapping must be valid JSON.'}, status=status.HTTP_400_BAD_REQUEST)
            if not isinstance(field_mapping, dict):
                return Response({'fieldMapping':'Field mapping must be a JSON object.'}, status=status.HTTP_400_BAD_REQUEST)
        if employee_import_mode in ('template', 'flexible') and not uploaded.name.lower().endswith('.xlsx'):
            return Response(
                {'file': 'Employee roster import accepts .xlsx files only. Macro-enabled files are blocked.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result=process_excel_import(
                uploaded,
                sheet_name=sheet_name,
                commit=commit,
                user=request.user,
                employee_import_mode=employee_import_mode,
                field_mapping=field_mapping,
                center_corrections=center_corrections,
            )
            result=normalize_import_result(result)
            summary=result['summary']
            # The expanded employee preview is for the current authenticated
            # response only. Never store row-level personal information in
            # DataImportBatch.summary, even in preview (non-commit) mode.
            batch_summary = result
            if employee_import_mode in ('template', 'flexible'):
                batch_summary = {
                    'mode': result.get('mode'),
                    'file_name': uploaded.name,
                    'sheet_name': result.get('sheet_name'),
                    'summary': dict(summary),
                    'detected_headers': result.get('detected_headers', []),
                    'mapped_fields': result.get('mapped_fields', {}),
                    'missing_required_fields': result.get('missing_required_fields', []),
                    'preview_rows_total': result.get('preview_rows_total', 0),
                    'preview_rows_truncated': result.get('preview_rows_truncated', False),
                    'privacy_note': 'Detailed employee preview is response-only.',
                }
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
                summary=batch_summary,
                created_by=request.user,
            )
            review_ids = result.get('review_ids') or []
            if review_ids:
                EmployeeImportReview.objects.filter(id__in=review_ids, batch__isnull=True).update(batch=batch)
            AuditLog.objects.create(user=str(request.user), action='excel_import_commit' if commit else 'excel_import_preview', model_name='DataImportBatch', record_id=str(batch.id))
            result['batch_id']=batch.id
            response = Response(result)
            if employee_import_mode in ('template', 'flexible'):
                response['Cache-Control'] = 'no-store, private'
            return response
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


class EmployeeImportReviewViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = EmployeeImportReview.objects.select_related(
        'batch', 'conflict_employee', 'activated_employee', 'created_by'
    ).all()
    serializer_class = EmployeeImportReviewSerializer
    permission_classes = [permissions.IsAdminUser]

    def get_queryset(self):
        queryset = super().get_queryset()
        requested_statuses = [
            value.strip()
            for value in str(self.request.query_params.get('status') or '').split(',')
            if value.strip()
        ]
        if requested_statuses:
            queryset = queryset.filter(status__in=requested_statuses)
        # Search only employee names; do not put identity numbers in URLs/logs.
        name_query = str(self.request.query_params.get('search') or '').strip()
        if name_query:
            if len(name_query) > 100:
                return queryset.none()
            queryset = queryset.filter(employee_payload__name__icontains=name_query)
        center_missing = str(self.request.query_params.get('missing_center') or '').lower()
        if center_missing in ('true', '1'):
            queryset = queryset.filter(
                Q(employee_payload__health_center__isnull=True) |
                Q(employee_payload__health_center=None) |
                Q(employee_payload__health_center='') |
                Q(employee_payload__health_center=0)
            )
        return queryset

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Create one real employee from a pending import review.

        basic_only is an explicit escape hatch for invalid OPTIONAL columns,
        never for a missing identity, ambiguous center, or duplicate employee.
        The skipped original values remain in the review's immutable source.
        """
        review = self.get_object()
        basic_only = request.data.get('basic_only', False)
        if type(basic_only) is not bool:
            return Response({'basic_only': 'يجب تحديد وضع الحفظ بشكل صحيح.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if basic_only and request.data.get('confirm_basic_only') is not True:
            return Response({
                'confirm_basic_only': 'يجب تأكيد إدراج البيانات الأساسية فقط، دون نقل الحقول الاختيارية.'
            }, status=status.HTTP_400_BAD_REQUEST)

        # The center is the mandatory, verified master foreign key. Sending
        # PK=0, an inactive center, or a text label cannot create an employee.
        raw_center_id = request.data.get('health_center')
        try:
            center_id = int(raw_center_id)
        except (TypeError, ValueError):
            center_id = 0
        if center_id <= 0 or not HealthCenter.objects.filter(pk=center_id, is_active=True).exists():
            return Response({
                'health_center': 'يرجى اختيار مركز صحي مسجل ونشط من القائمة قبل تفعيل البطاقة.'
            }, status=status.HTTP_400_BAD_REQUEST)

        skipped_optional = []
        if basic_only:
            # Start with the mandatory identity/center, then save every optional
            # employment/contact field that validates independently. Bad values
            # stay in the original review for later correction. We never infer
            # clinical assessments or assign an unapproved organizational unit.
            submitted = {
                key: request.data.get(key)
                for key in ('name', 'national_id', 'health_center')
            }
            optional_fields = (
                'employee_number', 'email', 'mobile', 'national_address',
                'birth_place', 'gender', 'marital_status', 'job_title',
                'job_title_en', 'current_job', 'nationality', 'children_count',
                'date_of_birth', 'appointment_date',
            )
            for field in optional_fields:
                value = request.data.get(field)
                if value in (None, ''):
                    continue
                candidate = dict(submitted)
                candidate[field] = value
                candidate_serializer = EmployeeSerializer(
                    data=candidate, context={'request': request},
                )
                if candidate_serializer.is_valid():
                    submitted = candidate
                else:
                    skipped_optional.append(field)
        else:
            submitted = request.data

        try:
            with transaction.atomic():
                locked_review = EmployeeImportReview.objects.select_for_update().get(
                    pk=review.pk,
                )
                if locked_review.status not in ('pending', 'conflict'):
                    return Response({
                        'detail': 'تمت معالجة هذه البطاقة سابقًا؛ لا يمكن إضافتها مرتين.'
                    }, status=status.HTTP_409_CONFLICT)

                # Review edits must never detach an import that has already
                # been matched to an existing employee (by ID, email or number).
                # Comparisons are read-only; changes require a separate,
                # authorized employee update/transfer workflow.
                if (locked_review.conflict_employee_id is not None
                        or (locked_review.employee_payload or {}).get('_import_classification') == 'existing'):
                    return Response({
                        'detail': 'هذه البطاقة مرتبطة بموظف مسجل مسبقًا. '
                                  'راجع الفروقات ولا تنشئ سجلًا جديدًا؛ '
                                  'تصحيح السجل القائم يتطلب إجراءً مستقلًا.'
                    }, status=status.HTTP_409_CONFLICT)

                employee_serializer = EmployeeSerializer(
                    data=submitted, context={'request': request},
                )
                employee_serializer.is_valid(raise_exception=True)
                employee = employee_serializer.save()

                original_review_payload = locked_review.employee_payload
                locked_review.employee_payload = dict(employee_serializer.data)
                if basic_only:
                    # Preserve previously parsed optional values in the original
                    # review, even if the uploaded Excel is no longer available.
                    locked_review.employee_payload['_original_import_payload'] = original_review_payload
                    locked_review.warnings = list(locked_review.warnings or []) + [
                        'تم إدراج الموظف بالحد الأدنى من البيانات مع الحقول الاختيارية الصالحة؛ '
                        'بقية بيانات المصدر محفوظة بالمراجعة الأصلية للاستكمال.'
                    ]
                    if skipped_optional:
                        locked_review.warnings.append(
                            'حقول لم تُنقل لعدم اجتياز التحقق: ' + ', '.join(skipped_optional)
                        )
                locked_review.status = 'activated'
                locked_review.activated_employee = employee
                locked_review.resolved_by = request.user
                locked_review.resolved_at = timezone.now()
                locked_review.issues = []
                updated = [
                    'employee_payload', 'status', 'activated_employee',
                    'resolved_by', 'resolved_at', 'issues', 'updated_at',
                ]
                if basic_only:
                    updated.append('warnings')
                locked_review.save(update_fields=updated)
                AuditLog.objects.create(
                    user=str(request.user),
                    action=('activate_employee_import_review_basic' if basic_only
                            else 'activate_employee_import_review'),
                    model_name='EmployeeImportReview',
                    record_id=str(locked_review.id),
                )
        except IntegrityError:
            return Response({
                'detail': 'تعذر إضافة الموظف بسبب تعارض فريد (الهوية أو البيانات). '
                          'راجع السجل الموجود ولا تنشئ موظفًا مكررًا.'
            }, status=status.HTTP_409_CONFLICT)

        return Response({
            'mode': 'basic_only' if basic_only else 'full',
            'review': EmployeeImportReviewSerializer(locked_review).data,
            'employee': EmployeeSerializer(employee, context={'request': request}).data,
            'skipped_optional_fields': skipped_optional,
            'notice': ('أُضيف الموظف بالبيانات الأساسية والحقول الاختيارية الصالحة. '
                       'القيم غير الصالحة محفوظة في سجل المراجعة للاستكمال لاحقًا.'
                       if basic_only else ''),
        })

    @action(detail=True, methods=['post'])
    def discard(self, request, pk=None):
        review = self.get_object()
        if review.status == 'activated':
            return Response(
                {'detail': 'An activated review cannot be discarded.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        review.status = 'discarded'
        review.resolved_by = request.user
        review.resolved_at = timezone.now()
        review.save(update_fields=['status', 'resolved_by', 'resolved_at', 'updated_at'])
        AuditLog.objects.create(
            user=str(request.user),
            action='discard_employee_import_review',
            model_name='EmployeeImportReview',
            record_id=str(review.id),
        )
        return Response(EmployeeImportReviewSerializer(review).data)


class HealthCenterViewSet(viewsets.ModelViewSet):
    serializer_class = HealthCenterSerializer
    permission_classes = [permissions.IsAuthenticated, CanManageHealthCenters]

    def get_queryset(self):
        queryset = HealthCenter.objects.all().order_by('region', 'city', 'name')
        archived = str(self.request.query_params.get('archived') or '').lower() == 'true'
        if archived and self.request.user.is_superuser:
            queryset = queryset.filter(is_archived=True)
        else:
            queryset = queryset.filter(is_archived=False)
        active = str(self.request.query_params.get('active') or '').lower()
        if active in {'1', 'true', 'yes'}:
            queryset = queryset.filter(is_active=True)
        elif active in {'0', 'false', 'no'}:
            queryset = queryset.filter(is_active=False)
        region = str(self.request.query_params.get('region') or '').strip()
        city = str(self.request.query_params.get('city') or '').strip()
        building_type = str(self.request.query_params.get('building_type') or '').strip()
        if region:
            queryset = queryset.filter(region__iexact=region)
        if city:
            queryset = queryset.filter(city__iexact=city)
        if building_type:
            queryset = queryset.filter(building_type=building_type)
        return queryset

    PROFILE_FIELDS = (
        'name', 'name_ar', 'name_en', 'code', 'region', 'city',
        'district', 'manager_name', 'building_type', 'notes', 'is_active',
        'proposed_parent_name', 'proposed_sector_name',
        'organizational_source_reference', 'supporting_document_reference',
    )

    @staticmethod
    def profile_snapshot(center):
        return {field: getattr(center, field) for field in HealthCenterViewSet.PROFILE_FIELDS}

    @transaction.atomic
    def perform_create(self, serializer):
        center = serializer.save()
        HealthCenterProfileAuditEvent.objects.create(
            center=center, action='create_profile',
            prior_state={}, new_state=self.profile_snapshot(center),
            performed_by=self.request.user,
            evidence_reference=center.supporting_document_reference,
        )
        AuditLog.objects.create(
            user=str(self.request.user), action='create_health_center',
            model_name='HealthCenter', record_id=str(center.id),
        )

    @transaction.atomic
    def perform_update(self, serializer):
        before = self.profile_snapshot(serializer.instance)
        center = serializer.save()
        after = self.profile_snapshot(center)
        if before != after:
            HealthCenterProfileAuditEvent.objects.create(
                center=center, action='update_profile', prior_state=before,
                new_state=after, performed_by=self.request.user,
                evidence_reference=center.supporting_document_reference,
            )
        AuditLog.objects.create(
            user=str(self.request.user), action='update_health_center',
            model_name='HealthCenter', record_id=str(center.id),
        )

    @action(detail=True, methods=['get', 'post'], url_path='units')
    def units(self, request, pk=None):
        """Distinct center-specific organization unit drafts. No implicit approval."""
        center = self.get_object()
        units = OrganizationUnit.objects.filter(
            Q(health_center=center) | Q(parent__health_center=center),
            kind=OrganizationUnit.Kind.UNIT,
            is_active=True,
        ).distinct().order_by('name', 'pk')
        if request.method == 'GET':
            return Response({
                'center_id': center.pk,
                'results': [{
                    'id': item.pk, 'name': item.name, 'code': item.code,
                    'parent_name': item.parent.name if item.parent_id else '',
                    'is_approved': item.is_approved, 'review_status':
                        'approved' if item.is_approved else 'pending',
                    'source_sheet': item.source_sheet,
                } for item in units.select_related('parent')[:250]],
            })
        if not CanManageHealthCenters().has_permission(request, self):
            return Response({'detail': 'Not allowed to add a unit.'},
                            status=status.HTTP_403_FORBIDDEN)
        name = ' '.join(str(request.data.get('name') or '').strip().split())
        source_reference = str(request.data.get('source_reference') or '').strip()
        if not 3 <= len(name) <= 180:
            return Response({'name': 'Name must be between 3 and 180 characters.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if len(source_reference) > 250:
            return Response({'source_reference': 'Reference too long.'}, status=400)
        if any(item.name.strip().casefold() == name.casefold() for item in units):
            return Response({'detail': 'This unit already belongs to the center.'}, status=409)
        with transaction.atomic():
            parent = OrganizationUnit.objects.filter(
                kind=OrganizationUnit.Kind.CENTER,
                health_center=center, is_active=True,
            ).order_by('-is_approved', 'pk').first()
            item = OrganizationUnit.objects.create(
                code='HC-U-' + uuid.uuid4().hex[:20].upper(),
                name=name, kind=OrganizationUnit.Kind.UNIT, parent=parent,
                health_center=center, source_path=f'{center.name_ar or center.name} / {name}',
                source_sheet='إضافة يدوية للمراجعة',
                source_rows=source_reference, is_approved=False, is_active=True,
            )
            HealthCenterProfileAuditEvent.objects.create(
                center=center, action='create_draft_unit', performed_by=request.user,
                prior_state={}, new_state={
                    'unit_id': item.pk, 'name': item.name, 'code': item.code,
                    'is_approved': False,
                }, evidence_reference=source_reference,
            )
            AuditLog.objects.create(
                user=str(request.user), action='create_health_center_draft_unit',
                model_name='OrganizationUnit', record_id=str(item.pk),
            )
        return Response({
            'id': item.pk, 'name': item.name, 'code': item.code,
            'is_approved': False, 'review_status': 'pending',
            'notice': 'Unit saved as a separate draft; no employee or organization approvals were changed.',
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='verify-reference')
    def verify_reference(self, request, pk=None):
        """Center identity verification, independent of sector and staff assignments."""
        if not request.user.is_superuser:
            return Response({'detail': 'Only system superuser can verify a center.'},
                            status=status.HTTP_403_FORBIDDEN)
        center = self.get_object()
        decision = str(request.data.get('decision') or '').strip()
        evidence = str(request.data.get('approval_reference') or '').strip()
        reason = str(request.data.get('reason') or '').strip()
        if decision not in {'approve', 'revoke'} or request.data.get('confirmed') is not True:
            return Response({'detail': 'Documented decision and explicit confirmation required.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if len(reason) < 15 or len(reason) > 500 or len(evidence) < 4 or len(evidence) > 250:
            return Response({'detail': 'Reason (15–500) and evidence reference (4–250) required.'}, status=400)
        with transaction.atomic():
            center = HealthCenter.objects.select_for_update().get(pk=center.pk)
            before = {
                'approval_status': center.approval_status,
                'approval_reference': center.approval_reference,
                'approved_at': center.approved_at.isoformat() if center.approved_at else None,
            }
            if decision == 'approve':
                center.approval_status = HealthCenter.ApprovalStatus.APPROVED
                center.approval_reference = evidence
                center.approved_by = request.user
                center.approved_at = timezone.now()
            else:
                center.approval_status = HealthCenter.ApprovalStatus.REVOKED
                center.approval_reference = ''
                center.approved_by = None
                center.approved_at = None
            center.save(update_fields=[
                'approval_status', 'approval_reference', 'approved_by',
                'approved_at', 'updated_at',
            ])
            HealthCenterProfileAuditEvent.objects.create(
                center=center, action='verify_center_reference_' + decision,
                prior_state=before,
                new_state={
                    'approval_status': center.approval_status,
                    'approval_reference': center.approval_reference,
                    'approved_at': center.approved_at.isoformat() if center.approved_at else None,
                    'reason': reason,
                },
                evidence_reference=evidence, performed_by=request.user,
            )
            AuditLog.objects.create(
                user=str(request.user), action='verify_center_reference_' + decision,
                model_name='HealthCenter', record_id=str(center.pk),
            )
        return Response({
            'id': center.pk, 'approval_status': center.approval_status,
            'approval_reference': center.approval_reference,
            'notice': 'Only center identity approval changed; sector and employees unchanged.',
        })

    def destroy(self, request, *args, **kwargs):
        # Legacy DELETE must not bypass explicit preview, reason, reference
        # validation, dual confirmation and reversible archive audit.
        return Response({
            'detail': 'Use health-centers/archive/ with preview, reason and confirmation.',
        }, status=status.HTTP_405_METHOD_NOT_ALLOWED)


class EmployeeViewSet(viewsets.ModelViewSet):
    queryset=Employee.objects.select_related('health_center', 'health_card').all().order_by('-created_at')
    serializer_class=EmployeeSerializer
    permission_classes=[permissions.IsAuthenticated,IsAdminOrManagerForWrite]
    search_fields=['name','email','employee_number','national_id','mobile','job_title','birth_place','national_address']

    @action(detail=True, methods=['post'], url_path='complete-profile')
    def complete_profile(self, request, pk=None):
        """Identity-checked, missing-fields-only demographic completion.

        Clinical staff can complete administrative gaps without transferring
        an existing center, overwriting verified data, or touching clinical data.
        """
        role = ''
        try:
            role = request.user.health_profile.role
        except Exception:
            pass
        permitted = request.user.is_superuser or request.user.is_staff or role in {
            'ohManager', 'clinicDoctor', 'ohDoctor', 'dataEntry',
        }
        if not permitted:
            return Response({'detail': 'ليس لديك صلاحية استكمال بيانات الموظف.'}, status=403)
        if request.data.get('identity_checked') is not True:
            return Response({'identity_checked': 'تحقق من هوية المراجع أولًا وأكد ذلك صراحة.'},
                            status=400)
        reason = str(request.data.get('reason') or '').strip()
        if not 10 <= len(reason) <= 500:
            return Response({'reason': 'يلزم سبب توثيقي من 10 إلى 500 حرف.'}, status=400)
        supplied = request.data.get('fields', {})
        allowed_fields = {
            'health_center', 'employee_number', 'email', 'mobile',
            'national_address', 'date_of_birth', 'birth_place',
            'gender', 'marital_status', 'nationality', 'job_title',
            'current_job', 'appointment_date', 'job_title_en',
        }
        if not isinstance(supplied, dict) or any(k not in allowed_fields for k in supplied):
            return Response({'fields': 'أُرسلت حقول غير مسموح بتعديلها من هذه الشاشة.'}, status=400)
        changes = {
            k: v for k, v in supplied.items()
            if v not in ('', None)
        }
        if not changes:
            return Response({'fields': 'اختر حقلًا ناقصًا واحدًا على الأقل لاستكماله.'}, status=400)
        with transaction.atomic():
            employee = Employee.objects.select_for_update().get(
                pk=self.get_object().pk, is_archived=False,
            )
            # Existing values can only be corrected by a separate authorized
            # workflow. Here we complete empty fields and first center linkage.
            for field, new_value in changes.items():
                current = getattr(employee, field + '_id' if field == 'health_center' else field)
                if current not in (None, ''):
                    return Response({
                        'detail': f'الحقل {field} مسجل مسبقًا؛ التعديل يتطلب إجراء تصحيح منفصل.'
                    }, status=409)
                if field == 'health_center':
                    try:
                        center = HealthCenter.objects.get(pk=int(new_value), is_active=True,
                                                          is_archived=False)
                    except (TypeError, ValueError, HealthCenter.DoesNotExist):
                        return Response({'health_center': 'المركز المختار غير موجود أو غير نشط.'},
                                        status=400)
                    changes[field] = center.pk
            serializer = EmployeeSerializer(
                employee, data=changes, partial=True, context={'request': request},
            )
            serializer.is_valid(raise_exception=True)
            old_center_id = employee.health_center_id
            updated = serializer.save()
            if updated.health_center_id:
                updated.registration_status = 'verified'
                updated.save(update_fields=['registration_status', 'updated_at'])
            EmployeeProfileCompletionEvent.objects.create(
                employee=updated, changed_fields=sorted(changes.keys()),
                reason=reason, identity_checked=True,
                previous_center_id=old_center_id,
                resulting_center_id=updated.health_center_id,
                performed_by=request.user,
            )
            AuditLog.objects.create(
                user=str(request.user), action='employee_profile_completed_at_visit',
                model_name='Employee', record_id=str(updated.pk),
            )
        result = Response({
            'employee': EmployeeSerializer(updated, context={'request': request}).data,
            'completed_fields': sorted(changes.keys()),
            'notice': 'تم استكمال الحقول الناقصة دون تعديل أي بيانات مثبتة سابقًا.',
        })
        result['Cache-Control'] = 'private, no-store'
        return result

    @staticmethod
    def _can_archive_employee(user):
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        if not user.is_staff:
            return False
        try:
            return user.health_profile.role == 'systemAdmin'
        except Exception:
            return False

    def get_queryset(self):
        queryset = super().get_queryset()
        # An archived record remains stored for medical and audit history.
        # Only the system administrator may view archived records in a separate
        # registry. Never expose them through the normal active employee list.
        if self.action == 'restore':
            queryset = queryset.filter(is_archived=True)
        elif (self.action in ('list', 'report') and
              str(self.request.query_params.get('archived') or '').lower() == 'true' and
              self._can_archive_employee(self.request.user)):
            queryset = queryset.filter(is_archived=True)
        else:
            queryset = queryset.filter(is_archived=False)
        requested_status = str(self.request.query_params.get('employment_status') or '').strip()
        if requested_status in Employee.EmploymentStatus.values:
            queryset = queryset.filter(employment_status=requested_status)
        center_id = str(self.request.query_params.get('health_center_id') or '').strip()
        if center_id.isdigit():
            queryset = queryset.filter(health_center_id=int(center_id))
        query = str(self.request.query_params.get('search') or '').strip()
        if query:
            queryset = queryset.filter(
                Q(name__icontains=query) | Q(employee_number__icontains=query) |
                Q(national_id__icontains=query) | Q(job_title__icontains=query) |
                Q(email__icontains=query) | Q(mobile__icontains=query)
            )
        # Completeness refers only to administrative fields, not medical status.
        # Filtering in SQL avoids showing misleading page-only counts.
        completeness = str(self.request.query_params.get('completion') or '').strip()
        if completeness in ('missing', 'complete'):
            fields = (
                'employee_number', 'gender', 'nationality', 'birth_place',
                'marital_status', 'mobile', 'email', 'national_address',
                'job_title', 'current_job',
            )
            incomplete = (
                Q(date_of_birth__isnull=True) |
                Q(appointment_date__isnull=True) |
                Q(health_center__isnull=True) |
                Q(registration_status='provisional')
            )
            for field in fields:
                incomplete |= Q(**{field + '__isnull': True}) | Q(**{field: ''})
            queryset = (queryset.filter(incomplete) if completeness == 'missing'
                        else queryset.exclude(incomplete))
        # Source roster status is separate from approved employment status.
        # Leave leave/study/temporary conditions distinct from retirement.
        source_category = str(self.request.query_params.get('source_category') or '').strip()
        if source_category == 'active':
            queryset = queryset.filter(roster_source_status='تعيين نشط')
        elif source_category == 'other':
            queryset = queryset.exclude(
                roster_source_status__in=['', 'تعيين نشط']
            )
        sort_key = str(self.request.query_params.get('sort') or 'newest').strip()
        safe_orders = {
            'newest': ('-created_at', '-pk'),
            'oldest': ('created_at', 'pk'),
            'name': ('name', 'pk'),
            'employee_number': ('employee_number', 'pk'),
            'center': ('health_center__name', 'name', 'pk'),
            'job_title': ('job_title', 'name', 'pk'),
            'age_asc': ('age', 'name', 'pk'),
            'age_desc': ('-age', 'name', 'pk'),
        }
        return queryset.order_by(*safe_orders.get(sort_key, safe_orders['newest']))

    @action(detail=False, methods=['get'], url_path='report')
    def report(self, request):
        """Read-only employee directory report across ALL matching pages.

        Reports are deliberately separate from the 25-record list pagination.
        The default response contains only a masked national ID. Full identity
        requires explicit opt-in AND the privileged sensitive-data reporting role.
        Clinical data is excluded in both modes.
        """
        user = request.user
        try:
            role = user.health_profile.role
        except Exception:
            role = ''
        allowed = user.is_superuser or role in (
            'systemAdmin', 'ohManager', 'reportsOfficer', 'executive',
        )
        if not allowed:
            return Response(
                {'detail': 'Employee report access requires an approved reporting role.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        identity_mode = str(
            request.query_params.get('include_full_national_id') or ''
        ).strip().lower()
        if identity_mode not in ('', 'false', '0', 'true', '1'):
            return Response(
                {'include_full_national_id': 'Use true or false.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        full_identity = identity_mode in ('true', '1')
        # Keep this aligned with VIEW_SENSITIVE_DATA ∩ EXPORT_REPORTS:
        # systemAdmin and ohManager are the only roles with both privileges.
        can_export_full_identity = (
            user.is_superuser or role in ('systemAdmin', 'ohManager')
        )
        if full_identity and not can_export_full_identity:
            return Response(
                {'detail': 'Full national ID requires sensitive-data reporting permission.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if str(request.query_params.get('archived') or '').lower() == 'true' and (
            not self._can_archive_employee(user)
        ):
            return Response(
                {'detail': 'Only a system administrator can report on archived employees.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        queryset = self.get_queryset()
        gender = str(request.query_params.get('gender') or '').strip()
        if gender:
            if gender not in ('male', 'female'):
                return Response({'gender': 'Invalid gender filter.'},
                                status=status.HTTP_400_BAD_REQUEST)
            queryset = queryset.filter(gender=gender)
        job_title = str(request.query_params.get('job_title') or '').strip()
        if len(job_title) > 120:
            return Response({'job_title': 'Job title filter is too long.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if job_title:
            queryset = queryset.filter(job_title__icontains=job_title)
        for param, lookup in (
            ('created_from', 'created_at__date__gte'),
            ('created_to', 'created_at__date__lte'),
        ):
            raw = str(request.query_params.get(param) or '').strip()
            if not raw:
                continue
            parsed = parse_date(raw)
            if not parsed:
                return Response({param: 'Date must be YYYY-MM-DD.'},
                                status=status.HTTP_400_BAD_REQUEST)
            queryset = queryset.filter(**{lookup: parsed})

        total = queryset.count()
        # Refuse incomplete exports rather than quietly printing only the
        # first N employees. The user may narrow the filters and retry.
        if total > 5000:
            return Response(
                {'detail': 'More than 5,000 employees matched. Narrow the filters before generating the report.',
                 'count': total},
                status=status.HTTP_400_BAD_REQUEST,
            )
        records = []
        for employee in queryset.select_related('health_center').iterator(chunk_size=200):
            nid = ''.join(char for char in str(employee.national_id or '') if char.isdigit())
            masked_nid = (
                f'{nid[:2]}••••{nid[-4:]}' if len(nid) >= 6 else '—'
            )
            record = {
                'id': employee.pk,
                'name': employee.name,
                'employee_number': employee.employee_number or '',
                'national_id_masked': masked_nid,
                'health_center_id': employee.health_center_id,
                'health_center': (
                    employee.health_center.name_ar or employee.health_center.name
                    if employee.health_center else ''
                ),
                'registration_status': employee.registration_status,
                'job_title': employee.job_title or '',
                'current_job': employee.current_job or '',
                'gender': employee.gender or '',
                'employment_status': employee.employment_status,
                'roster_source_status': employee.roster_source_status or '',
                'age': employee.age or None,
                'years_of_experience': (
                    str(employee.years_of_experience)
                    if employee.years_of_experience is not None else ''
                ),
                'mobile': employee.mobile or '',
                'email': employee.email or '',
                'created_at': employee.created_at.date().isoformat(),
                'archived': bool(employee.is_archived),
            }
            if full_identity:
                record['national_id_full'] = str(employee.national_id or '')
            records.append(record)
        AuditLog.objects.create(
            user=str(user),
            action=('view_employee_report_full_national_id' if full_identity
                    else 'view_employee_registry_report'),
            model_name='Employee', record_id=str(total),
        )
        response = Response({
            'count': total,
            'results': records,
            'identity_mode': 'full' if full_identity else 'masked',
            'generated_at': timezone.now().isoformat(),
            'generated_by': user.get_username(),
            'scope': ('archived' if str(request.query_params.get('archived') or '').lower() == 'true'
                      else 'active'),
        })
        # Browsers and intermediate proxies must not cache full identity reports.
        response['Cache-Control'] = 'private, no-store, max-age=0'
        response['Pragma'] = 'no-cache'
        return response

    def destroy(self, request, *args, **kwargs):
        """Never physically cascade-delete a record with health history."""
        return Response(
            {'detail': 'Permanent deletion is disabled. Use POST /employees/{id}/archive/ with a documented reason.'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    @action(detail=True, methods=['post'], url_path='archive')
    def archive(self, request, pk=None):
        """Remove a worker from the active registry without destroying health history."""
        if not self._can_archive_employee(request.user):
            return Response({'detail': 'Only a system administrator may archive an employee.'},
                            status=status.HTTP_403_FORBIDDEN)
        reason = str(request.data.get('reason') or '').strip()
        if not 10 <= len(reason) <= 500:
            return Response({'reason': 'A specific deletion reason of 10–500 characters is required.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if request.data.get('confirmed') is not True:
            return Response({'confirmed': 'You must confirm the non-destructive removal.'},
                            status=status.HTTP_400_BAD_REQUEST)
        employee_id = self.get_object().pk
        with transaction.atomic():
            employee = Employee.objects.select_for_update().get(pk=employee_id)
            if employee.is_archived:
                return Response({'detail': 'This employee is already archived.'},
                                status=status.HTTP_409_CONFLICT)
            employee.is_archived = True
            employee.archive_reason = reason
            employee.archived_at = timezone.now()
            employee.archived_by = request.user
            employee.save(update_fields=[
                'is_archived', 'archive_reason', 'archived_at',
                'archived_by', 'updated_at',
            ])
            EmployeeArchiveEvent.objects.create(
                employee=employee, action=EmployeeArchiveEvent.Action.ARCHIVE,
                reason=reason, performed_by=request.user,
            )
            AuditLog.objects.create(
                user=str(request.user), action='archive_employee',
                model_name='Employee', record_id=str(employee.pk),
            )
        return Response({
            'employee_id': employee.pk,
            'status': 'archived',
            'detail': 'The employee was removed from the active registry. Medical history was preserved.',
        })

    @action(detail=True, methods=['post'], url_path='restore')
    def restore(self, request, pk=None):
        """Restore a previously archived employee, with an audit-trail reason."""
        if not self._can_archive_employee(request.user):
            return Response({'detail': 'Only a system administrator may restore an employee.'},
                            status=status.HTTP_403_FORBIDDEN)
        reason = str(request.data.get('reason') or '').strip()
        if not 10 <= len(reason) <= 500:
            return Response({'reason': 'A restoration reason of 10–500 characters is required.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if request.data.get('confirmed') is not True:
            return Response({'confirmed': 'You must confirm restoration.'},
                            status=status.HTTP_400_BAD_REQUEST)
        employee_id = self.get_object().pk
        with transaction.atomic():
            employee = Employee.objects.select_for_update().get(pk=employee_id)
            if not employee.is_archived:
                return Response({'detail': 'This employee is not archived.'},
                                status=status.HTTP_409_CONFLICT)
            employee.is_archived = False
            employee.archive_reason = ''
            employee.archived_at = None
            employee.archived_by = None
            employee.save(update_fields=[
                'is_archived', 'archive_reason', 'archived_at',
                'archived_by', 'updated_at',
            ])
            EmployeeArchiveEvent.objects.create(
                employee=employee, action=EmployeeArchiveEvent.Action.RESTORE,
                reason=reason, performed_by=request.user,
            )
            AuditLog.objects.create(
                user=str(request.user), action='restore_employee',
                model_name='Employee', record_id=str(employee.pk),
            )
        return Response({
            'employee_id': employee.pk,
            'status': 'restored',
            'detail': 'The employee was restored to the active registry with medical history intact.',
        })

    @action(detail=True, methods=['post'], url_path='transfer-center')
    def transfer_center(self, request, pk=None):
        """Move an active employee internally; they remain active, with the previous center preserved."""
        if not request.user.is_staff and not request.user.is_superuser:
            return Response({'detail': 'Center transfer approval requires a staff administrator.'},
                            status=status.HTTP_403_FORBIDDEN)
        reference = str(request.data.get('evidence_reference') or '').strip()
        if len(reference) < 3:
            return Response({'evidence_reference': 'A formal transfer decision reference is required.'},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            effective_date = parse_date(str(request.data.get('effective_date') or ''))
        except ValueError:
            effective_date = None
        if not effective_date or effective_date > date.today():
            return Response({'effective_date': 'Provide a valid effective date on or before today.'},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            center_id = int(request.data.get('new_health_center_id'))
        except (TypeError, ValueError):
            return Response({'new_health_center_id': 'A destination center is required.'},
                            status=status.HTTP_400_BAD_REQUEST)
        center = HealthCenter.objects.filter(pk=center_id, is_active=True).first()
        if not center:
            return Response({'new_health_center_id': 'Select an existing active center.'},
                            status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            employee = Employee.objects.select_for_update().get(pk=self.get_object().pk)
            if employee.employment_status != Employee.EmploymentStatus.ACTIVE:
                return Response({'status': 'Only active employees may transfer internally.'},
                                status=status.HTTP_400_BAD_REQUEST)
            if employee.health_center_id == center.pk:
                return Response({'new_health_center_id': 'Employee already belongs to this center.'},
                                status=status.HTTP_400_BAD_REQUEST)
            latest = employee.employment_changes.order_by('-effective_date').first()
            if latest and effective_date < latest.effective_date:
                return Response({'effective_date': 'Date precedes the last approved change.'},
                                status=status.HTTP_400_BAD_REQUEST)
            previous_center = employee.health_center
            employee.health_center = center
            employee.save(update_fields=['health_center', 'updated_at'])
            change = EmployeeEmploymentChange.objects.create(
                employee=employee, previous_status=Employee.EmploymentStatus.ACTIVE,
                new_status=Employee.EmploymentStatus.ACTIVE,
                effective_date=effective_date, evidence_reference=reference,
                notes=str(request.data.get('notes') or '').strip(),
                previous_health_center=previous_center,
                new_health_center=center, approved_by=request.user,
            )
            AuditLog.objects.create(
                user=str(request.user), action='approve_employee_center_transfer',
                model_name='Employee', record_id=str(employee.pk),
            )
        return Response({'employee_id': employee.pk,
                         'employment_status': employee.employment_status,
                         'health_center_id': center.pk,
                         'employment_change_id': change.pk})

    @action(detail=True, methods=['get', 'post'], url_path='employment-status')
    def employment_status(self, request, pk=None):
        """Require an explicit approved source; never infer retirement from missing imports."""
        if not request.user.is_staff and not request.user.is_superuser:
            return Response({'detail': 'Employment status approval requires a staff administrator.'},
                            status=status.HTTP_403_FORBIDDEN)

        employee = self.get_object()
        if request.method == 'GET':
            history = employee.employment_changes.select_related(
                'previous_health_center', 'new_health_center', 'approved_by'
            ).all()
            return Response({
                'employee_id': employee.pk,
                'employment_status': employee.employment_status,
                'history': [{
                    'id': item.pk,
                    'from_status': item.previous_status,
                    'to_status': item.new_status,
                    'effective_date': item.effective_date.isoformat(),
                    'evidence_reference': item.evidence_reference,
                    'previous_health_center': (
                        item.previous_health_center.name if item.previous_health_center else None
                    ),
                    'new_health_center': (
                        item.new_health_center.name if item.new_health_center else None
                    ),
                    'approved_by': item.approved_by_id,
                    'created_at': item.created_at.isoformat(),
                } for item in history],
            })

        target = str(request.data.get('status') or '').strip()
        if target not in Employee.EmploymentStatus.values:
            return Response({'status': 'Invalid employment status.'},
                            status=status.HTTP_400_BAD_REQUEST)
        reference = str(request.data.get('evidence_reference') or '').strip()
        if len(reference) < 3:
            return Response({'evidence_reference': 'A formal decision or document reference is required.'},
                            status=status.HTTP_400_BAD_REQUEST)
        raw_date = str(request.data.get('effective_date') or '')
        try:
            effective_date = parse_date(raw_date)
        except ValueError:
            effective_date = None
        if not effective_date or effective_date > date.today():
            return Response({'effective_date': 'Provide an effective date on or before today (YYYY-MM-DD).'},
                            status=status.HTTP_400_BAD_REQUEST)

        requested_center_id = request.data.get('new_health_center_id')
        requested_center = None
        if requested_center_id:
            try:
                center_pk = int(requested_center_id)
            except (TypeError, ValueError):
                return Response({'new_health_center_id': 'Select an existing active center.'},
                                status=status.HTTP_400_BAD_REQUEST)
            requested_center = HealthCenter.objects.filter(
                pk=center_pk, is_active=True
            ).first()
            if not requested_center:
                return Response({'new_health_center_id': 'Select an existing active center.'},
                                status=status.HTTP_400_BAD_REQUEST)
        if target in (
            Employee.EmploymentStatus.RETIRED, Employee.EmploymentStatus.SEPARATED,
            Employee.EmploymentStatus.TRANSFERRED, Employee.EmploymentStatus.UNDER_REVIEW,
        ) and requested_center:
            return Response({'new_health_center_id': 'This status change does not reassign a center. Use transfer-center for internal moves.'},
                            status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            employee = Employee.objects.select_for_update().get(pk=employee.pk)
            if employee.employment_status == target:
                return Response({'status': 'This employee already has the requested status.'},
                                status=status.HTTP_400_BAD_REQUEST)
            latest = employee.employment_changes.order_by('-effective_date').first()
            if latest and effective_date < latest.effective_date:
                return Response({'effective_date': 'Date precedes the last approved status change.'},
                                status=status.HTTP_400_BAD_REQUEST)

            prior_status = employee.employment_status
            prior_center = employee.health_center
            if requested_center:
                employee.health_center = requested_center
            employee.employment_status = target
            employee.save(update_fields=['employment_status', 'health_center', 'updated_at'])
            record = EmployeeEmploymentChange.objects.create(
                employee=employee,
                previous_status=prior_status,
                new_status=target,
                effective_date=effective_date,
                evidence_reference=reference,
                notes=str(request.data.get('notes') or '').strip(),
                previous_health_center=prior_center,
                new_health_center=requested_center or employee.health_center,
                approved_by=request.user,
            )
            AuditLog.objects.create(
                user=str(request.user),
                action='approve_employee_employment_status',
                model_name='Employee',
                record_id=str(employee.pk),
            )
        return Response({
            'employee_id': employee.pk,
            'employment_status': employee.employment_status,
            'employment_change_id': record.pk,
        })

    def _health_card_role(self, request):
        if request.user.is_superuser:
            return 'systemAdmin'
        try:
            return request.user.health_profile.role
        except Exception:
            return 'systemAdmin' if request.user.is_staff else ''

    def _can_view_health_card(self, request, employee):
        role = self._health_card_role(request)
        if role in {
            'systemAdmin', 'ohManager', 'ohDoctor', 'clinicDoctor', 'labOfficer',
            'vaccinationOfficer', 'needleStickOfficer', 'medicalCommitteeOfficer',
            'centerManager', 'executive', 'dataEntry', 'dataQuality', 'reportsOfficer',
        }:
            return True
        if role == 'employee':
            try:
                profile = request.user.health_profile
                return (
                    (profile.employee_number and profile.employee_number == employee.employee_number)
                    or (profile.national_id and profile.national_id == employee.national_id)
                )
            except Exception:
                return False
        return False

    def _can_write_health_card(self, request):
        return self._health_card_role(request) in {
            'systemAdmin', 'ohManager', 'ohDoctor', 'clinicDoctor', 'dataEntry'
        }

    @action(detail=True, methods=['get', 'put', 'patch', 'delete'])
    def health_card(self, request, pk=None):
        employee = self.get_object()
        if not self._can_view_health_card(request, employee):
            return Response(
                {'detail': 'You do not have permission to view this health card.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        card = EmployeeHealthCard.objects.filter(employee=employee).first()
        if request.method == 'DELETE':
            if not self._can_write_health_card(request):
                return Response(
                    {'detail': 'You do not have permission to delete this health card.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if card:
                deleted_id = str(card.id)
                card.delete()
                AuditLog.objects.create(
                    user=str(request.user),
                    action='delete_employee_health_card',
                    model_name='EmployeeHealthCard',
                    record_id=deleted_id,
                )
            return Response(status=status.HTTP_204_NO_CONTENT)

        was_created = False
        if request.method in ('PUT', 'PATCH'):
            if not self._can_write_health_card(request):
                return Response(
                    {'detail': 'You do not have permission to edit this health card.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            was_created = card is None
            instance = card or EmployeeHealthCard(employee=employee, created_by=request.user)
            serializer = EmployeeHealthCardSerializer(
                instance,
                data={
                    'data': request.data.get('data', {}),
                    'issue_date': request.data.get('issue_date') or date.today().isoformat(),
                    'next_review_date': request.data.get('next_review_date') or None,
                    'reviewed_by': request.data.get('reviewed_by', ''),
                    'is_approved': request.data.get('is_approved', False),
                },
                partial=request.method == 'PATCH',
            )
            serializer.is_valid(raise_exception=True)
            card = serializer.save(employee=employee, updated_by=request.user)
            if not card.created_by_id:
                card.created_by = request.user
                card.save(update_fields=['created_by', 'updated_at'])
            AuditLog.objects.create(
                user=str(request.user),
                action='create_employee_health_card' if was_created else 'update_employee_health_card',
                model_name='EmployeeHealthCard',
                record_id=str(card.id),
            )
        try:
            profile = employee.detailed_health_profile
        except Exception:
            profile = None

        latest_lab = employee.lab_screenings.order_by('-request_date', '-created_at').first()
        latest_employee_visit = employee.employee_clinic_visits.order_by('-visit_date', '-created_at').first()
        latest_occupational_visit = employee.occupational_clinic_visits.order_by('-visit_date', '-created_at').first()
        latest_exposure = employee.needle_stick_exposures.order_by('-exposure_date', '-created_at').first()
        first_vaccine = employee.vaccination_records.order_by('-created_at').first()

        def p(field, default=''):
            return safe_text(getattr(profile, field, default), default) if profile else default

        def pd(field):
            return serialize_date(getattr(profile, field, None)) if profile else None

        vaccination_rows = []
        for record in employee.vaccination_records.all().order_by('vaccine_type', '-created_at')[:24]:
            dose = record.doses.order_by('-dose_date', '-created_at').first()
            vaccination_rows.append({
                'label': record.vaccine_type,
                'result': record.status,
                'date': serialize_date(dose.dose_date if dose else (record.booster_date or record.third_dose_date or record.second_dose_date or record.first_dose_date)),
                'notes': record.notes or record.post_vaccine_result or record.campaign_name,
            })

        if latest_lab:
            lab_rows = [
                ('Anti-HBs', latest_lab.anti_hbs),
                ('HBsAg', latest_lab.hbsag),
                ('HCV', latest_lab.hcv),
                ('HIV Test', latest_lab.hiv),
                ('Rubella IgG', latest_lab.rubella_igg),
                ('Measles IgG', latest_lab.measles_igg),
                ('Varicella IgG', latest_lab.varicella_igg),
                ('PPD Test', latest_lab.ppd_test),
            ]
            for label, result in lab_rows:
                vaccination_rows.append({'label': label, 'result': result, 'date': serialize_date(latest_lab.result_checked_date), 'notes': ''})

        next_review_date = card.next_review_date if card and card.next_review_date else date.today() + timedelta(days=180)
        issue_date = card.issue_date if card else date.today()
        reviewer = card.reviewed_by if card and card.reviewed_by else str(request.user.get_full_name() or request.user.username)
        payload = {
            'id': card.id if card else None,
            'exists': bool(card),
            'card_number': card.card_number if card else f'EHC-{issue_date.year}-{employee.id:05d}',
            'verification_token': card.verification_token if card else '',
            'issue_date': issue_date.isoformat(),
            'next_review_date': next_review_date.isoformat(),
            'reviewed_by': reviewer,
            'is_approved': card.is_approved if card else False,
            'updated_at': card.updated_at.isoformat() if card else None,
            'employee': {
                'id': employee.id,
                'name': employee.name,
                'email': employee.email,
                'national_id': employee.national_id,
                'employee_number': employee.employee_number,
                'national_address': employee.national_address,
                'mobile': employee.mobile,
                'date_of_birth': serialize_date(employee.date_of_birth),
                'birth_place': employee.birth_place,
                'age': employee.age,
                'gender': employee.gender,
                'marital_status': employee.marital_status,
                'health_center_name': employee.health_center.name if employee.health_center_id else '',
                'job_title': employee.job_title,
                'appointment_date': serialize_date(employee.appointment_date),
                'years_of_experience': serialize_decimal(employee.years_of_experience),
                'periodic_exam_status': employee.periodic_exam_status,
                'vaccination_status': employee.vaccination_status,
                'risk_level': employee.risk_level,
            },
            'physical': {
                'weight_kg': p('weight_kg'),
                'height_cm': p('height_cm'),
                'bmi': p('bmi'),
                'obesity_status': p('obesity_status'),
                'physical_activity': p('physical_activity'),
                'current_position': p('current_position'),
            },
            'conditions': {
                'diabetes': getattr(profile, 'diabetes', None) if profile else None,
                'hypertension': getattr(profile, 'hypertension', None) if profile else None,
                'thyroid_disease': getattr(profile, 'thyroid_disease', None) if profile else None,
                'asthma': getattr(profile, 'asthma', None) if profile else None,
                'blood_disease': getattr(profile, 'blood_disease', None) if profile else None,
                'smoking_status': p('smoking_status'),
                'surgical_history': p('surgical_history'),
                'family_history': p('family_history'),
                'medical_restrictions': p('medical_restrictions'),
                'notes': p('notes'),
            },
            'mental': {
                'phq_result': '',
                'phq_status': '',
                'gad_result': '',
                'gad_status': '',
                'mbi_result': '',
                'mbi_status': '',
                'notes': '',
            },
            'follow_up': {
                'latest_virtual_visit': serialize_date(latest_employee_visit.follow_up_date) if latest_employee_visit else None,
                'joined': True,
                'latest_field_visit': serialize_date(latest_occupational_visit.visit_date) if latest_occupational_visit else None,
                'lab_request': latest_lab.request_status if latest_lab else '',
                'lab_request_date': serialize_date(latest_lab.request_date) if latest_lab else None,
                'lab_result': latest_lab.result_status if latest_lab else '',
                'result_checked_date': serialize_date(latest_lab.result_checked_date) if latest_lab else None,
                'ppd_date': serialize_date(latest_lab.request_date) if latest_lab else None,
                'ppd_test': latest_lab.ppd_test if latest_lab else '',
                'colon_cancer_screening': '',
                'flu_vaccine': first_vaccine.status if first_vaccine else '',
                'covid_19': '',
                'other_vaccine': first_vaccine.vaccine_type if first_vaccine else '',
                'latest_exposure': serialize_date(latest_exposure.exposure_date) if latest_exposure else None,
                'notes': p('notes') or (latest_employee_visit.notes if latest_employee_visit else ''),
            },
            'vaccinations': vaccination_rows,
            'recommendations': {
                'medical': 'المتابعة الدورية حسب حالة الموظف ونتائج الفحوصات.',
                'vaccination': 'استكمال التطعيمات المستحقة حسب سياسة الصحة المهنية.',
                'next_review_date': next_review_date.isoformat(),
                'reviewed_by': reviewer,
            },
        }
        default_data = {
            'personal': {
                'children_count': getattr(profile, 'children_count', '') if profile else '',
                'spouse_name': '',
            },
            'employment': {
                'moh_id': p('moh_id'),
                'current_position': p('current_position') or employee.job_title,
            },
            'physical': {
                **{key: value for key, value in payload['physical'].items() if key != 'current_position'},
                'activity_level': '',
            },
            'conditions': {
                **{key: value for key, value in payload['conditions'].items() if key != 'notes'},
                'ms_disorder': '',
                'chronic_disease': '',
                'surgical_details': '',
                'allergy_history': '',
                'colon_cancer_history': '',
                'breast_cancer_history': '',
                'other_cancer_history': '',
                'needle_stick_history': 'Yes' if latest_exposure else '',
                'other_conditions': p('notes'),
                'metabolic_syndrome': '',
                'regular_medication': '',
            },
            'mental': {
                'phq_result': '', 'gad_result': '', 'mbi_result': '',
                'other_psychological': '', 'depression': '', 'anxiety': '',
                'burnout': '', 'sleep_disorder': '', 'other_risks': '',
            },
            'follow_up': {
                key: value for key, value in payload['follow_up'].items() if key != 'latest_exposure'
            },
            'vaccinations': {
                'anti_hbs': latest_lab.anti_hbs if latest_lab else '',
                'hbv_vaccine': '', 'hbv_dose_1': '', 'hbv_dose_2': '', 'hbv_dose_3': '',
                'post_vaccine_anti_hbs': '', 'post_vaccine_anti_hbs_date': '',
                'rubella_igg': latest_lab.rubella_igg if latest_lab else '',
                'mmr_vaccine': '', 'mmr_dose_1': '', 'mmr_dose_2': '',
                'influenza_vaccine': payload['follow_up'].get('flu_vaccine', ''),
                'hpv_vaccine': '',
                'hbsag': latest_lab.hbsag if latest_lab else '',
                'hcv': latest_lab.hcv if latest_lab else '',
                'hiv': latest_lab.hiv if latest_lab else '',
                'measles_igg': latest_lab.measles_igg if latest_lab else '',
                'mumps_igg': '',
                'varicella_igg': latest_lab.varicella_igg if latest_lab else '',
                'tetanus_vaccine': '', 'covid_booster': '',
                'other_immunization': '', 'notes': '',
            },
            'recommendations': {
                'medical': payload['recommendations']['medical'],
                'vaccination': payload['recommendations']['vaccination'],
            },
            'additional': {
                'pi_spare_1': '', 'pi_spare_2': '', 'ei_spare_1': '',
                'ei_spare_2': '', 'physical_spare': '', 'medical_spare_1': '',
                'nsi': '', 'medical_spare_3': '', 'mental_spare': '',
                'follow_up_spare_1': '', 'follow_up_spare_2': '',
                'follow_up_spare_3': '', 'comments': '',
            },
        }
        data = merge_health_card_data(default_data, card.data if card else {})
        payload['data'] = data
        payload.update(data)
        response_status = status.HTTP_201_CREATED if request.method in ('PUT', 'PATCH') and was_created else status.HTTP_200_OK
        return Response(payload, status=response_status)


class LabTestViewSet(viewsets.ModelViewSet): queryset=LabTest.objects.select_related('employee').all().order_by('-id'); serializer_class=LabTestSerializer; permission_classes=[permissions.IsAuthenticated]
class OccupationalHealthAssessmentViewSet(viewsets.ModelViewSet):
    queryset = OccupationalHealthAssessment.objects.select_related('employee', 'employee__health_center', 'created_by').all()
    serializer_class = OccupationalHealthAssessmentSerializer
    permission_classes = [CanManageOccupationalHealthAssessments]
    search_fields = ['employee__name', 'employee__national_id', 'employee__employee_number', 'assessor_name', 'restrictions']

    def perform_create(self, serializer):
        assessor_name = serializer.validated_data.get('assessor_name') or self.request.user.get_full_name() or self.request.user.username
        assessment = serializer.save(created_by=self.request.user, assessor_name=assessor_name)
        AuditLog.objects.create(
            user=str(self.request.user),
            action='create_occupational_health_assessment',
            model_name='OccupationalHealthAssessment',
            record_id=str(assessment.id),
        )

    def perform_update(self, serializer):
        assessment = serializer.save()
        AuditLog.objects.create(
            user=str(self.request.user),
            action='update_occupational_health_assessment',
            model_name='OccupationalHealthAssessment',
            record_id=str(assessment.id),
        )

    def perform_destroy(self, instance):
        record_id = str(instance.id)
        instance.delete()
        AuditLog.objects.create(
            user=str(self.request.user),
            action='delete_occupational_health_assessment',
            model_name='OccupationalHealthAssessment',
            record_id=record_id,
        )

class VaccinationViewSet(viewsets.ModelViewSet): queryset=Vaccination.objects.select_related('employee').all().order_by('-id'); serializer_class=VaccinationSerializer; permission_classes=[permissions.IsAuthenticated]
class ClinicVisitViewSet(viewsets.ModelViewSet):
    queryset = ClinicVisit.objects.select_related('employee', 'employee__health_center', 'created_by').all()
    serializer_class = ClinicVisitSerializer
    permission_classes = [permissions.IsAuthenticated]
    search_fields = ['employee__name', 'employee__employee_number', 'employee__national_id', 'clinic_type', 'doctor_name']

    def perform_create(self, serializer):
        visit = serializer.save(created_by=self.request.user)
        AuditLog.objects.create(
            user=str(self.request.user),
            action='create_clinic_visit',
            model_name='ClinicVisit',
            record_id=str(visit.id),
        )

    def perform_update(self, serializer):
        visit = serializer.save()
        AuditLog.objects.create(
            user=str(self.request.user),
            action='update_clinic_visit',
            model_name='ClinicVisit',
            record_id=str(visit.id),
        )

    def perform_destroy(self, instance):
        record_id = str(instance.id)
        instance.delete()
        AuditLog.objects.create(
            user=str(self.request.user),
            action='delete_clinic_visit',
            model_name='ClinicVisit',
            record_id=record_id,
        )
class CommitteeReferralViewSet(viewsets.ModelViewSet): queryset=CommitteeReferral.objects.select_related('employee').all().order_by('-id'); serializer_class=CommitteeReferralSerializer; permission_classes=[permissions.IsAuthenticated]
class InjuryCaseViewSet(viewsets.ModelViewSet): queryset=InjuryCase.objects.select_related('employee').all().order_by('-id'); serializer_class=InjuryCaseSerializer; permission_classes=[permissions.IsAuthenticated]
class AuditLogViewSet(viewsets.ReadOnlyModelViewSet): queryset=AuditLog.objects.all().order_by('-created_at'); serializer_class=AuditLogSerializer; permission_classes=[permissions.IsAdminUser]
