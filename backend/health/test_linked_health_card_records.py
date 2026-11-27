from datetime import date
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from .models import (Employee, EmployeeHealthCard, LabTest, LabScreening,
                     Vaccination, VaccinationRecord, VaccinationDose)
from .organization_structure import STAGING_PROJECT
from .staging_employee_reset import QA_EXAMPLES

ENV = {'STAGING_MODE':'true','RAILWAY_PROJECT_ID':STAGING_PROJECT}

class LinkedHealthCardRecordsTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser(username='linked_qa',password='test-only')
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        nid, name = QA_EXAMPLES['OHP-QA-01']
        self.e = Employee.objects.create(name=name,national_id=nid,employee_number='OHP-QA-01',email='ohp-qa-01@example.invalid')
        self.other = Employee.objects.create(name='غير موسوم للاختبار',national_id='1000000001')
        self.card = EmployeeHealthCard.objects.create(employee=self.e,is_approved=True,
            data={'vaccinations':{'anti_hbs':'historical'},'follow_up':{'ppd_date':'2020-01-01'}})
        self.url = f'/api/employees/{self.e.pk}/health_card/'

    @patch.dict('os.environ', ENV)
    def test_live_records_preserve_saved_card_and_do_not_infer_dates(self):
        lab = LabTest.objects.create(employee=self.e,test_type='Anti-HBs',result='synthetic current',status='completed',date=date(2025,2,1))
        LabTest.objects.create(employee=self.other,test_type='other employee',result='must not appear')
        LabScreening.objects.create(employee=self.e,request_date=date(2025,1,1),ppd_test='synthetic',anti_hbs='source')
        Vaccination.objects.create(employee=self.e,vaccine_type='FLU',dose='1',status='due',next_due_date=date(2026,12,1))
        series = VaccinationRecord.objects.create(employee=self.e,vaccine_type='HBV',status='incomplete',first_dose_date=date(2024,1,1))
        VaccinationDose.objects.create(record=series,dose_label='2',dose_date=date(2024,2,1))
        res = self.client.get(self.url)
        self.assertEqual(res.status_code,200,res.data)
        linked=res.data['linked_clinical_records']
        self.assertEqual(linked['lab_tests']['items'][0]['result'],'synthetic current')
        self.assertNotIn('must not appear',str(linked))
        self.assertIsNone(linked['lab_screenings']['items'][0]['result_checked_date'])
        self.assertEqual(linked['vaccinations']['items'][0]['next_due_date'],'2026-12-01')
        self.assertEqual(linked['vaccination_records']['items'][0]['recorded_dates'],[{'label':'1','date':'2024-01-01'}])
        self.assertEqual(linked['vaccination_records']['items'][0]['doses'][0]['date'],'2024-02-01')
        self.assertEqual(res.data['data']['vaccinations']['anti_hbs'],'historical')
        self.assertEqual(res.data['data']['follow_up']['ppd_date'],'2020-01-01')
        self.assertEqual(res.data['data']['follow_up']['joined'],'')
        self.assertEqual(res.data['data']['follow_up']['flu_vaccine'],'')
        self.assertEqual(res['Cache-Control'],'private, no-store')
        lab.result='updated synthetic result'
        lab.save()
        self.assertEqual(self.client.get(self.url).data['linked_clinical_records']['lab_tests']['items'][0]['result'],'updated synthetic result')
        self.card.refresh_from_db()
        self.assertTrue(self.card.is_approved)
        self.assertEqual(self.card.data,{'vaccinations':{'anti_hbs':'historical'},'follow_up':{'ppd_date':'2020-01-01'}})

    @patch.dict('os.environ', ENV)
    def test_bounds_and_synthetic_only(self):
        for n in range(10):
            LabTest.objects.create(employee=self.e,test_type='synthetic',result=str(n))
        data=self.client.get(self.url).data['linked_clinical_records']
        self.assertEqual(len(data['lab_tests']['items']),8)
        self.assertTrue(data['lab_tests']['has_more'])
        self.assertEqual(data['vaccination_records']['items'],[])
        self.assertNotIn('linked_clinical_records',self.client.get(f'/api/employees/{self.other.pk}/health_card/').data)

    @patch.dict('os.environ', {'STAGING_MODE':'false'})
    def test_production_projection_disabled(self):
        self.assertNotIn('linked_clinical_records',self.client.get(self.url).data)
