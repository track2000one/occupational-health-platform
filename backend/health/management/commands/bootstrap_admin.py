import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from health.models import HealthCenter, UserProfile


class Command(BaseCommand):
    help = "Create or update the default admin user, platform demo users, and seed base health centers."

    def handle(self, *args, **options):
        User = get_user_model()

        username = os.getenv("DJANGO_SUPERUSER_USERNAME", "admin")
        email = os.getenv("DJANGO_SUPERUSER_EMAIL", "admin@ohs.local")
        password = os.getenv("DJANGO_SUPERUSER_PASSWORD")

        if password:
            user, created = User.objects.get_or_create(
                username=username,
                defaults={"email": email, "is_staff": True, "is_superuser": True},
            )
            user.email = email
            user.first_name = user.first_name or "System Administrator"
            user.is_staff = True
            user.is_superuser = True
            user.set_password(password)
            user.save()
            UserProfile.objects.update_or_create(
                user=user,
                defaults={"role": "systemAdmin", "person_type": "admin", "employee_number": "OHP-ADMIN-000"},
            )
            status = "created" if created else "updated"
            self.stdout.write(self.style.SUCCESS(f"Superuser {username} {status}."))
        else:
            self.stdout.write(self.style.WARNING("DJANGO_SUPERUSER_PASSWORD is not set; skipping superuser bootstrap."))

        centers = [
            ("Main Occupational Health Center", "Dammam"),
            ("Employee Clinic", "Dammam"),
            ("Medical Committee Unit", "Dammam"),
        ]
        center_objects = []
        for name, city in centers:
            center, _ = HealthCenter.objects.get_or_create(name=name, defaults={"city": city, "is_active": True})
            center_objects.append(center)

        if os.getenv("SEED_DEMO_USERS", "True").lower() != "false":
            demo_users = [
                ("admin@health.gov", "admin123", "أحمد المنصور", "systemAdmin", "admin", center_objects[0] if center_objects else None, True, True, "OHP-ADM-001", "1099000001", "", "إدارة النظام", "مدير النظام", "", ""),
                ("manager@health.gov", "manager123", "خالد إبراهيم", "ohManager", "healthStaff", center_objects[0] if center_objects else None, True, False, "OHP-MGR-002", "1099000002", "", "الصحة المهنية", "مدير الصحة المهنية", "إدارة صحة مهنية", "SCFHS-1002"),
                ("ohdoctor@health.gov", "doctor123", "د. سارة محمد", "ohDoctor", "healthStaff", center_objects[0] if center_objects else None, False, False, "OHP-DOC-003", "1099000003", "", "العيادة المهنية", "طبيب صحة مهنية", "طب مهني", "SCFHS-1003"),
                ("clinicdoc@health.gov", "clinic123", "د. عمر الزهراني", "clinicDoctor", "healthStaff", center_objects[1] if len(center_objects) > 1 else None, False, False, "OHP-DOC-004", "1099000004", "", "عيادة الموظفين", "طبيب عيادة", "طب أسرة", "SCFHS-1004"),
                ("lab@health.gov", "lab123", "فاطمة علي", "labOfficer", "healthStaff", center_objects[0] if center_objects else None, False, False, "OHP-LAB-005", "1099000005", "", "المختبر", "مسؤول مختبر", "مختبرات", "SCFHS-1005"),
                ("vaccine@health.gov", "vaccine123", "عمر حسن", "vaccinationOfficer", "healthStaff", center_objects[0] if center_objects else None, False, False, "OHP-VAC-006", "1099000006", "", "التطعيمات", "مسؤول تطعيمات", "تمريض", "SCFHS-1006"),
                ("needle@health.gov", "needle123", "نورة العتيبي", "needleStickOfficer", "healthStaff", center_objects[0] if center_objects else None, False, False, "OHP-NSI-007", "1099000007", "", "السلامة المهنية", "مسؤول إصابات وخز", "صحة مهنية", "SCFHS-1007"),
                ("committee@health.gov", "comm123", "عبدالله القحطاني", "medicalCommitteeOfficer", "healthStaff", center_objects[2] if len(center_objects) > 2 else None, False, False, "OHP-COM-008", "1099000008", "", "الهيئة الطبية", "مسؤول هيئة طبية", "إدارة طبية", "SCFHS-1008"),
                ("campaign@health.gov", "camp123", "ريم الشمري", "campaignOfficer", "healthStaff", center_objects[0] if center_objects else None, False, False, "OHP-CAM-009", "1099000009", "", "الحملات الصحية", "مسؤول حملات", "تثقيف صحي", "SCFHS-1009"),
                ("center@health.gov", "center123", "سلطان المطيري", "centerManager", "healthStaff", center_objects[0] if center_objects else None, False, False, "OHP-CEN-010", "1099000010", "", "المركز الصحي", "مدير مركز", "إدارة صحية", "SCFHS-1010"),
                ("executive@health.gov", "exec123", "الأمير فيصل", "executive", "admin", None, False, False, "OHP-EXE-011", "1099000011", "", "الإدارة العليا", "تنفيذي", "", ""),
                ("employee@health.gov", "emp123", "ليلى أحمد", "employee", "employee", center_objects[1] if len(center_objects) > 1 else None, False, False, "OHP-EMP-012", "1099000012", "", "الموارد البشرية", "موظف", "", ""),
                ("dataentry@health.gov", "entry123", "هند السيف", "dataEntry", "employee", None, False, False, "OHP-DAT-013", "1099000013", "", "البيانات", "مدخل بيانات", "", ""),
                ("quality@health.gov", "quality123", "بدر الرشيدي", "dataQuality", "employee", None, False, False, "OHP-QUA-014", "1099000014", "", "جودة البيانات", "مدقق بيانات", "", ""),
                ("reports@health.gov", "reports123", "مريم البلوي", "reportsOfficer", "employee", None, False, False, "OHP-REP-015", "1099000015", "", "التقارير", "مسؤول تقارير", "", ""),
                ("support@health.gov", "support123", "وليد الحربي", "techSupport", "admin", None, True, False, "OHP-SUP-016", "1099000016", "", "الدعم الفني", "مسؤول دعم فني", "", ""),
            ]
            for email_addr, raw_password, full_name, role, person_type, center, is_staff, is_superuser, employee_no, national_id, mrn, department, job_title, specialty, license_no in demo_users:
                user, _ = User.objects.get_or_create(username=email_addr, defaults={"email": email_addr})
                user.email = email_addr
                user.first_name = full_name
                user.is_active = True
                user.is_staff = is_staff or role == "systemAdmin"
                user.is_superuser = is_superuser or role == "systemAdmin"
                user.set_password(raw_password)
                user.save()
                UserProfile.objects.update_or_create(
                    user=user,
                    defaults={
                        "role": role,
                        "person_type": person_type,
                        "health_center": center,
                        "employee_number": employee_no,
                        "national_id": national_id,
                        "medical_record_number": mrn or None,
                        "department": department,
                        "job_title": job_title,
                        "specialty": specialty,
                        "license_number": license_no,
                    },
                )
            self.stdout.write(self.style.SUCCESS("Platform demo users are ready."))

        self.stdout.write(self.style.SUCCESS("Base health centers are ready."))
