from unittest.mock import patch
from datetime import timedelta
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken,AccessToken
from .models import StagingAuthSession,StagingLoginWindow,AuditLog
from .organization_structure import STAGING_PROJECT

ENV={'STAGING_MODE':'true','RAILWAY_PROJECT_ID':STAGING_PROJECT}
class StagingSessionTests(TestCase):
    def setUp(self):
        env=patch.dict('os.environ',ENV);env.start();self.addCleanup(env.stop)
        U=get_user_model()
        self.user=U.objects.create_user(username='qa_session_user',password='Synthetic!Session37')
        self.admin=U.objects.create_superuser(username='qa_session_admin',password='Synthetic!Admin37')
        self.client=APIClient()
    def login(self,user=None,password='Synthetic!Session37'):
        self.client.credentials()
        return self.client.post('/api/auth/token/',{'username':(user or self.user).username,'password':password},format='json')
    def pair(self):
        r=self.login();self.assertEqual(r.status_code,200,r.data);return r.data
    def use(self,token):
        self.client.credentials(HTTP_AUTHORIZATION='Bearer '+token)
        return self.client.get('/api/users/me/')
    def refresh(self,token):
        self.client.credentials()
        return self.client.post('/api/auth/token/refresh/',{'refresh':token},format='json')
    def test_rotation_expiry_logout_and_legacy_denied(self):
        self.assertEqual(self.use(str(RefreshToken.for_user(self.user).access_token)).status_code,401)
        p=self.pair();a=AccessToken(p['access']);r=RefreshToken(p['refresh'])
        self.assertEqual(a['exp']-a['iat'],600)
        self.assertEqual(r['exp']-r['iat'],28800)
        self.assertEqual(self.use(p['access']).status_code,200)
        new=self.refresh(p['refresh']);self.assertEqual(new.status_code,200,new.data)
        self.assertNotEqual(new.data['refresh'],p['refresh'])
        self.assertEqual(RefreshToken(new.data['refresh'])['exp'],r['exp'])
        self.assertEqual(self.refresh(p['refresh']).status_code,401)
        self.assertEqual(self.use(new.data['access']).status_code,200)
        self.client.credentials()
        self.assertEqual(self.client.post('/api/auth/logout/',{'refresh':p['refresh']},format='json').status_code,200)
        self.assertEqual(self.use(new.data['access']).status_code,401)
        self.assertEqual(self.refresh(new.data['refresh']).status_code,401)
        self.assertTrue(AuditLog.objects.filter(action='qa_logout').exists())
        self.assertTrue(AuditLog.objects.filter(action='qa_refresh_replay_denied').exists())
    def test_password_change_and_admin_disable_reenable(self):
        p=self.pair()
        self.user.set_password('Different!Synthetic37');self.user.save()
        self.assertEqual(self.use(p['access']).status_code,401)
        self.assertEqual(self.refresh(p['refresh']).status_code,401)
        r=self.login(password='Different!Synthetic37');self.assertEqual(r.status_code,200);p=r.data
        a=self.login(self.admin,'Synthetic!Admin37');self.assertEqual(a.status_code,200)
        self.client.credentials(HTTP_AUTHORIZATION='Bearer '+a.data['access'])
        for active in (False,True):
            r=self.client.patch(f'/api/users/{self.user.pk}/',{'isActive':active},format='json')
            self.assertEqual(r.status_code,200,r.data)
        self.assertEqual(self.use(p['access']).status_code,401)
        self.assertEqual(self.refresh(p['refresh']).status_code,401)
    def test_absolute_expiry_and_rate_limit_metadata(self):
        p=self.pair()
        StagingAuthSession.objects.update(expires_at=timezone.now()-timedelta(seconds=1))
        self.assertEqual(self.use(p['access']).status_code,401)
        self.assertEqual(self.refresh(p['refresh']).status_code,401)
        for i in range(8):
            r=self.client.post('/api/auth/token/',{'username':'unknown-synthetic','password':'wrong-secret'},format='json')
            self.assertEqual(r.status_code,401)
        r=self.client.post('/api/auth/token/',{'username':'UNKNOWN-SYNTHETIC','password':'wrong-secret'},format='json')
        self.assertEqual(r.status_code,429);self.assertIn('Retry-After',r)
        self.assertEqual(AuditLog.objects.filter(action='qa_login_failed').count(),8)
        self.assertNotIn('unknown-synthetic',str(list(StagingLoginWindow.objects.values())))
        self.assertNotIn('wrong-secret',str(list(AuditLog.objects.values())))
    def test_partial_environment_denies_and_nonstaging_legacy(self):
        p=self.pair()
        with patch.dict('os.environ',{'STAGING_MODE':'false'}):
            self.assertEqual(self.use(p['access']).status_code,401)
            self.assertEqual(self.refresh(p['refresh']).status_code,401)
        with patch.dict('os.environ',{'STAGING_MODE':'false','RAILWAY_PROJECT_ID':'not-staging'}):
            r=self.login();self.assertEqual(r.status_code,200)
            self.assertNotIn('ohp_sid',AccessToken(r.data['access']))
            self.assertEqual(self.use(r.data['access']).status_code,200)
