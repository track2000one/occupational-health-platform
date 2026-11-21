from django.db import migrations


class Migration(migrations.Migration):
    """Merge the independent early job-title branch into the V4 lineage.

    Historical Staging applied 0015_employee_employment_lifecycle before
    the later-introduced 0015_employee_job_title_en existed. This merge
    avoids rewriting applied database migration history. No data is changed.
    """

    dependencies = [
        ('health', '0037_employee_organizational_hierarchy_events'),
        ('health', '0015_employee_job_title_en'),
    ]

    operations = []
