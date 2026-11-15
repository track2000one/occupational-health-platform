"""Temporarily retire fragmented legacy Excel import API paths.

This switch prevents accidental staff/clinical writes through older imports
while Employee Import V2 is under redesign. No existing database row is
deleted or migrated. The switch is OFF in production by default and may be
enabled only in synthetic CI to regression-test historical code.
"""
from django.conf import settings
from django.http import JsonResponse


LEGACY_PATH_PREFIXES = (
    '/api/excel-import/upload/',  # Preserve read-only historical import audit lists.
    '/api/employee-import-reviews/',
    '/api/employee-roster/reconcile/',
    '/api/employee-roster-template/',
    '/api/workforce-roster/',
    '/api/staging-employee-card-reset/',
    '/api/employee-registry-reset/',
)


class RetiredEmployeeExcelImportMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # CORS preflight is handled by the CORS middleware earlier in the chain.
        if (not settings.LEGACY_EMPLOYEE_EXCEL_IMPORTS_ENABLED and
                any(request.path.startswith(path) for path in LEGACY_PATH_PREFIXES)):
            response = JsonResponse({
                'detail': 'أُوقفت واجهات استيراد الموظفين القديمة. استخدم الإصدار الجديد.',
                'new_interface': '/employees/import',
                'legacy_import_disabled': True,
            }, status=403)
            response['Cache-Control'] = 'private, no-store'
            return response
        return self.get_response(request)
