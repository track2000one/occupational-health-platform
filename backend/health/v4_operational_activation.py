"""V4 internal data activation is not a legal/organizational approval.

Only the isolated V4 service may enable this opt-in workflow. Historic
official-reference approval workflows remain unchanged outside V4.
"""
import os

from .organization_structure import draft_import_scope


def operational_activation_enabled():
    return (
        draft_import_scope() == 'v4'
        and os.getenv('OHP_V4_OPERATIONAL_ACTIVATION_ENABLED', '').lower() == 'true'
    )


OPERATIONAL_NOTE = (
    'تفعيل تشغيلي داخلي للمنصة بعد مراجعة البيانات؛ '
    'لا يُمثل اعتمادًا رسميًا للهيكل التنظيمي.'
)
