"""Deterministic, NON-PERSONAL production-scale load dataset for STAGING only.

Creates 1,423 synthetic employee records to exercise pagination, filtering,
organization mapping and status reports. No names, IDs or contacts from uploaded
workbooks are used. This is NOT an employee-data migration/import.
"""
import os
from collections import Counter

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from health.models import Employee, HealthCenter, WorkforceCenterMapping
from health.workforce_preview import group_fingerprint

EXPECTED_STAGING_PROJECT_ID = 'cf4b2162-5236-4f92-b010-165f505fe2c2'
TOTAL_LOAD_EMPLOYEES = 1423
TOTAL_TEST_CENTERS = 25
TOTAL_TEST_ORGANIZATIONS = 131

# Only aggregate status frequencies are copied from the source's analysis.
SOURCE_STATUS_FREQUENCIES = (
    ('تعيين نشط', 1396),
    ('إيفاد للدراسة بالداخل', 8),
    ('مجــــــاز استثنائيا', 6),
    ('إجازة وضع غير مدفوعة', 4),
    ('إيقاف راتب مؤقتا', 2),
    ('إجازة مرضية - مدفوعة الأجر', 2),
    ('إجازة مرضية ثلاثة أرباع مدفوعة', 2),
    ('إجازة مرضية - بدون راتب', 1),
    ('مكلف داخلي', 1),
    ('اجازة أمومة/رعاية مولود', 1),
)


def requires_explicit_staging():
    if os.getenv('STAGING_MODE', '').lower() != 'true':
        raise CommandError('This operation is forbidden outside STAGING_MODE=true.')
    if os.getenv('SEED_STAGING_LOAD_DATA', '').lower() != 'true':
        raise CommandError('Explicit load-test opt-in is required.')
    if os.getenv('RAILWAY_PROJECT_ID') != EXPECTED_STAGING_PROJECT_ID:
        raise CommandError('Railway project is NOT the isolated test project.')


class Command(BaseCommand):
    help = 'Seed 1,423 obviously synthetic employees and 25 QA centers, safely and idempotently.'

    @transaction.atomic
    def handle(self, *args, **options):
        requires_explicit_staging()
        if sum(count for _, count in SOURCE_STATUS_FREQUENCIES) != TOTAL_LOAD_EMPLOYEES:
            raise CommandError('Synthetic status frequency total is invalid.')

        # Never touch or coexist with real employees; no automatic deletes.
        forbidden = (Employee.objects
            .exclude(employee_number__startswith='OHP-QA-')
            .exclude(employee_number__startswith='OHP-LOAD-'))
        if forbidden.exists():
            raise CommandError('Non-synthetic employees detected; refusing the load.')
        bad_load = (Employee.objects.filter(employee_number__startswith='OHP-LOAD-')
            .exclude(national_id__startswith='9991'))
        if bad_load.exists():
            raise CommandError('Unexpected non-test identity on a staging load record.')

        center_rows = []
        for number in range(1, TOTAL_TEST_CENTERS + 1):
            key = f'QA-C{number:02d}'
            center, _ = HealthCenter.objects.get_or_create(
                code=key,
                defaults={
                    'name': f'QA Synthetic Health Center {number:02d}',
                    'name_ar': f'مركز صحي تجريبي {number:02d}',
                    'name_en': f'QA Synthetic Health Center {number:02d}',
                    'manager_name': f'مدير تجريبي {number:02d}',
                    'region': 'Synthetic test region',
                    'city': 'Synthetic test city',
                    'is_active': True,
                }
            )
            if not center.name.startswith('QA Synthetic Health Center'):
                raise CommandError('QA center code collision detected.')
            center_rows.append(center)

        statuses = [name for name, count in SOURCE_STATUS_FREQUENCIES
                    for _ in range(count)]
        if len(statuses) != TOTAL_LOAD_EMPLOYEES:
            raise CommandError('Wrong synthetic status array length.')

        # The 131 organization labels are fake, with deterministic center mapping.
        new_mappings = []
        for org_number in range(1, TOTAL_TEST_ORGANIZATIONS + 1):
            organization = f'وحدة تنظيمية تجريبية {org_number:03d}'
            org_type = 'وحدة اختبار'
            fingerprint = group_fingerprint(organization, org_type)
            existing = WorkforceCenterMapping.objects.filter(fingerprint=fingerprint).first()
            if existing:
                if existing.approval_reference != 'SYNTHETIC-TEST-NOT-OFFICIAL':
                    raise CommandError('Organization mapping collision with non-QA approval.')
                continue
            new_mappings.append(WorkforceCenterMapping(
                fingerprint=fingerprint, organization=organization,
                organization_type=org_type,
                health_center=center_rows[(org_number - 1) % TOTAL_TEST_CENTERS],
                approval_reference='SYNTHETIC-TEST-NOT-OFFICIAL',
                is_active=True,
            ))
        WorkforceCenterMapping.objects.bulk_create(new_mappings, batch_size=140)

        # 10-digit marker IDs starting 9991 and reserved example.invalid emails
        # cannot be confused with genuine Saudi ID records.
        existing_employees = {
            item.employee_number: item
            for item in Employee.objects.filter(
                employee_number__startswith='OHP-LOAD-'
            ).only('national_id', 'employee_number')
        }
        if len(existing_employees) > TOTAL_LOAD_EMPLOYEES:
            raise CommandError('Too many staged load-test records.')

        titles = (
            'تمريض تجريبي', 'فني صحي تجريبي', 'إداري تجريبي',
            'أخصائي تجريبي', 'طبيب تجريبي', 'خدمات مساندة تجريبية',
        )
        to_create = []
        for i in range(1, TOTAL_LOAD_EMPLOYEES + 1):
            employee_number = f'OHP-LOAD-{i:04d}'
            national_id = f'9991{i:06d}'
            if employee_number in existing_employees:
                if existing_employees[employee_number].national_id != national_id:
                    raise CommandError('Synthetic employee identifier conflict.')
                continue
            org_number = ((i - 1) * 37) % TOTAL_TEST_ORGANIZATIONS
            center = center_rows[org_number % TOTAL_TEST_CENTERS]
            to_create.append(Employee(
                national_id=national_id,
                employee_number=employee_number,
                name=f'موظف تجريبي رقم {i:04d}',
                email=f'qa-load-{i:04d}@example.invalid',
                mobile='0000000000',
                gender='female' if i % 2 == 0 else 'male',
                health_center=center,
                job_title=titles[(i - 1) % len(titles)],
                employment_status=Employee.EmploymentStatus.ACTIVE,
                roster_source_status=statuses[i - 1],
                periodic_exam_status='unknown',
                vaccination_status='unknown',
                risk_level='unknown',
            ))
        Employee.objects.bulk_create(to_create, batch_size=140)

        actual_count = Employee.objects.filter(
            employee_number__startswith='OHP-LOAD-').count()
        if actual_count != TOTAL_LOAD_EMPLOYEES:
            raise CommandError('Staging load count differs from expected value.')
        if WorkforceCenterMapping.objects.filter(
            approval_reference='SYNTHETIC-TEST-NOT-OFFICIAL').count() != TOTAL_TEST_ORGANIZATIONS:
            raise CommandError('Synthetic organization mapping count differs.')

        self.stdout.write(self.style.SUCCESS(
            'Synthetic load completed: %d new, %d total load records, %d QA centers, '
            '%d fake organizational groups; no source identities used.'
            % (len(to_create), actual_count, TOTAL_TEST_CENTERS, TOTAL_TEST_ORGANIZATIONS)
        ))
