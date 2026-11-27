from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from .models import Employee,HealthCenter,OrganizationUnit,UserProfile
from .organization_structure import STAGING_PROJECT
from .staging_employee_reset import QA_EXAMPLES

ENV={'STAGING_MODE':'true','RAILWAY_PROJECT_ID':STAGING_PROJECT}
class ScopeTests(TestCase):
    def setUp(self):
        p=patch.dict('os.environ',ENV);p.start();self.addCleanup(p.stop)
        U=get_user_model()
        self.admin=U.objects.create_superuser(username='qa_scope_admin',password='test-only')
        self.user=U.objects.create_user(username='qa_scope_user',password='test-only',is_staff=True)
        self.profile,_=UserProfile.objects.update_or_create(user=self.user,defaults={'role':'centerManager'})
        self.s1=OrganizationUnit.objects.create(code='S1',name='Sector 1',kind='sector',is_approved=True)
        self.s2=OrganizationUnit.objects.create(code='S2',name='Sector 2',kind='sector',is_approved=True)
        self.c1=HealthCenter.objects.create(code='C1',name='Center 1')
        self.c2=HealthCenter.objects.create(code='C2',name='Center 2')
        self.n1=OrganizationUnit.objects.create(code='N1',name='Center 1',kind='center',parent=self.s1,health_center=self.c1,is_approved=True)
        self.n2=OrganizationUnit.objects.create(code='N2',name='Center 2',kind='center',parent=self.s2,health_center=self.c2,is_approved=True)
        self.d=OrganizationUnit.objects.create(code='D1',name='Department',kind='department',parent=self.s1,is_approved=True)
        self.a=self.make('OHP-QA-01',health_center=self.c1,organization_unit=self.n1)
        self.b=self.make('OHP-QA-02',health_center=self.c2,organization_unit=self.n2)
        self.c=self.make('OHP-QA-03',organization_unit=self.d)
        self.bad=Employee.objects.create(name='UNMARKED FIXTURE',national_id='1000000011',health_center=self.c1,organization_unit=self.n1)
        self.conflict=self.make('OHP-QA-04',health_center=self.c2,organization_unit=self.n1)
        self.fallback=self.make('OHP-QA-05',health_center=self.c1)
        self.client=APIClient()
        self.token(self.user)
    def make(self,num,**kw):
        nid,name=QA_EXAMPLES[num]
        return Employee.objects.create(name=name,national_id=nid,employee_number=num,email=num.lower()+'@example.invalid',**kw)
    def token(self,user):
        self.client.credentials(HTTP_AUTHORIZATION='Bearer '+str(RefreshToken.for_user(user).access_token))
    def scope(self,node):
        self.profile.organization_scope=node;self.profile.save(update_fields=['organization_scope'])
    def ids(self):
        r=self.client.get('/api/employees/')
        self.assertEqual(r.status_code,200,r.data)
        for row in r.data['results']:
            self.assertEqual(set(row),{'id','name','employee_number','job_title','health_center_name','organization_unit_name'})
        return {row['id'] for row in r.data['results']}
    def test_center_sector_department_and_direct_ids(self):
        self.assertEqual(self.ids(),set())
        self.scope(self.n1)
        self.assertEqual(self.ids(),{self.a.pk,self.fallback.pk})
        self.assertEqual(self.client.get(f'/api/employees/{self.b.pk}/').status_code,404)
        self.assertEqual(self.client.get(f'/api/employees/{self.bad.pk}/').status_code,404)
        self.scope(self.s1)
        self.assertEqual(self.ids(),{self.a.pk,self.c.pk,self.fallback.pk})
        self.scope(self.d)
        self.assertEqual(self.ids(),{self.c.pk})
        self.s1.is_approved=False;self.s1.save()
        self.assertEqual(self.ids(),set())
    def test_limited_jwt_denies_writes_and_alternate_paths(self):
        self.scope(self.n1)
        for path in ('/api/employees/report/','/api/provisional-employees/','/api/employee-import-reviews/',
            '/api/periodic-statistics/summary/','/api/audit-logs/','/api/users/','/api/staging-clinical/metrics/',
            f'/api/employees/{self.a.pk}/health_card/'):
            self.assertEqual(self.client.get(path).status_code,403,path)
        self.assertEqual(self.client.patch(f'/api/employees/{self.a.pk}/',{'name':'changed'},format='json').status_code,403)
        self.assertEqual(self.client.get('/api/users/me/').status_code,200)
        self.assertEqual(self.client.get('/api/employees/',{'search':self.a.national_id}).data['count'],0)
    def test_self_identity_and_role_deny(self):
        self.profile.role='employee';self.profile.employee_number=self.a.employee_number;self.profile.national_id=self.b.national_id;self.profile.save()
        self.assertEqual(self.ids(),set())
        self.profile.national_id=self.a.national_id;self.profile.save()
        self.assertEqual(self.ids(),{self.a.pk})
        self.profile.role='techSupport';self.profile.organization_scope=self.n1;self.profile.save()
        self.assertEqual(self.ids(),set())
    def test_admin_assigns_only_approved_scope_and_revocation(self):
        self.token(self.admin)
        url=f'/api/users/{self.user.pk}/'
        r=self.client.patch(url,{'organizationScopeId':self.n1.pk},format='json')
        self.assertEqual(r.status_code,200,r.data)
        self.profile.refresh_from_db();self.assertEqual(self.profile.organization_scope_id,self.n1.pk)
        self.s2.is_approved=False;self.s2.save()
        self.assertEqual(self.client.patch(url,{'organizationScopeId':self.n2.pk},format='json').status_code,400)
        self.assertEqual(self.client.patch(url,{'organizationScopeId':None},format='json').status_code,200)
        self.token(self.user);self.assertEqual(self.ids(),set())
