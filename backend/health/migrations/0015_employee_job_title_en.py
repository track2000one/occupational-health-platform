from django.db import migrations, models


def add_job_title_en_if_missing(apps, schema_editor):
    """Support both original production and earlier independent staging history.

    Historical Staging already added job_title_en in its 0020 migration.
    The newer baseline added it with this earlier independent 0015 migration.
    Never drop/recreate a column and never modify the saved employee values.
    """
    Employee = apps.get_model('health', 'Employee')
    db = schema_editor.connection
    with db.cursor() as cursor:
        columns = {
            column.name
            for column in db.introspection.get_table_description(
                cursor, Employee._meta.db_table,
            )
        }
    if 'job_title_en' in columns:
        return
    field = models.CharField(blank=True, max_length=150)
    field.set_attributes_from_name('job_title_en')
    field.model = Employee
    schema_editor.add_field(Employee, field)


class Migration(migrations.Migration):
    dependencies = [
        ('health', '0014_healthcenter_bilingual_names'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(
                    add_job_title_en_if_missing,
                    reverse_code=migrations.RunPython.noop,
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name='employee',
                    name='job_title_en',
                    field=models.CharField(blank=True, max_length=150),
                ),
            ],
        ),
    ]
