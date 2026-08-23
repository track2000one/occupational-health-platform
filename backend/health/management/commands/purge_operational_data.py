from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from health.models import (
    AuditLog,
    CampaignCoverage,
    ClinicVisit,
    CommitteeReferral,
    DataImportBatch,
    Employee,
    EmployeeClinicVisit,
    EmployeeHealthProfile,
    HealthCenter,
    InjuryCase,
    LabScreening,
    LabTest,
    MedicalCommitteeCase,
    NeedleStickExposure,
    OccupationalClinicVisit,
    ReferenceLookup,
    ScreeningProgramRecord,
    TraineeRotation,
    UserProfile,
    Vaccination,
    VaccinationDose,
    VaccinationRecord,
)


class Command(BaseCommand):
    help = (
        "Safely purge operational/demo data before official data entry. "
        "This command never runs automatically and requires --confirm."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--confirm",
            action="store_true",
            help="Required. Confirms that you intentionally want to delete operational records.",
        )
        parser.add_argument(
            "--include-import-history",
            action="store_true",
            help="Also delete DataImportBatch records.",
        )
        parser.add_argument(
            "--include-audit-log",
            action="store_true",
            help="Also delete AuditLog records. Usually keep audit logs unless they are purely demo.",
        )
        parser.add_argument(
            "--include-demo-users",
            action="store_true",
            help="Delete non-superuser demo/login accounts such as *@health.gov, while preserving superusers.",
        )
        parser.add_argument(
            "--include-reference-lookups",
            action="store_true",
            help="Also delete ReferenceLookup rows. Usually keep reference lookups unless they are demo.",
        )
        parser.add_argument(
            "--include-health-centers",
            action="store_true",
            help="Also delete health centers after employee records are deleted. Usually keep centers.",
        )

    def _delete_model(self, model, label, deleted_counts):
        count = model.objects.count()
        if count:
            model.objects.all().delete()
        deleted_counts[label] = count

    @transaction.atomic
    def handle(self, *args, **options):
        if not options["confirm"]:
            raise CommandError(
                "Refusing to delete data without --confirm. Example: "
                "python manage.py purge_operational_data --confirm"
            )

        deleted_counts = {}

        # Children/dependent records first.
        for model, label in [
            (VaccinationDose, "vaccination_doses"),
            (VaccinationRecord, "vaccination_records"),
            (Vaccination, "vaccinations"),
            (LabScreening, "lab_screenings"),
            (LabTest, "lab_tests"),
            (NeedleStickExposure, "needle_stick_exposures"),
            (InjuryCase, "injury_cases"),
            (MedicalCommitteeCase, "medical_committee_cases"),
            (CommitteeReferral, "committee_referrals"),
            (EmployeeClinicVisit, "employee_clinic_visits"),
            (OccupationalClinicVisit, "occupational_clinic_visits"),
            (ClinicVisit, "clinic_visits"),
            (ScreeningProgramRecord, "screening_program_records"),
            (CampaignCoverage, "campaign_coverages"),
            (TraineeRotation, "trainee_rotations"),
            (EmployeeHealthProfile, "employee_health_profiles"),
            (Employee, "employees"),
        ]:
            self._delete_model(model, label, deleted_counts)

        if options["include_import_history"]:
            self._delete_model(DataImportBatch, "data_import_batches", deleted_counts)

        if options["include_audit_log"]:
            self._delete_model(AuditLog, "audit_logs", deleted_counts)

        if options["include_reference_lookups"]:
            self._delete_model(ReferenceLookup, "reference_lookups", deleted_counts)

        if options["include_health_centers"]:
            self._delete_model(HealthCenter, "health_centers", deleted_counts)

        if options["include_demo_users"]:
            User = get_user_model()
            demo_qs = User.objects.filter(username__iendswith="@health.gov", is_superuser=False)
            demo_count = demo_qs.count()
            # UserProfile is cascaded through OneToOne user relation.
            demo_qs.delete()
            deleted_counts["demo_users"] = demo_count

            orphan_profiles = UserProfile.objects.filter(user__isnull=True).count()
            if orphan_profiles:
                UserProfile.objects.filter(user__isnull=True).delete()
                deleted_counts["orphan_user_profiles"] = orphan_profiles

        self.stdout.write(self.style.SUCCESS("Operational data purge completed."))
        for label, count in deleted_counts.items():
            self.stdout.write(f"{label}: {count}")
