"""Reversible, audited health-center archive, batch reset and recovery.

A center with ANY live FK reference is blocked, including employees, users,
organizational units, workforce mappings and clinical history. No relation
is reassigned, nulled or deleted by these operations.
"""
from hashlib import sha256
import json

from django.core import signing
from django.db import transaction
from django.db.models import Count
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AuditLog, HealthCenter, HealthCenterLifecycleEvent, HealthCenterResetBatch

SALT = 'ohp-health-centers-reversible-reset-v1'
TTL = 300
MAX_CENTERS = 1000


def owner(user):
    return bool(user and user.is_authenticated and user.is_superuser)


def relations_by_center(center_ids):
    """Find all live inbound center FK references via Django's model graph.

    This conservatively blocks any center referenced by ANY record, including
    nullable or PROTECT relations. The archive audit relation is the only
    exception: past archive events must not prevent future restoration.
    """
    result = {pk: {} for pk in center_ids}
    if not center_ids:
        return result
    for related in HealthCenter._meta.related_objects:
        model = related.related_model
        if model is HealthCenterLifecycleEvent:
            continue
        field = related.field
        if not getattr(field, 'many_to_one', False) and not getattr(field, 'one_to_one', False):
            continue
        key = field.attname
        label = model._meta.label
        grouped = (
            model._base_manager.filter(**{key + '__in': center_ids})
            .values(key).annotate(total=Count('pk'))
        )
        for item in grouped:
            pk = item[key]
            if pk in result and item['total']:
                result[pk][label] = result[pk].get(label, 0) + item['total']
    return result


def snapshot(archive=False, center_id=None, lock=False):
    query = HealthCenter.objects.filter(is_archived=archive).order_by('pk')
    if center_id is not None:
        query = query.filter(pk=center_id)
    if lock:
        query = query.select_for_update()
    rows = list(query.values('id', 'name', 'name_ar', 'updated_at', 'archived_at', 'is_active'))
    ids = [row['id'] for row in rows]
    related = relations_by_center(ids)
    blocked = [
        {'id': row['id'], 'name': row['name_ar'] or row['name'], 'references': related[row['id']]}
        for row in rows if related[row['id']]
    ]
    canonical = {
        'rows': [
            [
                row['id'], row['name'], row['name_ar'],
                row['updated_at'].isoformat() if row['updated_at'] else None,
                row['archived_at'].isoformat() if row['archived_at'] else None,
                row['is_active'], sorted(related[row['id']].items()),
            ] for row in rows
        ],
        'scope': 'archive' if archive else 'active',
    }
    return {
        'rows': rows, 'ids': ids, 'count': len(rows),
        'blocked': blocked, 'blocked_count': len(blocked),
        'eligible_count': len(rows) - len(blocked),
        'fingerprint': sha256(json.dumps(
            canonical, ensure_ascii=False, sort_keys=True,
        ).encode()).hexdigest(),
    }


def signed_preview(user, action, details, batch_id=None):
    return signing.dumps({
        'user': user.pk,
        'action': action,
        'ids': details['ids'],
        'hash': details['fingerprint'],
        'batch_id': str(batch_id) if batch_id else '',
    }, salt=SALT)


def latest_restorable():
    return HealthCenterResetBatch.objects.filter(
        restored_at__isnull=True,
    ).order_by('-created_at').first()


def restorable_batch_snapshot(batch, lock=False):
    if not batch:
        return None
    q = HealthCenter.objects.filter(
        pk__in=batch.center_ids,
        is_archived=True,
        archived_at=batch.archived_at,
    ).order_by('pk')
    if lock:
        q = q.select_for_update()
    rows = list(q.values('id', 'name', 'name_ar', 'updated_at', 'archived_at', 'is_active'))
    items = [
        [row['id'], row['updated_at'].isoformat() if row['updated_at'] else None,
         row['archived_at'].isoformat() if row['archived_at'] else None]
        for row in rows
    ]
    return {
        'ids': [row['id'] for row in rows],
        'count': len(rows),
        'fingerprint': sha256(json.dumps(
            {'batch': str(batch.pk), 'rows': items}, sort_keys=True,
        ).encode()).hexdigest(),
    }


