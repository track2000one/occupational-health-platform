from django.contrib import admin
from django.urls import path, include
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
class Health(APIView):
    permission_classes=[AllowAny]
    def get(self,request): return Response({'status':'ok','service':'occupational-health-backend'})
urlpatterns=[path('admin/',admin.site.urls),path('health/',Health.as_view()),path('api/auth/token/',TokenObtainPairView.as_view()),path('api/auth/token/refresh/',TokenRefreshView.as_view()),path('api/',include('health.urls'))]
