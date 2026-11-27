"""Explicit allowlist for limited JWT accounts during the isolated registry trial."""
import os
import re
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.exceptions import PermissionDenied

class ScopedStagingJWTAuthentication(JWTAuthentication):
    def authenticate(self,request):
        result=super().authenticate(request)
        if result is None:
            return None
        from health.organization_structure import STAGING_PROJECT
        flag=os.getenv('STAGING_MODE','').lower()=='true'
        project=os.getenv('RAILWAY_PROJECT_ID')==STAGING_PROJECT
        user,_=result
        if not (flag or project) or user.is_superuser:
            return result
        path=request.path_info
        if request.method in ('GET','HEAD','OPTIONS') and (
            path=='/api/users/me/' or (flag and project and
                (path=='/api/employees/' or re.fullmatch(r'/api/employees/[0-9]+/',path)))):
            return result
        # All other API modules remain closed pending object-level design.
        raise PermissionDenied('حساب الاختبار المحدود: يقتصر الوصول على دليل الموظفين ضمن النطاق المعتمد والملف الشخصي للحساب.')
