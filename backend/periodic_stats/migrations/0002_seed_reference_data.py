from django.db import migrations


def seed(apps, schema_editor):
    Indicator = apps.get_model('periodic_stats', 'Indicator')
    WorkforceMember = apps.get_model('periodic_stats', 'WorkforceMember')
    WorkforceTarget = apps.get_model('periodic_stats', 'WorkforceTarget')
    ReferenceDocument = apps.get_model('periodic_stats', 'ReferenceDocument')

    indicator_rows = [
        ('periodic-medical-screening', 'الكشف الطبي الدوري', 'Periodic Medical Screening', 409, 424, 0, 0, True, 'count'),
        ('pre-employment-examination', 'فحص ما قبل التوظيف', 'Pre-employment Examination', 0, 62, 0, 0, True, 'count'),
        ('fitness-for-duty', 'تقييم اللياقة للعمل', 'Fitness for Duty', 19, 16, 0, 0, True, 'count'),
        ('employee-vaccination', 'تطعيم الموظفين', 'Employee Vaccination', 275, 35, 0, 0, True, 'count'),
        ('supervisory-visits', 'الزيارات الإشرافية الموثقة والمجدولة', 'Supervisory visits plan documented and scheduled', 0, 12, 0, 0, True, 'count'),
        ('occupational-injury', 'الإصابات المهنية', 'Occupational Injury', None, None, None, None, False, 'reports'),
    ]
    for order, row in enumerate(indicator_rows, start=1):
        code, ar, en, q1, q2, q3, q4, targeted, measurement = row
        Indicator.objects.update_or_create(code=code, defaults={
            'name_ar': ar,
            'name_en': en,
            'q1_target': q1,
            'q2_target': q2,
            'q3_target': q3,
            'q4_target': q4,
            'is_targeted': targeted,
            'measurement_type': measurement,
            'sort_order': order,
            'is_active': True,
        })

    staff = [
        ('doctor', 'عبد العظيم موسى المؤمن', '3837007', 'طبيب نائب طب مهني', 'ماجستير طب مهني'),
        ('doctor', 'إيناس سمير الحليسي', '3851751', 'طبيب نائب أول صحة مهنية', 'زمالة الطب المهني'),
        ('nursing', 'خلود جاسر الظفيري', '0112468', 'أخصائية تمريض / إشراف صحة مهنية', 'ماجستير تمريض رعاية صحية أولية'),
    ]
    members = {}
    for category, name, number, title, qualification in staff:
        member, _ = WorkforceMember.objects.update_or_create(employee_number=number, defaults={
            'category': category,
            'name': name,
            'job_title': title,
            'qualification': qualification,
            'is_active': True,
        })
        members[number] = member

    target_rows = [
        ('3837007', 'عيادة الصحة المهنية', 700, 175, 175, 175, 175),
        ('3837007', 'عيادة فحص الموظفين الافتراضية', 400, 100, 100, 100, 100),
        ('3851751', 'عيادة الصحة المهنية', 700, 175, 175, 175, 175),
        ('3851751', 'عيادة فحص الموظفين الافتراضية', 400, 100, 100, 100, 100),
        ('0112468', 'عيادة الصحة المهنية', 1400, 350, 350, 350, 350),
        ('0112468', 'عيادة فحص الموظفين الافتراضية', 800, 200, 200, 200, 200),
    ]
    for number, item, annual, q1, q2, q3, q4 in target_rows:
        WorkforceTarget.objects.update_or_create(member=members[number], item=item, defaults={
            'annual_target': annual,
            'q1_target': q1,
            'q2_target': q2,
            'q3_target': q3,
            'q4_target': q4,
            'notes': 'حسب نموذج القوى العاملة',
        })

    documents = [
        ('الدليل الإرشادي للبرنامج', 'available', 'Occupational Health Clinic 2019'),
        ('الدليل الإرشادي للحالات الطارئة', 'available', 'متوفر من المركز السعودي للاعتماد - سباهي'),
        ('آلية الإبلاغ عن الأحداث', 'available', 'Email + OVR'),
        ('أدلة أخرى ذات علاقة', 'available', 'متوفر من المركز السعودي للاعتماد - سباهي'),
        ('سياسات الصحة المهنية', 'available', 'متوفر - عدد 5'),
        ('دليل تقييم مخاطر المراكز', 'available', 'متوفر - نموذج تقييم'),
    ]
    for title, status, reason in documents:
        ReferenceDocument.objects.update_or_create(title=title, defaults={'status': status, 'reason': reason})


def reverse_seed(apps, schema_editor):
    # Keep user data intact on reverse migration; schema rollback will remove the tables.
    pass


class Migration(migrations.Migration):
    dependencies = [('periodic_stats', '0001_initial')]
    operations = [migrations.RunPython(seed, reverse_seed)]
