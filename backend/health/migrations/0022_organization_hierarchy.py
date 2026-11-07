from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("health", "0021_employee_nationality_current_job"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="OrganizationUnit",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.CharField(max_length=80, unique=True)),
                ("name", models.CharField(max_length=220)),
                ("kind", models.CharField(max_length=20, choices=[
                    ("department", "Department / central organization"),
                    ("sector", "Consultative sector"),
                    ("center", "Health center organization"),
                    ("unit", "Department or unit within a center"),
                ])),
                ("source_path", models.TextField(blank=True)),
                ("source_sheet", models.CharField(blank=True, max_length=80)),
                ("source_rows", models.CharField(blank=True, max_length=255)),
                ("is_approved", models.BooleanField(db_index=True, default=False)),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                ("approval_reference", models.CharField(blank=True, max_length=255)),
                ("approved_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("health_center", models.ForeignKey(to="health.healthcenter", null=True, blank=True,
                     related_name="organization_units", on_delete=django.db.models.deletion.PROTECT)),
                ("parent", models.ForeignKey(to="health.organizationunit", null=True, blank=True,
                     related_name="children", on_delete=django.db.models.deletion.PROTECT)),
                ("approved_by", models.ForeignKey(to=settings.AUTH_USER_MODEL, null=True, blank=True,
                     related_name="approved_org_units", on_delete=django.db.models.deletion.SET_NULL)),
            ],
            options={"ordering": ["kind", "name"]},
        ),
        migrations.CreateModel(
            name="OrganizationUnitApprovalLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("action", models.CharField(max_length=25)),
                ("approval_reference", models.CharField(blank=True, max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("unit", models.ForeignKey(to="health.organizationunit", related_name="approval_logs",
                     on_delete=django.db.models.deletion.PROTECT)),
                ("user", models.ForeignKey(to=settings.AUTH_USER_MODEL, null=True, blank=True,
                     on_delete=django.db.models.deletion.SET_NULL)),
            ],
        ),
        migrations.AddField(
            model_name="employee", name="organization_unit",
            field=models.ForeignKey(to="health.organizationunit", null=True, blank=True,
                 related_name="employees", on_delete=django.db.models.deletion.PROTECT),
        ),
    ]
