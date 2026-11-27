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
            'result': record.result, 'record_date': iso(record.date),
            'request_date': iso(record.request_date), 'result_date': iso(record.result_date)}


def lab_screening(record):
    return {'id': record.pk, 'request_status': record.request_status,
            'request_date': iso(record.request_date), 'result_status': record.result_status,
            'result_checked_date': iso(record.result_checked_date),
            'results': [{'test': label, 'result': getattr(record, field)}
                        for field, label in LAB_FIELDS if getattr(record, field)],
            'follow_up_required': record.follow_up_required}


def vaccination(record):
    return {'id': record.pk, 'vaccine_type': record.vaccine_type, 'dose': record.dose,
            'status': record.status, 'next_due_date': iso(record.next_due_date), 'dose_date': iso(record.dose_date)}


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


def clinic_visit(record):
    return {'id': record.pk, 'clinic_type': record.clinic_type,
            'visit_date': iso(record.visit_date), 'visit_time': iso(record.visit_time),
            'diagnosis': record.diagnosis, 'action_taken': record.action_taken,
            'status': record.status, 'sick_leave_days': record.sick_leave_days,
            'follow_up_date': iso(record.follow_up_date)}


def employee_clinic_visit(record):
    return {'id': record.pk, 'visit_date': iso(record.visit_date),
            'diagnosis': record.diagnosis, 'sick_leave_days': record.sick_leave_days,
            'follow_up_date': iso(record.follow_up_date),
            'weight_kg': str(record.weight_kg) if record.weight_kg is not None else None}


def occupational_clinic_visit(record):
    return {'id': record.pk, 'visit_date': iso(record.visit_date),
            'action_taken': record.action}


def injury_case(record):
    # Legacy source_known defaults to False; do not represent this as a
    # confirmed unknown source or expose any third-party details.
    return {'id': record.pk, 'exposure_date': iso(record.exposure_date),
            'workplace': record.workplace, 'status': record.status}


def needle_stick(record):
    # Deliberately omit third-party name, identity, test result and free-text
    # notes (which may contain third-party identifiers).
    return {'id': record.pk, 'exposure_date': iso(record.exposure_date),
            'workplace': record.workplace, 'injury_method': record.injury_method,
            'status': record.status, 'referred_to_employee_clinic': record.referred_to_employee_clinic}


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
        'clinic_visits': bounded(employee.clinic_visits.order_by(
            F('visit_date').desc(nulls_last=True), F('visit_time').desc(nulls_last=True), '-pk'), clinic_visit),
        'employee_clinic_visits': bounded(employee.employee_clinic_visits.order_by(
            F('visit_date').desc(nulls_last=True), '-pk'), employee_clinic_visit),
        'occupational_clinic_visits': bounded(employee.occupational_clinic_visits.order_by(
            F('visit_date').desc(nulls_last=True), '-pk'), occupational_clinic_visit),
        'injury_cases': bounded(employee.injury_cases.order_by(
            F('exposure_date').desc(nulls_last=True), '-pk'), injury_case),
        'needle_stick_exposures': bounded(employee.needle_stick_exposures.order_by(
            F('exposure_date').desc(nulls_last=True), '-pk'), needle_stick),
        'read_only': True, 'limit_per_source': LIMIT,
    }
