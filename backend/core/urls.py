from django.contrib import admin
from django.urls import path, include
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from core.staging_sessions import StagingTokenObtainView, StagingTokenRefreshView, StagingLogoutView


class Health(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({'status': 'ok', 'service': 'occupational-health-backend'})


urlpatterns = [
    path('admin/', admin.site.urls),
    path('health/', Health.as_view()),
    path('api/auth/token/', StagingTokenObtainView.as_view()),
    path('api/auth/token/refresh/', StagingTokenRefreshView.as_view()),
    path('api/auth/logout/', StagingLogoutView.as_view()),
    path('api/periodic-statistics/', include('periodic_stats.urls')),
    path('api/', include('health.urls')),
]
