"""Isolated Staging session lifecycle; existing Production JWT routes unchanged."""
from datetime import timedelta, datetime, timezone as dt_timezone
from uuid import UUID, uuid4
from django.contrib.auth import authenticate, get_user_model
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import salted_hmac, constant_time_compare
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from health.models import StagingAuthSession, StagingLoginWindow, AuditLog
from health.staging_registry_scope import boundary, isolated

ACCESS=timedelta(minutes=10)
SESSION=timedelta(hours=8)
WINDOW=900
MAX_ATTEMPTS=8

def event(action,user=None):
    AuditLog.objects.create(user=str(user.pk) if user else '', action=action,
                            model_name='AuthSession',record_id='')

def password_stamp(user):
    return salted_hmac('ohp.staging.session.password',user.password,algorithm='sha256').hexdigest()

def revoke_user_sessions(user_id):
    StagingAuthSession.objects.filter(user_id=user_id,revoked_at__isnull=True).update(revoked_at=timezone.now())

def reserve_attempt(identifier):
    now=timezone.now()
    bucket=int(now.timestamp())//WINDOW
    expires=datetime.fromtimestamp((bucket+1)*WINDOW,tz=dt_timezone.utc)
    key=salted_hmac('ohp.staging.login.window',f'{bucket}:{identifier}',algorithm='sha256').hexdigest()
    with transaction.atomic():
        row,_=StagingLoginWindow.objects.get_or_create(key=key,defaults={'expires_at':expires})
        row=StagingLoginWindow.objects.select_for_update().get(pk=row.pk)
        if row.attempts>=MAX_ATTEMPTS:
            return max(1,int((expires-now).total_seconds())+1)
        row.attempts+=1
        row.save(update_fields=['attempts'])
    # Expired counters are removed in bounded batches, not user sessions or audit records.
    expired=list(StagingLoginWindow.objects.filter(expires_at__lte=now).values_list('pk',flat=True)[:100])
    if expired:
        StagingLoginWindow.objects.filter(pk__in=expired,expires_at__lte=now).delete()
    return 0

def issue_pair(user,session,now):
    token=RefreshToken.for_user(user)
    token['ohp_sid']=str(session.pk)
    token.set_exp(from_time=now,lifetime=session.expires_at-now)
    access=token.access_token
    access.set_exp(from_time=now,lifetime=min(ACCESS,session.expires_at-now))
    session.refresh_jti=str(token['jti'])
    session.save(update_fields=['refresh_jti'])
    return {'access':str(access),'refresh':str(token)}

def start_session(user):
    now=timezone.now()
    session=StagingAuthSession.objects.create(id=uuid4(),user=user,password_stamp=password_stamp(user),
        refresh_jti='',expires_at=now+SESSION)
    return issue_pair(user,session,now)

def token_ids(token):
    try:
        return UUID(str(token['ohp_sid'])),int(token['user_id'])
    except (KeyError,TypeError,ValueError,OverflowError):
        raise AuthenticationFailed('انتهت الجلسة. سجّل الدخول مجددًا.')

def valid_session(session,user,now):
    return bool(session and user and user.is_active and session.revoked_at is None
        and session.expires_at>now and constant_time_compare(session.password_stamp,password_stamp(user)))

def validate_access(user,token):
    if not isolated():
        raise AuthenticationFailed('بيئة الاختبار غير معتمدة.')
    sid,uid=token_ids(token)
    if uid!=user.pk:
        raise AuthenticationFailed('انتهت الجلسة.')
    session=StagingAuthSession.objects.filter(pk=sid,user_id=uid).first()
    if not valid_session(session,user,timezone.now()):
        raise AuthenticationFailed('انتهت الجلسة. سجّل الدخول مجددًا.')

def rejected():
    return Response({'detail':'انتهت الجلسة. سجّل الدخول مجددًا.'},status=401)

class StagingTokenObtainView(TokenObtainPairView):
    def post(self,request,*args,**kwargs):
        if not boundary():
            return super().post(request,*args,**kwargs)
        if not isolated():
            return rejected()
        identifier=request.data.get('username')
        password=request.data.get('password')
        if not isinstance(identifier,str) or not isinstance(password,str) or not identifier.strip() or len(identifier)>254 or len(password)>1024:
            return Response({'detail':'بيانات الدخول غير صحيحة.'},status=400)
        identifier=identifier.strip().lower()
        retry=reserve_attempt(identifier)
        if retry:
            return Response({'detail':'محاولات دخول متكررة. حاول بعد انتهاء المهلة.'},status=429,headers={'Retry-After':str(retry)})
        user=authenticate(request=request,username=identifier,password=password)
        if user is None or not user.is_active:
            event('qa_login_failed')
            return Response({'detail':'بيانات الدخول غير صحيحة.'},status=401)
        with transaction.atomic():
            current=get_user_model().objects.select_for_update().get(pk=user.pk)
            if not current.is_active or not constant_time_compare(current.password,user.password):
                return rejected()
            pair=start_session(current)
            current.last_login=timezone.now()
            current.save(update_fields=['last_login'])
            event('qa_login_success',current)
        return Response(pair)

def read_refresh(request):
    raw=request.data.get('refresh')
    if not isinstance(raw,str) or len(raw)>8192:
        return None
    try:
        token=RefreshToken(raw)
        sid,uid=token_ids(token)
        return token,sid,uid
    except (TokenError,AuthenticationFailed):
        return None

class StagingTokenRefreshView(TokenRefreshView):
    def post(self,request,*args,**kwargs):
        if not boundary():
            return super().post(request,*args,**kwargs)
        if not isolated():
            return rejected()
        parsed=read_refresh(request)
        if parsed is None:
            return rejected()
        token,sid,uid=parsed
        with transaction.atomic():
            user=get_user_model().objects.select_for_update().filter(pk=uid).first()
            session=StagingAuthSession.objects.select_for_update().filter(pk=sid,user_id=uid).first()
            now=timezone.now()
            if not valid_session(session,user,now):
                return rejected()
            if not constant_time_compare(session.refresh_jti,str(token['jti'])):
                event('qa_refresh_replay_denied',user)
                return rejected()
            return Response(issue_pair(user,session,now))

class StagingLogoutView(APIView):
    authentication_classes=[]
    permission_classes=[AllowAny]
    def post(self,request):
        if not isolated():
            return Response({'detail':'المسار متاح في Staging فقط.'},status=403)
        parsed=read_refresh(request)
        if parsed is None:
            return rejected()
        _,sid,uid=parsed
        # A previously rotated, still signed refresh may revoke its own session,
        # so logout concurrent with refresh cannot leave a replacement active.
        with transaction.atomic():
            session=StagingAuthSession.objects.select_for_update().filter(pk=sid,user_id=uid).first()
            if not session:
                return rejected()
            if session.revoked_at is None:
                session.revoked_at=timezone.now()
                session.save(update_fields=['revoked_at'])
                event('qa_logout',session.user)
        return Response({'status':'revoked'})
