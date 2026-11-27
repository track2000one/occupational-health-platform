import json
from io import BytesIO
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from openpyxl import Workbook
from rest_framework.test import APIClient
from .health_data_import import HEADERS
from .health_data_card_commit import CONFIRM
from .models import Employee, EmployeeHealthCard, DataImportBatch, AuditLog, LabTest
from .organization_structure import STAGING_PROJECT
from .staging_employee_reset import QA_EXAMPLES

URL = '/api/health-data-import/draft-commit/'
ENV = {'STAGING_MODE':'true','RAILWAY_PROJECT_ID':STAGING_PROJECT}

class DraftCardCommitTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_superuser(username='qa_card_admin',password='test-only')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        nid, name = QA_EXAMPLES['OHP-QA-01']
        self.e = Employee.objects.create(name=name,national_id=nid,employee_number='OHP-QA-01',email='ohp-qa-01@example.invalid')
        self.other = Employee.objects.create(name='غير موسوم للاختبار',national_id='1000000001')
        self.row = {'national_id':nid,'employee_name':name,'weight_kg':70,'diabetes':'No','latest_field_visit_source':'No'}
        self.raw = self.workbook([self.row])

    def workbook(self, rows):
        b = Workbook()
        s = b.active
        s.title = 'HealthData'
        s.append(HEADERS)
        for r in rows:
            s.append([r.get(k) for k in HEADERS])
        out = BytesIO()
        b.save(out)
        b.close()
        return out.getvalue()

    def request(self, action='preview', raw=None, **kwargs):
        return self.client.post(URL, {'file':SimpleUploadedFile('synthetic.xlsx',raw if raw is not None else self.raw),
            'synthetic_confirmed':'true','action':action,**kwargs},format='multipart')

    def apply(self, plan, **kwargs):
        return self.request('apply',preview_token=plan['preview_token'],selected_rows=json.dumps([2]),
            confirmation=CONFIRM,reason='استكمال مسودة ببيانات اصطناعية',**kwargs)

    @patch.dict('os.environ', ENV)
    def test_fill_only_visible_in_card_and_audited(self):
        plan = self.request().data
        self.assertEqual(plan['counts']['ready'],1)
        self.assertEqual(plan['eligible_values'],2)
        self.assertEqual(EmployeeHealthCard.objects.count(),0)
        res=self.apply(plan)
        self.assertEqual(res.status_code,200,res.data)
        card=EmployeeHealthCard.objects.get(employee=self.e)
        self.assertEqual(card.data['physical']['weight_kg'],'70')
        self.assertEqual(card.data['conditions']['diabetes'],'No')
        self.assertNotIn('follow_up',card.data)
        self.assertFalse(card.is_approved)
        self.assertEqual(Employee.objects.count(),2)
        self.assertEqual(DataImportBatch.objects.count(),1)
        self.assertTrue(AuditLog.objects.filter(action='health_data_draft_fill',record_id=str(card.pk)).exists())
        self.assertEqual(self.apply(plan).status_code,409)
        replay = self.request().data
        self.assertEqual(replay['counts']['ready'], 0)
        self.assertEqual(replay['counts']['review'], 1)
        self.assertEqual(replay['eligible_values'], 0)
        self.assertEqual(replay['rows'][0]['reason'], 'ambiguous_or_invalid')
        self.assertEqual(replay['rows'][0]['review_fields'], ['latest_field_visit_source'])
        self.assertCountEqual(replay['rows'][0]['matched_fields'], ['weight_kg', 'diabetes'])
        self.assertEqual(self.apply(replay).status_code, 400)
        self.assertEqual(DataImportBatch.objects.count(), 1)
        # A clean replay without the unresolved source column is truly unchanged.
        clean = self.workbook([{**self.row, 'latest_field_visit_source': None}])
        clean_plan = self.request(raw=clean).data
        self.assertEqual(clean_plan['counts']['unchanged'], 1)
        self.assertEqual(clean_plan['eligible_values'], 0)
        self.assertEqual(self.apply(clean_plan, raw=clean).status_code, 400)
        self.assertEqual(EmployeeHealthCard.objects.count(), 1)
        self.assertEqual(DataImportBatch.objects.count(), 1)
        response=self.client.get(f'/api/employees/{self.e.pk}/health_card/')
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.data['data']['physical']['weight_kg'],'70')

    @patch.dict('os.environ', ENV)
    def test_protect_unmarked_approved_and_specialized(self):
        other=self.workbook([{'national_id':self.other.national_id,'employee_name':self.other.name,'weight_kg':70}])
        self.assertEqual(self.request(raw=other).data['rows'][0]['reason'],'unmatched')
        card=EmployeeHealthCard.objects.create(employee=self.e,is_approved=True)
        self.assertEqual(self.request().data['rows'][0]['reason'],'approved_card')
        card.is_approved=False
        card.save()
        LabTest.objects.create(employee=self.e,test_type='Synthetic')
        self.assertEqual(self.request().data['rows'][0]['reason'],'specialized_records')

    @patch.dict('os.environ', ENV)
    def test_conflict_and_changed_file_block(self):
        plan=self.request().data
        raw=self.workbook([{**self.row,'weight_kg':75}])
        self.assertEqual(self.apply(plan,raw=raw).status_code,409)
        card=EmployeeHealthCard.objects.create(employee=self.e,data={'physical':{'weight_kg':'65'}})
        result=self.request().data
        self.assertEqual(result['rows'][0]['reason'],'card_conflict')
        self.assertEqual(self.apply(result).status_code,400)
        card.refresh_from_db()
        self.assertEqual(card.data['physical']['weight_kg'],'65')

    @patch.dict('os.environ', {'STAGING_MODE':'false'})
    def test_production_blocked(self):
        self.assertEqual(self.request().status_code,403)
