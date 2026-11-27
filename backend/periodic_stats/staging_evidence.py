"""Freeze legacy evidence in Staging; retain existing files without opening them."""
from rest_framework.permissions import BasePermission
from rest_framework.exceptions import PermissionDenied
from health.staging_registry_scope import boundary

class LegacyEvidencePermission(BasePermission):
    message='المرفقات القديمة مجمدة في Staging دون حذف؛ استخدم مسار البطاقة الصحية التجريبية.'
    def has_permission(self,request,view):
        return not boundary()

def prevent_parent_delete(instance):
    if boundary() and instance.attachments.exists():
        raise PermissionDenied('لا يمكن حذف سجل مرتبط بمرفقات قديمة في Staging.')
