"""Employee Import V2: read-only, single-pass registry and approved-center matching.

No historical Excel import API dependency. No employee/create/restore/update writes.
Names and identifiers are diagnostic safety checks, never identity proof.
"""
from collections import Counter, defaultdict
import re
import unicodedata

from django.db.models import Q
from django.db.models.functions import Lower, Trim

from .models import Employee, HealthCenter, OrganizationUnit, EmployeeRegistryResetBatch


REVIEW_LIMIT = 30
REQUIRED_PROFILE_FIELDS = (
    'employee_number', 'nationality', 'date_of_birth',
    'mobile', 'appointment_date', 'job_title', 'health_center',
)
TEXT_FIELDS = ('employee_number', 'nationality', 'mobile', 'job_title')


def norm_text(raw):
    value = unicodedata.normalize('NFKC', str(raw or '')).strip().casefold()
    value = re.sub(r'[\u064b-\u065f\u0670\u0640\u200b-\u200f\ufeff]', '', value)
    value = re.sub('[أإآٱ]', 'ا', value).replace('ى', 'ي')
    return re.sub(r'[^\w\u0600-\u06ff]+', '', value)


def norm_email(raw):
    return str(raw or '').strip().casefold()


def cell_at(cells, mapping, key):
    idx = mapping.get(key)
    if idx is None or idx >= len(cells):
        return ''
    value = cells[idx]
    if value is None:
        return ''
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def source_profile(cells, mapping):
    return {field: cell_at(cells, mapping, field)
            for field in ('name', 'national_id', *REQUIRED_PROFILE_FIELDS, 'email', 'organization_unit',
                          'gender', 'marital_status', 'national_address', 'birth_place',
                          'current_job', 'job_title_en')}


def matched_center_map():
    names = defaultdict(set)
    approved = HealthCenter.objects.filter(
        is_active=True,
        is_archived=False,
        approval_status=HealthCenter.ApprovalStatus.APPROVED,
    ).only('id', 'name', 'name_ar', 'name_en', 'code')
    for center in approved:
        for label in (center.name, center.name_ar, center.name_en, center.code):
            if label:
                names[norm_text(label)].add(center.pk)
    return names


def approved_organization_map():
    names = defaultdict(set)
    units = {}
    for unit in OrganizationUnit.objects.filter(
        is_active=True, is_approved=True,
    ).only('id', 'name', 'code', 'health_center_id'):
        units[unit.pk] = unit
        for label in (unit.name, unit.code):
            if label:
                names[norm_text(label)].add(unit.pk)
    return names, units


