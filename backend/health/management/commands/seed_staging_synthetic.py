"""Stage-only artificial employee fixtures, explicitly forbidden with real data.

The marker 999... identities and example.invalid addresses are NOT real Saudi identities.
The command is idempotent and refuses to run on any non-QA employee database.
"""
import os

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from health.models import Employee, HealthCenter, EmployeeEmploymentChange


class Command(BaseCommand):
    help = 'Seed isolated staging with a handful of clearly synthetic employees.'

    @transaction.atomic
    def handle(self, *args, **options):
        if os.getenv('STAGING_MODE', '').lower() != 'true':
            raise CommandError('Refusing to seed outside explicitly marked staging.')
        if os.getenv('SEED_STAGING_SYNTHETIC', '').lower() != 'true':
            raise CommandError('Synthetic seeding is disabled in this environment.')
        # Defense against accidental execution on a copied real database.
        if Employee.objects.exclude(employee_number__startswith='OHP-QA-').exists():
            raise CommandError('Refusing to seed a database containing non-QA employees.')
        centers = list(HealthCenter.objects.filter(is_active=True).order_by('id')[:3])
        if len(centers) < 2:
            raise CommandError('Two active test centers are required.')

        examples = [
            ('9990000001', 'OHP-QA-01', 'تجريبي — موظف نشط ١', 'male', 0, 'active'),
            ('9990000002', 'OHP-QA-02', 'تجريبي — موظفة نشطة ٢', 'female', 1, 'active'),
            ('9990000003', 'OHP-QA-03', 'تجريبي — موظف نشط ٣', 'male', 0, 'active'),
            ('9990000004', 'OHP-QA-04', 'تجريبي — موظفة متقاعدة', 'female', 1, 'retired'),
            ('9990000005', 'OHP-QA-05', 'تجريبي — موظف تحت المراجعة', 'male', 0, 'under_review'),
            ('9990000006', 'OHP-QA-06', 'تجريبي — موظف منقول خارج الجهة', 'male', 1, 'transferred'),
        ]

        count = 0
        for national_id, number, name, gender, center_index, status in examples:
            employee, created = Employee.objects.get_or_create(
                national_id=national_id,
                defaults={
                    'employee_number': number,
                    'name': name,
                    'email': number.lower() + '@example.invalid',
                    'gender': gender,
                    'mobile': '0000000000',
                    'health_center': centers[center_index],
                    'job_title': 'مسمى وظيفي تجريبي',
                    'employment_status': status,
                    'periodic_exam_status': 'unknown',
                    'vaccination_status': 'unknown',
                    'risk_level': 'unknown',
                },
            )
            if not created and employee.employee_number != number:
                raise CommandError('Synthetic identifier collided with another record.')
            count += bool(created)
        self.stdout.write(self.style.SUCCESS(
            'Synthetic staging seed passed. Added %s artificial records; expected %s total.'
            % (count, len(examples))
        ))
