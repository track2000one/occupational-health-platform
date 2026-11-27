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
from .staging_employee_reset import QA_EXAMPLES

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
        EmployeeHealthCard.objects.bulk_create([EmployeeHealthCard(employee=e,is_approved=True) for e in self.employees])
        self.assertEqual(self.client.get(URL).status_code,409)
        with patch.dict('os.environ',{'RAILWAY_PROJECT_ID':'other'}):
            self.assertEqual(self.client.get(URL).status_code,403)
        staff=get_user_model().objects.create_user(username='sample_staff',password='test-only',is_staff=True)
        self.client.force_authenticate(staff)
        self.assertEqual(self.client.get(URL).status_code,403)
