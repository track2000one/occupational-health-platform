"""Private bulk review export and evidenced review decisions for employee Excel.

This module operates on already-classified name discrepancies. It never creates,
restores, archives, completes or updates an Employee. Its Excel is generated only
in memory, delivered to authenticated superusers, and never stored in GitHub.
"""
from datetime import datetime
from io import BytesIO
import json

from django.core import signing
from django.db import IntegrityError, transaction
from django.http import HttpResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from rest_framework.response import Response
from rest_framework import status

from .models import AuditLog, Employee, EmployeeExcelMatchReview


EXPORT_LIMIT = 2500
MAX_BULK_DECISIONS = 25
REVIEW_CATEGORIES = frozenset((
    'name_mismatch', 'name_different_scripts',
    'individually_archived_requires_review',
    'unique_field_mismatch', 'unique_value_owned_by_other',
))
NAME_SUBTYPES = frozenset((
    'orthographic', 'reordered', 'missing_or_extra_parts',
    'same_first_and_last', 'same_first_only', 'same_last_only',
    'different_or_complex',
))
CATEGORY_LABELS = {
    'name_mismatch': 'اختلاف الاسم ضمن نفس لغة الكتابة',
    'name_different_scripts': 'الاسم بالعربية والإنجليزية',
    'individually_archived_requires_review': 'مؤرشف بشكل مستقل',
    'unique_field_mismatch': 'اختلاف الرقم الوظيفي أو البريد',
    'unique_value_owned_by_other': 'رقم أو بريد يخص موظفًا آخر',
}
SUBTYPE_LABELS = {
    'orthographic': 'اختلاف إملائي أو تشكيل',
    'reordered': 'تبديل ترتيب مقاطع الاسم',
    'missing_or_extra_parts': 'جزء مفقود أو إضافي في الاسم',
    'same_first_and_last': 'اتفاق الأول والأخير مع اختلاف الوسط',
    'same_first_only': 'اتفاق الاسم الأول فقط',
    'same_last_only': 'اتفاق اسم العائلة فقط',
    'different_or_complex': 'اختلاف أوسع يحتاج تحققًا',
}
DECISION_LABELS = {
    'pending': 'لم تُراجع',
    'verified': 'تم توثيق التحقق دون تعديل',
    'not_verified': 'لم يثبت التطابق',
    'stale': 'مراجعة سابقة غير مطابقة',
}


def matching_review_rows(plan, category, subtype):
    """Return only filtered conflicts; no unfiltered staff directory export."""
    if category != 'all' and category not in REVIEW_CATEGORIES:
        raise ValueError('تصنيف مراجعة غير معروف.')
    if subtype != 'all' and subtype not in NAME_SUBTYPES:
        raise ValueError('تفصيل اختلاف الاسم غير معروف.')
    return [
        row for row in plan['comparison_rows']
        if (category == 'all' or row['status'] == category) and
        (subtype == 'all' or (
            row['status'] == 'name_mismatch' and row['name_diagnostic'] == subtype
        ))
    ]


def decision_status_map(rows, file_hash, sheet_name):
    reviews = {
        review.source_row: review
        for review in EmployeeExcelMatchReview.objects.filter(
            workbook_sha256=file_hash,
            sheet_name=sheet_name,
            source_row__in=[r['row'] for r in rows],
        )
    }
    result = {}
    for row in rows:
        decision = reviews.get(row['row'])
        if decision is None:
            result[row['row']] = 'pending'
        elif (decision.employee_id == row['employee_pk']
              and decision.source_row_sha256 == row['source_row_hash']
              and decision.registry_snapshot_sha256 == row['registry_snapshot_hash']):
            result[row['row']] = decision.decision
        else:
            result[row['row']] = 'stale'
    return result


def safe_excel_text(value):
    """Prevent spreadsheet-formula injection from untrusted Excel employee names."""
    content = str(value if value is not None else '').replace('\r', ' ').replace('\n', ' ')
    content = content[:500]
    return "'" + content if content.startswith(('=', '+', '-', '@', '\t')) else content


