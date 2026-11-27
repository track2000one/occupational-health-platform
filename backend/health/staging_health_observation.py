"""Create-only dated observations for explicitly verified synthetic QA employees."""
from django.db import transaction
from rest_framework import permissions, serializers
from rest_framework.views import APIView
from .health_data_import import authorized
from .staging_clinical_entry import eligible, reply, past, audit
from .models import Employee, EmployeeHealthObservation
from .health_observation_fields import MEASUREMENTS, CONDITIONS, TEXT_FIELDS, OBSERVATION_FIELDS, observation_record

class ObservationInput(serializers.Serializer):
    observation_date=serializers.DateField(validators=[past])
    weight_kg=serializers.DecimalField(max_digits=6,decimal_places=2,min_value=0.01,required=False)
    height_cm=serializers.DecimalField(max_digits=6,decimal_places=2,min_value=0.01,required=False)
    bmi=serializers.DecimalField(max_digits=5,decimal_places=2,min_value=0.01,required=False)

    def get_fields(self):
        fields=super().get_fields()
        for key in CONDITIONS:
            fields[key]=serializers.ChoiceField(choices=('yes','no','unknown'),required=False)
        for key in TEXT_FIELDS:
            fields[key]=serializers.CharField(max_length=1000 if key in (
                'surgical_history','family_history','medical_restrictions','medical_recommendations') else 120,
                required=False,allow_blank=False)
        return fields

    def validate(self, attrs):
        for prefix in ('phq','gad','mbi'):
            if (prefix+'_version' in attrs)!=(prefix+'_result' in attrs):
                raise serializers.ValidationError('يجب تسجيل نسخة أداة التقييم والنتيجة المدونة معًا.')
        if not any(key in attrs for key in OBSERVATION_FIELDS):
            raise serializers.ValidationError('أدخل قيمة واحدة على الأقل.')
        return attrs

class SyntheticObservationView(APIView):
    permission_classes=[permissions.IsAuthenticated]

    def get(self,request,employee_id):
        if not authorized(request):
            return reply({'detail':'متاح للمسؤول الأعلى في Staging فقط.'},403)
        employee=Employee.objects.filter(pk=employee_id).select_related('health_center').first()
        if not eligible(employee):
            return reply({'detail':'الموظف غير مؤهل للاختبار.'},403)
        try:
            page=int(request.query_params.get('page','1'))
            if not 1<=page<=10000:
                raise ValueError
        except ValueError:
            return reply({'detail':'رقم الصفحة غير صالح.'},400)
        qs=employee.health_observations.order_by('-observation_date','-pk')
        start=(page-1)*50
        rows=list(qs[start:start+51])
        return reply({'items':[observation_record(r) for r in rows[:50]],'total':qs.count(),
                      'page':page,'has_more':len(rows)>50,'employee_id':employee.pk})

    def post(self,request,employee_id):
        if not authorized(request):
            return reply({'detail':'متاح للمسؤول الأعلى في Staging فقط.'},403)
        if request.data.get('synthetic_confirmed') is not True:
            return reply({'detail':'أكد أن البيانات اصطناعية فقط.'},400)
        if set(request.data)-set(OBSERVATION_FIELDS)-{'observation_date','synthetic_confirmed'}:
            return reply({'detail':'حقول غير معتمدة.'},400)
        form=ObservationInput(data=request.data)
        if not form.is_valid():
            return reply({'detail':'راجع القيم وتاريخ التقييم ونسخ الأدوات.','errors':form.errors},400)
        d=form.validated_data
        values={key:(str(d[key]) if key in MEASUREMENTS else d[key]) for key in OBSERVATION_FIELDS if key in d}
        with transaction.atomic():
            employee=Employee.objects.select_for_update().filter(pk=employee_id).first()
            if not eligible(employee):
                return reply({'detail':'الموظف غير مؤهل للاختبار.'},403)
            if employee.health_observations.filter(observation_date=d['observation_date']).exists():
                return reply({'detail':'يوجد سجل لهذا التاريخ. لا يسمح بالكتابة فوق التقييم السابق.'},409)
            record=EmployeeHealthObservation.objects.create(employee=employee,observation_date=d['observation_date'],
                      data=values,created_by=request.user)
            audit(request.user,'qa_health_observation_registered',record)
            return reply(observation_record(record),201)
