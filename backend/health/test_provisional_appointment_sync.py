from datetime import date
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from .models import Employee, EmployeeProfileCompletionEvent, ProvisionalEmployeeImportBatch, ProvisionalEmployeeRosterRow
from .organization_structure import STAGING_PROJECT
from .provisional_appointment_sync import parse_appointment
from .provisional_employee_roster import _seal, _digest

URL = '/api/provisional-employees/appointment-sync/'
ENV = {'STAGING_MODE': 'true', 'RAILWAY_PROJECT_ID': STAGING_PROJECT}


class AppointmentSyncTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser(username='date_admin', password='test-only')
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.batch = ProvisionalEmployeeImportBatch.objects.create(file_sha256='a'*64, file_name='synthetic.xlsx',
            total_rows=5, created_by=self.admin)
        self.ready, self.row = self.make_row(1, '1403/02/17')
        self.conflict, self.conflict_row = self.make_row(2, '2020-01-01', appointment_date=date(2021,1,1))
        self.archived, _ = self.make_row(3, '2020-01-01', is_archived=True)
        self.missing, _ = self.make_row(4, '')
        self.different, _ = self.make_row(5, '2020-01-01', different_name=True)

    def make_row(self, index, source_date, different_name=False, **kwargs):
        nid = f'{1000000000 + index}'
        name = 'موظف تجريبي ' + str(index)
        e = Employee.objects.create(national_id=nid, name=name, **kwargs)
        row = ProvisionalEmployeeRosterRow.objects.create(batch=self.batch, source_row=index+1,
            identity_digest=_digest(nid), classification='name_match',
            sealed_payload=_seal({'national_id': nid, 'name': 'اسم مختلف' if different_name else name,
                                  'appointment_date': source_date}))
        return e, row

    def preview(self):
        res = self.client.post(URL, {'batch_id': self.batch.pk, 'action': 'preview'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        return res.data

    def apply(self, plan, ids, **kwargs):
        return self.client.post(URL, {'batch_id': self.batch.pk, 'action': 'apply',
            'row_ids': ids, 'preview_token': plan['preview_token'], 'confirmed': True,
            'reason': 'تمت مراجعة المصدر المعتمد والهوية', **kwargs}, format='json')

    def test_ummalqura_and_strict_parsing(self):
        self.assertEqual(parse_appointment('١٤٠٣/٠٢/١٧'), (date(1982,12,2), '1403/02/17'))
        self.assertEqual(parse_appointment('2020-02-29'), (date(2020,2,29), ''))
        for bad in ('2021-02-29', '17/02/1403', '1447/13/01'):
            with self.assertRaises((ValueError, OverflowError)):
                parse_appointment(bad)

    @patch.dict('os.environ', ENV)
    def test_preview_fill_only_and_audit(self):
        plan = self.preview()
        self.assertEqual(plan['counts'], {'ready':1,'matched':0,'conflict':1,'unmatched':0,'missing':1,'review':2})
        self.ready.refresh_from_db()
        self.assertIsNone(self.ready.appointment_date)
        self.assertEqual(self.apply(plan, [self.conflict_row.pk]).status_code, 400)
        self.assertEqual(self.apply(plan, [self.row.pk], confirmed=False).status_code, 400)
        self.assertEqual(self.apply(plan, [self.row.pk]).status_code, 200)
        self.ready.refresh_from_db()
        self.conflict.refresh_from_db()
        self.assertEqual(self.ready.appointment_date, date(1982,12,2))
        self.assertEqual(self.ready.roster_hijri_appointment_date, '1403/02/17')
        self.assertEqual(self.conflict.appointment_date, date(2021,1,1))
        self.assertEqual(EmployeeProfileCompletionEvent.objects.filter(employee=self.ready).count(), 1)
        self.assertEqual(self.apply(plan, [self.row.pk]).status_code, 409)
        self.assertEqual(self.preview()['counts']['matched'], 1)

    @patch.dict('os.environ', ENV)
    def test_changed_source_blocks_execution(self):
        plan = self.preview()
        self.row.sealed_payload = _seal({'national_id': self.ready.national_id, 'name': self.ready.name, 'appointment_date': '2020-01-01'})
        self.row.save()
        self.assertEqual(self.apply(plan, [self.row.pk]).status_code, 409)

    @patch.dict('os.environ', {'STAGING_MODE': 'false'})
    def test_production_blocked(self):
        self.assertEqual(self.client.post(URL, {'action':'preview','batch_id': self.batch.pk}, format='json').status_code, 403)
