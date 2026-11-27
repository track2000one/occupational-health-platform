from datetime import date
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from .models import (Employee, EmployeeHealthCard, ClinicVisit, EmployeeClinicVisit,
                     OccupationalClinicVisit, InjuryCase, NeedleStickExposure, AuditLog)
from .organization_structure import STAGING_PROJECT
from .staging_employee_reset import QA_EXAMPLES

ENV={'STAGING_MODE':'true','RAILWAY_PROJECT_ID':STAGING_PROJECT}

class LinkedVisitInjuryTests(TestCase):
    def setUp(self):
        self.admin=get_user_model().objects.create_superuser(username='qa_visits',password='test-only')
        self.client=APIClient()
        self.client.force_authenticate(self.admin)
        nid,name=QA_EXAMPLES['OHP-QA-01']
        self.e=Employee.objects.create(name=name,national_id=nid,employee_number='OHP-QA-01',email='ohp-qa-01@example.invalid')
        self.other=Employee.objects.create(name='unmarked synthetic',national_id='1000000001')
        self.url=f'/api/employees/{self.e.pk}/health_card/'
        self.entry=f'/api/staging-clinical/employees/{self.e.pk}/exposures/'
        self.input={'synthetic_confirmed':True,'exposure_date':'2025-03-01','workplace':'QA-SYNTHETIC','injury_method':'needle_stick'}

    @patch.dict('os.environ',ENV)
    def test_linked_sources_preserve_recorded_dates_and_private_card(self):
        c=EmployeeHealthCard.objects.create(employee=self.e,is_approved=True,data={'follow_up':{'latest_field_visit':'2024-01-01'}})
        ClinicVisit.objects.create(employee=self.e,clinic_type='synthetic clinic',visit_date=date(2025,1,1),follow_up_date=date(2025,2,1),status='follow_up',sick_leave_days=0)
        EmployeeClinicVisit.objects.create(employee=self.e,visit_date=date(2025,1,3),follow_up_date=date(2025,3,3))
        OccupationalClinicVisit.objects.create(employee=self.e,visit_date=date(2025,1,4),action='synthetic action')
        InjuryCase.objects.create(employee=self.e,exposure_date=date(2025,2,1))
        NeedleStickExposure.objects.create(employee=self.e,exposure_date=date(2025,2,2),source_name='PRIVATE-QA-NAME',source_national_id='PRIVATE-QA-ID',source_result='PRIVATE-QA-RESULT',notes='PRIVATE-QA-NOTES')
        ClinicVisit.objects.create(employee=self.other,clinic_type='OTHER-EMPLOYEE-ONLY')
        response=self.client.get(self.url)
        self.assertEqual(response.status_code,200,response.data)
        linked=response.data['linked_clinical_records']
        self.assertEqual(linked['clinic_visits']['items'][0]['visit_date'],'2025-01-01')
        self.assertEqual(linked['clinic_visits']['items'][0]['follow_up_date'],'2025-02-01')
        self.assertEqual(linked['clinic_visits']['items'][0]['sick_leave_days'],0)
        self.assertEqual(linked['employee_clinic_visits']['items'][0]['follow_up_date'],'2025-03-03')
        self.assertEqual(linked['occupational_clinic_visits']['items'][0]['visit_date'],'2025-01-04')
        self.assertEqual(linked['injury_cases']['items'][0]['exposure_date'],'2025-02-01')
        self.assertEqual(linked['needle_stick_exposures']['items'][0]['exposure_date'],'2025-02-02')
        self.assertNotIn('PRIVATE-QA',str(linked))
        self.assertNotIn('OTHER-EMPLOYEE-ONLY',str(linked))
        self.assertEqual(response.data['data']['follow_up']['latest_virtual_visit'],'')
        self.assertEqual(response.data['data']['follow_up']['latest_field_visit'],'2024-01-01')
        self.assertEqual(response.data['data']['conditions']['needle_stick_history'],'')
        c.refresh_from_db()
        self.assertTrue(c.is_approved)
        self.assertEqual(c.data,{'follow_up':{'latest_field_visit':'2024-01-01'}})

    @patch.dict('os.environ',ENV)
    def test_bounded_order_and_unknown_dates(self):
        for day in range(1,10):
            ClinicVisit.objects.create(employee=self.e,clinic_type='QA',visit_date=date(2025,1,day))
        ClinicVisit.objects.create(employee=self.e,clinic_type='undated')
        linked=self.client.get(self.url).data['linked_clinical_records']
        self.assertEqual(len(linked['clinic_visits']['items']),8)
        self.assertTrue(linked['clinic_visits']['has_more'])
        self.assertEqual(linked['clinic_visits']['items'][0]['visit_date'],'2025-01-09')
        self.assertEqual(linked['needle_stick_exposures']['items'],[])

    @patch.dict('os.environ',ENV)
    def test_synthetic_exposure_persists_and_links_without_source_inference(self):
        post=lambda data:self.client.post(self.entry,data,format='json')
        self.assertEqual(post({**self.input,'synthetic_confirmed':False}).status_code,400)
        self.assertEqual(post({**self.input,'source_name':'private'}).status_code,400)
        self.assertEqual(post({**self.input,'workplace':'not allowed'}).status_code,400)
        result=post(self.input)
        self.assertEqual(result.status_code,201,result.data)
        self.assertEqual(post(self.input).status_code,409)
        record=NeedleStickExposure.objects.get(employee=self.e)
        self.assertIsNone(record.source_known)
        self.assertEqual(record.source_name,'')
        self.assertEqual(record.status,'new')
        self.assertEqual(self.client.get(self.entry).data['total'],1)
        self.assertEqual(self.client.get(self.url).data['linked_clinical_records']['needle_stick_exposures']['items'][0]['id'],record.pk)
        self.assertEqual(AuditLog.objects.filter(action='qa_exposure_registered').count(),1)
        self.assertEqual(EmployeeHealthCard.objects.count(),0)

    @patch.dict('os.environ',ENV)
    def test_access_guard(self):
        other=f'/api/staging-clinical/employees/{self.other.pk}/exposures/'
        self.assertEqual(self.client.get(other).status_code,403)
        self.assertEqual(self.client.post(other,self.input,format='json').status_code,403)
        staff=get_user_model().objects.create_user(username='qa_staff',password='test-only',is_staff=True)
        self.client.force_authenticate(staff)
        self.assertEqual(self.client.get(self.entry).status_code,403)
        self.assertEqual(self.client.post(self.entry,self.input,format='json').status_code,403)
        self.assertEqual(NeedleStickExposure.objects.count(),0)

    @patch.dict('os.environ',{'STAGING_MODE':'false'})
    def test_no_production_entry(self):
        self.assertEqual(self.client.get(self.entry).status_code,403)
        self.assertEqual(self.client.post(self.entry,self.input,format='json').status_code,403)
        self.assertNotIn('linked_clinical_records',self.client.get(self.url).data)
