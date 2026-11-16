"""Reversible removal of archived employee cards from the administrative list.

Never deletes Employee rows, audit history, or medical/clinical data. The
latest archive-list visibility action is an append-only AuditLog event;
no schema migration or changes to employee identity are required.
"""
import hashlib
import json

from django.core import signing
from django.db import transaction
from django.db.models import Q
from rest_framework import permissions, status
from rest_framework.parsers import JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AuditLog, Employee

HIDE_ACTION = 'employee_list_hide:'
SHOW_ACTION = 'employee_list_show:'
SIGNING_SALT = 'archived-employee-admin-list-visibility-v1'
MAX_SELECTION = 10000
MAX_PAGE_SELECTION = 100
MAX_AGE_SECONDS = 600
CACHE_HEADERS = {'Cache-Control': 'private, no-store'}


def hidden_archive_employee_ids():
    """Replay only this feature's visibility events; unrelated audit stays intact."""
    last_action = {}
    events = (
        AuditLog.objects.filter(model_name='Employee')
        .filter(Q(action__startswith=HIDE_ACTION)
                | Q(action__startswith=SHOW_ACTION))
        .order_by('pk')
        .values_list('record_id', 'action')
    )
    for record_id, action in events.iterator(chunk_size=2000):
        if record_id.isascii() and record_id.isdecimal():
            last_action[int(record_id)] = action.startswith(HIDE_ACTION)
    return {employee_id for employee_id, hidden in last_action.items() if hidden}


