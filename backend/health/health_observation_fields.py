"""Shared allowlist for clinical observation entry and projection."""
MEASUREMENTS=('weight_kg','height_cm','bmi')
CONDITIONS=('diabetes','hypertension','thyroid_disease','asthma','blood_disease','chronic_disease','depression','anxiety','burnout')
TEXT_FIELDS=('physical_activity','smoking_status','surgical_history','family_history','medical_restrictions',
             'medical_recommendations','phq_version','phq_result','gad_version','gad_result','mbi_version','mbi_result')
OBSERVATION_FIELDS=MEASUREMENTS+CONDITIONS+TEXT_FIELDS

def observation_record(record):
    data=record.data if isinstance(record.data,dict) else {}
    return {'id':record.pk,'observation_date':record.observation_date.isoformat(),
            'data':{key:data[key] for key in OBSERVATION_FIELDS if key in data}}

def profile_record(record):
    if record is None:
        return None
    result={}
    for key in MEASUREMENTS:
        value=getattr(record,key)
        result[key]=str(value) if value is not None else None
    for key in ('diabetes','hypertension','thyroid_disease','asthma','blood_disease'):
        result[key]=getattr(record,key)
    for key in ('physical_activity','obesity_status','smoking_status','surgical_history','family_history','medical_restrictions'):
        result[key]=getattr(record,key)
    # No clinical observation date is present in this legacy profile.
    return {'data':result,'observation_date':None}
