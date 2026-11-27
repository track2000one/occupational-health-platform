"""Read-only aggregate trial: exact synthetic cohort, no employee rows or clinical text."""
from collections import Counter
from datetime import date
from io import BytesIO
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from rest_framework import permissions, serializers
from rest_framework.views import APIView
from .health_data_import import authorized, NO_CACHE
from .health_card_presence import CARD_FIELDS, card_presence, percent
from .staging_clinical_entry import eligible, reply
from .models import (Employee, OrganizationUnit, EmployeeHealthCard, EmployeeHealthProfile,
    EmployeeHealthObservation, LabTest, LabScreening, Vaccination, VaccinationRecord, VaccinationDose,
    ClinicVisit, EmployeeClinicVisit, OccupationalClinicVisit, InjuryCase, NeedleStickExposure,
    OccupationalHealthAssessment, CommitteeReferral, MedicalCommitteeCase)

MAX_CANDIDATES=5000
MAX_ORG=5000
MAX_DAYS=3660
# Each metric is explicitly a source-specific record count, never a prevalence rate.
EVENTS=(
 ('lab_requests','طلبات التحاليل المؤرخة',LabTest,'request_date',Q()),
 ('lab_results','نتائج التحاليل المسجلة والمؤرخة',LabTest,'result_date',Q(status='completed')&~Q(result='')),
 ('lab_screenings','طلبات فحوص المناعة المؤرخة',LabScreening,'request_date',Q()),
 ('vaccine_doses','جرعات التطعيم المسجلة والمؤرخة',Vaccination,'dose_date',Q(status='given')),
 ('series_doses','جرعات سلاسل التطعيم المؤرخة',VaccinationDose,'dose_date',Q()),
 ('clinic_visits','زيارات العيادات المؤرخة',ClinicVisit,'visit_date',Q()),
 ('employee_clinic_visits','زيارات عيادة الموظفين المؤرخة',EmployeeClinicVisit,'visit_date',Q()),
 ('occupational_clinic_visits','زيارات الصحة المهنية المؤرخة',OccupationalClinicVisit,'visit_date',Q()),
 ('observations','التقييمات الصحية المؤرخة',EmployeeHealthObservation,'observation_date',Q()),
 ('fitness','تقييمات اللياقة المؤرخة',OccupationalHealthAssessment,'assessment_date',Q()),
 ('injury_cases','حالات الإصابات المؤرخة',InjuryCase,'exposure_date',Q()),
 ('needle_stick','حوادث التعرض ووخز الإبر المؤرخة',NeedleStickExposure,'exposure_date',Q()),
 ('referrals','الإحالات الطبية المؤرخة',CommitteeReferral,'referral_date',Q()),
 ('decisions','قرارات الإحالات المسجلة والمؤرخة',CommitteeReferral,'decision_date',~Q(decision='')),
 ('committee_cases','قرارات اللجان التاريخية المؤرخة',MedicalCommitteeCase,'decision_date',~Q(decision='')),
)
COVERAGE=(
 ('lab','موظفون لديهم سجل تحليل أو فحص مناعة',LabTest,LabScreening),
 ('vaccination','موظفون لديهم سجل تطعيم',Vaccination,VaccinationRecord),
 ('visits','موظفون لديهم سجل زيارة',ClinicVisit,EmployeeClinicVisit,OccupationalClinicVisit),
 ('health','موظفون لديهم ملف صحي أو تقييم',EmployeeHealthProfile,EmployeeHealthObservation),
 ('fitness','موظفون لديهم تقييم لياقة',OccupationalHealthAssessment),
 ('injuries','موظفون لديهم سجل إصابة أو تعرض',InjuryCase,NeedleStickExposure),
 ('committee','موظفون لديهم سجل إحالة أو لجنة',CommitteeReferral,MedicalCommitteeCase),
)
CONDITION_KEYS=(('diabetes','السكري'),('hypertension','ارتفاع ضغط الدم'),('thyroid_disease','أمراض الغدة الدرقية'),
 ('asthma','الربو'),('blood_disease','أمراض الدم'),('chronic_disease','مرض مزمن'))
MENTAL_KEYS=(('phq','PHQ'),('gad','GAD'),('mbi','MBI'))