class ArchivedEmployeeListVisibilityView(APIView):
    """Superuser-only, two-step visibility operation across all archived pages."""
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser]

    @staticmethod
    def _parse_ids(raw):
        if not isinstance(raw, list) or len(raw) > MAX_PAGE_SELECTION:
            raise ValueError('حدد حتى 100 بطاقة في هذه الصفحة.')
        if any(type(value) is not int or value < 1 for value in raw):
            raise ValueError('أرقام بطاقات الاختيار غير صالحة.')
        if len(raw) != len(set(raw)):
            raise ValueError('توجد بطاقات مكررة في التحديد.')
        return sorted(raw)

    def _target(self, data):
        mode = data.get('mode')
        scope = data.get('scope')
        if mode not in ('hide', 'show') or scope not in ('selected', 'all'):
            raise ValueError('نوع الإجراء أو نطاق الاختيار غير صالح.')
        hidden_ids = hidden_archive_employee_ids()
        queryset = Employee.objects.filter(is_archived=True)
        if mode == 'hide':
            queryset = queryset.exclude(pk__in=hidden_ids)
        else:
            queryset = queryset.filter(pk__in=hidden_ids)
        if scope == 'selected':
            ids = self._parse_ids(data.get('ids'))
            if not ids:
                raise ValueError('لم تحدد أي بطاقة.')
            queryset = queryset.filter(pk__in=ids)
        else:
            # This is deliberately the whole archived category. Frontend
            # labels it explicitly as 'all archived results, across pages'.
            ids = None
        records = list(queryset.order_by('pk').values(
            'pk', 'updated_at', 'archived_at', 'is_archived',
        )[:MAX_SELECTION + 1])
        if len(records) > MAX_SELECTION:
            raise ValueError('عدد السجلات أكبر من حد 10,000 سجل للدفعة.')
        if ids is not None and len(records) != len(ids):
            raise ValueError('تغيرت حالة بعض البطاقات المحددة. أعد التحميل.')
        digest = hashlib.sha256(json.dumps(
            {
                'mode': mode, 'scope': scope,
                'ids': ids, 'records': [
                    {
                        'pk': record['pk'],
                        'updated': record['updated_at'].isoformat(),
                        'archive': record['archived_at'].isoformat()
                           if record['archived_at'] else None,
                        'archived': record['is_archived'],
                    }
                    for record in records
                ],
            },
            ensure_ascii=False, sort_keys=True,
        ).encode('utf-8')).hexdigest()
        return records, digest, ids

    def post(self, request):
        if not request.user.is_superuser:
            return Response(
                {'detail': 'هذه المهمة متاحة للمسؤول الأعلى فقط.'},
                status=status.HTTP_403_FORBIDDEN, headers=CACHE_HEADERS,
            )
        action = request.data.get('action')
        if action not in ('preview', 'execute'):
            return Response({'detail': 'إجراء غير معروف.'},
                            status=400, headers=CACHE_HEADERS)
        try:
            records, digest, ids = self._target(request.data)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=409, headers=CACHE_HEADERS)
        mode = request.data['mode']
        scope = request.data['scope']
        count = len(records)
        verb = 'حذف' if mode == 'hide' else 'إظهار'
        phrase = f'{verb} {count} سجلًا من العرض' if mode == 'hide' else (
            f'{verb} {count} سجلًا في العرض'
        )
        if action == 'preview':
            return Response({
                'mode': 'archived_employee_list_visibility_preview',
                'operation': mode,
                'scope': scope,
                'count': count,
                'confirm_phrase': phrase,
                'preview_token': signing.dumps({
                    'user': request.user.pk,
                    'mode': mode, 'scope': scope, 'ids': ids,
                    'count': count, 'digest': digest,
                }, salt=SIGNING_SALT),
                'permanent_deleted': 0,
                'notice': (
                    'هذا حذف من القائمة الإدارية فقط، وليس حذفًا نهائيًا '
                    'من PostgreSQL. تبقى الهويات والملفات الطبية وسجلات الأرشفة '
                    'ويمكن إظهار البطاقات مجددًا.'
                ),
            }, headers=CACHE_HEADERS)
        if count == 0:
            return Response({'detail': 'لا توجد سجلات مطابقة للاختيار.'},
                            status=409, headers=CACHE_HEADERS)
        reason = str(request.data.get('reason') or '').strip()
        if not 10 <= len(reason) <= 80 or any(c in reason for c in ('\n', '\r')):
            return Response({
                'detail': 'يلزم سبب إداري موجز من 10 إلى 80 حرفًا دون بيانات حساسة.',
            }, status=400, headers=CACHE_HEADERS)
        if (request.data.get('confirmed') is not True
                or request.data.get('confirm_phrase') != phrase):
            return Response({'detail': 'يلزم تأكيد العبارة والنطاق كما ظهرا في المعاينة.'},
                            status=400, headers=CACHE_HEADERS)
        try:
            signed = signing.loads(
                request.data.get('preview_token'),
                salt=SIGNING_SALT, max_age=MAX_AGE_SECONDS,
            )
        except (signing.BadSignature, signing.SignatureExpired, TypeError, ValueError):
            return Response({'detail': 'انتهت صلاحية الفحص. أعد المعاينة.'},
                            status=409, headers=CACHE_HEADERS)
        if (not isinstance(signed, dict)
                or signed.get('user') != request.user.pk
                or signed.get('mode') != mode
                or signed.get('scope') != scope
                or signed.get('ids') != ids
                or signed.get('count') != count
                or signed.get('digest') != digest):
            return Response({'detail': 'تغيّر التحديد منذ المعاينة؛ أعد الفحص.'},
                            status=409, headers=CACHE_HEADERS)

        with transaction.atomic():
            # Lock all candidates before rechecking current audit visibility.
            list(Employee.objects.select_for_update().filter(
                pk__in=[item['pk'] for item in records]
            ).order_by('pk').values_list('pk', flat=True))
            try:
                fresh, current_digest, fresh_ids = self._target(request.data)
            except ValueError:
                return Response({'detail': 'تغير التحديد أثناء التنفيذ.'},
                                status=409, headers=CACHE_HEADERS)
            if (current_digest != digest or len(fresh) != count
                    or fresh_ids != ids):
                return Response({'detail': 'تغير السجل؛ أعد معاينة التحديد.'},
                                status=409, headers=CACHE_HEADERS)
            marker = (HIDE_ACTION if mode == 'hide' else SHOW_ACTION) + reason
            AuditLog.objects.bulk_create([
                AuditLog(
                    user=str(request.user), action=marker,
                    model_name='Employee', record_id=str(item['pk']),
                ) for item in fresh
            ], batch_size=250)
        return Response({
            'mode': 'archived_employee_list_visibility_completed',
            'operation': mode, 'changed': count,
            'permanent_deleted': 0,
            'notice': (
                'تم تعديل ظهور البطاقات المؤرشفة في القائمة دون حذف أي '
                'بيانات موظف أو ملف صحي. يمكن عكس الإجراء من عرض المحذوف من القائمة.'
            ),
        }, headers=CACHE_HEADERS)
