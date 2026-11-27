"""Explicit, audited clinical entry for synthetic QA employees in isolated Staging."""
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, serializers
from rest_framework.response import Response
from rest_framework.views import APIView
from .health_data_import import authorized, NO_CACHE
from .health_data_card_commit import synthetic
from .models import Employee, LabTest, Vaccination, AuditLog
from .linked_health_card_records import lab_test, vaccination

LAB_TYPES = ('Anti-HBs','HBsAg','HCV','HIV','PPD','Rubella IgG','Measles IgG','Varicella IgG','CBC','Urine Analysis')
VACCINES = ('HBV','Influenza','MMR','MCV4','COVID-19','Varicella','HPV','Tetanus')

def eligible(e):
    return bool(e and not e.is_archived and e.registration_status == 'verified'
                and e.employment_status == Employee.EmploymentStatus.ACTIVE and synthetic(e))

def reply(data, code=200):
    return Response(data, status=code, headers=NO_CACHE)

def past(value):
    if value > timezone.localdate() or value.year < 1900:
        raise serializers.ValidationError('التاريخ غير صالح أو في المستقبل.')
    return value

class RequestInput(serializers.Serializer):
    test_type = serializers.ChoiceField(choices=LAB_TYPES)
    request_date = serializers.DateField(validators=[past])
    notes = serializers.CharField(max_length=1000, required=False, default='', allow_blank=True)

class ResultInput(serializers.Serializer):
    record_id = serializers.IntegerField(min_value=1)
    result = serializers.CharField(max_length=200)
    result_date = serializers.DateField(validators=[past])
    notes = serializers.CharField(max_length=1000, required=False, default='', allow_blank=True)

class VaccineInput(serializers.Serializer):
    vaccine_type = serializers.ChoiceField(choices=VACCINES)
    dose = serializers.ChoiceField(choices=('1','2','3','booster'))
    dose_date = serializers.DateField(validators=[past])
    next_due_date = serializers.DateField(required=False, allow_null=True, default=None)
    notes = serializers.CharField(max_length=1000, required=False, default='', allow_blank=True)
    def validate(self, attrs):
        if attrs['next_due_date'] and attrs['next_due_date'] <= attrs['dose_date']:
            raise serializers.ValidationError('تاريخ الاستحقاق يجب أن يلي تاريخ الجرعة.')
        return attrs

def audit(user, action, record):
    AuditLog.objects.create(user=str(user)[:150], action=action,
                            model_name=record.__class__.__name__, record_id=str(record.pk))

class SyntheticClinicalEmployeesView(APIView):
    permission_classes=[permissions.IsAuthenticated]
    def get(self, request):
        if not authorized(request):
            return reply({'detail':'متاح للمسؤول الأعلى في Staging فقط.'},403)
        candidates=list(Employee.objects.filter(is_archived=False, registration_status='verified',
            employment_status=Employee.EmploymentStatus.ACTIVE).filter(
            Q(employee_number__startswith='OHP-QA-') | Q(employee_number__startswith='OHP-LOAD-')
        ).select_related('health_center').order_by('pk')[:5001])
        if len(candidates)>5000:
            return reply({'detail':'تجاوز عدد سجلات الاختبار الحد الآمن.'},409)
        return reply({'employees':[{'id':e.pk,'name':e.name,'number':e.employee_number}
                                   for e in candidates if eligible(e)]})

class SyntheticClinicalEntryView(APIView):
    permission_classes=[permissions.IsAuthenticated]
    def get(self, request, employee_id):
        if not authorized(request):
            return reply({'detail':'متاح للمسؤول الأعلى في Staging فقط.'},403)
        e=Employee.objects.filter(pk=employee_id).select_related('health_center').first()
        if not eligible(e):
            return reply({'detail':'الموظف غير مؤهل للاختبار.'},403)
        kind=request.query_params.get('kind')
        if kind not in ('labs','vaccines'):
            return reply({'detail':'نوع السجل غير صالح.'},400)
        try:
            page=int(request.query_params.get('page','1'))
            if not 1<=page<=10000:
                raise ValueError
        except ValueError:
            return reply({'detail':'رقم الصفحة غير صالح.'},400)
        qs=(e.lab_tests if kind=='labs' else e.vaccinations).order_by('-pk')
        start=(page-1)*50
        rows=list(qs[start:start+51])
        convert=lab_test if kind=='labs' else vaccination
        return reply({'items':[convert(r) for r in rows[:50]],'total':qs.count(),
                      'page':page,'has_more':len(rows)>50,'employee_id':e.pk})

    def post(self, request, employee_id):
        if not authorized(request):
            return reply({'detail':'متاح للمسؤول الأعلى في Staging فقط.'},403)
        if request.data.get('synthetic_confirmed') is not True:
            return reply({'detail':'أكد استخدام بيانات اصطناعية فقط.'},400)
        action=request.data.get('action')
        cls={'lab_request':RequestInput,'lab_result':ResultInput,'vaccine_given':VaccineInput}.get(action)
        if not cls:
            return reply({'detail':'الإجراء غير صالح.'},400)
        form=cls(data=request.data)
        if not form.is_valid():
            return reply({'detail':'راجع الحقول والتواريخ المطلوبة.','errors':form.errors},400)
        d=form.validated_data
        with transaction.atomic():
            e=Employee.objects.select_for_update().filter(pk=employee_id).first()
            if not eligible(e):
                return reply({'detail':'الموظف غير مؤهل للاختبار.'},403)
            if action=='lab_request':
                if e.lab_tests.filter(test_type=d['test_type']).filter(
                    Q(request_date=d['request_date']) | Q(request_date__isnull=True,date=d['request_date'])).exists():
                    return reply({'detail':'يوجد طلب من النوع والتاريخ نفسيهما.'},409)
                r=LabTest.objects.create(employee=e,test_type=d['test_type'],request_date=d['request_date'],
                    date=d['request_date'],request_notes=d['notes'],status='pending')
                audit(request.user,'qa_lab_request',r)
                return reply(lab_test(r),201)
            if action=='lab_result':
                r=e.lab_tests.select_for_update().filter(pk=d['record_id']).first()
                if not r or r.status!='pending' or r.result or r.result_date or not r.request_date:
                    return reply({'detail':'اختر طلب اختبار معلقًا؛ لا تعدل النتائج السابقة.'},409)
                if d['result_date']<r.request_date:
                    return reply({'detail':'تاريخ النتيجة لا يسبق تاريخ الطلب.'},400)
                r.result=d['result']
                r.result_date=d['result_date']
                r.result_notes=d['notes']
                r.status='completed'
                r.save(update_fields=['result','result_date','result_notes','status'])
                audit(request.user,'qa_lab_result',r)
                return reply(lab_test(r))
            if e.vaccinations.filter(vaccine_type=d['vaccine_type'],dose=d['dose'],dose_date=d['dose_date']).exists():
                return reply({'detail':'الجرعة بنفس التاريخ موجودة مسبقًا.'},409)
            r=Vaccination.objects.create(employee=e,vaccine_type=d['vaccine_type'],dose=d['dose'],
                dose_date=d['dose_date'],next_due_date=d['next_due_date'],notes=d['notes'],status='given')
            audit(request.user,'qa_vaccine_given',r)
            return reply(vaccination(r),201)
