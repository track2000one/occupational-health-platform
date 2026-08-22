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
            UserProfile.objects.update_or_create(user=user, defaults={"role": "systemAdmin"})
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
                ("admin@health.gov", "admin123", "أحمد المنصور", "systemAdmin", None, True, True),
                ("manager@health.gov", "manager123", "خالد إبراهيم", "ohManager", None, True, False),
                ("ohdoctor@health.gov", "doctor123", "د. سارة محمد", "ohDoctor", None, False, False),
                ("clinicdoc@health.gov", "clinic123", "د. عمر الزهراني", "clinicDoctor", None, False, False),
                ("lab@health.gov", "lab123", "فاطمة علي", "labOfficer", None, False, False),
                ("vaccine@health.gov", "vaccine123", "عمر حسن", "vaccinationOfficer", None, False, False),
                ("needle@health.gov", "needle123", "نورة العتيبي", "needleStickOfficer", None, False, False),
                ("committee@health.gov", "comm123", "عبدالله القحطاني", "medicalCommitteeOfficer", None, False, False),
                ("campaign@health.gov", "camp123", "ريم الشمري", "campaignOfficer", None, False, False),
                ("center@health.gov", "center123", "سلطان المطيري", "centerManager", center_objects[0] if center_objects else None, False, False),
                ("executive@health.gov", "exec123", "الأمير فيصل", "executive", None, False, False),
                ("employee@health.gov", "emp123", "ليلى أحمد", "employee", None, False, False),
                ("dataentry@health.gov", "entry123", "هند السيف", "dataEntry", None, False, False),
                ("quality@health.gov", "quality123", "بدر الرشيدي", "dataQuality", None, False, False),
                ("reports@health.gov", "reports123", "مريم البلوي", "reportsOfficer", None, False, False),
                ("support@health.gov", "support123", "وليد الحربي", "techSupport", None, True, False),
            ]
            for email_addr, raw_password, full_name, role, center, is_staff, is_superuser in demo_users:
                user, _ = User.objects.get_or_create(username=email_addr, defaults={"email": email_addr})
                user.email = email_addr
                user.first_name = full_name
                user.is_active = True
                user.is_staff = is_staff or role == "systemAdmin"
                user.is_superuser = is_superuser or role == "systemAdmin"
                user.set_password(raw_password)
                user.save()
                UserProfile.objects.update_or_create(user=user, defaults={"role": role, "health_center": center})
            self.stdout.write(self.style.SUCCESS("Platform demo users are ready."))

        self.stdout.write(self.style.SUCCESS("Base health centers are ready."))
