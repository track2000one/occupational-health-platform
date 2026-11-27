"""Fail-closed controls for the isolated Staging exercise, not a production policy."""
import os
from django.http import JsonResponse
from django.utils.cache import add_never_cache_headers
from django.contrib.auth.password_validation import (
    validate_password, MinimumLengthValidator, CommonPasswordValidator,
    NumericPasswordValidator, UserAttributeSimilarityValidator,
)
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import BasePermission
from .organization_structure import STAGING_PROJECT

def staging_boundary():
    return os.getenv('STAGING_MODE','').lower()=='true' or os.getenv('RAILWAY_PROJECT_ID')==STAGING_PROJECT

class StagingAdminOrLegacyStaff(BasePermission):
    def has_permission(self,request,view):
        user=request.user
        if staging_boundary():
            return bool(user and user.is_authenticated and user.is_superuser and user.is_active
                and os.getenv('STAGING_MODE','').lower()=='true' and os.getenv('RAILWAY_PROJECT_ID')==STAGING_PROJECT)
        return bool(user and user.is_staff)

def enforce_staging_password(password,user=None):
    if not staging_boundary():
        return
    if not isinstance(password,str) or len(password)>128:
        raise ValidationError({'password':'كلمة مرور صالحة مطلوبة (12 إلى 128 حرفًا).'})
    try:
        validate_password(password,user=user,password_validators=[
            MinimumLengthValidator(12),CommonPasswordValidator(),NumericPasswordValidator(),
            UserAttributeSimilarityValidator(),
        ])
    except DjangoValidationError:
        raise ValidationError({'password':'استخدم 12 حرفًا على الأقل، غير شائعة أو رقمية فقط، وغير مشابهة لبيانات الحساب.'})

class StagingPrivacyMiddleware:
    def __init__(self,get_response):
        self.get_response=get_response
    def __call__(self,request):
        if not staging_boundary():
            return self.get_response(request)
        if request.path_info=='/admin' or request.path_info.startswith('/admin/'):
            response=JsonResponse({'detail':'لوحة Django الإدارية مغلقة في Staging؛ استخدم المسارات المعتمدة.'},status=403)
            add_never_cache_headers(response)
            return response
        response=self.get_response(request)
        if request.path_info.startswith('/api/'):
            # Preserve the explicit no-store header used by existing clinical APIs.
            if 'no-store' not in response.get('Cache-Control',''):
                add_never_cache_headers(response)
        return response
