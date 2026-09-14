from django.contrib import admin

from .models import DailyStatistic, Indicator, Initiative, ReferenceDocument, WorkforceMember, WorkforceTarget

admin.site.register(Indicator)
admin.site.register(DailyStatistic)
admin.site.register(WorkforceMember)
admin.site.register(WorkforceTarget)
admin.site.register(Initiative)
admin.site.register(ReferenceDocument)