class MetricsFilter(serializers.Serializer):
    sector=serializers.IntegerField(required=False,min_value=1)
    center=serializers.IntegerField(required=False,min_value=1)
    department=serializers.IntegerField(required=False,min_value=1)
    start=serializers.DateField(required=False)
    end=serializers.DateField(required=False)
    def validate(self,attrs):
        a,b=attrs.get('start'),attrs.get('end')
        if bool(a)!=bool(b):
            raise serializers.ValidationError('حدد بداية الفترة ونهايتها معًا، أو اتركهما فارغتين.')
        if a and (a>b or (b-a).days>MAX_DAYS or a.year<1900 or b>timezone.localdate()):
            raise serializers.ValidationError('الفترة غير صالحة أو تزيد على عشر سنوات أو تقع في المستقبل.')
        return attrs

def cohort():
    candidates=list(Employee.objects.filter(is_archived=False,registration_status='verified',
        employment_status=Employee.EmploymentStatus.ACTIVE).filter(
        Q(employee_number__startswith='OHP-QA-')|Q(employee_number__startswith='OHP-LOAD-')
    ).select_related('health_center').order_by('pk')[:MAX_CANDIDATES+1])
    if len(candidates)>MAX_CANDIDATES:
        raise ValueError('تجاوز عدد سجلات الاختبار الحد الآمن.')
    return [e for e in candidates if eligible(e)]

def organization_scope(employees,filters):
    # Only actual, approved and active organization links; no source-label guessing.
    nodes=list(OrganizationUnit.objects.filter(is_approved=True,is_active=True).order_by('pk')[:MAX_ORG+1])
    if len(nodes)>MAX_ORG:
        raise ValueError('تجاوز الهيكل التنظيمي الحد الآمن.')
    by_id={n.pk:n for n in nodes}
    center_nodes={}
    for n in nodes:
        if n.health_center_id and n.kind==OrganizationUnit.Kind.CENTER:
            center_nodes.setdefault(n.health_center_id,[]).append(n.pk)
    def ancestry(start):
        out=set()
        while start in by_id and start not in out:
            out.add(start)
            start=by_id[start].parent_id
        return out
    choices={key:{} for key in ('sector','center','department')}
    assignments={}
    for e in employees:
        # Explicit organization unit takes precedence. If absent, use only an
        # unambiguous approved center node, not an inferred sector from its name.
        direct=e.organization_unit_id
        fallback=center_nodes.get(e.health_center_id,[])
        chain=ancestry(direct if direct else (fallback[0] if len(fallback)==1 else None))
        sectors={i for i in chain if by_id[i].kind==OrganizationUnit.Kind.SECTOR}
        departments={i for i in chain if by_id[i].kind in (OrganizationUnit.Kind.DEPARTMENT,OrganizationUnit.Kind.UNIT)}
        for i in sectors: choices['sector'][i]=by_id[i].name
        for i in departments: choices['department'][i]=by_id[i].name
        center=e.health_center if e.health_center_id else None
        # Direct center FK is recorded, but do not claim official approval.
        center_id=center.pk if center and center.is_active and not center.is_archived else None
        if center_id: choices['center'][center_id]=center.name_ar or center.name
        assignments[e.pk]={'sector':sectors,'department':departments,'center':{center_id} if center_id else set()}
    for key,options in choices.items():
        if key in filters and filters[key] not in options:
            raise ValueError('اختر وحدة تنظيمية موجودة ضمن مجتمع الاختبار.')
    ids=[e.pk for e in employees if all(filters[k] in assignments[e.pk][k] for k in choices if k in filters)]
    options={key:[{'id':i,'label':name} for i,name in sorted(v.items(),key=lambda item:(item[1],item[0]))] for key,v in choices.items()}
    labels={key:choices[key].get(filters.get(key),'الكل') for key in choices}
    return ids,options,labels

def event_scope(model,field,filters,ids):
    fk='record__employee_id' if model is VaccinationDose else 'employee_id'
    qs=model.objects.filter(**{fk+'__in':ids,field+'__isnull':False})
    if 'start' in filters:
        qs=qs.filter(**{field+'__gte':filters['start'],field+'__lte':filters['end']})
    else:
        qs=qs.filter(**{field+'__lte':timezone.localdate()})
    return qs

