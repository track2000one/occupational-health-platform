"""Security regression for the final isolated QA gate. No live data or network."""
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from .models import Employee, EmployeeHealthCard, LabTest, ClinicVisit, InjuryCase, Vaccination
from .organization_structure import STAGING_PROJECT
from .staging_employee_reset import QA_EXAMPLES

ENV={'STAGING_MODE':'true','RAILWAY_PROJECT_ID':STAGING_PROJECT}
LEGACY=('/api/lab-tests/','/api/vaccinations/','/api/clinic-visits/','/api/injury-cases/',
        '/api/occupational-health-assessments/','/api/committee-referrals/')

class StagingOperationalReadinessTests(TestCase):
    def setUp(self):
        self.admin=get_user_model().objects.create_superuser(username='qa_final_admin',password='test-only')
        self.staff=get_user_model().objects.create_user(username='qa_final_staff',password='test-only',is_staff=True)
        self.client=APIClient()
        self.client.force_authenticate(self.admin)
        nid,name=QA_EXAMPLES['OHP-QA-01']
        self.e=Employee.objects.create(name=name,national_id=nid,employee_number='OHP-QA-01',email='ohp-qa-01@example.invalid')
        self.other=Employee.objects.create(name='UNMARKED TEST',national_id='1000000091')
        self.card=EmployeeHealthCard.objects.create(employee=self.e,is_approved=True,data={'physical':{'weight_kg':'70'}})
        self.other_card=EmployeeHealthCard.objects.create(employee=self.other,data={'conditions':{'notes':'PRIVATE FIXTURE'}})
        self.url=f'/api/employees/{self.e.pk}/health_card/'
        self.other_url=f'/api/employees/{self.other.pk}/health_card/'
    @patch.dict('os.environ',ENV)
    def test_card_boundaries_approval_delete_and_public_token(self):
        self.assertEqual(self.client.get(self.url).status_code,200)
        self.assertEqual(self.client.get(self.other_url).status_code,403)
        for method in ('patch','put','delete'):
            req=getattr(self.client,method)
            self.assertEqual(req(self.url,{'data':{}},format='json').status_code,403)
            self.assertEqual(req(self.other_url,{'data':{}},format='json').status_code,403)
        self.card.refresh_from_db()
        self.assertEqual(self.card.data,{'physical':{'weight_kg':'70'}})
        self.assertTrue(self.card.is_approved)
        self.assertEqual(EmployeeHealthCard.objects.count(),2)
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get(self.url).status_code,403)
        self.client.force_authenticate(None)
        res=self.client.get('/api/health-card-verification/'+self.card.verification_token+'/')
        self.assertEqual(res.status_code,404)
        self.assertNotIn(self.e.name,str(res.data))
        self.assertEqual(res['Cache-Control'],'no-store')
    @patch.dict('os.environ',ENV)
    def test_legacy_clinical_global_reads_and_writes_blocked(self):
        for user in (self.admin,self.staff):
            self.client.force_authenticate(user)
            for url in LEGACY:
                self.assertEqual(self.client.get(url).status_code,403,url)
                self.assertEqual(self.client.post(url,{'employee':self.other.pk},format='json').status_code,403,url)
        for model in (LabTest,Vaccination,ClinicVisit,InjuryCase):
            self.assertEqual(model.objects.count(),0)
    @patch.dict('os.environ',ENV)
    def test_active_draft_can_be_saved_but_not_approved(self):
        nid,name=QA_EXAMPLES['OHP-QA-02']
        e=Employee.objects.create(name=name,national_id=nid,employee_number='OHP-QA-02',email='ohp-qa-02@example.invalid')
        url=f'/api/employees/{e.pk}/health_card/'
        res=self.client.put(url,{'data':{'physical':{'weight_kg':'75'}},'is_approved':True},format='json')
        self.assertEqual(res.status_code,403)
        self.assertFalse(EmployeeHealthCard.objects.filter(employee=e).exists())
        res=self.client.put(url,{'data':{'physical':{'weight_kg':'75'}},'is_approved':False},format='json')
        self.assertIn(res.status_code,(200,201),res.data)
        self.assertFalse(EmployeeHealthCard.objects.get(employee=e).is_approved)
    def test_partial_staging_marker_fails_closed(self):
        for env in ({'STAGING_MODE':'true','RAILWAY_PROJECT_ID':'wrong'},
                    {'STAGING_MODE':'false','RAILWAY_PROJECT_ID':STAGING_PROJECT}):
            with patch.dict('os.environ',env):
                self.assertEqual(self.client.get(self.url).status_code,403)
                self.assertEqual(self.client.get(LEGACY[0]).status_code,403)
