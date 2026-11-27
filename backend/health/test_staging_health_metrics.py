from datetime import date
from io import BytesIO
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import TestCase
from openpyxl import load_workbook
from rest_framework.test import APIClient
from .models import (Employee, HealthCenter, OrganizationUnit, EmployeeHealthCard, EmployeeHealthObservation,
    LabTest, LabScreening, Vaccination, VaccinationRecord, ClinicVisit, CommitteeReferral)
from .organization_structure import STAGING_PROJECT
from .staging_employee_reset import QA_EXAMPLES
from .staging_health_metrics import CARD_FIELDS
ENV={'STAGING_MODE':'true','RAILWAY_PROJECT_ID':STAGING_PROJECT}
URL='/api/staging-clinical/metrics/'

class HealthMetricsTests(TestCase):
    def setUp(self):
        self.admin=get_user_model().objects.create_superuser(username='qa_metrics',password='test-only')
        self.client=APIClient();self.client.force_authenticate(self.admin)
        self.c=HealthCenter.objects.create(name='QA center metrics',code='QA-METRIC')
        self.sector=OrganizationUnit.objects.create(name='QA sector',code='QA-S',kind='sector',is_approved=True)
        self.unit=OrganizationUnit.objects.create(name='QA unit',code='QA-U',kind='unit',parent=self.sector,is_approved=True)
        self.e=self.make('OHP-QA-01',health_center=self.c,organization_unit=self.unit)
        self.e2=self.make('OHP-QA-02')
        self.other=Employee.objects.create(name='EXCLUDED EMPLOYEE',national_id='1000000001',health_center=self.c)
        self.make('OHP-QA-03',is_archived=True)
        self.make('OHP-QA-04',employment_status='retired')
    def make(self,number,**kwargs):
        nid,name=QA_EXAMPLES[number]
        return Employee.objects.create(name=name,national_id=nid,employee_number=number,email=number.lower()+'@example.invalid',**kwargs)
    @patch.dict('os.environ',ENV)
    def test_metrics_exact_cohort_distinct_counts_and_period(self):
        EmployeeHealthCard.objects.create(employee=self.e,is_approved=True,data={'conditions':{'diabetes':False,'hypertension':'unknown'},'physical':{'weight_kg':0}})
        EmployeeHealthCard.objects.create(employee=self.other,data={'conditions':{'diabetes':True}})
        LabTest.objects.create(employee=self.e,test_type='QA 1',request_date=date(2025,1,1),result_date=date(2025,1,2),status='completed',result='SECRET QA RESULT')
        LabTest.objects.create(employee=self.e,test_type='QA 2',request_date=date(2025,1,3))
        LabTest.objects.create(employee=self.other,test_type='EXCLUDED RESULT',request_date=date(2025,1,3))
        LabScreening.objects.create(employee=self.e,request_date=date(2025,1,3))
        Vaccination.objects.create(employee=self.e,vaccine_type='HBV',dose='1',status='given',dose_date=date(2025,1,3))
        VaccinationRecord.objects.create(employee=self.e,vaccine_type='HBV')
        ClinicVisit.objects.create(employee=self.e,clinic_type='QA',visit_date=date(2024,1,1))
        ClinicVisit.objects.create(employee=self.e,clinic_type='QA undated')
        for day in (1,2):
            EmployeeHealthObservation.objects.create(employee=self.e,observation_date=date(2025,1,day),data={'diabetes':'yes','phq_version':'QA','phq_result':'SECRET SCORE'})
        EmployeeHealthObservation.objects.create(employee=self.other,observation_date=date(2025,1,1),data={'diabetes':'yes'})
        r=self.client.get(URL,{'start':'2025-01-01','end':'2025-01-31'})
        self.assertEqual(r.status_code,200,r.data)
        d=r.data;s={x['key']:x['value'] for x in d['summary']};e={x['key']:x['count'] for x in d['events']}
        c={x['key']:x for x in d['coverage']}
        self.assertEqual(s['employees'],2);self.assertEqual(s['cards'],1);self.assertEqual(s['card_presence'],50)
        self.assertEqual(d['field_presence']['recorded'],2)
        self.assertEqual(d['field_presence']['possible'],len(CARD_FIELDS))
        self.assertEqual(c['lab']['count'],1);self.assertEqual(c['vaccination']['count'],1)
        self.assertEqual(c['visits']['count'],1)
        self.assertEqual(e['lab_requests'],2);self.assertEqual(e['lab_results'],1);self.assertEqual(e['clinic_visits'],0)
        self.assertEqual(e['observations'],2)
        self.assertEqual(d['conditions'][0]['count'],1);self.assertEqual(d['mental'][0]['count'],1)
        for secret in ('SECRET','EXCLUDED','9990000001','OHP-QA-01'):
            self.assertNotIn(secret,str(d))
        self.assertEqual(r['Cache-Control'],'private, no-store')
        filtered=self.client.get(URL,{'sector':self.sector.pk,'center':self.c.pk,'department':self.unit.pk})
        self.assertEqual(filtered.status_code,200,filtered.data)
        self.assertEqual(filtered.data['summary'][0]['value'],1)
    @patch.dict('os.environ',ENV)
    def test_excel_and_invalid_filters(self):
        for query in ({'start':'2025-01-01'},{'start':'2025-02-01','end':'2025-01-01'},{'center':999999},{'download':'csv'},{'unexpected':'1'}):
            self.assertEqual(self.client.get(URL,query).status_code,400)
        self.assertEqual(self.client.get(URL+'?center=1&center=2').status_code,400)
        r=self.client.get(URL,{'download':'xlsx','center':self.c.pk})
        self.assertEqual(r.status_code,200)
        self.assertEqual(r['Cache-Control'],'private, no-store')
        book=load_workbook(BytesIO(r.content))
        self.assertEqual(book['المؤشرات']['B2'].value,1)
        self.assertTrue(book['المؤشرات'].sheet_view.rightToLeft)
        self.assertNotIn(self.e.national_id,str(list(book['المؤشرات'].values)))
    @patch.dict('os.environ',ENV)
    def test_zero_scope_and_permissions(self):
        Employee.objects.filter(pk__in=[self.e.pk,self.e2.pk]).update(is_archived=True)
        r=self.client.get(URL)
        self.assertEqual(r.status_code,200)
        self.assertEqual(r.data['summary'][0]['value'],0)
        self.assertIsNone(r.data['summary'][4]['value'])
        self.assertIsNone(r.data['summary'][5]['value'])
        self.assertIsNone(r.data['coverage'][0]['percent'])
        staff=get_user_model().objects.create_user(username='qa_metrics_staff',password='test-only',is_staff=True)
        self.client.force_authenticate(staff)
        self.assertEqual(self.client.get(URL).status_code,403)
        self.assertEqual(self.client.get(URL,{'download':'xlsx'}).status_code,403)
    @patch.dict('os.environ',{'STAGING_MODE':'false','RAILWAY_PROJECT_ID':'non-staging'})
    def test_production_blocked(self):
        self.assertEqual(self.client.get(URL).status_code,403)
        self.assertEqual(self.client.get(URL,{'download':'xlsx'}).status_code,403)
