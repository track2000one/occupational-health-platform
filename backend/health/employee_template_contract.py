"""Single canonical employee Excel schema shared by template and import verification.

Only Employees carries source employee rows; all other sheets are documentation/
lookup data and are never imported. All original numbers remain strings.
"""
TEMPLATE_VERSION = 'OHP-EMPLOYEE-TEMPLATE-V3'
SHEET_NAME = 'Employees'
CANONICAL_FIELDS = (
    ('name', 'اسم الموظف'),
    ('national_id', 'رقم الهوية / الإقامة'),
    ('employee_number', 'الرقم الوظيفي'),
    ('email', 'البريد الإلكتروني'),
    ('mobile', 'رقم الجوال'),
    ('health_center', 'المركز الصحي'),
    ('organization_unit', 'الوحدة التنظيمية'),
    ('sector', 'القطاع'),
    ('nationality', 'الجنسية'),
    ('date_of_birth', 'تاريخ الميلاد'),
    ('birth_place', 'مكان الميلاد'),
    ('gender', 'الجنس'),
    ('marital_status', 'الحالة الاجتماعية'),
    ('children_count', 'عدد الأطفال'),
    ('national_address', 'العنوان الوطني'),
    ('job_title', 'المسمى الوظيفي'),
    ('job_title_en', 'المسمى الوظيفي بالإنجليزية'),
    ('current_job', 'الوظيفة الحالية'),
    ('appointment_date', 'تاريخ التعيين'),
)
CANONICAL_HEADERS = tuple(label for _, label in CANONICAL_FIELDS)
REQUIRED_FIELDS = ('name', 'national_id')

# For presentation and value validation; the importer stores text and does
# not convert source values into employee/clinical master tables automatically.
GENDER_CHOICES = ('ذكر', 'أنثى')
MARITAL_CHOICES = ('أعزب', 'متزوج', 'مطلق', 'أرمل')
NATIONALITY_PRIORITY = (
    'السعودية', 'البحرين', 'الكويت', 'الإمارات', 'قطر', 'عُمان',
    'مصر', 'الأردن', 'العراق', 'لبنان', 'سوريا', 'فلسطين',
    'السودان', 'اليمن', 'المغرب', 'الجزائر', 'تونس', 'ليبيا',
    'موريتانيا', 'الصومال', 'جيبوتي', 'جزر القمر',
)
