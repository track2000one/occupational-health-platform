from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from .models import AuditLog,Employee,EmployeeHealthCard
from .organization_structure import STAGING_PROJECT
from .staging_employee_reset import QA_EXAMPLES

ENV={'STAGING_MODE':'true','RAILWAY_PROJECT_ID':STAGING_PROJECT}
class StagingSecurityTests(TestCase):
    def setUp(self):
        env=patch.dict('os.environ',ENV);env.start();self.addCleanup(env.stop)
        User=get_user_model()
        self.admin=User.objects.create_superuser(username='qa_security_admin',password='test-only')
        self.staff=User.objects.create_user(username='qa_security_staff',password='test-only',is_staff=True)
        self.client=APIClient()
        self.client.force_authenticate(self.admin)

    def test_staff_cannot_escalate_or_read_audit(self):
        self.client.force_authenticate(self.staff)
        for url in ('/api/users/','/api/audit-logs/'):
            self.assertEqual(self.client.get(url).status_code,403)
        self.assertEqual(self.client.patch(f'/api/users/{self.staff.pk}/',{'role':'systemAdmin'},format='json').status_code,403)
        self.assertEqual(self.client.post(f'/api/users/{self.admin.pk}/reset_password/',{'password':'Another-Strong-Example!37'},format='json').status_code,403)
        self.staff.refresh_from_db();self.assertFalse(self.staff.is_superuser)
        self.assertEqual(self.client.get('/api/users/me/').status_code,200)

    def test_account_guard_password_and_no_hard_delete(self):
        self.assertEqual(self.client.patch(f'/api/users/{self.admin.pk}/',{'isActive':False},format='json').status_code,400)
        self.assertEqual(self.client.delete(f'/api/users/{self.staff.pk}/').status_code,403)
        self.assertEqual(self.client.post(f'/api/users/{self.staff.pk}/reset_password/',{'password':'123456789012'},format='json').status_code,400)
        self.assertEqual(self.client.post(f'/api/users/{self.staff.pk}/reset_password/',{'password':'A-Long-Synthetic!Key37'},format='json').status_code,200)
        self.staff.refresh_from_db();self.assertTrue(self.staff.check_password('A-Long-Synthetic!Key37'))
        self.assertTrue(AuditLog.objects.filter(action='reset_password',record_id=str(self.staff.pk)).exists())

    def test_no_alternate_admin_or_legacy_upload(self):
        for url in ('/admin/','/admin/login/','/admin/health/employeehealthcard/'):
            r=self.client.get(url);self.assertEqual(r.status_code,403);self.assertIn('no-store',r['Cache-Control'])
        r=self.client.post('/api/excel-import/upload/',{},format='json')
        self.assertIn(r.status_code,(403,410))
        self.assertIn('no-store',r['Cache-Control'])
        self.assertIn('no-store',self.client.get('/api/users/me/')['Cache-Control'])

    def test_actual_audit_metadata_only_and_readonly(self):
        nid,name=QA_EXAMPLES['OHP-QA-01']
        e=Employee.objects.create(name=name,national_id=nid,employee_number='OHP-QA-01',email='ohp-qa-01@example.invalid')
        c=EmployeeHealthCard.objects.create(employee=e,data={'conditions':{'notes':'PRIVATE SYNTHETIC VALUE'}})
        self.assertEqual(self.client.get(f'/api/employees/{e.pk}/health_card/').status_code,200)
        self.assertEqual(self.client.get('/api/staging-clinical/metrics/',{'download':'xlsx'}).status_code,200)
        audit=self.client.get('/api/audit-logs/',{'action':'qa_view_health_card'})
        self.assertEqual(audit.status_code,200,audit.data)
        self.assertEqual(audit.data['count'],1)
        self.assertEqual(audit.data['results'][0]['record_id'],str(c.pk))
        self.assertNotIn('PRIVATE SYNTHETIC VALUE',str(audit.data))
        self.assertNotIn(nid,str(audit.data))
        self.assertTrue(AuditLog.objects.filter(action='qa_export_health_metrics').exists())
        self.assertEqual(self.client.post('/api/audit-logs/',{},format='json').status_code,405)
        self.assertEqual(self.client.delete('/api/audit-logs/'+str(audit.data['results'][0]['id'])+'/').status_code,405)
        with patch.dict('os.environ',{'STAGING_MODE':'false'}):
            self.assertEqual(self.client.get('/api/audit-logs/').status_code,403)
