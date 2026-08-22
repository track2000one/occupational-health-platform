from datetime import datetime, date
from typing import Any, Dict, List, Tuple

from django.db import transaction
from openpyxl import load_workbook

from .models import ClinicVisit, Employee, HealthCenter

HEADER_ALIASES = {
    'name': ['name', 'employee name', 'full name', 'اسم', 'الاسم', 'اسم الموظف', 'employee', 'الموظف'],
    'national_id': ['national id', 'national_id', 'nid', 'id', 'رقم الهوية', 'الهوية', 'الهويه', 'رقم السجل', 'السجل المدني', 'رقم الهوية الوطنية'],
    'mobile': ['mobile', 'phone', 'phone number', 'جوال', 'الجوال', 'رقم الجوال', 'الهاتف', 'رقم الهاتف'],
    'gender': ['gender', 'sex', 'الجنس'],
    'health_center': ['health center', 'center', 'facility', 'المركز', 'المركز الصحي', 'الجهة', 'جهة العمل', 'المستشفى'],
    'job_title': ['job title', 'position', 'job', 'المسمى الوظيفي', 'الوظيفة', 'المهنة'],
    'age': ['age', 'العمر'],
    'diagnosis': ['diagnosis', 'diagnoses', 'التشخيص', 'تشخيص'],
    'clinic_type': ['clinic', 'clinic type', 'العيادة', 'نوع العيادة', 'نوع الزيارة'],
    'action_taken': ['action', 'action taken', 'recommendation', 'الإجراء', 'الاجراء', 'التوصية'],
    'visit_date': ['date', 'visit date', 'تاريخ', 'التاريخ', 'تاريخ الزيارة'],
}

SENSITIVE_FIELDS = {'national_id', 'mobile'}
DEFAULT_CENTER_NAME = 'Imported Occupational Health Center'


def normalize_header(value: Any) -> str:
    return str(value or '').strip().lower().replace('\n', ' ').replace('\r', ' ')


def clean_text(value: Any) -> str:
    if value is None:
        return ''
    if isinstance(value, float) and value.is_integer():
        return str(int(value)).strip()
    return str(value).strip()


def mask_value(value: str) -> str:
    value = clean_text(value)
    if not value:
        return ''
    if len(value) <= 4:
        return '****'
    return f"{'*' * max(len(value) - 4, 4)}{value[-4:]}"


def parse_int(value: Any, default: int = 0) -> int:
    try:
        if value in (None, ''):
            return default
        return int(float(value))
    except (TypeError, ValueError):
        return default


def parse_gender(value: Any) -> str:
    text = normalize_header(value)
    if text in ('female', 'f', 'أنثى', 'انثى', 'female '):
        return 'female'
    return 'male'


def parse_date(value: Any):
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = clean_text(value)
    if not text:
        return None
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%d-%m-%Y'):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def find_header_row(ws) -> Tuple[int, List[str]]:
    best_row = 1
    best_headers: List[str] = []
    best_score = 0
    for idx, row in enumerate(ws.iter_rows(min_row=1, max_row=min(ws.max_row, 20), values_only=True), start=1):
        headers = [clean_text(cell) for cell in row]
        normalized = [normalize_header(cell) for cell in headers]
        non_empty = [cell for cell in normalized if cell]
        score = len(non_empty)
        for canonical, aliases in HEADER_ALIASES.items():
            if any(alias in normalized for alias in aliases):
                score += 3
        if score > best_score and len(non_empty) >= 3:
            best_score = score
            best_row = idx
            best_headers = headers
    if not best_headers:
        raise ValueError('Could not detect a valid header row in the selected sheet.')
    return best_row, best_headers


def build_header_map(headers: List[str]) -> Dict[str, int]:
    normalized_headers = [normalize_header(header) for header in headers]
    header_map: Dict[str, int] = {}
    for canonical, aliases in HEADER_ALIASES.items():
        for alias in aliases:
            if alias in normalized_headers:
                header_map[canonical] = normalized_headers.index(alias)
                break
    return header_map


def get_cell(row: Tuple[Any, ...], header_map: Dict[str, int], field: str) -> str:
    idx = header_map.get(field)
    if idx is None or idx >= len(row):
        return ''
    return clean_text(row[idx])