def build_metrics(filters):
    employees=cohort()
    ids,options,labels=organization_scope(employees,filters)
    n=len(ids)
    cards=list(EmployeeHealthCard.objects.filter(employee_id__in=ids).values_list('is_approved','data'))
    presence=[card_presence(data) for _,data in cards]
    entered=sum(row['recorded'] for row in presence)
    complete=sum(row['complete'] for row in presence)
    saved=len(cards)
    approved=sum(1 for a,_ in cards if a)
    capacity=saved*len(CARD_FIELDS)
    summary=[
        {'key':'employees','label':'الموظفون النشطون الموثقون (اختبار)','value':n,'unit':'موظف'},
        {'key':'cards','label':'البطاقات الصحية المحفوظة','value':saved,'unit':'بطاقة'},
        {'key':'approved','label':'البطاقات ذات علامة الاعتماد','value':approved,'unit':'بطاقة'},
        {'key':'no_card','label':'موظفون بلا بطاقة محفوظة','value':n-saved,'unit':'موظف'},
        {'key':'card_presence','label':'نسبة وجود بطاقة محفوظة','value':percent(saved,n),'unit':'%'},
        {'key':'field_presence','label':'نسبة الحقول المدونة في البطاقات المحفوظة','value':percent(entered,capacity),'unit':'%'},
        {'key':'complete_cards','label':'بطاقات جميع حقولها المرجعية مدونة','value':complete,'unit':'بطاقة'},
        {'key':'incomplete_cards','label':'بطاقات بها حقول مرجعية غير مدونة','value':saved-complete,'unit':'بطاقة'},
    ]
    coverage=[]
    for key,label,*models in COVERAGE:
        found=set()
        for model in models:
            found.update(model.objects.filter(employee_id__in=ids).order_by().values_list('employee_id',flat=True).distinct())
        coverage.append({'key':key,'label':label,'count':len(found),'denominator':n,'percent':percent(len(found),n)})
    events=[{'key':key,'label':label,'count':event_scope(model,field,filters,ids).filter(extra).count()}
            for key,label,model,field,extra in EVENTS]
    observations=event_scope(EmployeeHealthObservation,'observation_date',filters,ids)
    # Count unique employees with at least one explicit recorded finding in the period.
    # No diagnosis inferred from PHQ/GAD/MBI and no merging historic and current values.
    conditions=[]
    for key,label in CONDITION_KEYS:
        q=observations.filter(**{'data__'+key:'yes'}).order_by().values_list('employee_id',flat=True).distinct()
        conditions.append({'key':key,'label':label,'count':q.count()})
    mental=[]
    for key,label in MENTAL_KEYS:
        q=observations.filter(data__has_key=key+'_version').filter(data__has_key=key+'_result').exclude(**{'data__'+key+'_version':''}).exclude(**{'data__'+key+'_result':''})
        mental.append({'key':key,'label':label,'count':q.order_by().values_list('employee_id',flat=True).distinct().count()})
    return {'scope':'verified_synthetic_active_only','generated_at':timezone.now().isoformat(),
        'filters':{k:(v.isoformat() if isinstance(v,date) else v) for k,v in filters.items()},
        'filter_labels':labels,'options':options,'summary':summary,'coverage':coverage,'events':events,
        'conditions':conditions,'mental':mental,'field_presence':{'recorded':entered,'possible':capacity,
            'fields_per_card':len(CARD_FIELDS)},
        'notes':[
            'البيانات اصطناعية فقط ولا تمثل وضعًا صحيًا فعليًا. لا يحتوي التقرير على أسماء أو هويات أو نتائج فردية.',
            'المجتمع: الموظفون النشطون الموثقون المطابقون لعلامات الاختبار الدقيقة، غير المؤرشفين. التصفية بالارتباط التنظيمي الحالي المسجل.',
            'التاريخ يطبق على السجلات المؤرخة والأمراض/أدوات التقييم المدونة فقط؛ مؤشرات الموظفين والبطاقات ووجود السجلات لجميع التواريخ.',
            'وجود سجل لا يعني اكتمال الفحص أو المناعة أو اللياقة. النسب لا تعني التغطية السريرية ولا تحقق الالتزام الطبي.',
            'الحقول المدونة تُقاس من القيم المحفوظة فقط في حقول القالب الواضحة، ولا تشمل قيم العرض الافتراضية أو الحقول المبهمة. لا تعني الحقول الفارغة نقصًا إلزاميًا. مؤشر كتلة الجسم المحسوب للعرض فقط لا يُحتسب كحقل مدون، واكتمال التدوين لا يعني اعتمادًا طبيًا.',
            'كل عداد أحداث يمثل مصدرًا مستقلًا؛ لا تجمع المصادر المختلفة باعتبارها عدد حالات فريدة. السجلات غير المؤرخة مستبعدة من عدادات الأحداث.',
            'الأمراض: عدد موظفين لهم قيمة نعم مدونة في تقييم مؤرخ خلال الفترة، وليس انتشارًا أو تشخيصًا حاليًا. الأدوات النفسية: وجود نتيجة ونسخة مدونتين فقط.',
        ]}

