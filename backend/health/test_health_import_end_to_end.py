"""End-to-end synthetic health import regression; never accesses Railway data."""
import json
from copy import deepcopy
from datetime import date
from io import BytesIO
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError
from django.test import TestCase
from openpyxl import load_workbook
from rest_framework.test import APIClient
from .health_data_import import HEADERS, HEALTH_FIELDS
from .health_data_card_commit import CONFIRM
from .models import (Employee, HealthCenter, OrganizationUnit, EmployeeHealthCard,
    EmployeeHealthObservation, LabTest, Vaccination, ClinicVisit, NeedleStickExposure,
    OccupationalHealthAssessment, CommitteeReferral, DataImportBatch, AuditLog)
from .organization_structure import STAGING_PROJECT
from .staging_employee_reset import QA_EXAMPLES
from .staging_health_metrics import CARD_FIELDS

ENV={'STAGING_MODE':'true','RAILWAY_PROJECT_ID':STAGING_PROJECT}
TEMPLATE='/api/health-data-import/template/'
PREVIEW='/api/health-data-import/preview/'
COMMIT='/api/health-data-import/draft-commit/'
METRICS='/api/staging-clinical/metrics/'

@patch.dict('os.environ',ENV)
class HealthImportEndToEndTests(TestCase):
    def setUp(self):
        self.admin=get_user_model().objects.create_superuser(username='qa_e2e_admin',password='test-only')
        self.client=APIClient()
        self.client.force_authenticate(self.admin)
        self.center=HealthCenter.objects.create(name='Synthetic E2E Center',code='QA-E2E')
        self.sector=OrganizationUnit.objects.create(name='Synthetic E2E Sector',code='QA-E2E-S',
            kind='sector',is_approved=True)
        self.unit=OrganizationUnit.objects.create(name='Synthetic E2E Unit',code='QA-E2E-U',
            kind='unit',parent=self.sector,is_approved=True)
        self.e=self.employee('OHP-QA-01',health_center=self.center,organization_unit=self.unit)
        self.second=self.employee('OHP-QA-02',health_center=self.center,organization_unit=self.unit)
        self.third=self.employee('OHP-QA-03')
        self.retired=self.employee('OHP-QA-04',employment_status='retired')
        self.other=Employee.objects.create(name='UNMARKED SYNTHETIC FIXTURE',national_id='1000000091')
        self.master_before=list(Employee.objects.order_by('pk').values())
    def employee(self,number,**kwargs):
        nid,name=QA_EXAMPLES[number]
        return Employee.objects.create(name=name,national_id=nid,employee_number=number,
            email=number.lower()+'@example.invalid',**kwargs)
    def row(self,employee,**values):
        return {'national_id':employee.national_id,'employee_name':employee.name,**values}
    def workbook(self,rows):
        response=self.client.get(TEMPLATE)
        self.assertEqual(response.status_code,200)
        self.assertEqual(response['Cache-Control'],'private, no-store')
        book=load_workbook(BytesIO(response.content))
        sheet=book['HealthData']
        self.assertEqual(tuple(c.value for c in sheet[1]),HEADERS)
        self.assertEqual(len(HEALTH_FIELDS),61)
        for r in rows:sheet.append([r.get(k) for k in HEADERS])
        out=BytesIO();book.save(out);book.close()
        return out.getvalue()
    def post_file(self,url,raw,**kw):
        return self.client.post(url,{'file':SimpleUploadedFile('synthetic-health-e2e.xlsx',raw),
            'synthetic_confirmed':'true',**kw},format='multipart')
    def plan(self,raw):
        res=self.post_file(COMMIT,raw,action='preview')
        self.assertEqual(res.status_code,200,res.data)
        return res.data
    def apply(self,raw,plan,rows):
        return self.post_file(COMMIT,raw,action='apply',preview_token=plan['preview_token'],
            selected_rows=json.dumps(rows),confirmation=CONFIRM,reason='اختبار تكامل الاستيراد الصحي')
    def card(self,e):
        response=self.client.get(f'/api/employees/{e.pk}/health_card/')
        self.assertEqual(response.status_code,200,response.data)
        return response.data
    def metrics(self,**filters):
        res=self.client.get(METRICS,filters)
        self.assertEqual(res.status_code,200,res.data)
        return res.data
    def clinical(self,e,suffix,**data):
        return self.client.post(f'/api/staging-clinical/employees/{e.pk}/{suffix}',
            {'synthetic_confirmed':True,**data},format='json')
    def counts(self,metrics,key):
        return {r['key']:r['count'] for r in metrics[key]}
    def assert_master_unchanged(self):
        self.assertEqual(list(Employee.objects.order_by('pk').values()),self.master_before)

    def test_template_to_card_to_live_clinical_records_to_export(self):
        raw=self.workbook([self.row(self.e,source_health_center=self.center.code,
            weight_kg=72,diabetes=False,phq_result=0,hbv_dose_1='2025-01-05',
            latest_field_visit_source='Unclear',hypertension=None)])
        preview=self.post_file(PREVIEW,raw)
        self.assertEqual(preview.status_code,200,preview.data)
        self.assertEqual(preview.data['identity_counts']['matched'],1)
        self.assertEqual(preview.data['field_totals']['proposed'],4)
        self.assertEqual(preview.data['field_totals']['review'],1)
        self.assertEqual(EmployeeHealthCard.objects.count(),0)
        self.assertEqual(DataImportBatch.objects.count(),0)
        before=self.metrics()
        self.assertEqual(before['summary'][0]['value'],3)
        self.assertEqual(before['summary'][1]['value'],0)
        self.assertIsNone(before['summary'][5]['value'])
        plan=self.plan(raw)
        self.assertEqual(plan['counts']['ready'],1)
        self.assertEqual(plan['eligible_values'],4)
        result=self.apply(raw,plan,[2])
        self.assertEqual(result.status_code,200,result.data)
        self.assertEqual(result.data['updated_cards'],1)
        self.assertEqual(result.data['updated_values'],4)
        saved=EmployeeHealthCard.objects.get(employee=self.e)
        snapshot=deepcopy(saved.data)
        self.assertFalse(saved.is_approved)
        self.assertEqual(snapshot['physical']['weight_kg'],'72')
        self.assertEqual(snapshot['conditions']['diabetes'],'No')
        self.assertNotIn('hypertension',snapshot['conditions'])
        self.assertNotIn('follow_up',snapshot)
        self.assertEqual(snapshot['mental']['phq_result'],'0')
        self.assertEqual(snapshot['vaccinations']['hbv_dose_1'],'2025-01-05')
        self.assertEqual(self.card(self.e)['data']['physical']['weight_kg'],'72')
        self.assertEqual(self.apply(raw,plan,[2]).status_code,409)
        self.assertEqual(DataImportBatch.objects.count(),1)
        self.assertEqual(AuditLog.objects.filter(action='health_data_draft_fill').count(),1)
        after=self.metrics(center=self.center.pk,sector=self.sector.pk,department=self.unit.pk)
        self.assertEqual(after['summary'][0]['value'],2)
        self.assertEqual(after['summary'][1]['value'],1)
        self.assertEqual(after['summary'][4]['value'],50)
        self.assertEqual(after['field_presence']['recorded'],4)
        self.assertEqual(after['field_presence']['possible'],len(CARD_FIELDS))
        self.assertEqual(self.counts(after,'events')['vaccine_doses'],0)
        self.assertEqual(self.counts(after,'mental')['phq'],0)
        # A draft historical value is not itself a dated specialized event.
        self.assertEqual(LabTest.objects.count(),0)
        self.assertEqual(Vaccination.objects.count(),0)
        # Enter explicitly dated synthetic events through their own endpoints.
        lab=self.clinical(self.e,'',action='lab_request',test_type='CBC',request_date='2025-02-01')
        self.assertEqual(lab.status_code,201,lab.data)
        res=self.clinical(self.e,'',action='lab_result',record_id=lab.data['id'],
            result='QA RESULT PRIVATE',result_date='2025-02-02')
        self.assertEqual(res.status_code,200,res.data)
        vaccine=self.clinical(self.e,'',action='vaccine_given',vaccine_type='HBV',dose='1',dose_date='2025-02-03')
        self.assertEqual(vaccine.status_code,201,vaccine.data)
        obs=self.clinical(self.e,'observations/',observation_date='2025-02-04',diabetes='yes',
            phq_version='PHQ-9',phq_result='QA SCORE PRIVATE')
        self.assertEqual(obs.status_code,201,obs.data)
        fit=self.clinical(self.e,'fitness-committee/',action='fitness',assessment_date='2025-02-05',
            assessment_type='Periodic',fitness_decision='fitWithRestrictions',restrictions='QA RESTRICTION PRIVATE')
        self.assertEqual(fit.status_code,201,fit.data)
        ref=self.clinical(self.e,'fitness-committee/',action='referral',referral_date='2025-02-06',diagnosis='QA REFERRAL PRIVATE')
        self.assertEqual(ref.status_code,201,ref.data)
        dec=self.clinical(self.e,'fitness-committee/',action='decision',record_id=ref.data['id'],
            decision_date='2025-02-07',decision='QA DECISION PRIVATE')
        self.assertEqual(dec.status_code,200,dec.data)
        ClinicVisit.objects.create(employee=self.e,clinic_type='QA',visit_date=date(2025,2,8))
        NeedleStickExposure.objects.create(employee=self.e,exposure_date=date(2025,2,9))
        saved.refresh_from_db()
        self.assertEqual(saved.data,snapshot)
        self.assertFalse(saved.is_approved)
        linked=self.card(self.e)['linked_clinical_records']
        for source in ('lab_tests','vaccinations','health_observations','fitness_assessments','committee_referrals','clinic_visits','needle_stick_exposures'):
            self.assertEqual(len(linked[source]['items']),1,source)
        self.assertEqual(self.plan(raw)['rows'][0]['reason'],'specialized_records')
        query={'center':self.center.pk,'start':'2025-02-01','end':'2025-02-28'}
        metrics=self.metrics(**query)
        events=self.counts(metrics,'events')
        for key in ('lab_requests','lab_results','vaccine_doses','observations','fitness','referrals','decisions','clinic_visits','needle_stick'):
            self.assertEqual(events[key],1,key)
        self.assertEqual(self.counts(metrics,'conditions')['diabetes'],1)
        self.assertEqual(self.counts(metrics,'mental')['phq'],1)
        self.assertEqual(metrics['field_presence']['recorded'],4)
        self.assertEqual(self.metrics(start='2025-01-01',end='2025-01-31')['events'][0]['count'],0)
        excel=self.client.get(METRICS,{**query,'download':'xlsx'})
        self.assertEqual(excel.status_code,200)
        self.assertEqual(excel['Cache-Control'],'private, no-store')
        book=load_workbook(BytesIO(excel.content))
        self.assertEqual(len(book.worksheets),6)
        self.assertEqual(book['المؤشرات']['B2'].value,2)
        self.assertEqual(book['المؤشرات']['B3'].value,1)
        self.assertTrue(all(s.sheet_view.rightToLeft for s in book.worksheets))
        values=str([list(s.values) for s in book.worksheets])
        for secret in ('PRIVATE',self.e.national_id,self.e.name,self.e.employee_number,self.other.national_id):
            self.assertNotIn(secret,str(metrics))
            self.assertNotIn(secret,values)
        book.close()
        self.assert_master_unchanged()

    def test_mixed_batch_selection_protects_previous_records(self):
        approved=EmployeeHealthCard.objects.create(employee=self.second,is_approved=True,
            data={'physical':{'weight_kg':'60'}})
        specialized=LabTest.objects.create(employee=self.third,test_type='QA-existing')
        raw=self.workbook([
            self.row(self.e,weight_kg=71),
            self.row(self.second,weight_kg=90),
            self.row(self.third,weight_kg=65),
            self.row(self.retired,weight_kg=66),
            self.row(self.other,weight_kg=70),
            {'national_id':'9990000099','employee_name':'Missing QA fixture','weight_kg':50},
        ])
        preview=self.post_file(PREVIEW,raw).data
        self.assertEqual(preview['identity_counts']['unmatched'],2)
        self.assertEqual(preview['identity_counts']['inactive'],1)
        plan=self.plan(raw)
        self.assertEqual(plan['counts']['ready'],1)
        self.assertEqual([r['reason'] for r in plan['rows']],['','approved_card','specialized_records','inactive','unmatched','unmatched'])
        self.assertEqual(self.apply(raw,plan,[2,3]).status_code,400)
        self.assertEqual(EmployeeHealthCard.objects.count(),1)
        self.assertEqual(self.apply(raw,plan,[2]).status_code,200)
        approved.refresh_from_db();specialized.refresh_from_db()
        self.assertEqual(approved.data,{'physical':{'weight_kg':'60'}})
        self.assertTrue(approved.is_approved)
        self.assertEqual(specialized.test_type,'QA-existing')
        self.assertEqual(EmployeeHealthCard.objects.count(),2)
        self.assertFalse(EmployeeHealthCard.objects.filter(employee__in=[self.third,self.retired,self.other]).exists())
        self.assert_master_unchanged()

    def test_duplicate_conflict_identity_and_stale_selection(self):
        card=EmployeeHealthCard.objects.create(employee=self.e,data={'physical':{'weight_kg':'65'}})
        conflict=self.workbook([self.row(self.e,weight_kg=80,diabetes='Yes')])
        plan=self.plan(conflict)
        self.assertEqual(plan['rows'][0]['reason'],'card_conflict')
        self.assertEqual(self.apply(conflict,plan,[2]).status_code,400)
        card.refresh_from_db()
        self.assertEqual(card.data,{'physical':{'weight_kg':'65'}})
        dup=self.workbook([self.row(self.second,weight_kg=70),self.row(self.second,diabetes='No')])
        self.assertEqual([r['reason'] for r in self.plan(dup)['rows']],['duplicate','duplicate'])
        mismatch=self.workbook([self.row(self.second,source_health_center='wrong',weight_kg=70)])
        self.assertEqual(self.plan(mismatch)['rows'][0]['reason'],'identity_review')
        ready=self.workbook([self.row(self.second,weight_kg=70)])
        plan=self.plan(ready)
        other=get_user_model().objects.create_superuser(username='other_qa_admin',password='test-only')
        self.client.force_authenticate(other)
        self.assertEqual(self.apply(ready,plan,[2]).status_code,409)
        self.client.force_authenticate(self.admin)
        changed=self.workbook([self.row(self.second,weight_kg=71)])
        self.assertEqual(self.apply(changed,plan,[2]).status_code,409)
        EmployeeHealthObservation.objects.create(employee=self.second,observation_date=date(2025,3,1),data={'diabetes':'no'})
        self.assertEqual(self.apply(ready,plan,[2]).status_code,409)
        self.assertFalse(EmployeeHealthCard.objects.filter(employee=self.second).exists())
        self.assertEqual(DataImportBatch.objects.count(),0)
        self.assert_master_unchanged()

    def test_atomic_rollback_after_first_row(self):
        raw=self.workbook([self.row(self.e,weight_kg=71),self.row(self.second,weight_kg=72)])
        plan=self.plan(raw)
        self.assertEqual(plan['counts']['ready'],2)
        original=AuditLog.objects.create
        calls=[]
        def fail_second(**kwargs):
            calls.append(kwargs['action'])
            if len(calls)==2:
                raise IntegrityError('Synthetic transaction failure')
            return original(**kwargs)
        with patch('health.health_data_card_commit.AuditLog.objects.create',side_effect=fail_second):
            res=self.apply(raw,plan,[2,3])
        self.assertEqual(res.status_code,409,res.data)
        self.assertEqual(len(calls),2)
        self.assertEqual(EmployeeHealthCard.objects.count(),0)
        self.assertEqual(DataImportBatch.objects.count(),0)
        self.assertEqual(AuditLog.objects.filter(action='health_data_draft_fill').count(),0)
        self.assertEqual(self.metrics()['summary'][1]['value'],0)
        self.assert_master_unchanged()

    def test_staff_wrong_project_and_anonymous_cannot_import_or_export(self):
        raw=self.workbook([self.row(self.e,weight_kg=71)])
        staff=get_user_model().objects.create_user(username='qa_e2e_staff',password='test-only',is_staff=True)
        for user in (staff,self.admin,None):
            self.client.force_authenticate(user)
            with patch.dict('os.environ',{'RAILWAY_PROJECT_ID':'wrong-project'} if user==self.admin else {}):
                for path in (TEMPLATE,METRICS,METRICS+'?download=xlsx'):
                    self.assertIn(self.client.get(path).status_code,(401,403))
                for path in (PREVIEW,COMMIT):
                    self.assertIn(self.post_file(path,raw,action='preview').status_code,(401,403))
        self.assertEqual(EmployeeHealthCard.objects.count(),0)
        self.assertEqual(DataImportBatch.objects.count(),0)
        self.assert_master_unchanged()
