from datetime import date
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from .models import Employee,EmployeeHealthCard,OccupationalHealthAssessment,CommitteeReferral,MedicalCommitteeCase,AuditLog
from .organization_structure import STAGING_PROJECT
from .staging_employee_reset import QA_EXAMPLES

ENV={'STAGING_MODE':'true','RAILWAY_PROJECT_ID':STAGING_PROJECT}

class FitnessCommitteeTests(TestCase):
    def setUp(self):
        self.admin=get_user_model().objects.create_superuser(username='qa_fitness',password='test-only')
        self.client=APIClient()
        self.client.force_authenticate(self.admin)
        nid,name=QA_EXAMPLES['OHP-QA-01']
        self.e=Employee.objects.create(name=name,national_id=nid,employee_number='OHP-QA-01',email='ohp-qa-01@example.invalid')
        self.other=Employee.objects.create(name='not marked',national_id='1000000001')
        self.entry=f'/api/staging-clinical/employees/{self.e.pk}/fitness-committee/'
        self.card=f'/api/employees/{self.e.pk}/health_card/'
        self.fitness={'synthetic_confirmed':True,'action':'fitness','assessment_date':'2025-01-01',
                      'assessment_type':'Return to Work','fitness_decision':'fitWithRestrictions','restrictions':'QA restriction',
                      'next_assessment_date':'2025-02-01'}
        self.referral={'synthetic_confirmed':True,'action':'referral','referral_date':'2025-03-01','diagnosis':'QA reason'}
    def post(self,d,url=None):
        return self.client.post(url or self.entry,d,format='json')
    @patch.dict('os.environ',ENV)
    def test_fitness_explicit_decision_and_preserved_card(self):
        card=EmployeeHealthCard.objects.create(employee=self.e,is_approved=True,data={'follow_up':{'latest_field_visit':'2024-01-01'}})
        invalid=dict(self.fitness);invalid.pop('fitness_decision')
        self.assertEqual(self.post(invalid).status_code,400)
        self.assertEqual(self.post({**self.fitness,'restrictions':''}).status_code,400)
        self.assertEqual(self.post({**self.fitness,'next_assessment_date':'2024-12-01'}).status_code,400)
        r=self.post(self.fitness)
        self.assertEqual(r.status_code,201,r.data)
        self.assertEqual(self.post(self.fitness).status_code,409)
        self.assertEqual(self.client.get(self.entry+'?kind=fitness').data['total'],1)
        res=self.client.get(self.card).data
        linked=res['linked_clinical_records']['fitness_assessments']['items'][0]
        self.assertEqual(linked['fitness_decision'],'fitWithRestrictions')
        self.assertEqual(linked['next_assessment_date'],'2025-02-01')
        self.assertEqual(res['data']['follow_up']['latest_field_visit'],'2024-01-01')
        self.assertIsNone(res['next_review_date'])
        card.refresh_from_db()
        self.assertTrue(card.is_approved)
        self.assertEqual(card.data,{'follow_up':{'latest_field_visit':'2024-01-01'}})
    @patch.dict('os.environ',ENV)
    def test_referral_and_explicit_decision(self):
        legacy=CommitteeReferral.objects.create(employee=self.e,date=date(2024,1,1),status='under_review')
        MedicalCommitteeCase.objects.create(employee=self.e,decision='QA historic')
        result=self.post(self.referral)
        self.assertEqual(result.status_code,201,result.data)
        self.assertIsNone(result.data['decision_date'])
        self.assertEqual(self.post(self.referral).status_code,409)
        decision={'synthetic_confirmed':True,'action':'decision','record_id':result.data['id'],
                  'decision_date':'2025-03-02','decision':'QA recorded decision','recommendations':'QA advice'}
        self.assertEqual(self.post({**decision,'record_id':legacy.pk}).status_code,409)
        self.assertEqual(self.post({**decision,'decision_date':'2025-02-28'}).status_code,400)
        self.assertEqual(self.post(decision).status_code,200)
        self.assertEqual(self.post(decision).status_code,409)
        linked=self.client.get(self.card).data['linked_clinical_records']
        records={x['id']:x for x in linked['committee_referrals']['items']}
        self.assertIsNone(records[legacy.pk]['referral_date'])
        self.assertIsNone(records[legacy.pk]['decision_date'])
        self.assertEqual(records[result.data['id']]['decision_date'],'2025-03-02')
        self.assertEqual(records[result.data['id']]['recommendations'],'QA advice')
        self.assertEqual(linked['medical_committee_cases']['items'][0]['decision'],'QA historic')
        self.assertIsNone(linked['medical_committee_cases']['items'][0]['decision_date'])
        self.assertEqual(AuditLog.objects.filter(action__startswith='qa_committee_').count(),2)
        self.assertEqual(EmployeeHealthCard.objects.count(),0)
    @patch.dict('os.environ',ENV)
    def test_access_and_legacy_api_blocked(self):
        other=f'/api/staging-clinical/employees/{self.other.pk}/fitness-committee/'
        self.assertEqual(self.post(self.fitness,other).status_code,403)
        self.assertEqual(self.post({**self.fitness,'synthetic_confirmed':False}).status_code,400)
        self.assertEqual(self.client.get('/api/occupational-health-assessments/').status_code,403)
        self.assertEqual(self.client.get('/api/committee-referrals/').status_code,403)
        staff=get_user_model().objects.create_user(username='qa_staff_fitness',password='test-only',is_staff=True)
        self.client.force_authenticate(staff)
        self.assertEqual(self.post(self.referral).status_code,403)
        self.assertEqual(self.client.get(self.entry+'?kind=committee').status_code,403)
        self.assertEqual(OccupationalHealthAssessment.objects.count(),0)
        self.assertEqual(CommitteeReferral.objects.count(),0)
    @patch.dict('os.environ',{'STAGING_MODE':'false','RAILWAY_PROJECT_ID':'non-staging'})
    def test_production_blocked(self):
        self.assertEqual(self.post(self.fitness).status_code,403)
        self.assertNotIn('linked_clinical_records',self.client.get(self.card).data)
    @patch.dict('os.environ',ENV)
    def test_bound_and_employee_scope(self):
        for day in range(1,10):
            OccupationalHealthAssessment.objects.create(employee=self.e,assessment_date=date(2025,1,day),fitness_decision='fit')
        CommitteeReferral.objects.create(employee=self.other,diagnosis='OTHER EMPLOYEE')
        data=self.client.get(self.card).data['linked_clinical_records']
        self.assertEqual(len(data['fitness_assessments']['items']),8)
        self.assertTrue(data['fitness_assessments']['has_more'])
        self.assertEqual(data['fitness_assessments']['items'][0]['assessment_date'],'2025-01-09')
        self.assertNotIn('OTHER EMPLOYEE',str(data))
