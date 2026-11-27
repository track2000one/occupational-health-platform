"""Bounded, local synthetic security/performance regression; no Railway traffic."""
from concurrent.futures import ThreadPoolExecutor
from time import perf_counter
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.db import connection, connections
from django.test import TransactionTestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient
from .models import Employee, HealthCenter, OrganizationUnit, UserProfile
from .organization_structure import STAGING_PROJECT
from .staging_registry_scope import SCOPED_ROLES

ENV={'STAGING_MODE':'true','RAILWAY_PROJECT_ID':STAGING_PROJECT}
FIELDS={'id','name','employee_number','job_title','health_center_name','organization_unit_name'}
PASSWORD='Synthetic!Performance37'

class StagingSecurityPerformanceTests(TransactionTestCase):
    def setUp(self):
        p=patch.dict('os.environ',ENV);p.start();self.addCleanup(p.stop)
        U=get_user_model()
        self.reader=U.objects.create_user(username='qa_perf_reader',password=PASSWORD,is_staff=True)
        self.sector=OrganizationUnit.objects.create(code='QA-PERF-S',name='Synthetic sector',kind='sector',is_approved=True)
        self.centers=[];self.nodes=[]
        for i in range(1,26):
            c=HealthCenter.objects.create(code=f'QA-C{i:02d}',name=f'Synthetic center {i}')
            self.centers.append(c)
            self.nodes.append(OrganizationUnit.objects.create(code=f'QA-PERF-N{i:02d}',name=f'Synthetic unit {i}',
                kind='center',health_center=c,parent=self.sector,is_approved=True))
        rows=[]
        for i in range(1,1424):
            ix=(((i-1)*37)%131)%25
            rows.append(Employee(name=f'موظف تجريبي رقم {i:04d}',national_id=f'9991{i:06d}',
                employee_number=f'OHP-LOAD-{i:04d}',email=f'qa-load-{i:04d}@example.invalid',
                health_center=self.centers[ix],organization_unit=self.nodes[ix],job_title='Synthetic job'))
        Employee.objects.bulk_create(rows,batch_size=140)
        self.unverified=Employee.objects.create(name='Unmarked CI fixture',national_id='1000000077',
            employee_number='OHP-LOAD-1424',email='unmarked@example.invalid',health_center=self.centers[0],organization_unit=self.nodes[0])
        self.profile,_=UserProfile.objects.update_or_create(user=self.reader,defaults={'role':'centerManager','organization_scope':self.sector})
        self.client=APIClient()
        r=self.client.post('/api/auth/token/',{'username':self.reader.username,'password':PASSWORD},format='json')
        self.assertEqual(r.status_code,200,r.data)
        self.token=r.data['access'];self.client.credentials(HTTP_AUTHORIZATION='Bearer '+self.token)

    def test_bounded_registry_and_permission_matrix(self):
        times=[];counts=[]
        for path in ('/api/employees/?page=1','/api/employees/?page=57','/api/employees/?search=OHP-LOAD-1423'):
            start=perf_counter()
            with CaptureQueriesContext(connection) as queries:
                r=self.client.get(path)
            times.append((perf_counter()-start)*1000);counts.append(len(queries))
            self.assertEqual(r.status_code,200,r.data)
            self.assertEqual(r.data['count'],1 if 'search=' in path else 1423)
            self.assertLessEqual(len(r.data['results']),25)
            self.assertTrue(all(set(x)==FIELDS for x in r.data['results']))
            self.assertLessEqual(len(queries),12,'Scoped directory query budget exceeded')
            self.assertFalse(any('health_employeehealthcard' in q['sql'].lower() for q in queries))
            self.assertIn('no-store',r['Cache-Control'])
            self.assertEqual(r['X-Content-Type-Options'],'nosniff')
            self.assertEqual(r['Referrer-Policy'],'no-referrer')
            self.assertEqual(r['X-Frame-Options'],'DENY')
        print(f'STAGING PERF sequential: employees=1423 queries_max={max(counts)} elapsed_ms_max={max(times):.1f}')
        self.assertEqual(self.client.get(f'/api/employees/{self.unverified.pk}/').status_code,404)
        # Exercise every scoped role under the same approved scope, and denied roles.
        for role in sorted(SCOPED_ROLES):
            UserProfile.objects.filter(pk=self.profile.pk).update(role=role)
            r=self.client.get('/api/employees/?search=OHP-LOAD-1423')
            self.assertEqual(r.status_code,200,r.data);self.assertEqual(r.data['count'],1,role)
        for role in ('techSupport','campaignOfficer','executive','systemAdmin','employee'):
            UserProfile.objects.filter(pk=self.profile.pk).update(role=role)
            r=self.client.get('/api/employees/')
            self.assertEqual(r.status_code,200,r.data);self.assertEqual(r.data['count'],0,role)
        UserProfile.objects.filter(pk=self.profile.pk).update(role='centerManager')
        for path in ('/api/employees/report/','/api/users/','/api/audit-logs/','/api/staging-clinical/metrics/',
                     '/api/periodic-statistics/summary/','/api/periodic-statistics/evidence-attachments/'):
            self.assertEqual(self.client.get(path).status_code,403,path)
        e=Employee.objects.get(employee_number='OHP-LOAD-0001')
        self.assertEqual(self.client.get(f'/api/employees/{e.pk}/health_card/').status_code,403)
        self.assertEqual(self.client.patch(f'/api/employees/{e.pk}/',{'name':'changed'},format='json').status_code,403)
        # Revocation cannot leave a cached permission behind.
        self.sector.is_approved=False;self.sector.save(update_fields=['is_approved'])
        self.assertEqual(self.client.get('/api/employees/').data['count'],0)
        self.sector.is_approved=True;self.sector.save(update_fields=['is_approved'])
        # PostgreSQL only: 20 local reads, at most four concurrent workers.
        # No production traffic, no long-running stress, no timing pass/fail threshold.
        if connection.vendor=='postgresql':
            token=self.token
            def worker(_):
                c=APIClient();c.credentials(HTTP_AUTHORIZATION='Bearer '+token)
                try:
                    start=perf_counter();r=c.get('/api/employees/?page=1')
                    return r.status_code,r.data.get('count'),(perf_counter()-start)*1000
                finally:
                    connections.close_all()
            start=perf_counter()
            with ThreadPoolExecutor(max_workers=4) as pool:
                results=list(pool.map(worker,range(20)))
            self.assertTrue(all(status==200 and count==1423 for status,count,_ in results))
            lat=sorted(t for _,_,t in results)
            print(f'STAGING PERF concurrent: requests=20 workers=4 success=20 elapsed_s={perf_counter()-start:.2f} p95_ms={lat[18]:.1f} max_ms={lat[-1]:.1f}')
        self.client.credentials()
        self.assertEqual(self.client.get('/api/employees/').status_code,401)
        self.client.credentials(HTTP_AUTHORIZATION='Bearer invalid-token')
        self.assertEqual(self.client.get('/api/employees/').status_code,401)
        r=self.client.post('/api/auth/token/',{'username':'qa_perf_reader','password':'x'*17000},format='json')
        self.assertEqual(r.status_code,413)
        self.assertIn('no-store',r['Cache-Control'])
