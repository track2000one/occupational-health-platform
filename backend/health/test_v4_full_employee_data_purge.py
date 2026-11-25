"""Synthetic-only regression of irreversible, V4-isolated employee-only purge."""
from datetime import date, timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from . import models
from .v4_full_employee_data_purge import CONFIRM_TEXT, _assert_model_scope


class FullEmployeeDataPurgeTests(TestCase):
    URL = '/api/admin/v4-full-employee-data-purge/'

    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_superuser(
            username='ci-employee-purge-admin', password='ci-only',
        )
        self.staff = User.objects.create_user(
            username='ci-employee-purge-nonadmin', password='ci-only',
            is_staff=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.center = models.HealthCenter.objects.create(name='Synthetic center', name_ar='مركز اختبار')
        self.parent = models.OrganizationUnit.objects.create(
            code='CI-ORG-EMPLOYEE-PURGE', name='إدارة اختبار',
            kind=models.OrganizationUnit.Kind.DEPARTMENT,
            is_active=True, is_approved=True,
        )
        models.OrganizationUnitApprovalLog.objects.create(
            unit=self.parent, action='v4-activate', user=self.admin,
        )
        models.AuditLog.objects.create(
            user='ci-admin',action='v4_sector_direct_unit_operational_activation',
            model_name='OrganizationUnit',record_id=str(self.parent.pk),
        )

    def post(self, payload, scope='v4'):
        with patch('health.v4_full_employee_data_purge.draft_import_scope',
                   return_value=scope):
            return self.client.post(self.URL,payload,format='json')

    def preview(self,scope='v4'):
        return self.post({'action':'preview'},scope=scope)

    def purge(self, token, **overrides):
        args = {'action':'execute', 'preview_token':token,
                'confirmed':True,'confirm_phrase':CONFIRM_TEXT,
                'reason':'تصفير البيانات المستوردة بالكامل دون تغيير السجلات التنظيمية'}
        args.update(overrides)
        return self.post(args)

    def populate(self):
        employee = models.Employee.objects.create(
            name='Synthetic temporary employee', national_id='9990001039',
            health_center=self.center, organization_unit=self.parent,
        )
        models.EmployeeHealthCard.objects.create(
            employee=employee, card_number='CI-HEALTH-CARD-01',
            data={'test_only':'synthetic value'},
        )
        models.OccupationalHealthAssessment.objects.create(
            employee=employee, assessment_date=date.today(),
            assessor_name='ci-assessor',
        )
        models.EmployeeArchiveEvent.objects.create(
            employee=employee, action='archive', reason='ci archived',
        )
        models.EmployeeOrganizationalHierarchyEvent.objects.create(
            employee=employee, action='change',
            changed_levels=['department'], reason='ci hierarchy',
        )
        models.EmployeeProfileCompletionEvent.objects.create(
            employee=employee, reason='ci verified',
        )
        models.EmployeeEmploymentChange.objects.create(
            employee=employee,
            previous_status='active', new_status='transferred',
            effective_date=date.today(), evidence_reference='ci-test',
        )
        plan = models.WorkforceImportPlan.objects.create(
            created_by=self.admin,file_sha256='a'*64,mapping_sha256='b'*64,
        )
        models.WorkforceImportCreatedEmployee.objects.create(
            plan=plan,employee=employee,source_row=2,
        )
        batch = models.DataImportBatch.objects.create(file_name='Synthetic employee roster.xlsx')
        models.EmployeeImportReview.objects.create(
            batch=batch,source_row=2,fingerprint='c'*64,
            raw_payload={'employee_name':'Synthetic'},
            employee_payload={'name':'Synthetic temporary employee'},
            conflict_employee=employee,
        )
        models.EmployeeImportReviewCleanupBatch.objects.create(
            reason='ci cleanup',applied_at=timezone.now(),
            original_statuses={'1':'conflict'},
        )
        models.EmployeeRegistryResetBatch.objects.create(
            reason='ci reset',applied_at=timezone.now(),
            employee_ids=[employee.pk],
        )
        models.TemporaryWorkforceSnapshot.objects.create(
            file_sha256='d'*64,encrypted_rows=b'SYNTHETIC-ENCRYPTED-ROSTER',
            created_by=self.admin,expires_at=timezone.now()+timedelta(hours=2),
        )
        provisional = models.ProvisionalEmployeeImportBatch.objects.create(
            file_sha256='e'*64,file_name='Synthetic temporary.xlsx',
            total_rows=1,created_by=self.admin,
        )
        row = models.ProvisionalEmployeeRosterRow.objects.create(
            batch=provisional,source_row=2,identity_digest='f'*64,
            sealed_payload='SYNTHETIC-SEALED-CI-ONLY',
            classification='needs_review',
        )
        models.ProvisionalEmployeeNumberCorrectionEvent.objects.create(
            row=row,batch_sha256='e'*64,source_row=2,
            old_number_digest='1'*64,new_number_digest='2'*64,
            evidence_reference='ci-proof',reason='ci-number-change',
            performed_by=self.admin,
        )
        models.AuditLog.objects.create(
            user='ci-admin',action='employee_created',
            model_name='Employee',record_id=str(employee.pk),
        )
        return employee

    def test_model_relation_scope_is_complete(self):
        _assert_model_scope()

    def test_preview_does_not_write_and_reports_all_categories(self):
        self.populate()
        a=self.preview()
        self.assertEqual(a.status_code,200,a.data)
        self.assertEqual(a.data['scope'],'isolated_v4_database_only')
        self.assertTrue(a.data['irreversible'])
        self.assertTrue(a.data['includes_clinical_records'])
        self.assertEqual(a.data['impact']['employees'],1)
        self.assertEqual(a.data['impact']['staged_reviews'],1)
        self.assertEqual(a.data['impact']['provisional_rows'],1)
        self.assertGreaterEqual(a.data['impact']['clinical_records'],2)
        self.assertEqual(models.Employee.objects.count(),1)
        self.assertEqual(models.ProvisionalEmployeeRosterRow.objects.count(),1)
        self.assertEqual(models.HealthCenter.objects.count(),1)
        self.assertEqual(models.OrganizationUnit.objects.count(),1)

    def test_confirm_purges_all_employee_data_and_preserves_registry(self):
        self.populate()
        preview=self.preview().data
        result=self.purge(preview['preview_token'])
        self.assertEqual(result.status_code,200,result.data)
        self.assertEqual(result.data['status'],'deleted')
        self.assertEqual(result.data['remaining_employee_records'],0)
        self.assertTrue(result.data['purge_reference'].startswith('purge-'))
        for model in (
            models.Employee,models.EmployeeHealthCard,
            models.OccupationalHealthAssessment,models.EmployeeArchiveEvent,
            models.EmployeeOrganizationalHierarchyEvent,
            models.EmployeeProfileCompletionEvent,models.EmployeeEmploymentChange,
            models.WorkforceImportCreatedEmployee,models.WorkforceImportPlan,
            models.DataImportBatch,models.EmployeeImportReview,
            models.EmployeeImportReviewCleanupBatch,
            models.EmployeeRegistryResetBatch,models.TemporaryWorkforceSnapshot,
            models.ProvisionalEmployeeRosterRow,
            models.ProvisionalEmployeeImportBatch,
            models.ProvisionalEmployeeNumberCorrectionEvent,
        ):
            self.assertEqual(model.objects.count(),0,model.__name__)
        self.assertEqual(models.HealthCenter.objects.count(),1)
        self.assertEqual(models.OrganizationUnit.objects.count(),1)
        self.assertEqual(models.OrganizationUnitApprovalLog.objects.count(),1)
        self.assertEqual(get_user_model().objects.count(),2)
        self.assertEqual(models.AuditLog.objects.filter(
            model_name='OrganizationUnit').count(),1)
        self.assertEqual(models.AuditLog.objects.filter(model_name='Employee').count(),0)
        self.assertEqual(models.AuditLog.objects.filter(
            model_name='V4EmployeeDataPurge').count(),1)
        self.assertEqual(self.preview().data['impact']['employees'],0)
        self.assertEqual(self.preview().data['impact']['employee_audit_entries'],0)

    def test_preview_expires_on_new_employee_or_review(self):
        self.populate()
        token=self.preview().data['preview_token']
        models.Employee.objects.create(name='Added after preview',national_id='9990001040')
        response=self.purge(token)
        self.assertEqual(response.status_code,409,response.data)
        self.assertEqual(models.Employee.objects.count(),2)

    def test_rejects_without_phrase_reason_confirmation_or_bad_token(self):
        self.populate()
        token=self.preview().data['preview_token']
        self.assertEqual(self.purge(token,confirm_phrase='حذف').status_code,400)
        self.assertEqual(self.purge(token,confirmed=False).status_code,400)
        self.assertEqual(self.purge(token,reason='قصير').status_code,400)
        self.assertEqual(self.purge('forged-token').status_code,409)
        self.assertEqual(models.Employee.objects.count(),1)

    def test_forbidden_to_non_superuser_and_outside_v4(self):
        self.populate()
        self.assertEqual(self.preview(scope='production').status_code,403)
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.preview().status_code,403)
        self.assertEqual(models.Employee.objects.count(),1)

    def test_no_get_or_unrequested_delete(self):
        self.assertEqual(self.client.get(self.URL).status_code,405)
        self.assertEqual(self.client.delete(self.URL).status_code,405)

    def test_empty_database_preview_no_impact_and_purge_repeat_safe(self):
        preview=self.preview().data
        self.assertEqual(preview['impact']['employees'],0)
        self.assertEqual(preview['impact']['clinical_records'],0)
        result=self.purge(preview['preview_token'])
        self.assertEqual(result.status_code,200,result.data)
        self.assertEqual(models.HealthCenter.objects.count(),1)
        self.assertEqual(models.OrganizationUnit.objects.count(),1)
        self.assertEqual(models.AuditLog.objects.filter(
            model_name='V4EmployeeDataPurge').count(),1)
