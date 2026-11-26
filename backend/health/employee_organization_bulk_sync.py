"""Explicit, staging-only completion of missing source labels from existing affiliations."""
import json
import os
from collections import Counter, defaultdict

from django.db import transaction
from django.utils import timezone
from django.utils.crypto import constant_time_compare, salted_hmac
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .employee_org_template_v4 import clean_org_value
from .models import AuditLog, Employee, EmployeeOrganizationalHierarchyEvent, HealthCenter, OrganizationUnit
from .organization_assignment import assignment_hierarchy, NETWORK
from .organization_structure import STAGING_PROJECT

MAX_REGISTRY = 10000


def plan_registry(employees, units, centers):
    by_id = {u.pk: u for u in units if u.is_active}
    center_units = defaultdict(list)
    for unit in by_id.values():
        if unit.kind == 'center' and unit.health_center_id:
            center_units[unit.health_center_id].append(unit)
        if unit.health_center_id:
            unit.health_center = centers.get(unit.health_center_id)
    configured = any(u.kind == 'department' and u.name == NETWORK for u in by_id.values())
    plans, changes = [], {}
    for employee in employees:
        source = employee.source_organizational_hierarchy
        selected = by_id.get(employee.organization_unit_id)
        center = centers.get(employee.health_center_id)
        label = (center.name_ar or center.name) if center else (selected.name if selected else '')
        item = {'id': employee.pk, 'affiliation': label, 'status': 'review', 'reason': '', 'fields': []}
        plans.append(item)
        if employee.registration_status != 'verified' or employee.employment_status != Employee.EmploymentStatus.ACTIVE:
            item['reason'] = 'employment_or_registration'
            continue
        if not configured or not isinstance(source, dict):
            item['reason'] = 'missing_verified_path'
            continue
        if employee.health_center_id:
            candidates = center_units.get(employee.health_center_id, [])
            if not center or not center.is_active or center.is_archived or len(candidates) != 1:
                item['reason'] = 'missing_verified_path'
                continue
            if employee.organization_unit_id:
                if not selected or selected.kind not in ('center', 'unit') or selected.health_center_id != center.pk:
                    item['reason'] = 'invalid_affiliation'
                    continue
            else:
                selected = candidates[0]
        elif not selected or selected.kind != 'department' or selected.health_center_id:
            item['reason'] = 'missing_verified_path'
            continue
        labels = assignment_hierarchy(selected, by_id)
        if not labels:
            item['reason'] = 'missing_verified_path'
            continue
        conflicts, additions = [], {}
        for key, target in labels.items():
            original = source.get(key)
            if original is not None and not isinstance(original, str):
                conflicts.append(key)
                continue
            text = (original or '').strip()
            expected = clean_org_value(target)
            existing = clean_org_value(text)
            if (existing and existing != expected) or (text == 'لا ينطبق' and expected):
                conflicts.append(key)
            elif expected and not existing:
                additions[key] = expected
        if conflicts:
            item.update(status='conflict', reason='source_conflict', fields=conflicts)
        elif additions:
            item.update(status='ready', reason='', fields=sorted(additions))
            changes[employee.pk] = {**source, **additions}
        else:
            item.update(status='matched', reason='')
    return plans, changes


def snapshot_token(employees, plans, changes, user_id):
    snapshot = {
        'user': user_id,
        'employees': [[e.pk, e.health_center_id, e.organization_unit_id,
                       e.registration_status, e.employment_status,
                       e.updated_at.isoformat(), e.source_organizational_hierarchy] for e in employees],
        'plans': plans, 'changes': changes,
    }
    return salted_hmac('ohp-bulk-org-sync-v1', json.dumps(snapshot, ensure_ascii=False,
                       sort_keys=True, separators=(',', ':')), algorithm='sha256').hexdigest()


class EmployeeOrganizationBulkSyncView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request):
        if not request.user.is_superuser:
            return Response({'detail': 'صلاحية المسؤول الأعلى مطلوبة.'}, status=403)
        if os.getenv('STAGING_MODE', '').lower() != 'true' or os.getenv('RAILWAY_PROJECT_ID') != STAGING_PROJECT:
            return Response({'detail': 'المطابقة الجماعية متاحة في Staging المعزولة فقط.'}, status=403)
        action = request.data.get('action')
        if action not in ('preview', 'apply'):
            return Response({'detail': 'إجراء غير صالح.'}, status=400)
        with transaction.atomic():
            center_qs = HealthCenter.objects.order_by('pk')
            unit_qs = OrganizationUnit.objects.order_by('pk')
            employee_qs = Employee.objects.filter(is_archived=False).order_by('pk').only(
                'id', 'health_center', 'organization_unit', 'registration_status',
                'employment_status', 'updated_at', 'source_organizational_hierarchy')
            if action == 'apply':
                center_qs = center_qs.select_for_update()
                unit_qs = unit_qs.select_for_update()
                employee_qs = employee_qs.select_for_update()
            centers = {c.pk: c for c in center_qs}
            units = list(unit_qs)
            employees = list(employee_qs[:MAX_REGISTRY + 1])
            if len(employees) > MAX_REGISTRY:
                return Response({'detail': 'السجل أكبر من الحد المسموح؛ يلزم تقسيم نطاق المعالجة.'}, status=400)
            plans, changes = plan_registry(employees, units, centers)
            fingerprint = snapshot_token(employees, plans, changes, request.user.pk)
            if action == 'preview':
                counts = Counter(row['status'] for row in plans)
                return Response({'total': len(plans), 'counts': {k: counts[k] for k in
                    ('ready', 'matched', 'conflict', 'review')}, 'rows': plans, 'preview_token': fingerprint})
            token = request.data.get('preview_token')
            if not isinstance(token, str) or not constant_time_compare(token, fingerprint):
                return Response({'detail': 'تغيرت البيانات منذ المعاينة. أعد الفحص قبل التنفيذ.'}, status=409)
            ids = request.data.get('employee_ids')
            if (not isinstance(ids, list) or not ids or len(ids) > MAX_REGISTRY
                    or any(type(pk) is not int or pk <= 0 for pk in ids)
                    or len(ids) != len(set(ids)) or not set(ids).issubset(changes)):
                return Response({'detail': 'اختر السجلات المؤهلة فقط.'}, status=400)
            reason = request.data.get('reason')
            if not isinstance(reason, str) or not 10 <= len(reason.strip()) <= 500 or request.data.get('confirmed') is not True:
                return Response({'detail': 'يلزم توثيق السبب والإقرار بنتائج المعاينة.'}, status=400)
            ids = set(ids)
            now = timezone.now()
            updates, events = [], []
            for employee in employees:
                if employee.pk not in ids:
                    continue
                before, after = employee.source_organizational_hierarchy, changes[employee.pk]
                fields = sorted(k for k in after if before.get(k) != after[k])
                employee.source_organizational_hierarchy = after
                employee.updated_at = now
                updates.append(employee)
                events.append(EmployeeOrganizationalHierarchyEvent(employee=employee,
                    action='completed', changed_levels=fields, reason=reason.strip(), performed_by=request.user))
            Employee.objects.bulk_update(updates, ['source_organizational_hierarchy', 'updated_at'], batch_size=250)
            EmployeeOrganizationalHierarchyEvent.objects.bulk_create(events, batch_size=250)
            AuditLog.objects.create(user=str(request.user), action='employee_organization_bulk_sync',
                                    model_name='Employee', record_id='bulk:' + fingerprint[:20])
            return Response({'updated_count': len(updates), 'remaining_ready': len(changes) - len(updates)})