def registry_match(sheet_rows):
    """Classify all workbook rows and return aggregate, masked, read-only results."""
    from .employee_import_v2 import identity

    total = len(sheet_rows)
    national_ids = [identity(row['national_id']) for row in sheet_rows]
    id_counts = Counter(v for v in national_ids if v)
    file_numbers = Counter(
        norm_text(row['employee_number']) for row in sheet_rows if row['employee_number']
    )
    file_emails = Counter(norm_email(row['email']) for row in sheet_rows if row['email'])

    unique_nids = set(id_counts)
    registry = {
        employee.national_id: employee
        for employee in Employee.objects.filter(national_id__in=unique_nids)
        .select_related('health_center')
    }

    numbers = set(file_numbers)
    emails = set(file_emails)
    if numbers or emails:
        q = Q()
        if numbers:
            q |= Q(_number_lower__in={
                row['employee_number'].strip().casefold()
                for row in sheet_rows if row['employee_number']
            })
        if emails:
            q |= Q(_mail_lower__in=emails)
        identifier_owners = list(
            Employee.objects.annotate(
                _mail_lower=Lower(Trim('email')),
                _number_lower=Lower(Trim('employee_number')),
            ).filter(q).only('pk', 'employee_number', 'email')
        )
    else:
        identifier_owners = []
    number_owners = defaultdict(set)
    email_owners = defaultdict(set)
    for owner in identifier_owners:
        if owner.employee_number:
            number_owners[norm_text(owner.employee_number)].add(owner.pk)
        if owner.email:
            email_owners[norm_email(owner.email)].add(owner.pk)

    centers = matched_center_map()
    organization_names, organization_units = approved_organization_map()
    # An unfinished bulk reset is only provenance evidence, not an authorization
    # to reinstate staff. Individual archives and retired/separated people stay
    # blocked until a distinct, documented review.
    reset = EmployeeRegistryResetBatch.objects.filter(
        restored_at__isnull=True,
    ).order_by('-created_at').only('employee_ids', 'applied_at').first()
    reset_ids = {
        str(item) for item in (reset.employee_ids or [])
    } if reset else set()
    counts = Counter()
    independent_flags = Counter()
    archive_provenance = Counter()
    planned_rows = []
    missing_counts = Counter()
    review_examples = []
    summary = Counter()
    for row, nid in zip(sheet_rows, national_ids):
        employee = registry.get(nid)
        source_name = row['name'].strip()
        # Orthogonal diagnostics: a matched employee can be both archived
        # and have a name discrepancy. "kind" below is deliberately one
        # primary blocking reason, never a complete status inventory.
        if employee:
            name_differs = norm_text(source_name) != norm_text(employee.name)
            independent_flags['matched_identity_total'] += 1
            independent_flags['archived_identity_total'] += int(employee.is_archived)
            independent_flags['active_identity_total'] += int(not employee.is_archived)
            independent_flags['name_difference_total'] += int(name_differs)
            independent_flags['archived_with_name_difference'] += int(
                employee.is_archived and name_differs
            )
            if employee.is_archived:
                in_reset = bool(reset and str(employee.pk) in reset_ids and
                                employee.archived_at == reset.applied_at)
                archive_provenance['matching_unfinished_bulk_reset'] += int(in_reset)
                archive_provenance['other_or_unverified_archive'] += int(not in_reset)
                if not (employee.archive_reason or '').strip():
                    archive_provenance['archive_reason_missing'] += 1
                archive_provenance[
                    'employment_' + (employee.employment_status or 'unknown')
                ] += 1
        employee_number = row['employee_number'].strip()
        email = norm_email(row['email'])
        source_center = row['health_center'].strip()
        center_ids = centers.get(norm_text(source_center), set()) if source_center else set()
        approved_center_id = next(iter(center_ids)) if len(center_ids) == 1 else None
        source_unit = row['organization_unit'].strip()
        unit_ids = organization_names.get(norm_text(source_unit), set()) if source_unit else set()
        approved_unit_id = next(iter(unit_ids)) if len(unit_ids) == 1 else None
        approved_unit = organization_units.get(approved_unit_id)
        nvalid = (len(nid) == 10 and nid[0] in ('1', '2') and
                  len(row['national_id'].strip()) == 10 and
                  all(c.isdecimal() for c in row['national_id'].strip()))
        duplicate_identifier = (
            bool(employee_number and file_numbers[norm_text(employee_number)] > 1) or
            bool(email and file_emails[email] > 1)
        )
        other_identifier_owner = bool(
            employee_number and
            (number_owners.get(norm_text(employee_number), set()) - ({employee.pk} if employee else set()))
        ) or bool(
            email and
            (email_owners.get(email, set()) - ({employee.pk} if employee else set()))
        )
        if not nvalid or not source_name:
            kind = 'invalid_identity'
        elif id_counts[nid] > 1:
            kind = 'duplicate_file_identity'
        elif duplicate_identifier:
            kind = 'duplicate_file_identifier'
        elif other_identifier_owner:
            kind = 'identifier_owned_by_other'
        elif employee and norm_text(source_name) != norm_text(employee.name):
            kind = 'name_review'
        elif employee and (
            (employee_number and employee.employee_number and
             norm_text(employee_number) != norm_text(employee.employee_number)) or
            (email and employee.email and email != norm_email(employee.email))
        ):
            kind = 'identifier_disagreement'
        elif employee and employee.is_archived:
            kind = 'archived_review'
        elif source_center and approved_center_id is None:
            kind = 'center_review' if employee else 'new_provisional'
        elif (employee and approved_center_id and employee.health_center_id and
              approved_center_id != employee.health_center_id):
            kind = 'center_review'
        elif source_unit and (
            not approved_unit_id or
            (approved_unit and approved_unit.health_center_id and approved_center_id
             and approved_unit.health_center_id != approved_center_id) or
            (employee and employee.organization_unit_id and
             employee.organization_unit_id != approved_unit_id)
        ):
            kind = 'organization_review' if employee else 'new_provisional'
        elif employee:
            has_fill = any(
                row.get(field) and not getattr(employee, field, None)
                for field in TEXT_FIELDS + ('date_of_birth', 'appointment_date', 'email')
            ) or bool(approved_center_id and not employee.health_center_id) or bool(
                approved_unit_id and not employee.organization_unit_id
            )
            kind = 'existing_fill_only' if has_fill else 'existing_no_change'
        elif source_center and approved_center_id:
            kind = 'new_candidate'
        else:
            kind = 'new_incomplete'

        # A missing optional property is a yellow card, not a reason to reject
        # a legally valid identity. Existing verified fields count as present.
        missing = [
            key for key in REQUIRED_PROFILE_FIELDS
            if (not row.get(key) and not (
                employee and ((employee.health_center_id if key == 'health_center'
                               else getattr(employee, key, None)))
            ))
        ]
        for field in missing:
            missing_counts[field] += 1
        if missing:
            summary['yellow_missing_information'] += 1

        counts[kind] += 1
        if kind in ('new_candidate', 'new_incomplete', 'new_provisional', 'existing_fill_only'):
            planned_rows.append({
                'row': row, 'national_id': nid, 'kind': kind,
                'employee_pk': employee.pk if employee else None,
                'approved_center_id': approved_center_id,
                'approved_unit_id': (
                    approved_unit_id if approved_unit and (
                        not approved_unit.health_center_id or not approved_center_id
                        or approved_unit.health_center_id == approved_center_id
                    ) else None
                ),
                'missing_fields': missing,
            })
        summary['identity_found'] += bool(employee)
        if len(review_examples) < REVIEW_LIMIT and (
            kind not in ('new_candidate', 'existing_no_change') or missing
        ):
            review_examples.append({
                'row': row['_row'],
                'identity_masked': nid[:2] + '••••' + nid[-4:] if nvalid else '—',
                'status': kind,
                'missing_fields': missing[:8],
                'center_approved': bool(approved_center_id),
                'organization_approved': bool(approved_unit_id),
                'existing_record': bool(employee),
                'archived_record': bool(employee and employee.is_archived),
            })

    return {
        'mode': 'read_only_registry_match_v2',
        '_internal_planned_rows': planned_rows,
        'rows_total': total,
        'registry_counts': dict(counts),
        'archive_provenance': {
            'matching_unfinished_bulk_reset':
                archive_provenance['matching_unfinished_bulk_reset'],
            'other_or_unverified_archive':
                archive_provenance['other_or_unverified_archive'],
            'archive_reason_missing':
                archive_provenance['archive_reason_missing'],
            'employment_active': archive_provenance['employment_active'],
            'employment_transferred': archive_provenance['employment_transferred'],
            'employment_retired': archive_provenance['employment_retired'],
            'employment_separated': archive_provenance['employment_separated'],
            'employment_under_review': archive_provenance['employment_under_review'],
            'employment_unknown': archive_provenance['employment_unknown'],
            'has_unfinished_bulk_reset': bool(reset),
        },
        'registry_facets': {
            'matched_identity_total': independent_flags['matched_identity_total'],
            'active_identity_total': independent_flags['active_identity_total'],
            'archived_identity_total': independent_flags['archived_identity_total'],
            'name_difference_total': independent_flags['name_difference_total'],
            'archived_with_name_difference': independent_flags['archived_with_name_difference'],
        },
        'identity_found': summary['identity_found'],
        'yellow_missing_information': summary['yellow_missing_information'],
        'missing_field_counts': dict(missing_counts),
        'review_examples_masked': review_examples,
        'database_identity_checked': True,
        'employee_count_created': 0,
        'employee_count_updated': 0,
        'import_enabled': False,
        'notice': ('هذه نتائج مطابقة قراءة فقط مع السجلات الحالية، بما فيها المؤرشفة. '
                   'قد تتداخل حالات الأرشفة واختلاف الاسم، لذلك يُعرض إجمالي كل حالة '
                   'مستقلًا عن تصنيف المنع الأساسي. '
                   'الاسم المختلف أو الرقم المتعارض لا يُعتمد تلقائيًا. '
                   'المركز والجهة التنظيمية لا يُعتمدان إلا بالمطابقة الفريدة مع سجل معتمد. '
                   'لم تُنشأ أو تُعدل أي بطاقة.'),
    }
