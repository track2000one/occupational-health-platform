import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from health.models import HealthCenter


class Command(BaseCommand):
    help = "Create or update the default admin user and seed base health centers."

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
            user.is_staff = True
            user.is_superuser = True
            user.set_password(password)
            user.save()
            status = "created" if created else "updated"
            self.stdout.write(self.style.SUCCESS(f"Superuser {username} {status}."))
        else:
            self.stdout.write(self.style.WARNING("DJANGO_SUPERUSER_PASSWORD is not set; skipping superuser bootstrap."))

        centers = [
            ("Main Occupational Health Center", "Dammam"),
            ("Employee Clinic", "Dammam"),
            ("Medical Committee Unit", "Dammam"),
        ]
        for name, city in centers:
            HealthCenter.objects.get_or_create(name=name, defaults={"city": city, "is_active": True})

        self.stdout.write(self.style.SUCCESS("Base health centers are ready."))
