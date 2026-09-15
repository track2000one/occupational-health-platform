from django.contrib import admin

from .models import DailyStatistic, EvidenceAttachment, Indicator, Initiative, ReferenceDocument, WorkforceMember, WorkforceTarget

admin.site.register(Indicator)
admin.site.register(DailyStatistic)
admin.site.register(WorkforceMember)
admin.site.register(WorkforceTarget)
admin.site.register(Initiative)
admin.site.register(ReferenceDocument)


@admin.register(EvidenceAttachment)
class EvidenceAttachmentAdmin(admin.ModelAdmin):
    list_display = ('file_name', 'owner_type', 'byte_size', 'uploaded_by', 'created_at')
    list_filter = ('owner_type', 'content_type', 'created_at')
    search_fields = ('file_name', 'description', 'checksum_sha256')
    readonly_fields = ('file_name', 'content_type', 'byte_size', 'checksum_sha256', 'uploaded_by', 'created_at')
    exclude = ('file_data',)
