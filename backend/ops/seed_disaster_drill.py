"""Run via manage.py shell only against the dedicated synthetic CI database."""
from urllib.parse import urlsplit
import os
from hashlib import sha256
from io import BytesIO
from uuid import uuid4
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from PIL import Image
from health.models import (Employee,HealthCenter,OrganizationUnit,EmployeeHealthCard,
    StagingMedicalAttachment,StagingAuthSession,AuditLog)
from health.staging_employee_reset import QA_EXAMPLES

u=urlsplit(os.environ.get('DATABASE_URL',''))
if u.hostname!='127.0.0.1' or u.path!='/occupational_ci' or os.environ.get('OHP_DR_CI_SYNTHETIC')!='yes':
    raise RuntimeError('Synthetic CI database required.')
admin=get_user_model().objects.create_superuser(username='qa_dr_only',password='Synthetic-CI-Only-Not-A-Real-Password!')
center=HealthCenter.objects.create(name='Synthetic CI Center',code='QA-DR-CENTER')
node=OrganizationUnit.objects.create(name='Synthetic CI department',code='QA-DR-UNIT',kind='department',is_approved=True)
nid,name=QA_EXAMPLES['OHP-QA-01']
emp=Employee.objects.create(name=name,national_id=nid,employee_number='OHP-QA-01',email='ohp-qa-01@example.invalid',
    health_center=center,organization_unit=node,risk_level='high')
card=EmployeeHealthCard.objects.create(employee=emp,created_by=admin,data={'physical':{'weight_kg':'72','height_cm':'170'},'conditions':{'diabetes':'No'}})
img=BytesIO();Image.new('RGB',(32,32),'blue').save(img,format='PNG');data=img.getvalue()
attachment=StagingMedicalAttachment.objects.create(id=uuid4(),card=card,uploaded_by=admin,content_type='image/png',
    byte_size=len(data),checksum_sha256=sha256(data).hexdigest(),file_data=data)
StagingAuthSession.objects.create(id=uuid4(),user=admin,password_stamp='synthetic-stamp',refresh_jti='synthetic-jti',
    expires_at=timezone.now()+timedelta(hours=1),revoked_at=timezone.now())
AuditLog.objects.create(user=str(admin.pk),action='qa_medical_attachment_upload',model_name='StagingMedicalAttachment',record_id=str(attachment.pk))
print('Seeded synthetic disaster rehearsal: employee, organization, card, binary attachment, revoked session, audit.')
