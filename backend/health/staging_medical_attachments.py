"""Staging-only canonical image attachments. No arbitrary PDF, executable, or archive ingestion."""
from hashlib import sha256
from io import BytesIO
from pathlib import PurePath
from uuid import uuid4
import warnings

from PIL import Image, ImageOps, UnidentifiedImageError
from django.db import transaction
from django.db.models import Sum
from django.http import HttpResponse
from rest_framework.exceptions import ValidationError, NotFound, PermissionDenied
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import Employee,EmployeeHealthCard,StagingMedicalAttachment,AuditLog
from .staging_clinical_entry import eligible
from .health_data_import import authorized,NO_CACHE

MAX_BYTES=5*1024*1024
MAX_PIXELS=8_000_000
MAX_PER_CARD=10
MAX_TOTAL=20*1024*1024
FORMATS={'PNG':('.png',),'JPEG':('.jpg','.jpeg'),'WEBP':('.webp',)}
MIMES={'PNG':'image/png','JPEG':'image/jpeg','WEBP':'image/webp'}

def bad(message):
    raise ValidationError({'file':message})

def canonical_image(upload,output):
    if not upload or upload.size<=0 or upload.size>MAX_BYTES:
        bad('اختر صورة واحدة بحجم لا يتجاوز 5 ميجابايت.')
    if output not in ('image','pdf'):
        bad('صيغة المخرج غير مدعومة.')
    ext=PurePath(upload.name or '').suffix.lower()
    if ext not in {x for values in FORMATS.values() for x in values}:
        bad('يسمح فقط بصور PNG وJPEG وWebP؛ لا تقبل ملفات PDF الخارجية أو Word.')
    raw=upload.read(MAX_BYTES+1)
    if len(raw)>MAX_BYTES:
        bad('حجم الملف يتجاوز الحد.')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error',Image.DecompressionBombWarning)
            with Image.open(BytesIO(raw),formats=list(FORMATS)) as check:
                fmt=check.format
                if ext not in FORMATS.get(fmt,()) or upload.content_type not in (MIMES.get(fmt),'application/octet-stream'):
                    bad('امتداد الملف أو نوعه لا يطابق محتواه.')
                if check.width*check.height>MAX_PIXELS or getattr(check,'n_frames',1)!=1:
                    bad('الصورة كبيرة الأبعاد أو متعددة الإطارات.')
                check.verify()
            with Image.open(BytesIO(raw),formats=list(FORMATS)) as original:
                original.load()
                oriented=ImageOps.exif_transpose(original).convert('RGB')
                # Copy pixels into a fresh canvas; EXIF, profiles, comments, and trailing bytes are never copied.
                clean=Image.new('RGB',oriented.size,'white')
                clean.paste(oriented)
                result=BytesIO()
                if output=='pdf':
                    clean.save(result,format='PDF',resolution=150,title='Synthetic QA attachment')
                    mime='application/pdf'
                else:
                    clean.save(result,format='PNG')
                    mime='image/png'
                data=result.getvalue()
    except (UnidentifiedImageError,OSError,ValueError,SyntaxError,Image.DecompressionBombError,Image.DecompressionBombWarning):
        bad('الصورة تالفة أو غير آمنة للمعالجة.')
    if not data or len(data)>MAX_BYTES:
        bad('حجم المخرج المعاد ترميزه يتجاوز الحد.')
    return data,mime

def card_for(request,employee_id):
    if not authorized(request):
        raise PermissionDenied('المرفقات الطبية متاحة للمسؤول الأعلى في Staging المعزولة فقط.')
    employee=Employee.objects.select_for_update().filter(pk=employee_id).first()
    if not eligible(employee):
        raise NotFound('بطاقة اختبار مؤهلة غير موجودة.')
    card=EmployeeHealthCard.objects.select_for_update().filter(employee_id=employee_id,is_approved=False).first()
    if card is None:
        raise NotFound('احفظ بطاقة الاختبار غير المعتمدة أولًا.')
    return card

