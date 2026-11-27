"""Shared documentation coverage and display-only BMI for the isolated trial."""
from decimal import Decimal, InvalidOperation, localcontext
from .health_data_import import TARGETS

CARD_FIELDS=tuple(dict.fromkeys(TARGETS.values()))

def recorded(value):
    # False and zero are actual recorded values; missing/placeholder strings are not.
    if value is None or isinstance(value,(dict,list)):
        return False
    if isinstance(value,str):
        return value.strip().lower() not in ('','-','—','n/a','na','null','none','unknown','غير معروف','غير مدون','غير متوفر')
    return isinstance(value,(bool,int,float))

def percent(n,d):
    return round(n*100/d,1) if d else None

def card_presence(data):
    count=0
    if isinstance(data,dict):
        for section,key in CARD_FIELDS:
            block=data.get(section)
            if isinstance(block,dict) and recorded(block.get(key)):
                count+=1
    total=len(CARD_FIELDS)
    return {'recorded':count,'possible':total,'percent':percent(count,total),
            'complete':count==total}

def derived_bmi(data):
    """Return a display value only. Never replace an explicitly recorded BMI."""
    physical=data.get('physical',{}) if isinstance(data,dict) else {}
    if not isinstance(physical,dict) or recorded(physical.get('bmi')):
        return None
    try:
        with localcontext() as ctx:
            ctx.prec=28
            weight=Decimal(str(physical.get('weight_kg','')))
            height=Decimal(str(physical.get('height_cm','')))
            if not weight.is_finite() or not height.is_finite() or not (0<weight<=10000 and 0<height<=10000):
                return None
            bmi=weight/(height/100)**2
            if not bmi.is_finite() or bmi<=0 or bmi>10000:
                return None
            return format(bmi.quantize(Decimal('0.1')),'f')
    except (InvalidOperation, ArithmeticError, ValueError, TypeError):
        return None
