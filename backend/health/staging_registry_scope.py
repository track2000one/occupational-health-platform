"""Read-only registry pilot. No inference from names or unapproved source labels."""
import os
from collections import defaultdict
from django.db.models import Q
from rest_framework.permissions import BasePermission
from rest_framework.exceptions import PermissionDenied
from .models import Employee, OrganizationUnit
from .organization_structure import STAGING_PROJECT
from .health_data_import import synthetic

SCOPED_ROLES=frozenset(('ohManager','centerManager','ohDoctor','clinicDoctor','labOfficer',
    'vaccinationOfficer','needleStickOfficer','medicalCommitteeOfficer','dataEntry','dataQuality','reportsOfficer'))
MAX_NODES=5000
MAX_CANDIDATES=5000

def boundary():
    return os.getenv('STAGING_MODE','').lower()=='true' or os.getenv('RAILWAY_PROJECT_ID')==STAGING_PROJECT

def isolated():
    return os.getenv('STAGING_MODE','').lower()=='true' and os.getenv('RAILWAY_PROJECT_ID')==STAGING_PROJECT

def graph():
    nodes=list(OrganizationUnit.objects.filter(is_active=True,is_approved=True).select_related('health_center').order_by('pk')[:MAX_NODES+1])
    if len(nodes)>MAX_NODES:
        raise PermissionDenied('الهيكل التنظيمي يتجاوز حد الاختبار.')
    return {n.pk:n for n in nodes}

def chain(node_id,nodes):
    out=set()
    while node_id is not None:
        if node_id in out or node_id not in nodes:
            return set()
        n=nodes[node_id]
        if n.health_center_id and (not n.health_center.is_active or n.health_center.is_archived):
            return set()
        out.add(node_id)
        node_id=n.parent_id
    return out

def validated_scope(unit_id):
    return bool(unit_id and chain(unit_id,graph()))

def profile_for(user):
    try:
        return user.health_profile
    except Exception:
        return None

def eligible_ids(user):
    profile=profile_for(user)
    if not isolated() or not profile:
        return []
    nodes=graph()
    own=profile.role=='employee'
    scope=profile.organization_scope_id
    if own:
        if not profile.national_id and not profile.employee_number:
            return []
    elif profile.role not in SCOPED_ROLES or not chain(scope,nodes):
        return []
    q=Employee.objects.filter(is_archived=False,registration_status='verified',employment_status=Employee.EmploymentStatus.ACTIVE).filter(
        Q(employee_number__startswith='OHP-QA-')|Q(employee_number__startswith='OHP-LOAD-'))
    if own:
        if profile.national_id:q=q.filter(national_id=profile.national_id)
        if profile.employee_number:q=q.filter(employee_number=profile.employee_number)
    candidates=list(q.select_related('health_center').order_by('pk')[:MAX_CANDIDATES+1])
    if len(candidates)>MAX_CANDIDATES:
        raise PermissionDenied('تجاوز عدد سجلات الاختبار الحد الآمن.')
    centers=defaultdict(list)
    for n in nodes.values():
        if n.kind=='center' and n.health_center_id and chain(n.pk,nodes):
            centers[n.health_center_id].append(n.pk)
    ids=[]
    for e in candidates:
        if not synthetic(e):
            continue
        if own:
            ids.append(e.pk)
            continue
        unit=e.organization_unit_id
        if unit is None and e.health_center_id:
            matches=centers[e.health_center_id]
            unit=matches[0] if len(matches)==1 else None
        ancestors=chain(unit,nodes)
        if not ancestors or scope not in ancestors:
            continue
        # A recorded center FK must agree with the explicit organization ancestry.
        if e.health_center_id:
            mapped={nodes[i].health_center_id for i in ancestors if nodes[i].kind=='center' and nodes[i].health_center_id}
            if mapped!={e.health_center_id}:
                continue
        ids.append(e.pk)
    return ids

class StagingRegistryPermission(BasePermission):
    def has_permission(self,request,view):
        if not boundary() or request.user.is_superuser:
            return True
        return bool(isolated() and request.method in ('GET','HEAD','OPTIONS') and
            view.action in ('list','retrieve'))
