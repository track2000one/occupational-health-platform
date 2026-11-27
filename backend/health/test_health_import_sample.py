from io import BytesIO
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from openpyxl import load_workbook
from rest_framework.test import APIClient
from .health_data_import import HEADERS
from .models import Employee, EmployeeHealthCard, LabTest, DataImportBatch, AuditLog
from .organization_structure import STAGING_PROJECT
from .staging_employee_reset import QA_EXAMPLES, IMPORT_QA_EXAMPLES

ENV={'STAGING_MODE':'true','RAILWAY_PROJECT_ID':STAGING_PROJECT}
URL='/api/health-data-import/template/?sample=1'

@patch.dict('os.environ',ENV)
class SyntheticSampleTests(TestCase):
    def setUp(self):
        self.admin=get_user_model().objects.create_superuser(username='sample_qa',password='test-only')
        self.client=APIClient()
        self.client.force_authenticate(self.admin)
        self.employees=[]
        for key in ('OHP-QA-01','OHP-QA-02','OHP-QA-03'):
            nid,name=QA_EXAMPLES[key]
            self.employees.append(Employee.objects.create(name=name,national_id=nid,
                employee_number=key,email=key.lower()+'@example.invalid'))
        self.other=Employee.objects.create(name='UNMARKED FIXTURE',national_id='1000000091')

    def test_sample_matches_and_has_only_safe_proposed_fields(self):
        EmployeeHealthCard.objects.create(employee=self.employees[1],is_approved=True)
        LabTest.objects.create(employee=self.employees[2],test_type='QA')
        res=self.client.get(URL)
        self.assertEqual(res.status_code,200,res.data if hasattr(res,'data') else '')
        self.assertEqual(res['Cache-Control'],'private, no-store')
        book=load_workbook(BytesIO(res.content))
        sheet=book['HealthData']
        self.assertEqual(tuple(c.value for c in sheet[1]),HEADERS)
        self.assertEqual(sheet.max_row,2)
        self.assertEqual(sheet['B2'].value,self.employees[0].national_id)
        self.assertEqual(book['دليل الحقول']['B2'].value,'مرجع الصف')
        book.close()
        for path,extra in (('/api/health-data-import/preview/',{}),
                           ('/api/health-data-import/draft-commit/',{'action':'preview'})):
            result=self.client.post(path,{'file':SimpleUploadedFile('sample.xlsx',res.content),
                'synthetic_confirmed':'true',**extra},format='multipart')
            self.assertEqual(result.status_code,200,result.data)
            if extra:
                self.assertEqual(result.data['counts']['ready'],1)
                self.assertEqual(result.data['eligible_values'],3)
            else:
                self.assertEqual(result.data['identity_counts']['matched'],1)
                self.assertEqual(result.data['field_totals']['proposed'],3)
                self.assertEqual(result.data['field_totals']['empty'],58)
        self.assertEqual(Employee.objects.count(),4)
        self.assertEqual(EmployeeHealthCard.objects.count(),1)
        self.assertEqual(DataImportBatch.objects.count(),0)
        self.assertFalse(AuditLog.objects.filter(action='health_data_draft_fill').exists())

    def test_no_eligible_and_wrong_project_denied(self):
        for e in self.employees:
            EmployeeHealthCard.objects.create(employee=e,is_approved=True)
        self.assertEqual(self.client.get(URL).status_code,409)
        with patch.dict('os.environ',{'RAILWAY_PROJECT_ID':'other'}):
            self.assertEqual(self.client.get(URL).status_code,403)
        staff=get_user_model().objects.create_user(username='sample_staff',password='test-only',is_staff=True)
        self.client.force_authenticate(staff)
        self.assertEqual(self.client.get(URL).status_code,403)


    def prepare(self, **override):
        return self.client.post('/api/health-data-import/template/',
            {'action':'prepare_import_fixtures','synthetic_confirmed':True,**override},format='json')

    def test_dedicated_fixtures_create_once_and_import_end_to_end(self):
        before = list(Employee.objects.order_by('pk').values())
        self.assertEqual(self.prepare(synthetic_confirmed=False).status_code,400)
        self.assertEqual(self.prepare().data,{'created':3,'existing':0})
        self.assertEqual(self.prepare().data,{'created':0,'existing':3})
        self.assertEqual(Employee.objects.count(),7)
        self.assertEqual(list(Employee.objects.filter(pk__in=[r['id'] for r in before]).order_by('pk').values()),before)
        self.assertEqual(AuditLog.objects.filter(action='staging_health_import_fixture_create').count(),3)
        sample=self.client.get(URL)
        self.assertEqual(sample.status_code,200)
        book=load_workbook(BytesIO(sample.content))
        self.assertEqual([row[1] for row in book['HealthData'].iter_rows(min_row=2,values_only=True)],
                         [nid for nid,_ in IMPORT_QA_EXAMPLES.values()])
        book.close()
        path='/api/health-data-import/draft-commit/'
        def send(**kwargs):
            return self.client.post(path,{'file':SimpleUploadedFile('sample.xlsx',sample.content),
                'synthetic_confirmed':'true',**kwargs},format='multipart')
        plan=send(action='preview')
        self.assertEqual(plan.status_code,200,plan.data)
        self.assertEqual(plan.data['counts']['ready'],3)
        self.assertEqual(plan.data['eligible_values'],9)
        applied=send(action='apply',preview_token=plan.data['preview_token'],
            selected_rows='[2,3,4]',confirmation='استكمال مسودات الاختبار',reason='اختبار الاستيراد UAT-002')
        self.assertEqual(applied.status_code,200,applied.data)
        self.assertEqual(applied.data['updated_cards'],3)
        self.assertEqual(applied.data['updated_values'],9)
        cards=EmployeeHealthCard.objects.filter(employee__employee_number__in=IMPORT_QA_EXAMPLES)
        self.assertEqual(cards.count(),3)
        self.assertFalse(cards.filter(is_approved=True).exists())
        for card in cards:
            self.assertEqual(card.data['physical']['weight_kg'],'72')
            self.assertEqual(card.data['conditions']['diabetes'],'No')
        snapshot=list(cards.order_by('pk').values())
        self.assertEqual(self.prepare().data,{'created':0,'existing':3})
        self.assertEqual(list(cards.order_by('pk').values()),snapshot)
        self.assertEqual(list(Employee.objects.filter(pk__in=[r['id'] for r in before]).order_by('pk').values()),before)

    def test_collision_atomic_and_prepare_permissions(self):
        nid,_=IMPORT_QA_EXAMPLES['OHP-QA-IMPORT-02']
        Employee.objects.create(national_id=nid,name='COLLISION FIXTURE')
        before=list(Employee.objects.order_by('pk').values())
        self.assertEqual(self.prepare().status_code,409)
        self.assertEqual(list(Employee.objects.order_by('pk').values()),before)
        self.assertEqual(AuditLog.objects.filter(action='staging_health_import_fixture_create').count(),0)
        with patch.dict('os.environ',{'RAILWAY_PROJECT_ID':'other'}):
            self.assertEqual(self.prepare().status_code,403)
        staff=get_user_model().objects.create_user(username='prepare_staff',password='test-only',is_staff=True)
        self.client.force_authenticate(staff)
        self.assertEqual(self.prepare().status_code,403)

    def test_blocker_categories_without_medical_values(self):
        e=self.employees[0]
        e.lab_request='PRIVATE-QA-TEST-DETAIL'
        e.save(update_fields=['lab_request'])
        LabTest.objects.create(employee=e,test_type='PRIVATE-QA-LAB-DETAIL')
        from .health_data_import import template_bytes
        raw=template_bytes([{'national_id':e.national_id,'employee_name':e.name,'weight_kg':72}])
        result=self.client.post('/api/health-data-import/draft-commit/',{'file':SimpleUploadedFile('sample.xlsx',raw),
            'synthetic_confirmed':'true','action':'preview'},format='multipart')
        self.assertEqual(result.status_code,200,result.data)
        row=result.data['rows'][0]
        self.assertEqual(row['reason'],'specialized_records')
        self.assertEqual(row['blockers'],['LabTest','lab_request'])
        self.assertNotIn('PRIVATE-QA',str(result.data))
