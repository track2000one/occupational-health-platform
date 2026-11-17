"""Confidential, read-only diagnostics for imported identifier conflicts.

Never returns a full national ID, employee number, email address, another
person's name or another employee primary key. Never writes to Employee,
clinical records or provisional roster. Does not resolve an identity.
"""
from collections import defaultdict

from django.db.models import Q
from django.db.models.functions import Lower
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Employee, ProvisionalEmployeeImportBatch
from .provisional_employee_roster import NO_CACHE, _masked, _unseal

# Reasons intentionally convey the conflicting *field* and *source*, not its value.
FLAGS = (
    'employee_number_used_by_different_registry_identity',
    'email_used_by_different_registry_identity',
    'employee_number_repeated_in_excel',
    'email_repeated_in_excel',
)


def diagnostic_report(batch):
    # Snapshot covers all current source rows so a conflict against a
    # different source row is detectable even if that row itself was not flagged.
    all_rows = list(batch.rows.only(
        'id', 'source_row', 'classification', 'sealed_payload',
    ).order_by('source_row'))
    snapshots = [(row, _unseal(row.sealed_payload)) for row in all_rows]
    if not snapshots:
        return {
            'batch_id': batch.pk, 'flagged_rows': 0, 'items': [], 'counts': {},
            'mode': 'identifier_conflict_diagnostics_read_only',
            'clinical_or_employee_modified': False,
        }

    source_numbers = defaultdict(list)
    source_emails = defaultdict(list)
    for row, source in snapshots:
        national_id = str(source.get('national_id') or '')
        employee_number = str(source.get('employee_number') or '').strip()
        email = str(source.get('email') or '').strip().casefold()
        if employee_number:
            source_numbers[employee_number].append((row.source_row, national_id))
        if email:
            source_emails[email].append((row.source_row, national_id))

    conflicts = [(row, source) for row, source in snapshots
                 if row.classification == 'identifier_review']
    numbers = {
        str(source.get('employee_number') or '').strip()
        for _, source in conflicts
        if str(source.get('employee_number') or '').strip()
    }
    emails = {
        str(source.get('email') or '').strip().casefold()
        for _, source in conflicts
        if str(source.get('email') or '').strip()
    }
    owner_numbers = defaultdict(set)
    owner_emails = defaultdict(set)
    if numbers or emails:
        cond = Q()
        if numbers:
            cond |= Q(employee_number__in=numbers)
        if emails:
            cond |= Q(email_lower__in=emails)
        owners = Employee.objects.annotate(email_lower=Lower('email')).filter(
            cond
        ).only('national_id', 'employee_number', 'email')
        for owner in owners:
            if owner.employee_number:
                owner_numbers[owner.employee_number.strip()].add(owner.national_id)
            if owner.email:
                owner_emails[owner.email.strip().casefold()].add(owner.national_id)

    reasons_by_code = defaultdict(int)
    items = []
    for row, source in conflicts:
        national_id = str(source.get('national_id') or '')
        employee_number = str(source.get('employee_number') or '').strip()
        email = str(source.get('email') or '').strip().casefold()
        codes = []
        other_excel_rows = set()

        if employee_number:
            if any(other != national_id for other in owner_numbers.get(employee_number, ())):
                codes.append('employee_number_used_by_different_registry_identity')
            for other_row, other_id in source_numbers[employee_number]:
                if other_id != national_id:
                    other_excel_rows.add(other_row)
                    if 'employee_number_repeated_in_excel' not in codes:
                        codes.append('employee_number_repeated_in_excel')
        if email:
            if any(other != national_id for other in owner_emails.get(email, ())):
                codes.append('email_used_by_different_registry_identity')
            for other_row, other_id in source_emails[email]:
                if other_id != national_id:
                    other_excel_rows.add(other_row)
                    if 'email_repeated_in_excel' not in codes:
                        codes.append('email_repeated_in_excel')

        # A conflict is a *frozen import classification*. If no reason
        # reproduces now, leave the case for manual confirmation instead of
        # silently marking it as clean.
        if not codes:
            codes.append('import_time_conflict_not_reproduced')
        for code in codes:
            reasons_by_code[code] += 1
        items.append({
            'source_row': row.source_row,
            'masked_id': _masked(national_id),
            'name': str(source.get('name') or ''),
            'reason_codes': codes,
            'other_excel_rows': sorted(other_excel_rows)[:10],
            'requires_manual_verification': True,
            'approved': False,
        })

    return {
        'mode': 'identifier_conflict_diagnostics_read_only',
        'batch_id': batch.pk,
        'flagged_rows': len(items),
        'counts': dict(reasons_by_code),
        'items': items,
        'clinical_or_employee_modified': False,
        'notice': (
            'فحص توضيحي فقط: لا يُصحّح الأرقام ولا يعتمد الهوية، '
            'ولا يغيّر بيانات الموظفين أو ملفاتهم الصحية.'
        ),
    }


class ProvisionalEmployeeConflictDiagnosticsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not request.user.is_superuser:
            return Response({'detail': 'فحص تعارض المعرّفات للمسؤول الأعلى فقط.'},
                            status=403, headers=NO_CACHE)
        batch = ProvisionalEmployeeImportBatch.objects.order_by(
            '-created_at', '-pk',
        ).first()
        if batch is None:
            return Response({
                'mode': 'identifier_conflict_diagnostics_read_only',
                'batch_id': None, 'flagged_rows': 0, 'counts': {}, 'items': [],
                'clinical_or_employee_modified': False,
                'notice': 'لا توجد دفعة موظفين مؤقتة.',
            }, headers=NO_CACHE)
        try:
            report = diagnostic_report(batch)
        except ValueError:
            return Response({
                'detail': 'تعذر قراءة بيانات الدفعة المؤقتة المشفّرة.',
            }, status=409, headers=NO_CACHE)
        return Response(report, headers=NO_CACHE)