def workbook_bytes(data):
    book=Workbook()
    sheet=book.active;sheet.title='المؤشرات'
    sheet.append(('المؤشر','القيمة','الوحدة'))
    for r in data['summary']:sheet.append((r['label'],r['value'],r['unit']))
    coverage=book.create_sheet('وجود السجلات')
    coverage.append(('المؤشر','الموظفون','المجتمع','النسبة %'))
    for r in data['coverage']:coverage.append((r['label'],r['count'],r['denominator'],r['percent']))
    for title,key in (('الأحداث المؤرخة','events'),('الأمراض المدونة','conditions'),('أدوات الصحة النفسية','mental')):
        ws=book.create_sheet(title);ws.append(('المؤشر','العدد'))
        for r in data[key]:ws.append((r['label'],r['count']))
    scope=book.create_sheet('نطاق التقرير')
    scope.append(('البند','القيمة'))
    for key,label in (('sector','القطاع'),('center','المركز'),('department','القسم / الوحدة')):
        scope.append((label,data['filter_labels'][key]))
    scope.append(('بداية الفترة',data['filters'].get('start','جميع التواريخ')))
    scope.append(('نهاية الفترة',data['filters'].get('end','جميع التواريخ')))
    scope.append(('وقت الإنشاء',data['generated_at']))
    scope.append(('الحقول المدونة',data['field_presence']['recorded']))
    scope.append(('الحقول المرجعية الممكنة',data['field_presence']['possible']))
    for note in data['notes']:scope.append(('منهجية',note))
    for ws in book.worksheets:
        ws.sheet_view.rightToLeft=True;ws.freeze_panes='A2';ws.auto_filter.ref=ws.dimensions
        for cell in ws[1]:
            cell.fill=PatternFill('solid',fgColor='164D73');cell.font=Font(color='FFFFFF',bold=True)
        ws.column_dimensions['A'].width=55;ws.column_dimensions['B'].width=100 if ws==scope else 22
        ws.column_dimensions['C'].width=20;ws.column_dimensions['D'].width=20
        for row in ws.iter_rows():
            for cell in row:
                # Prevent organization names being interpreted as Excel formulas.
                if isinstance(cell.value,str):
                    cell.data_type='s'
                cell.alignment=Alignment(horizontal='right',vertical='center',wrap_text=True)
    out=BytesIO();book.save(out);return out.getvalue()

class StagingHealthMetricsView(APIView):
    permission_classes=[permissions.IsAuthenticated]
    def get(self,request):
        if not authorized(request):
            return reply({'detail':'المؤشرات الصحية التجريبية متاحة للمسؤول الأعلى في Staging فقط.'},403)
        if set(request.query_params)-{'sector','center','department','start','end','download'}:
            return reply({'detail':'معاملات التقرير غير معتمدة.'},400)
        if any(len(request.query_params.getlist(k))!=1 for k in request.query_params):
            return reply({'detail':'معاملات مكررة.'},400)
        download=request.query_params.get('download','')
        if download not in ('','xlsx'):
            return reply({'detail':'صيغة التصدير غير معتمدة.'},400)
        form=MetricsFilter(data={k:v for k,v in request.query_params.items() if k!='download'})
        if not form.is_valid():
            return reply({'detail':'راجع مرشحات التقرير والفترة.','errors':form.errors},400)
        try:
            data=build_metrics(form.validated_data)
        except ValueError as exc:
            return reply({'detail':str(exc)},400)
        if download=='xlsx':
            response=HttpResponse(workbook_bytes(data),content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            response['Content-Disposition']='attachment; filename="OHP_Staging_Health_KPI.xlsx"'
            response['Cache-Control']=NO_CACHE['Cache-Control']
            return response
        return reply(data)
