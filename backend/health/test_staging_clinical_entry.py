from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from .models import Employee, LabTest, Vaccination, AuditLog, EmployeeHealthCard
from .organization_structure import STAGING_PROJECT
from .staging_employee_reset import QA_EXAMPLES

ENV={'STAGING_MODE':'true','RAILWAY_PROJECT_ID':STAGING_PROJECT}

class StagingClinicalEntryTests(TestCase):
    def setUp(self):
        self.user=get_user_model().objects.create_superuser(username='qa_clinical',password='test-only')
        self.client=APIClient()
        self.client.force_authenticate(self.user)
        nid,name=QA_EXAMPLES['OHP-QA-01']
        self.e=Employee.objects.create(name=name,national_id=nid,employee_number='OHP-QA-01',email='ohp-qa-01@example.invalid')
        self.other=Employee.objects.create(name='unmarked test',national_id='1000000001')
        self.url=f'/api/staging-clinical/employees/{self.e.pk}/'
        self.card=f'/api/employees/{self.e.pk}/health_card/'
        self.req={'action':'lab_request','test_type':'Anti-HBs','request_date':'2025-01-01','notes':'synthetic request','synthetic_confirmed':True}
    def post(self,data,url=None):
        return self.client.post(url or self.url,data,format='json')
    @patch.dict('os.environ',ENV)
    def test_request_result_and_card(self):
        r=self.post(self.req)
        self.assertEqual(r.status_code,201,r.data)
        pk=r.data['id']
        self.assertEqual(self.post(self.req).status_code,409)
        data={'action':'lab_result','record_id':pk,'result':'synthetic result','result_date':'2025-01-02','notes':'synthetic result note','synthetic_confirmed':True}
        self.assertEqual(self.post({**data,'result_date':'2024-12-31'}).status_code,400)
        self.assertEqual(self.post(data).status_code,200)
        self.assertEqual(self.post(data).status_code,409)
        record=LabTest.objects.get(pk=pk)
        self.assertEqual(record.request_date.isoformat(),'2025-01-01')
        self.assertEqual(record.result_date.isoformat(),'2025-01-02')
        self.assertEqual(record.request_notes,'synthetic request')
        self.assertEqual(record.result_notes,'synthetic result note')
        linked=self.client.get(self.card).data['linked_clinical_records']['lab_tests']['items'][0]
        self.assertEqual(linked['result_date'],'2025-01-02')
        self.assertEqual(linked['result'],'synthetic result')
        self.assertEqual(self.client.get(self.url+'?kind=labs').data['total'],1)
        self.assertEqual(AuditLog.objects.filter(action__startswith='qa_lab_').count(),2)
        self.assertEqual(EmployeeHealthCard.objects.count(),0)
    @patch.dict('os.environ',ENV)
    def test_vaccine_and_no_inferred_immunity(self):
        data={'action':'vaccine_given','vaccine_type':'HBV','dose':'3','dose_date':'2025-01-01','next_due_date':'2025-02-01','synthetic_confirmed':True}
        self.assertEqual(self.post({**data,'next_due_date':'2024-01-01'}).status_code,400)
        self.assertEqual(self.post({**data,'vaccine_type':'PPD'}).status_code,400)
        self.assertEqual(self.post(data).status_code,201)
        self.assertEqual(self.post(data).status_code,409)
        linked=self.client.get(self.card).data['linked_clinical_records']['vaccinations']['items'][0]
        self.assertEqual(linked['dose_date'],'2025-01-01')
        self.assertEqual(linked['status'],'given')
        self.assertEqual(Vaccination.objects.count(),1)
    @patch.dict('os.environ',ENV)
    def test_protection(self):
        self.assertEqual(self.post({**self.req,'synthetic_confirmed':False}).status_code,400)
        self.assertEqual(self.post(self.req,f'/api/staging-clinical/employees/{self.other.pk}/').status_code,403)
        self.assertEqual(len(self.client.get('/api/staging-clinical/employees/').data['employees']),1)
        self.assertEqual(self.client.post('/api/lab-tests/',{'employee':self.e.pk,'test_type':'CBC'},format='json').status_code,400)
        staff=get_user_model().objects.create_user(username='staff',password='test-only',is_staff=True)
        self.client.force_authenticate(staff)
        self.assertEqual(self.post(self.req).status_code,403)
        self.assertEqual(self.client.get(self.url+'?kind=labs').status_code,403)
        self.assertEqual(LabTest.objects.count(),0)
    @patch.dict('os.environ',{'STAGING_MODE':'false'})
    def test_production_blocked(self):
        self.assertEqual(self.post(self.req).status_code,403)
