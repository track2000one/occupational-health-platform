"""Read-only, privacy-minimized preview of the *current* workforce roster.

The source is a distinct 19-column Arabic roster; manager identity (column D)
must never be confused with employee national ID (column H). Previewing performs
no Employee writes, no center reassignment, and no inferred retirement.
"""
from collections import Counter, defaultdict
import hashlib
import io
import re
import unicodedata
import zipfile

from django.db.models import Q
from openpyxl import load_workbook
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AuditLog, Employee, HealthCenter


EXPECTED_COLUMNS = [
    'إسم الجهه', 'نوع الجهه', 'إسم المدير', 'رقم الهوية',
    'الإيميل', 'رقم الجوال', 'رقم الموظف', 'رقم هوية الموظف',
    'إسم الموظف', 'الجنس', 'الجنسية', 'العمر',
    'رقم جوال الموظف', 'إيميل الموظف', 'حال الموظف',
    'تاريخ التعيين', 'نوع التوظيف', 'المسمى الوظيفى', 'البرنامج',
]
MAX_ROWS = 15000
MAX_UNCOMPRESSED = 75 * 1024 * 1024
ACTIVE_LABEL = 'تعيين نشط'


def clean(value):
    if value is None:
        return ''
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    value = unicodedata.normalize('NFKC', str(value))
    value = re.sub(r'[\u200b-\u200f\ufeff\u2066-\u2069]', '', value)
    return ' '.join(value.replace('\xa0', ' ').split()).strip()


def norm(value):
    return re.sub(r'[\u064b-\u065f\u0670\u0640]', '', clean(value)).casefold()


