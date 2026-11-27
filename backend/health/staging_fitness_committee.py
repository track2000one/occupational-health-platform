"""Explicit synthetic fitness and referral workflow, no automatic medical approval."""
from django.db import transaction
from rest_framework import permissions, serializers
from rest_framework.views import APIView
from .health_data_import import authorized
from .staging_clinical_entry import eligible, reply, past, audit
from .models import Employee, OccupationalHealthAssessment, CommitteeReferral
from .linked_health_card_records import fitness_assessment, committee_referral

class FitnessInput(serializers.Serializer):
    assessment_date=serializers.DateField(validators=[past])
    assessment_type=serializers.ChoiceField(choices=OccupationalHealthAssessment.ASSESSMENT_TYPES)
    fitness_decision=serializers.ChoiceField(choices=OccupationalHealthAssessment.FITNESS_DECISIONS)
    restrictions=serializers.CharField(max_length=1000,required=False,allow_blank=True,default='')
    next_assessment_date=serializers.DateField(required=False,allow_null=True,default=None)
    def validate(self,attrs):
        if attrs['fitness_decision']=='fitWithRestrictions' and not attrs['restrictions']:
            raise serializers.ValidationError('القيود مطلوبة للقرار المقيد.')
        if attrs['next_assessment_date'] and attrs['next_assessment_date']<attrs['assessment_date']:
            raise serializers.ValidationError('تاريخ إعادة التقييم لا يسبق التقييم الفعلي.')
        return attrs

class ReferralInput(serializers.Serializer):
    referral_date=serializers.DateField(validators=[past])
    diagnosis=serializers.CharField(max_length=1000)

class DecisionInput(serializers.Serializer):
    record_id=serializers.IntegerField(min_value=1)
    decision_date=serializers.DateField(validators=[past])
    decision=serializers.CharField(max_length=1000)
    recommendations=serializers.CharField(max_length=1000,required=False,allow_blank=True,default='')

INPUTS={'fitness':FitnessInput,'referral':ReferralInput,'decision':DecisionInput}

class SyntheticFitnessCommitteeView(APIView):
    permission_classes=[permissions.IsAuthenticated]
    def get(self,request,employee_id):
        if not authorized(request):
            return reply({'detail':'متاح للمسؤول الأعلى في Staging فقط.'},403)
        employee=Employee.objects.filter(pk=employee_id).select_related('health_center').first()
        if not eligible(employee):
            return reply({'detail':'الموظف غير مؤهل للاختبار.'},403)
        kind=request.query_params.get('kind')
        if kind not in ('fitness','committee'):
            return reply({'detail':'نوع السجل غير صالح.'},400)
        try:
            page=int(request.query_params.get('page','1'))
            if not 1<=page<=10000:
                raise ValueError
        except ValueError:
            return reply({'detail':'رقم الصفحة غير صالح.'},400)
        qs=(employee.occupational_health_assessments.order_by('-assessment_date','-pk') if kind=='fitness'
            else employee.committee_referrals.order_by('-pk'))
        convert=fitness_assessment if kind=='fitness' else committee_referral
        start=(page-1)*50
        rows=list(qs[start:start+51])
        return reply({'items':[convert(r) for r in rows[:50]],'page':page,'total':qs.count(),
                      'has_more':len(rows)>50,'employee_id':employee.pk})
    def post(self,request,employee_id):
        if not authorized(request):
            return reply({'detail':'متاح للمسؤول الأعلى في Staging فقط.'},403)
        if request.data.get('synthetic_confirmed') is not True:
            return reply({'detail':'أكد أن البيانات اصطناعية فقط.'},400)
        action=request.data.get('action')
        cls=INPUTS.get(action)
        if not cls:
            return reply({'detail':'الإجراء غير صالح.'},400)
        form=cls(data=request.data)
        if set(request.data)-set(form.fields)-{'action','synthetic_confirmed'}:
            return reply({'detail':'حقول غير معتمدة.'},400)
        if not form.is_valid():
            return reply({'detail':'راجع الحقول والتواريخ المطلوبة.','errors':form.errors},400)
        d=form.validated_data
        with transaction.atomic():
            employee=Employee.objects.select_for_update().filter(pk=employee_id).first()
            if not eligible(employee):
                return reply({'detail':'الموظف غير مؤهل للاختبار.'},403)
            if action=='fitness':
                if employee.occupational_health_assessments.filter(assessment_date=d['assessment_date'],
                        assessment_type=d['assessment_type']).exists():
                    return reply({'detail':'تقييم من النوع والتاريخ نفسيهما موجود مسبقًا.'},409)
                record=OccupationalHealthAssessment.objects.create(employee=employee,**d,
                    created_by=request.user,assessor_name='QA — synthetic assessment')
                audit(request.user,'qa_fitness_recorded',record)
                return reply(fitness_assessment(record),201)
            if action=='referral':
                if employee.committee_referrals.filter(referral_date=d['referral_date'],
                        diagnosis=d['diagnosis']).exists():
                    return reply({'detail':'إحالة مماثلة موجودة مسبقًا.'},409)
                record=CommitteeReferral.objects.create(employee=employee,**d,
                    date=d['referral_date'],status='under_review',qa_workflow=True)
                audit(request.user,'qa_committee_referral',record)
                return reply(committee_referral(record),201)
            record=employee.committee_referrals.select_for_update().filter(pk=d['record_id'],qa_workflow=True).first()
            if (not record or record.status!='under_review' or not record.referral_date
                    or record.decision or record.decision_date):
                return reply({'detail':'اختر إحالة اختبار قيد المراجعة دون قرار سابق.'},409)
            if d['decision_date']<record.referral_date:
                return reply({'detail':'تاريخ القرار لا يسبق تاريخ الإحالة.'},400)
            record.decision=d['decision']
            record.decision_date=d['decision_date']
            record.recommendations=d['recommendations']
            record.status='decision_issued'
            record.save(update_fields=['decision','decision_date','recommendations','status'])
            audit(request.user,'qa_committee_decision_recorded',record)
            return reply(committee_referral(record))