def filename(row):
    return 'qa-attachment-'+str(row.pk)+('.pdf' if row.content_type=='application/pdf' else '.png')

def metadata(row):
    return {'id':str(row.pk),'file_name':filename(row),'content_type':row.content_type,
        'byte_size':row.byte_size,'created_at':row.created_at.isoformat()}

def audit(request,action,row):
    AuditLog.objects.create(user=str(request.user.pk),action=action,
        model_name='StagingMedicalAttachment',record_id=str(row.pk))

class StagingMedicalAttachmentCollection(APIView):
    permission_classes=[IsAuthenticated]
    parser_classes=[MultiPartParser,FormParser]

    @transaction.atomic
    def get(self,request,employee_id):
        card=card_for(request,employee_id)
        rows=list(StagingMedicalAttachment.objects.filter(card=card).defer('file_data')[:MAX_PER_CARD+1])
        if len(rows)>MAX_PER_CARD:
            return Response({'detail':'تجاوز عدد المرفقات الحد المعتمد.'},status=409,headers=NO_CACHE)
        return Response({'attachments':[metadata(row) for row in rows]},headers=NO_CACHE)

    @transaction.atomic
    def post(self,request,employee_id):
        card=card_for(request,employee_id)
        try:
            length=int(request.META.get('CONTENT_LENGTH') or 0)
        except ValueError:
            length=0
        if length<=0 or length>MAX_BYTES+65536:
            return Response({'detail':'حجم طلب الرفع غير مقبول.'},status=413,headers=NO_CACHE)
        if request.data.get('synthetic_confirmed')!='true':
            raise ValidationError({'detail':'أكّد أن الملف اصطناعي ولا يتضمن بيانات فعلية.'})
        if set(request.FILES.keys())!={'file'} or len(request.FILES.getlist('file'))!=1:
            bad('يسمح برفع ملف واحد في الطلب.')
        data,mime=canonical_image(request.FILES['file'],request.data.get('output','image'))
        digest=sha256(data).hexdigest()
        rows=StagingMedicalAttachment.objects.filter(card=card)
        if rows.filter(checksum_sha256=digest).exists():
            return Response({'detail':'المرفق نفسه موجود مسبقًا.'},status=409,headers=NO_CACHE)
        if rows.count()>=MAX_PER_CARD or (rows.aggregate(total=Sum('byte_size'))['total'] or 0)+len(data)>MAX_TOTAL:
            return Response({'detail':'تم بلوغ الحد الإجمالي لمرفقات البطاقة.'},status=409,headers=NO_CACHE)
        row=StagingMedicalAttachment.objects.create(id=uuid4(),card=card,content_type=mime,
            byte_size=len(data),checksum_sha256=digest,file_data=data,uploaded_by=request.user)
        audit(request,'qa_medical_attachment_upload',row)
        return Response(metadata(row),status=201,headers=NO_CACHE)

class StagingMedicalAttachmentContent(APIView):
    permission_classes=[IsAuthenticated]

    @transaction.atomic
    def get(self,request,employee_id,attachment_id):
        card=card_for(request,employee_id)
        row=StagingMedicalAttachment.objects.filter(card=card,pk=attachment_id).first()
        if row is None:
            raise NotFound('المرفق غير موجود ضمن هذه البطاقة.')
        data=bytes(row.file_data)
        if (row.content_type not in ('image/png','application/pdf') or row.byte_size!=len(data)
                or len(data)>MAX_BYTES or sha256(data).hexdigest()!=row.checksum_sha256):
            return Response({'detail':'تعذر التحقق من سلامة المرفق.'},status=409,headers=NO_CACHE)
        response=HttpResponse(data,content_type=row.content_type)
        response['Content-Length']=str(len(data))
        response['Content-Disposition']='attachment; filename="'+filename(row)+'"'
        response['Cache-Control']='private, no-store'
        response['X-Content-Type-Options']='nosniff'
        response['Content-Security-Policy']="default-src 'none'; sandbox"
        if request.method=='GET':
            audit(request,'qa_medical_attachment_download',row)
        return response
