from django.db import migrations, models


def assign_temporary_numbers(apps, schema_editor):
    Batch = apps.get_model('health', 'ProvisionalEmployeeImportBatch')
    Row = apps.get_model('health', 'ProvisionalEmployeeRosterRow')
    database = schema_editor.connection.alias
    for batch_id in Batch.objects.using(database).values_list('pk', flat=True).iterator():
        missing_rows = (
            row for row in Row.objects.using(database).filter(batch_id=batch_id)
            .order_by('source_row').only('missing_optional').iterator()
            if 'employee_number' in row.missing_optional
        )
        edits = []
        for length, row in enumerate(missing_rows, 4):
            row.temporary_number_length = length
            edits.append(row)
        if edits:
            Row.objects.using(database).bulk_update(edits, ['temporary_number_length'])


class Migration(migrations.Migration):
    dependencies = [('health', '0034_provisional_employee_number_correction_event')]
    operations = [
        migrations.AddField(
            model_name='provisionalemployeerosterrow',
            name='temporary_number_length',
            field=models.PositiveSmallIntegerField(null=True, blank=True),
        ),
        migrations.RunPython(assign_temporary_numbers, migrations.RunPython.noop),
    ]
