from unittest.mock import patch
from io import BytesIO
from datetime import date
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from PIL import Image
from rest_framework.test import APIClient
from .models import Employee,EmployeeHealthCard,StagingMedicalAttachment,AuditLog
from .organization_structure import STAGING_PROJECT
from .staging_employee_reset import QA_EXAMPLES
from periodic_stats.models import Initiative,EvidenceAttachment,ReferenceDocument

ENV={'STAGING_MODE':'true','RAILWAY_PROJECT_ID':STAGING_PROJECT}
class MedicalAttachmentTests(TestCase):
    def setUp(self):
        p=patch.dict('os.environ',ENV);p.start();self.addCleanup(p.stop)
        U=get_user_model()
        self.admin=U.objects.create_superuser(username='qa_file_admin',password='Synthetic!Files37')
        self.limited=U.objects.create_user(username='qa_file_reader',password='Synthetic!Files37',is_staff=True)
        self.e=self.employee('OHP-QA-01');self.other=self.employee('OHP-QA-02')
        self.card=EmployeeHealthCard.objects.create(employee=self.e)
        self.other_card=EmployeeHealthCard.objects.create(employee=self.other)
        self.unmarked=Employee.objects.create(name='Unmarked fixture',national_id='1000000091')
        EmployeeHealthCard.objects.create(employee=self.unmarked)
        self.client=APIClient();self.login(self.admin)
        self.url=self.path(self.e)
    def employee(self,num):
        nid,name=QA_EXAMPLES[num]
        return Employee.objects.create(name=name,national_id=nid,employee_number=num,email=num.lower()+'@example.invalid')
    def login(self,user):
        self.client.credentials()
        r=self.client.post('/api/auth/token/',{'username':user.username,'password':'Synthetic!Files37'},format='json')
        self.assertEqual(r.status_code,200,r.data)
        self.client.credentials(HTTP_AUTHORIZATION='Bearer '+r.data['access'])
    def path(self,e):
        return f'/api/staging-clinical/employees/{e.pk}/attachments/'
    def png(self,name='synthetic.png',data=None):
        if data is None:
            b=BytesIO();Image.new('RGB',(32,32),'blue').save(b,format='PNG');data=b.getvalue()
        return SimpleUploadedFile(name,data,content_type='image/png')
    def upload(self,file=None,output='image',confirm='true',url=None):
        return self.client.post(url or self.url,{'file':file or self.png(),'output':output,'synthetic_confirmed':confirm},format='multipart')
    def test_canonical_upload_download_audit_and_cross_card(self):
        b=BytesIO();Image.new('RGB',(32,32),'blue').save(b,format='PNG')
        r=self.upload(self.png(data=b.getvalue()+b'QA_TRAILING_MARKER'))
        self.assertEqual(r.status_code,201,r.data);rid=r.data['id']
        self.assertNotIn('synthetic.png',str(r.data))
        row=StagingMedicalAttachment.objects.get(pk=rid)
        self.assertNotIn(b'QA_TRAILING_MARKER',bytes(row.file_data))
        self.assertEqual(self.upload().status_code,409)
        self.assertEqual(self.client.get(self.url).data['attachments'][0]['id'],rid)
        route=self.url+rid+'/content/'
        res=self.client.get(route);self.assertEqual(res.status_code,200)
        self.assertIn('attachment;',res['Content-Disposition']);self.assertIn('no-store',res['Cache-Control'])
        self.assertEqual(res['X-Content-Type-Options'],'nosniff')
        self.assertEqual(self.client.get(self.path(self.other)+rid+'/content/').status_code,404)
        self.assertEqual(self.client.delete(route).status_code,405)
        self.assertTrue(AuditLog.objects.filter(action='qa_medical_attachment_upload',record_id=rid).exists())
        self.assertTrue(AuditLog.objects.filter(action='qa_medical_attachment_download',record_id=rid).exists())
        StagingMedicalAttachment.objects.filter(pk=rid).update(file_data=b'corrupted')
        self.assertEqual(self.client.get(route).status_code,409)
        pdf=self.upload(output='pdf');self.assertEqual(pdf.status_code,201,pdf.data)
        self.assertEqual(pdf.data['content_type'],'application/pdf')
        self.assertTrue(self.client.get(self.url+pdf.data['id']+'/content/').content.startswith(b'%PDF'))
    def test_denies_bad_input_and_noneligible_users(self):
        for file in (self.png(data=b'\x89PNG\r\n\x1a\nBAD'),self.png('renamed.pdf'),
                self.png(data=b'x'*(5*1024*1024+1)),self.png('renamed.jpg')):
            self.assertIn(self.upload(file).status_code,(400,413))
        self.assertEqual(self.upload(confirm='false').status_code,400)
        self.assertEqual(self.upload(url=self.path(self.unmarked)).status_code,404)
        self.assertEqual(StagingMedicalAttachment.objects.count(),0)
        self.login(self.limited)
        self.assertEqual(self.client.get(self.url).status_code,403)
        self.assertEqual(self.upload().status_code,403)
    def test_card_protection_and_frozen_legacy_evidence(self):
        self.assertEqual(self.upload().status_code,201)
        route=f'/api/employees/{self.e.pk}/health_card/'
        r=self.client.get(route);self.assertEqual(r.status_code,200,getattr(r,'data',None))
        self.assertFalse(r.data['can_delete_draft'])
        r=self.client.delete(route,{'confirmation':'حذف مسودة الاختبار','synthetic_confirmed':True,
            'reason':'retest','card_id':self.card.pk,'updated_at':self.card.updated_at.isoformat()},format='json')
        self.assertEqual(r.status_code,403)
        initiative=Initiative.objects.create(name='Synthetic legacy fixture',start_date=date(2026,1,1),created_by=self.admin)
        a=EvidenceAttachment.objects.create(owner_type='initiative',initiative=initiative,file_name='old.pdf',content_type='application/pdf',byte_size=4,file_data=b'test',checksum_sha256='a'*64,uploaded_by=self.admin)
        base='/api/periodic-statistics/evidence-attachments/'
        self.assertEqual(self.client.get(base+str(a.pk)+'/content/').status_code,403)
        self.assertEqual(self.client.delete(base+str(a.pk)+'/').status_code,403)
        self.assertEqual(self.client.post(base,{'file':self.png(),'owner_type':'initiative','owner_id':initiative.pk},format='multipart').status_code,403)
        ir='/api/periodic-statistics/initiatives/'+str(initiative.pk)+'/'
        r=self.client.get(ir);self.assertEqual(r.status_code,200);self.assertNotIn('attachments',r.data)
        self.assertEqual(self.client.delete(ir).status_code,403)
        self.assertTrue(EvidenceAttachment.objects.filter(pk=a.pk).exists())
    def test_environment_gate_and_legacy_compound(self):
        before=set(ReferenceDocument.objects.values_list('pk',flat=True))
        evidence_before=EvidenceAttachment.objects.count()
        r=self.client.post('/api/periodic-statistics/reference-documents/create-with-attachments/',{'payload':'{"title":"QA"}','files':self.png()},format='multipart')
        self.assertEqual(r.status_code,403)
        self.assertEqual(set(ReferenceDocument.objects.values_list('pk',flat=True)),before)
        self.assertEqual(EvidenceAttachment.objects.count(),evidence_before)
        self.assertFalse(ReferenceDocument.objects.filter(title='QA').exists())
        with patch.dict('os.environ',{'STAGING_MODE':'false','RAILWAY_PROJECT_ID':'not-staging'}):
            self.assertEqual(self.client.get(self.url).status_code,403)