class HealthCenterArchiveView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not owner(request.user):
            return Response(
                {'detail': 'Center deletion and reset require a system superuser.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        action = str(request.data.get('action') or '')
        allowed = {
            'preview_delete', 'delete', 'preview_reset', 'reset',
            'preview_restore', 'restore', 'preview_restore_batch', 'restore_batch',
        }
        if action not in allowed:
            return Response({'detail': 'Unknown center archive action.'}, status=400)

        single = action in {'preview_delete', 'delete', 'preview_restore', 'restore'}
        center_id = None
        if single:
            try:
                center_id = int(request.data['center_id'])
                if center_id < 1:
                    raise ValueError()
            except (KeyError, TypeError, ValueError):
                return Response({'detail': 'A valid center ID is required.'}, status=400)

        if action.startswith('preview_'):
            if action in {'preview_restore_batch'}:
                batch = latest_restorable()
                state = restorable_batch_snapshot(batch)
                if not state or not state['count']:
                    return Response({'detail': 'No remaining centers from a reset batch.'}, status=409)
                return Response({
                    'mode': action, 'count': state['count'], 'blocked_count': 0,
                    'blocked': [], 'confirm_phrase': f"استعادة {state['count']} مركزًا",
                    'preview_token': signed_preview(request.user, 'restore_batch', state, batch.pk),
                }, headers={'Cache-Control': 'private, no-store'})

            archived = action == 'preview_restore'
            state = snapshot(archive=archived, center_id=center_id)
            if single and not state['count']:
                return Response({'detail': 'Center not found in the requested state.'}, status=404)
            if state['count'] > MAX_CENTERS:
                return Response({'detail': 'Center count is too large for a safe batch reset.'},
                                status=409)
            if action == 'preview_reset' and not state['count']:
                return Response({'detail': 'No active centers to reset.'}, status=409)
            if action == 'preview_delete':
                phrase = f"حذف مركز {state['rows'][0]['name_ar'] or state['rows'][0]['name']}"
                planned = 'delete'
            elif action == 'preview_restore':
                phrase = f"استعادة مركز {state['rows'][0]['name_ar'] or state['rows'][0]['name']}"
                planned = 'restore'
            else:
                phrase = f"تصفير {state['count']} مركزًا"
                planned = 'reset'
            return Response({
                'mode': action, 'count': state['count'],
                'eligible_count': state['eligible_count'],
                'blocked_count': state['blocked_count'],
                'blocked': state['blocked'][:100],
                'confirm_phrase': phrase,
                'preview_token': signed_preview(request.user, planned, state),
                'notice': 'Reversible archive only. Linked centers cannot be removed.',
            }, headers={'Cache-Control': 'private, no-store'})

        reason = str(request.data.get('reason') or '').strip()
        if len(reason) < 15 or len(reason) > 500:
            return Response({'detail': 'Specific documented reason (15–500 characters) is required.'},
                            status=400)
        if request.data.get('confirmed') is not True:
            return Response({'detail': 'Explicit confirmation is required.'}, status=400)
        try:
            signed = signing.loads(
                request.data.get('preview_token'), salt=SALT, max_age=TTL,
            )
        except (TypeError, signing.BadSignature, signing.SignatureExpired, ValueError):
            return Response({'detail': 'Preview expired or invalid; repeat preview.'}, status=409)
        if not isinstance(signed, dict) or signed.get('user') != request.user.pk or signed.get('action') != action:
            return Response({'detail': 'Preview belongs to another user or action.'}, status=409)

        with transaction.atomic():
            if action == 'restore_batch':
                batch = latest_restorable()
                if not batch or str(batch.pk) != signed.get('batch_id'):
                    return Response({'detail': 'The last reset batch changed; repeat preview.'}, status=409)
                state = restorable_batch_snapshot(batch, lock=True)
                if not state or not state['count']:
                    return Response({'detail': 'Nothing eligible to restore.'}, status=409)
                expected_phrase = f"استعادة {state['count']} مركزًا"
            else:
                state = snapshot(
                    archive=(action == 'restore'),
                    center_id=center_id if single else None,
                    lock=True,
                )
                if not state['count']:
                    return Response({'detail': 'Center state changed; preview again.'}, status=409)
                if action == 'delete':
                    expected_phrase = f"حذف مركز {state['rows'][0]['name_ar'] or state['rows'][0]['name']}"
                elif action == 'restore':
                    expected_phrase = f"استعادة مركز {state['rows'][0]['name_ar'] or state['rows'][0]['name']}"
                else:
                    expected_phrase = f"تصفير {state['count']} مركزًا"
                if action in {'delete', 'reset'} and state['blocked_count']:
                    return Response({
                        'detail': 'Blocked: linked employees, organizational units or other records exist.',
                        'blocked_count': state['blocked_count'],
                        'blocked': state['blocked'][:100],
                    }, status=409)
                if action == 'reset' and state['count'] > MAX_CENTERS:
                    return Response({'detail': 'Too many centers for a single reset.'}, status=409)

            if state['ids'] != signed.get('ids') or state['fingerprint'] != signed.get('hash'):
                return Response({'detail': 'Center records changed since preview. Preview again.'},
                                status=409)
            if request.data.get('confirm_phrase') != expected_phrase:
                return Response({'detail': 'Exact confirmation phrase does not match.'}, status=400)

            timestamp = timezone.now()
            batch = None
            if action == 'reset':
                batch = HealthCenterResetBatch.objects.create(
                    center_ids=state['ids'], reason=reason,
                    archived_at=timestamp, created_by=request.user,
                )
            if action in ('delete', 'reset'):
                count = HealthCenter.objects.filter(
                    pk__in=state['ids'], is_archived=False,
                ).update(
                    is_archived=True, archived_at=timestamp, archived_by=request.user,
                    archive_reason=reason, updated_at=timestamp,
                )
                event_action = 'archive' if action == 'delete' else 'reset_archive'
            else:
                if action == 'restore_batch':
                    batch = latest_restorable()
                count = HealthCenter.objects.filter(
                    pk__in=state['ids'], is_archived=True,
                ).update(
                    is_archived=False, archived_at=None, archived_by=None,
                    archive_reason='', updated_at=timestamp,
                )
                event_action = 'restore' if action == 'restore' else 'batch_restore'
                if action == 'restore_batch' and batch:
                    batch.restored_at = timestamp
                    batch.restored_by = request.user
                    batch.restore_reason = reason
                    batch.save(update_fields=['restored_at', 'restored_by', 'restore_reason'])
            if count != state['count']:
                raise RuntimeError('Center count changed during transaction; rolled back.')
            HealthCenterLifecycleEvent.objects.bulk_create([
                HealthCenterLifecycleEvent(
                    center_id=pk, action=event_action, reason=reason,
                    performed_by=request.user, batch=batch,
                ) for pk in state['ids']
            ], batch_size=200)
            AuditLog.objects.create(
                user=str(request.user), action='health_center_' + action,
                model_name='HealthCenterResetBatch' if batch else 'HealthCenter',
                record_id=str(batch.pk if batch else center_id),
            )
        return Response({
            'status': action, 'affected': count,
            'batch_id': str(batch.pk) if batch else None,
            'notice': 'No employee or clinical data was deleted or reassigned.',
        }, headers={'Cache-Control': 'private, no-store'})
