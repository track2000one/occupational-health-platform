from io import BytesIO
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from openpyxl import load_workbook
from rest_framework.test import APIClient
from .health_card_presence import CARD_FIELDS, card_presence, derived_bmi
from .models import Employee, EmployeeHealthCard
from .organization_structure import STAGING_PROJECT

ENV={'STAGING_MODE':'true','RAILWAY_PROJECT_ID':STAGING_PROJECT}
TEMPLATE='/api/health-data-import/template/'
METRICS='/api/staging-clinical/metrics/'
IMPORT='/api/health-data-import/draft-commit/'

class CardCompletionTests(TestCase):
    def setUp(self):
        environment = patch.dict('os.environ', ENV)
        environment.start()
        self.addCleanup(environment.stop)
        self.admin=get_user_model().objects.create_superuser(username='completion_qa',password='test-only')
        self.client=APIClient()
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(TEMPLATE,{'action':'prepare_import_fixtures','synthetic_confirmed':True},format='json').status_code,201)
        self.employees=list(Employee.objects.order_by('pk'))
    def card(self,e):
        res=self.client.get(f'/api/employees/{e.pk}/health_card/')
        self.assertEqual(res.status_code,200,res.data)
        return res.data
    def test_blank_and_imported_cards_metrics_excel_consistent(self):
        blank=self.card(self.employees[0])
        self.assertIsNone(blank['employee']['age'])
        self.assertEqual(blank['employee']['gender'],'')
        self.assertEqual(blank['data']['employment']['current_position'],'')
        self.assertEqual(blank['reviewed_by'],'')
        self.assertIsNone(blank['derived_bmi'])
        self.assertEqual(blank['completion']['recorded'],0)
        self.assertFalse(blank['exists'])
        raw=self.client.get(TEMPLATE+'?sample=1').content
        def send(**kwargs):
            return self.client.post(IMPORT,{'file':SimpleUploadedFile('sample.xlsx',raw),
                'synthetic_confirmed':'true',**kwargs},format='multipart')
        plan=send(action='preview')
        self.assertEqual(plan.data['eligible_values'],9)
        result=send(action='apply',preview_token=plan.data['preview_token'],selected_rows='[2,3,4]',
            confirmation='استكمال مسودات الاختبار',reason='اختبار اتساق البطاقات والمؤشرات')
        self.assertEqual(result.status_code,200,result.data)
        before=list(EmployeeHealthCard.objects.order_by('pk').values())
        for e in self.employees:
            c=self.card(e)
            self.assertEqual(c['derived_bmi'],'24.9')
            self.assertEqual(c['data']['physical']['bmi'],'')
            self.assertEqual(c['data']['physical']['obesity_status'],'')
            self.assertEqual(c['data']['physical']['weight_kg'],'72')
            self.assertEqual(c['completion'],{'recorded':3,'possible':len(CARD_FIELDS),
                'percent':round(300/len(CARD_FIELDS),1),'complete':False})
            self.assertFalse(c['is_approved'])
        metrics=self.client.get(METRICS)
        self.assertEqual(metrics.status_code,200,metrics.data)
        summary={r['key']:r['value'] for r in metrics.data['summary']}
        self.assertEqual(summary['cards'],3)
        self.assertEqual(summary['incomplete_cards'],3)
        self.assertEqual(summary['complete_cards'],0)
        self.assertEqual(metrics.data['field_presence']['recorded'],9)
        self.assertEqual(metrics.data['field_presence']['possible'],3*len(CARD_FIELDS))
        self.assertEqual(summary['field_presence'],round(300/len(CARD_FIELDS),1))
        export=self.client.get(METRICS,{'download':'xlsx'})
        self.assertEqual(export.status_code,200)
        book=load_workbook(BytesIO(export.content))
        rows={r[0]:r[1] for r in book['المؤشرات'].iter_rows(min_row=2,values_only=True)}
        for item in metrics.data['summary']:
            self.assertEqual(rows[item['label']],item['value'])
        self.assertEqual(len(book.worksheets),6)
        book.close()
        self.assertEqual(list(EmployeeHealthCard.objects.order_by('pk').values()),before)

    def test_explicit_values_and_bmi_guard(self):
        e=self.employees[0]
        e.current_job='QA actual job'
        e.gender='female'
        e.save()
        saved={'physical':{'weight_kg':'72','height_cm':'170','bmi':'25.0'},
               'conditions':{'diabetes':False},'mental':{'phq_result':0}}
        card=EmployeeHealthCard.objects.create(employee=e,data=saved)
        data=self.card(e)
        self.assertEqual(data['employee']['gender'],'female')
        self.assertEqual(data['data']['employment']['current_position'],'QA actual job')
        self.assertIsNone(data['derived_bmi'])
        self.assertEqual(data['data']['physical']['bmi'],'25.0')
        self.assertEqual(data['completion']['recorded'],5)
        card.refresh_from_db()
        self.assertEqual(card.data,saved)
        for bad in ('0','-1','NaN','Infinity','abc','1e-9999999',True,None):
            self.assertIsNone(derived_bmi({'physical':{'weight_kg':72,'height_cm':bad}}))
        self.assertIsNone(derived_bmi({'physical':{'weight_kg':72}}))
        self.assertEqual(card_presence({'conditions':{'diabetes':False,'hypertension':'unknown'},'mental':{'phq_result':0}})['recorded'],2)
        full={}
        for section,key in CARD_FIELDS:
            full.setdefault(section,{})[key]='QA'
        self.assertTrue(card_presence(full)['complete'])