def export_reconciled_review(request, plan, file_hash, sheet_name):
    category = str(request.data.get('review_filter') or 'name_mismatch')
    subtype = str(request.data.get('review_name_diagnostic') or 'all')
    try:
        rows = matching_review_rows(plan, category, subtype)
    except ValueError as err:
        return Response({'detail': str(err)}, status=status.HTTP_400_BAD_REQUEST)
    if not rows or len(rows) > EXPORT_LIMIT:
        return Response(
            {'detail': 'لا توجد حالات مطابقة للتصفية أو تجاوز التصدير 2500 حالة.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    decision_by_row = decision_status_map(rows, file_hash, sheet_name)

    wb = Workbook()
    summary = wb.active
    summary.title = 'الملخص'
    summary.sheet_view.rightToLeft = True
    summary.append(['تقرير مراجعة اختلاف بيانات الموظفين'])
    summary.append(['الغرض', 'المقارنة إدارية فقط؛ لا يجيز الملف استعادة أو تعديل موظف'])
    summary.append(['عدد الحالات', len(rows)])
    summary.append(['نوع الحالة', CATEGORY_LABELS.get(category, 'جميع التصنيفات')])
    summary.append(['تفصيل الاسم', SUBTYPE_LABELS.get(subtype, 'جميع التفصيلات')])
    summary.append(['اسم ورقة المصدر', sheet_name])
    summary.append(['وقت التقرير', datetime.now().strftime('%Y-%m-%d %H:%M')])
    summary.append(['الملاحظة', 'الأسماء وأرقام الموظفين بيانات مهنية سرية؛ يُحتفظ بالتقرير ضمن القنوات المصرح بها فقط'])
    summary.append(['تنبيه', 'أي توثيق أو تغيير للموظفين يجب إجراؤه من المنصة بعد التحقق من المستند الرسمي'])

    comparison = wb.create_sheet('مقارنة الأسماء')
    comparison.sheet_view.rightToLeft = True
    comparison.freeze_panes = 'A2'
    headers = [
        'صف الملف', 'رقم الهوية (مخفي)', 'اسم السجل الأصلي', 'الاسم في Excel',
        'رقم موظف السجل', 'الرقم الوظيفي Excel', 'المركز الحالي',
        'مركز Excel (مرجعي)', 'حالة الأرشفة', 'نوع التعارض',
        'تفصيل اختلاف الاسم', 'قرار المراجعة',
    ]
    comparison.append(headers)
    for row in rows:
        items = [
            row['row'], row['national_id_masked'],
            row['registry_name'], row['source_name'],
            row['registry_employee_number'], row['source_employee_number'],
            row['registry_center'], row['source_center'],
            'مؤرشف' if row['archived'] else 'غير مؤرشف',
            CATEGORY_LABELS.get(row['status'], row['status']),
            SUBTYPE_LABELS.get(row['name_diagnostic'], '—'),
            DECISION_LABELS.get(decision_by_row[row['row']], 'غير محدد'),
        ]
        comparison.append([
            item if isinstance(item, int) else safe_excel_text(item)
            for item in items
        ])

    navy_fill = PatternFill(fill_type='solid', fgColor='164E63')
    white_bold = Font(name='Arial', size=11, bold=True, color='FFFFFF')
    for sheet in (summary, comparison):
        sheet.row_dimensions[1].height = 34
        for cell in sheet[1]:
            cell.fill = navy_fill
            cell.font = white_bold
            cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        sheet.sheet_properties.pageSetUpPr.fitToPage = True

    for col, width in enumerate([14, 19, 37, 37, 20, 20, 32, 32, 17, 31, 32, 29], 1):
        comparison.column_dimensions[get_column_letter(col)].width = width
    summary.column_dimensions['A'].width = 24
    summary.column_dimensions['B'].width = 95
    comparison.auto_filter.ref = f'A1:L{len(rows) + 1}'
    for row in comparison.iter_rows(min_row=2):
        for cell in row:
            cell.font = Font(name='Arial', size=10)
            cell.alignment = Alignment(vertical='center', horizontal='right', wrap_text=True)
            if cell.column in (2, 5, 6):
                cell.number_format = '@'
            if cell.row % 2 == 0:
                cell.fill = PatternFill(fill_type='solid', fgColor='EFF6F9')
    for num in range(2, comparison.max_row + 1):
        comparison.row_dimensions[num].height = 27

    output = BytesIO()
    wb.save(output)
    output.seek(0)
    response = HttpResponse(
        output.getvalue(),
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    response['Content-Disposition'] = (
        'attachment; filename="employee_excel_discrepancy_review.xlsx"'
    )
    response['Cache-Control'] = 'private, no-store'
    response['X-Content-Type-Options'] = 'nosniff'
    return response


def commit_evidenced_bulk_review(
    request, plan, file_hash, sheet_name,
    *, token_salt, token_ttl, employee_state, digest_value,
):
    """Write reviewed *decisions* only; never mutate Employee or clinical data."""
    try:
        signed_tokens = json.loads(request.data.get('decision_tokens') or '[]')
    except (ValueError, TypeError):
        return Response({'detail': 'قائمة الاختيارات غير صحيحة.'}, status=400)
    if (not isinstance(signed_tokens, list) or
            not 1 <= len(signed_tokens) <= MAX_BULK_DECISIONS or
            not all(isinstance(token, str) for token in signed_tokens)):
        return Response({
            'detail': 'حدد من 1 إلى 25 بطاقة مراجعة في كل دفعة.',
        }, status=400)
    decision = str(request.data.get('decision') or '')
    reference = str(request.data.get('evidence_reference') or '').strip()
    reason = str(request.data.get('reason') or '').strip()
    if (decision not in ('verified', 'not_verified')
            or not 6 <= len(reference) <= 255
            or not 30 <= len(reason) <= 500
            or request.data.get('confirmed') != 'true'
            or request.data.get('shared_evidence_confirmed') != 'true'):
        return Response({
            'detail': 'يلزم مرجع رسمي يغطي جميع المحددين، ومبرر 30–500 حرف، وتأكيد مستقل.',
        }, status=400)

    by_row = {row['row']: row for row in plan['comparison_rows']}
    selected = []
    unique_rows = set()
    unique_employees = set()
    for signed in signed_tokens:
        try:
            token = signing.loads(
                signed, salt=token_salt + '-review', max_age=token_ttl,
            )
        except (signing.BadSignature, signing.SignatureExpired, ValueError, TypeError):
            return Response({'detail': 'انتهت صلاحية اختيار. أعد عرض جدول المقارنة.'}, status=409)
        if (not isinstance(token, dict)
                or token.get('file_sha') != file_hash
                or token.get('sheet') != sheet_name
                or token.get('admin_id') != request.user.pk):
            return Response({'detail': 'ملف أو مسؤول الاعتماد لا يطابق المعاينة.'}, status=409)
        row = by_row.get(token.get('row'))
        if (row is None or row['status'] not in REVIEW_CATEGORIES
                or row['employee_pk'] != token.get('pk')
                or row['status'] != token.get('kind')
                or row['source_row_hash'] != token.get('source_hash')
                or row['registry_snapshot_hash'] != token.get('registry_hash')):
            return Response({'detail': 'تغيرت بيانات إحدى البطاقات؛ أعد المقارنة.'}, status=409)
        if row['row'] in unique_rows or row['employee_pk'] in unique_employees:
            return Response({'detail': 'تكرار بطاقة أو موظف ضمن التحديد الجماعي.'}, status=400)
        unique_rows.add(row['row'])
        unique_employees.add(row['employee_pk'])
        selected.append(row)

    try:
        with transaction.atomic():
            locked = {
                employee.pk: employee
                for employee in Employee.objects.select_for_update()
                .filter(pk__in=unique_employees).order_by('pk')
            }
            if len(locked) != len(unique_employees):
                return Response({'detail': 'لم تعد جميع سجلات الموظفين متاحة.'}, status=409)
            for row in selected:
                employee = locked[row['employee_pk']]
                if digest_value(employee_state(employee)) != row['registry_snapshot_hash']:
                    return Response({'detail': 'تغيرت بيانات موظف؛ أعد معاينة الملف.'}, status=409)

            if EmployeeExcelMatchReview.objects.filter(
                workbook_sha256=file_hash,
                sheet_name=sheet_name,
                source_row__in=list(unique_rows),
            ).exists():
                return Response({'detail': 'سُجل قرار سابق لإحدى البطاقات؛ حدّث المقارنة.'},
                                status=409)

            records = [
                EmployeeExcelMatchReview(
                    employee=locked[row['employee_pk']],
                    workbook_sha256=file_hash,
                    sheet_name=sheet_name,
                    source_row=row['row'],
                    source_row_sha256=row['source_row_hash'],
                    registry_snapshot_sha256=row['registry_snapshot_hash'],
                    discrepancy_type=row['status'],
                    decision=decision,
                    evidence_reference=reference,
                    reason=reason,
                    reviewed_by=request.user,
                )
                for row in selected
            ]
            EmployeeExcelMatchReview.objects.bulk_create(records)
            AuditLog.objects.create(
                user=str(request.user),
                action='employee_excel_bulk_match_review_decision',
                model_name='EmployeeExcelMatchReview',
                record_id=str(len(records)),
            )
    except IntegrityError:
        return Response({'detail': 'حدثت مراجعة متزامنة؛ لم تُحفظ الدفعة. أعد فحص الحالات.'},
                        status=409)

    return Response({
        'mode': 'bulk_review_decision',
        'saved_decisions': len(selected),
        'decision': decision,
        'employee_records_modified': 0,
        'notice': 'وُثقت القرارات فقط؛ لم تُستعد أو تُعدل أي بطاقة موظف.',
    }, headers={'Cache-Control': 'private, no-store'})
