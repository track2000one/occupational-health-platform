from datetime import date
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from .models import Employee, EmployeeHealthCard, EmployeeHealthProfile, EmployeeHealthObservation, AuditLog
from .organization_structure import STAGING_PROJECT
from .staging_employee_reset import QA_EXAMPLES, linked_employee_ids
from .health_data_card_commit import SPECIALIZED

ENV={'STAGING_MODE':'true','RAILWAY_PROJECT_ID':STAGING_PROJECT}

class HealthObservationTests(TestCase):
    def setUp(self):
        self.admin=get_user_model().objects.create_superuser(username='qa_observations',password='test-only')
        self.client=APIClient()
        self.client.force_authenticate(self.admin)
        nid,name=QA_EXAMPLES['OHP-QA-01']
        self.e=Employee.objects.create(name=name,national_id=nid,employee_number='OHP-QA-01',email='ohp-qa-01@example.invalid')
        self.other=Employee.objects.create(name='not marked',national_id='1000000001')
        self.entry=f'/api/staging-clinical/employees/{self.e.pk}/observations/'
        self.card=f'/api/employees/{self.e.pk}/health_card/'
        self.data={'synthetic_confirmed':True,'observation_date':'2025-03-01','weight_kg':'70.25',
                   'diabetes':'no','phq_version':'PHQ-9','phq_result':'synthetic 3','mbi_version':'QA variant','mbi_result':'synthetic subscale'}
    def post(self,data,url=None):
        return self.client.post(url or self.entry,data,format='json')
    @patch.dict('os.environ',ENV)
    def test_create_preserves_snapshot_and_legacy_profile(self):
        profile=EmployeeHealthProfile.objects.create(employee=self.e,weight_kg=80,diabetes=None,hypertension=False)
        c=EmployeeHealthCard.objects.create(employee=self.e,is_approved=True,data={'mental':{'phq_result':'historical'}})
        r=self.post(self.data)
        self.assertEqual(r.status_code,201,r.data)
        self.assertEqual(self.post(self.data).status_code,409)
        linked=self.client.get(self.card).data
        self.assertEqual(linked['data']['mental']['phq_result'],'historical')
        records=linked['linked_clinical_records']
        self.assertEqual(records['health_profile']['data']['weight_kg'],'80.00')
        self.assertIsNone(records['health_profile']['data']['diabetes'])
        self.assertIs(records['health_profile']['data']['hypertension'],False)
        self.assertIsNone(records['health_profile']['observation_date'])
        v=records['health_observations']['items'][0]['data']
        self.assertEqual(v['weight_kg'],'70.25')
        self.assertEqual(v['diabetes'],'no')
        self.assertEqual(v['phq_result'],'synthetic 3')
        self.assertNotIn('depression',v)
        self.assertNotIn('bmi',v)
        self.assertNotIn('anxiety',v)
        self.assertEqual(AuditLog.objects.filter(action='qa_health_observation_registered').count(),1)
        self.assertEqual(self.client.get(self.entry).data['total'],1)
        c.refresh_from_db()
        profile.refresh_from_db()
        self.assertEqual(c.data,{'mental':{'phq_result':'historical'}})
        self.assertTrue(c.is_approved)
        self.assertEqual(str(profile.weight_kg),'80.00')
        self.assertIn(self.e.pk,linked_employee_ids([self.e.pk]))
        self.assertIn(EmployeeHealthObservation,SPECIALIZED)
    @patch.dict('os.environ',ENV)
    def test_validation_and_access(self):
        base={'synthetic_confirmed':True,'observation_date':'2025-03-01'}
        for invalid in ({}, {'phq_result':'3'}, {'mbi_version':'QA'}, {'weight_kg':'-1'}, {'diabetes':'maybe'}, {'extra':'unknown'}, {'observation_date':'2999-01-01','diabetes':'no'}):
            self.assertEqual(self.post({**base,**invalid}).status_code,400)
        self.assertEqual(self.post({**self.data,'synthetic_confirmed':False}).status_code,400)
        self.assertEqual(self.post(self.data,f'/api/staging-clinical/employees/{self.other.pk}/observations/').status_code,403)
        staff=get_user_model().objects.create_user(username='qa_staff_observation',password='test-only',is_staff=True)
        self.client.force_authenticate(staff)
        self.assertEqual(self.post(self.data).status_code,403)
        self.assertEqual(self.client.get(self.entry).status_code,403)
        self.assertEqual(EmployeeHealthObservation.objects.count(),0)
    @patch.dict('os.environ',ENV)
    def test_bounded_and_no_cross_employee_data(self):
        for day in range(1,10):
            EmployeeHealthObservation.objects.create(employee=self.e,observation_date=date(2025,1,day),data={'weight_kg':'71'})
        EmployeeHealthObservation.objects.create(employee=self.other,observation_date=date(2025,2,1),data={'phq_result':'OTHER EMPLOYEE'})
        linked=self.client.get(self.card).data['linked_clinical_records']['health_observations']
        self.assertEqual(len(linked['items']),8)
        self.assertTrue(linked['has_more'])
        self.assertEqual(linked['items'][0]['observation_date'],'2025-01-09')
        self.assertNotIn('OTHER EMPLOYEE',str(linked))
    @patch.dict('os.environ',{'STAGING_MODE':'false'})
    def test_production_blocked(self):
        self.assertEqual(self.post(self.data).status_code,403)
        self.assertEqual(self.client.get(self.entry).status_code,403)
        self.assertNotIn('linked_clinical_records',self.client.get(self.card).data)