def row_to_payload(row: Tuple[Any, ...], header_map: Dict[str, int]) -> Dict[str, Any]:
    return {
        'name': get_cell(row, header_map, 'name'),
        'national_id': get_cell(row, header_map, 'national_id'),
        'mobile': get_cell(row, header_map, 'mobile'),
        'gender': parse_gender(get_cell(row, header_map, 'gender')),
        'health_center': get_cell(row, header_map, 'health_center') or DEFAULT_CENTER_NAME,
        'job_title': get_cell(row, header_map, 'job_title'),
        'age': parse_int(get_cell(row, header_map, 'age')),
        'diagnosis': get_cell(row, header_map, 'diagnosis'),
        'clinic_type': get_cell(row, header_map, 'clinic_type') or 'Imported Excel Visit',
        'action_taken': get_cell(row, header_map, 'action_taken'),
        'visit_date': parse_date(get_cell(row, header_map, 'visit_date')),
    }


def masked_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    safe = dict(payload)
    for field in SENSITIVE_FIELDS:
        safe[field] = mask_value(safe.get(field, ''))
    return safe


def process_excel_import(uploaded_file, sheet_name: str = '', commit: bool = False, user=None) -> Dict[str, Any]:
    workbook = load_workbook(uploaded_file, read_only=True, data_only=True)
    selected_sheet = sheet_name if sheet_name in workbook.sheetnames else ('Database' if 'Database' in workbook.sheetnames else workbook.sheetnames[0])
    ws = workbook[selected_sheet]

    header_row, headers = find_header_row(ws)
    header_map = build_header_map(headers)
    required = ['name', 'national_id']
    missing_required = [field for field in required if field not in header_map]
    if missing_required:
        raise ValueError(f"Missing required columns: {', '.join(missing_required)}")

    existing_ids = set(Employee.objects.values_list('national_id', flat=True))
    seen_ids = set()
    valid_payloads: List[Dict[str, Any]] = []
    duplicates: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    preview_rows: List[Dict[str, Any]] = []

    total_rows = 0
    for row_number, row in enumerate(ws.iter_rows(min_row=header_row + 1, values_only=True), start=header_row + 1):
        if not any(clean_text(cell) for cell in row):
            continue
        total_rows += 1
        payload = row_to_payload(row, header_map)
        national_id = payload['national_id']
        if not payload['name'] or not national_id:
            errors.append({'row': row_number, 'reason': 'Missing employee name or national ID.'})
            continue
        duplicate_reason = ''
        if national_id in seen_ids:
            duplicate_reason = 'Duplicate national ID inside the uploaded file.'
        elif national_id in existing_ids:
            duplicate_reason = 'National ID already exists in PostgreSQL.'
        if duplicate_reason:
            duplicates.append({'row': row_number, 'national_id': mask_value(national_id), 'name': payload['name'], 'reason': duplicate_reason})
            continue
        seen_ids.add(national_id)
        valid_payloads.append(payload)
        if len(preview_rows) < 12:
            preview_rows.append({'row': row_number, **masked_payload(payload)})

    imported_employees = 0
    imported_clinic_visits = 0
    if commit:
        with transaction.atomic():
            for payload in valid_payloads:
                center, _ = HealthCenter.objects.get_or_create(name=payload['health_center'], defaults={'city': '', 'is_active': True})
                employee, created = Employee.objects.update_or_create(
                    national_id=payload['national_id'],
                    defaults={
                        'name': payload['name'],
                        'mobile': payload['mobile'],
                        'gender': payload['gender'],
                        'health_center': center,
                        'job_title': payload['job_title'],
                        'age': payload['age'],
                    },
                )
                imported_employees += 1
                if payload.get('diagnosis'):
                    ClinicVisit.objects.create(
                        employee=employee,
                        clinic_type=payload.get('clinic_type') or 'Imported Excel Visit',
                        diagnosis=payload.get('diagnosis') or '',
                        action_taken=payload.get('action_taken') or '',
                        visit_date=payload.get('visit_date'),
                    )
                    imported_clinic_visits += 1

    return {
        'mode': 'commit' if commit else 'preview',
        'file_name': getattr(uploaded_file, 'name', 'uploaded.xlsx'),
        'sheet_name': selected_sheet,
        'available_sheets': workbook.sheetnames,
        'detected_headers': headers,
        'mapped_fields': header_map,
        'summary': {
            'total_rows': total_rows,
            'valid_rows': len(valid_payloads),
            'duplicate_rows': len(duplicates),
            'errors_count': len(errors),
            'skipped_rows': len(duplicates) + len(errors),
            'imported_employees': imported_employees,
            'imported_clinic_visits': imported_clinic_visits,
        },
        'duplicates': duplicates[:50],
        'errors': errors[:50],
        'preview_rows': preview_rows,
        'privacy_note': 'Raw Excel files are not stored in GitHub or the database. Only validated records are committed when commit mode is selected.',
    }
