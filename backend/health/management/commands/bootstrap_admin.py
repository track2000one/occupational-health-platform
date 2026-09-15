import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from health.models import HealthCenter, UserProfile


class Command(BaseCommand):
    help = "Create or update the default admin user and base health centers. Demo users are disabled by default."

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
            ("Main Occupational Health Center", "مركز الصحة المهنية الرئيسي", "Dammam"),
            ("Employee Clinic", "عيادة الموظفين", "Dammam"),
            ("Medical Committee Unit", "وحدة اللجنة الطبية", "Dammam"),
        ]
        for name_en, name_ar, city in centers:
            center, _ = HealthCenter.objects.get_or_create(
                name=name_en,
                defaults={
                    "name_en": name_en,
                    "name_ar": name_ar,
                    "city": city,
                    "is_active": True,
                },
            )
            update_fields = []
            if not center.name_en:
                center.name_en = name_en
                update_fields.append("name_en")
            if not center.name_ar:
                center.name_ar = name_ar
                update_fields.append("name_ar")
            if not center.city:
                center.city = city
                update_fields.append("city")
            if update_fields:
                center.save(update_fields=update_fields)
        self.stdout.write(self.style.SUCCESS("Base health centers are ready."))

        if os.getenv("SEED_DEMO_USERS", "False").lower() == "true":
            self.stdout.write(self.style.WARNING(
                "SEED_DEMO_USERS is true, but demo user seeding has been intentionally removed. "
                "Create real platform users from Django Admin or the platform user management page."
            ))