def safe_preview(upload, existing_employees=None, centers=None):
    """Analyze uploaded file in memory; return only counts and redacted examples."""
    upload.seek(0)
    payload = upload.read()
    if not payload or len(payload) > 20 * 1024 * 1024:
        raise ValueError('File is empty or exceeds 20 MB.')
    try:
        with zipfile.ZipFile(io.BytesIO(payload)) as zipped:
            infos = zipped.infolist()
            if sum(info.file_size for info in infos) > MAX_UNCOMPRESSED:
                raise ValueError('Uncompressed workbook exceeds the allowed limit.')
            if any(info.filename.startswith(('/', '../')) or '..' in info.filename.split('/') for info in infos):
                raise ValueError('Invalid workbook contents.')
    except zipfile.BadZipFile as exc:
        raise ValueError('Invalid XLSX workbook.') from exc

    try:
        workbook = load_workbook(io.BytesIO(payload), read_only=True, data_only=True)
    except Exception as exc:
        raise ValueError('The XLSX workbook could not be opened.') from exc
    try:
        worksheet = workbook.active
        if worksheet.max_row and worksheet.max_row > MAX_ROWS + 10:
            raise ValueError('Workbook has too many rows.')
        header = [norm(value) for value in next(worksheet.iter_rows(min_row=1, max_row=1, max_col=19, values_only=True))]
        if header != [norm(value) for value in EXPECTED_COLUMNS]:
            raise ValueError('Unexpected headers. Upload the original 19-column workforce roster (A:S).')
        existing_employees = existing_employees or []
        centers = centers or []
        old_ids = set()
        old_emails = {}
        old_numbers = {}
        for employee in existing_employees:
            employee_id = clean(employee['national_id'])
            old_ids.add(employee_id)
            if employee.get('email'):
                old_emails[norm(employee['email'])] = employee_id
            if employee.get('employee_number'):
                old_numbers[clean(employee['employee_number'])] = employee_id

        by_center_name = defaultdict(set)
        for center in centers:
            for key in ('name', 'name_ar', 'name_en'):
                if center.get(key):
                    by_center_name[norm(center[key])].add((str(center['id']), clean(center.get('name_ar') or center['name'])))

        seen = set()
        seen_job_numbers = {}
        seen_emails = {}
        error_examples = []
        status_counts = Counter()
        unit_counts = Counter()
        summary = Counter()
        organizational_groups = {}

        for row_index, raw in enumerate(worksheet.iter_rows(min_row=2, max_col=19, values_only=True), start=2):
            values = [clean(value) for value in raw]
            if not any(values):
                continue
            summary['total_rows'] += 1
            if summary['total_rows'] > MAX_ROWS:
                raise ValueError('Workbook has too many employees.')
            organization, org_type, manager_name = values[0], values[1], values[2]
            # Never use column D (manager identity); use column H only.
            employee_id = re.sub(r'\D', '', values[7])
            employee_name = values[8]
            job_number = values[6]
            employee_email = norm(values[13])
            source_status = values[14]
            status_counts[source_status or 'غير محدد'] += 1
            unit_counts[org_type or 'غير محدد'] += 1

            org_key = (organization, org_type)
            if org_key not in organizational_groups:
                organizational_groups[org_key] = {
                    'organization': organization,
                    'organization_type': org_type,
                    'count': 0,
                    'manager_names': set(),
                    'suggested_center': '',
                    'matched_centers_count': 0,
                    'requires_approval': True,
                }
            group = organizational_groups[org_key]
            group['count'] += 1
            if manager_name:
                group['manager_names'].add(manager_name)

            issues = []
            if not re.fullmatch(r'\d{10}', employee_id):
                issues.append('رقم هوية الموظف غير صالح')
            if not employee_name:
                issues.append('اسم الموظف مفقود')
            if employee_id in seen:
                issues.append('رقم الهوية مكرر داخل الملف')
            if not job_number:
                issues.append('الرقم الوظيفي مفقود')
            elif job_number in seen_job_numbers and seen_job_numbers[job_number] != employee_id:
                issues.append('رقم وظيفي مكرر لموظفين مختلفين')
            if employee_email and employee_email in seen_emails and seen_emails[employee_email] != employee_id:
                issues.append('بريد إلكتروني مكرر لموظفين مختلفين')
            if employee_id and employee_id not in old_ids:
                if employee_email and employee_email in old_emails and old_emails[employee_email] != employee_id:
                    issues.append('البريد مرتبط بموظف آخر في قاعدة المنصة')
                if job_number in old_numbers and old_numbers[job_number] != employee_id:
                    issues.append('الرقم الوظيفي مرتبط بموظف آخر في قاعدة المنصة')
            if not organization or not org_type:
                issues.append('الجهة الإدارية غير مكتملة')
            if issues:
                summary['review_rows'] += 1
                if len(error_examples) < 30:
                    error_examples.append({
                        'excel_row': row_index,
                        'national_id_masked': ('******' + employee_id[-4:]) if len(employee_id) >= 4 else 'غير صالح',
                        'issues': issues,
                    })
            else:
                summary['valid_rows'] += 1

            if employee_id:
                seen.add(employee_id)
            if job_number:
                seen_job_numbers[job_number] = employee_id
            if employee_email:
                seen_emails[employee_email] = employee_id
            if employee_id in old_ids:
                summary['already_on_platform'] += 1
            else:
                summary['not_on_platform'] += 1
            if source_status != ACTIVE_LABEL:
                summary['special_source_status'] += 1

        for group in organizational_groups.values():
            # Exact segment matching is advisory and never an automatic assignment.
            fragments = re.split(r'\s+-\s+', group['organization'])
            possibilities = set()
            for fragment in fragments:
                possibilities.update(by_center_name.get(norm(fragment), set()))
            group['matched_centers_count'] = len(possibilities)
            if len(possibilities) == 1:
                group['suggested_center'] = next(iter(possibilities))[1]
            group['manager_names'] = sorted(group['manager_names'])

        return {
            'sha256_prefix': hashlib.sha256(payload).hexdigest()[:12],
            'source_columns': len(EXPECTED_COLUMNS),
            'summary': {
                'total_rows': summary['total_rows'],
                'unique_employee_ids': len(seen),
                'valid_rows': summary['valid_rows'],
                'review_rows': summary['review_rows'],
                'already_on_platform': summary['already_on_platform'],
                'not_on_platform': summary['not_on_platform'],
                'special_source_status': summary['special_source_status'],
                'organization_groups': len(organizational_groups),
                'automatic_imported': 0,
            },
            'source_statuses': dict(status_counts.most_common()),
            'organization_types': dict(unit_counts.most_common()),
            'organization_groups': sorted(
                organizational_groups.values(), key=lambda group: -group['count']
            ),
            'review_examples': error_examples,
            'warnings': [
                'Read-only preview: no employees, health cards, or clinical records were changed.',
                'Source employee national ID is column H; column D is manager identity.',
                'Hijri appointment dates are not converted or overwritten automatically.',
                'Source organization paths and manager names are advisory until center mapping is approved.',
                'Leave/study/source status is not evidence of retirement or separation.',
                'Any previous employee missing from this file remains unchanged.',
            ],
        }
    finally:
        workbook.close()


class WorkforceRosterPreviewView(APIView):
    permission_classes = [permissions.IsAdminUser]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        upload = request.FILES.get('file')
        if not upload or not upload.name.lower().endswith('.xlsx'):
            return Response({'detail': 'Upload the original XLSX workforce roster.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if upload.size > 20 * 1024 * 1024:
            return Response({'detail': 'Maximum file size is 20 MB.'},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            employees = list(Employee.objects.values('national_id', 'email', 'employee_number'))
            centers = list(HealthCenter.objects.filter(is_active=True).values(
                'id', 'name', 'name_ar', 'name_en'
            ))
            result = safe_preview(upload, existing_employees=employees, centers=centers)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        AuditLog.objects.create(
            user=str(request.user), action='workforce_roster_preview',
            model_name='WorkforceRoster', record_id=result['sha256_prefix']
        )
        return Response(result)
