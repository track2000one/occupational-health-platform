"""Privacy-minimised, non-mutating preview of the 19-column workforce source.

Do not interpret the organisation path as an approved HealthCenter. Manager
identity/contact columns are deliberately never read into the response.
Import commit of this source is blocked until a separate approved mapping and
authorised import implementation are available.
"""
from collections import Counter
from hashlib import sha256
import re

SOURCE_COLUMNS = {
    'organization': 'إسم الجهه',
    'employee_number': 'رقم الموظف',
    'national_id': 'رقم هوية الموظف',
    'name': 'إسم الموظف',
    'gender': 'الجنس',
    'mobile': 'رقم جوال الموظف',
    'email': 'إيميل الموظف',
    'employment_condition': 'حال الموظف',
    'appointment_date': 'تاريخ التعيين',
    'job_title': 'المسمى الوظيفى',
}


def _label(value):
    return re.sub(r'\s+', '', str(value or '').strip().replace('إ', 'ا')
                  .replace('أ', 'ا').replace('آ', 'ا').replace('ى', 'ي'))


def source_columns(headers):
    positions = {_label(header): index for index, header in enumerate(headers) if header}
    fields = {key: positions.get(_label(header)) for key, header in SOURCE_COLUMNS.items()}
    return fields if all(fields.get(key) is not None for key in
                         ('organization', 'national_id', 'name', 'employee_number')) else None


def preview_workforce_source(ws, sheet_name, file_name, existing_ids=()):
    """Aggregate safely; no Employee rows, health facts or manager PII are written."""
    header_rows = ws.iter_rows(min_row=1, max_row=1, values_only=True)
    headers = list(next(header_rows, ()))
    columns = source_columns(headers)
    if columns is None:
        raise ValueError('Not a recognised 19-column workforce roster.')

    def cell(row, key):
        index = columns.get(key)
        if index is None or index >= len(row):
            return ''
        value = row[index]
        if value is None:
            return ''
        if isinstance(value, float) and value.is_integer():
            return str(int(value))
        return str(value).strip()

    existing = set(str(item) for item in existing_ids)
    seen = set()
    groups = Counter()
    problems = []
    total = 0
    structurally_valid = 0
    duplicate_source = 0
    already_present = 0
    for row_number, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if not any(value is not None and str(value).strip() for value in row):
            continue
        total += 1
        organization = cell(row, 'organization')
        # Organisation groups are only grouping labels; never considered approved centers.
        groups[organization or '(unassigned organization)'] += 1
        identity = re.sub(r'\D', '', cell(row, 'national_id'))
        employee_name = cell(row, 'name')
        if not employee_name or len(identity) != 10:
            problems.append({
                'row': row_number,
                'reason': 'Missing employee name or invalid employee national ID.',
            })
            continue
        if identity in seen:
            duplicate_source += 1
            continue
        seen.add(identity)
        structurally_valid += 1
        if identity in existing:
            already_present += 1

    group_records = [
        {
            'key': sha256(name.encode('utf-8')).hexdigest()[:16],
            'name': name,
            'count': count,
            'approved': False,
        }
        for name, count in sorted(groups.items(), key=lambda item: (-item[1], item[0]))
    ]
    return {
        'mode': 'preview',
        'processor': 'workforce-roster-review-only',
        'workforce_roster_preview': True,
        'file_name': file_name,
        'sheet_name': sheet_name,
        'header_row': 1,
        'detected_headers': [str(header or '') for header in headers],
        'mapped_fields': columns,
        # Never return sample identifiers or manager names/contact details.
        'mapping_options': [],
        'mapping_candidates': {},
        'ignored_columns': [],
        'missing_required_fields': ['health_center'],
        'employee_import_mode': 'flexible',
        'summary': {
            'total_rows': total,
            'valid_rows': 0,  # Zero records approved for database insertion.
            'source_verified_rows': structurally_valid,
            'pending_center_mapping': structurally_valid,
            'organization_groups': len(group_records),
            'existing_identity_matches': already_present,
            'duplicate_rows': duplicate_source,
            'errors_count': len(problems),
            'skipped_rows': 0,
            'imported_employees': 0,
        },
        'organization_groups': group_records,
        'errors': problems[:50],
        'duplicates': [],
        'preview_rows': [],
        'privacy_note': (
            'Review-only: no employee records were created; no clinical values or '
            'manager identity fields were read or retained. Organization names '
            'require explicit HealthCenter approval before import.'
        ),
    }
