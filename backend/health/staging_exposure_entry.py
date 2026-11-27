"""Scoped incident registration; no third-party personal or medical data."""
from django.db import transaction
from rest_framework import permissions, serializers
from rest_framework.views import APIView
from .health_data_import import authorized
from .staging_clinical_entry import eligible, reply, past, audit
from .linked_health_card_records import needle_stick
from .models import Employee, NeedleStickExposure

METHODS = ('needle_stick', 'sharp_object', 'other_exposure')

class ExposureInput(serializers.Serializer):
    exposure_date = serializers.DateField(validators=[past])
    workplace = serializers.CharField(max_length=150)
    injury_method = serializers.ChoiceField(choices=METHODS)

class SyntheticExposureView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, employee_id):
        if not authorized(request):
            return reply({'detail':'متاح للمسؤول الأعلى في Staging فقط.'},403)
        employee = Employee.objects.filter(pk=employee_id).select_related('health_center').first()
        if not eligible(employee):
            return reply({'detail':'الموظف غير مؤهل للاختبار.'},403)
        try:
            page=int(request.query_params.get('page','1'))
            if not 1<=page<=10000:
                raise ValueError
        except ValueError:
            return reply({'detail':'رقم الصفحة غير صالح.'},400)
        qs=employee.needle_stick_exposures.order_by('-pk')
        start=(page-1)*50
        records=list(qs[start:start+51])
        return reply({'items':[needle_stick(r) for r in records[:50]],
                      'page':page,'total':qs.count(),'has_more':len(records)>50,
                      'employee_id':employee.pk})

    def post(self, request, employee_id):
        if not authorized(request):
            return reply({'detail':'متاح للمسؤول الأعلى في Staging فقط.'},403)
        if request.data.get('synthetic_confirmed') is not True:
            return reply({'detail':'أكد استخدام بيانات اصطناعية فقط.'},400)
        allowed={'synthetic_confirmed','exposure_date','workplace','injury_method'}
        if set(request.data)-allowed:
            return reply({'detail':'لا يُسمح ببيانات إضافية أو بيانات مصدر التعرض.'},400)
        form=ExposureInput(data=request.data)
        if not form.is_valid():
            return reply({'detail':'راجع تاريخ التعرض ومكان العمل وطريقة الإصابة.','errors':form.errors},400)
        d=form.validated_data
        # This trial uses a fixed synthetic workplace marker, not real location
        # or third-party text supplied by a user.
        if d['workplace'] != 'QA-SYNTHETIC':
            return reply({'detail':'استخدم مكان العمل الاصطناعي QA-SYNTHETIC فقط.'},400)
        with transaction.atomic():
            employee=Employee.objects.select_for_update().filter(pk=employee_id).first()
            if not eligible(employee):
                return reply({'detail':'الموظف غير مؤهل للاختبار.'},403)
            if employee.needle_stick_exposures.filter(**d).exists():
                return reply({'detail':'سجل اختبار مماثل موجود مسبقًا.'},409)
            record=NeedleStickExposure.objects.create(employee=employee, **d,
                       status='new', source_known=None)
            audit(request.user,'qa_exposure_registered',record)
            return reply(needle_stick(record),201)
