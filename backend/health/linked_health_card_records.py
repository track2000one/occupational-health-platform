"""Read-only clinical projection: never creates events or modifies the saved card."""
from django.db.models import F, Prefetch
from .models import VaccinationDose

LIMIT = 8
DOSE_LIMIT = 8
LAB_FIELDS = (
    ('anti_hbs', 'Anti-HBs'), ('hbsag', 'HBsAg'), ('hcv', 'HCV'),
    ('hiv', 'HIV'), ('rubella_igg', 'Rubella IgG'), ('measles_igg', 'Measles IgG'),
    ('varicella_igg', 'Varicella IgG'), ('ppd_test', 'PPD'),
)


def iso(value):
    return value.isoformat() if value else None


def bounded(queryset, convert):
    records = list(queryset[:LIMIT + 1])
    return {'items': [convert(record) for record in records[:LIMIT]],
            'has_more': len(records) > LIMIT}


def lab_test(record):
    return {'id': record.pk, 'test_type': record.test_type, 'status': record.status,
            'result': record.result, 'record_date': iso(record.date)}


def lab_screening(record):
    return {'id': record.pk, 'request_status': record.request_status,
            'request_date': iso(record.request_date), 'result_status': record.result_status,
            'result_checked_date': iso(record.result_checked_date),
            'results': [{'test': label, 'result': getattr(record, field)}
                        for field, label in LAB_FIELDS if getattr(record, field)],
            'follow_up_required': record.follow_up_required}


def vaccination(record):
    return {'id': record.pk, 'vaccine_type': record.vaccine_type, 'dose': record.dose,
            'status': record.status, 'next_due_date': iso(record.next_due_date)}


def vaccine_record(record):
    # Dates explicitly present in this series are not inferred from status.
    recorded_dates = [{'label': label, 'date': iso(getattr(record, field))}
                      for field, label in (('first_dose_date', '1'), ('second_dose_date', '2'),
                          ('third_dose_date', '3'), ('booster_date', 'booster'))
                      if getattr(record, field)]
    doses = list(record.recent_linked_doses)
    return {'id': record.pk, 'vaccine_type': record.vaccine_type, 'status': record.status,
            'campaign_name': record.campaign_name, 'recorded_dates': recorded_dates,
            'doses': [{'id': d.pk, 'label': d.dose_label, 'date': iso(d.dose_date)} for d in doses[:DOSE_LIMIT]],
            'more_doses': len(doses) > DOSE_LIMIT, 'post_vaccine_result': record.post_vaccine_result}


def linked_clinical_records(employee):
    """Each collection is scoped to this employee; separate source models remain distinct."""
    records = employee.vaccination_records.order_by('-updated_at', '-pk').prefetch_related(
        Prefetch('doses', queryset=VaccinationDose.objects.order_by(
            F('dose_date').desc(nulls_last=True), '-pk')[:DOSE_LIMIT + 1],
            to_attr='recent_linked_doses'))
    return {
        'lab_tests': bounded(employee.lab_tests.order_by(F('date').desc(nulls_last=True), '-pk'), lab_test),
        'lab_screenings': bounded(employee.lab_screenings.order_by(
            F('request_date').desc(nulls_last=True), '-pk'), lab_screening),
        'vaccinations': bounded(employee.vaccinations.order_by('-pk'), vaccination),
        'vaccination_records': bounded(records, vaccine_record),
        'read_only': True, 'limit_per_source': LIMIT,
    }
