"""Read-only classification of imported employee rows against the staff registry.

Keep identity matching conservative: identical identity alone identifies a stored
record; conflicting names or unique identifiers must be reviewed, and no staff
record is ever modified by this module. Missing *optional* data is independent
of row eligibility and should not prevent a new employee from being created.
"""
import re
import unicodedata

OPTIONAL_COMPLETENESS_FIELDS = (
    'employee_number', 'date_of_birth', 'gender', 'nationality',
    'birth_place', 'marital_status', 'mobile', 'email', 'national_address',
    'job_title', 'current_job', 'appointment_date',
)

# Same field identifiers used in the employee Excel importer, enabling the UI
# to translate labels without guessing about Arabic/English headings.
COMPARE_FIELDS = (
    'name', 'employee_number', 'date_of_birth', 'gender', 'nationality',
    'birth_place', 'marital_status', 'mobile', 'email', 'national_address',
    'job_title', 'current_job', 'appointment_date',
)

PRIVATE_FIELDS = {'mobile', 'email', 'national_address'}


def normalize_person_name(value):
    text = unicodedata.normalize('NFKC', str(value or ''))
    text = re.sub(r'[\u064b-\u065f\u0670\u0640]', '', text)
    text = text.translate(str.maketrans({'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي'}))
    return ' '.join(text.casefold().split())


def normalize_compare(value):
    if value is None:
        return ''
    if hasattr(value, 'isoformat'):
        return value.isoformat()
    return str(value).strip()


def optional_missing_fields(raw):
    return [
        field for field in OPTIONAL_COMPLETENESS_FIELDS
        if not str(raw.get(field) or '').strip()
    ]


def compare_employee(existing, raw, normalized_values, center):
    """Return only changed/extra fields; never divulge existing contact details."""
    fields = dict(raw)
    for key in ('date_of_birth', 'appointment_date', 'gender', 'nationality', 'marital_status'):
        value = normalized_values.get(key)
        if value:
            fields[key] = normalize_compare(value)
    differences = []
    for field in COMPARE_FIELDS:
        incoming = normalize_compare(fields.get(field))
        current = normalize_compare(getattr(existing, field, None))
        if not incoming and not current:
            continue
        if field == 'name':
            equal = normalize_person_name(incoming) == normalize_person_name(current)
        elif field == 'email':
            equal = incoming.casefold() == current.casefold()
        else:
            equal = incoming == current
        if equal:
            continue
        kind = 'different' if incoming and current else 'incoming_only' if incoming else 'existing_only'
        if field in PRIVATE_FIELDS:
            # For privacy, show presence/mismatch rather than either full value.
            before = 'موجود' if current else '—'
            after = 'موجود' if incoming else '—'
        else:
            before, after = current or '—', incoming or '—'
        differences.append({
            'field': field, 'kind': kind,
            'existing': before, 'incoming': after,
        })

    existing_center = getattr(existing, 'health_center', None)
    if center and existing_center and center.pk != existing_center.pk:
        differences.append({
            'field': 'health_center', 'kind': 'different',
            'existing': existing_center.name, 'incoming': center.name,
        })
    return differences


def matched_employee_summary(existing):
    if not existing:
        return None
    return {
        'id': existing.pk,
        'name': existing.name,
        'employee_number': existing.employee_number or '',
        'health_center': (existing.health_center.name
                          if existing.health_center else ''),
    }
