from pathlib import Path


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, content):
    file_path = Path(path)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(content, encoding='utf-8')


def replace_once(source, old, new, label):
    if old not in source:
        raise RuntimeError(f'Missing patch target: {label}')
    return source.replace(old, new, 1)


# Backend model: keep legacy canonical name for compatibility, add localized names.
path = 'backend/health/models.py'
source = read(path)
source = replace_once(
    source,
    "    name = models.CharField(max_length=150, unique=True)\n    code = models.CharField(max_length=40, unique=True, null=True, blank=True)",
    "    name = models.CharField(max_length=150, unique=True)\n    name_ar = models.CharField(max_length=150, blank=True, db_index=True)\n    name_en = models.CharField(max_length=150, blank=True, db_index=True)\n    code = models.CharField(max_length=40, unique=True, null=True, blank=True)",
    'HealthCenter bilingual fields',
)
write(path, source)


# Backend serializer: validate localized names independently without breaking legacy API callers.
path = 'backend/health/serializers.py'
source = read(path)
source = replace_once(
    source,
    "        return value\n\n    def validate_code(self, value):",
    "        return value\n\n    def validate_name_ar(self, value):\n        value = str(value or '').strip()\n        if not value:\n            return ''\n        queryset = HealthCenter.objects.filter(name_ar__iexact=value)\n        if self.instance:\n            queryset = queryset.exclude(pk=self.instance.pk)\n        if queryset.exists():\n            raise serializers.ValidationError('A health center with this Arabic name already exists.')\n        return value\n\n    def validate_name_en(self, value):\n        value = str(value or '').strip()\n        if not value:\n            return ''\n        queryset = HealthCenter.objects.filter(name_en__iexact=value)\n        if self.instance:\n            queryset = queryset.exclude(pk=self.instance.pk)\n        if queryset.exists():\n            raise serializers.ValidationError('A health center with this English name already exists.')\n        return value\n\n    def validate_code(self, value):",
    'HealthCenter localized-name validation',
)
source = replace_once(
    source,
    "        for field in ('region', 'city', 'district', 'notes'):",
    "        for field in ('name_ar', 'name_en', 'region', 'city', 'district', 'notes'):",
    'HealthCenter trim localized names',
)
write(path, source)


# Bootstrap: seed localized labels only when missing, so later admin edits are respected.
path = 'backend/health/management/commands/bootstrap_admin.py'
source = read(path)
source = replace_once(
    source,
    "        centers = [\n            (\"Main Occupational Health Center\", \"Dammam\"),\n            (\"Employee Clinic\", \"Dammam\"),\n            (\"Medical Committee Unit\", \"Dammam\"),\n        ]\n        for name, city in centers:\n            HealthCenter.objects.get_or_create(name=name, defaults={\"city\": city, \"is_active\": True})\n        self.stdout.write(self.style.SUCCESS(\"Base health centers are ready.\"))",
    "        centers = [\n            (\"Main Occupational Health Center\", \"مركز الصحة المهنية الرئيسي\", \"Dammam\"),\n            (\"Employee Clinic\", \"عيادة الموظفين\", \"Dammam\"),\n            (\"Medical Committee Unit\", \"وحدة اللجنة الطبية\", \"Dammam\"),\n        ]\n        for name_en, name_ar, city in centers:\n            center, _ = HealthCenter.objects.get_or_create(\n                name=name_en,\n                defaults={\n                    \"name_en\": name_en,\n                    \"name_ar\": name_ar,\n                    \"city\": city,\n                    \"is_active\": True,\n                },\n            )\n            update_fields = []\n            if not center.name_en:\n                center.name_en = name_en\n                update_fields.append(\"name_en\")\n            if not center.name_ar:\n                center.name_ar = name_ar\n                update_fields.append(\"name_ar\")\n            if not center.city:\n                center.city = city\n                update_fields.append(\"city\")\n            if update_fields:\n                center.save(update_fields=update_fields)\n        self.stdout.write(self.style.SUCCESS(\"Base health centers are ready.\"))",
    'bootstrap bilingual centers',
)
write(path, source)


# Migration: add localized fields, backfill English from canonical name, and seed Arabic labels for known base records.
write('backend/health/migrations/0014_healthcenter_bilingual_names.py', '''from django.db import migrations, models


def backfill_bilingual_names(apps, schema_editor):
    HealthCenter = apps.get_model('health', 'HealthCenter')
    arabic_names = {
        'Main Occupational Health Center': 'مركز الصحة المهنية الرئيسي',
        'Employee Clinic': 'عيادة الموظفين',
        'Medical Committee Unit': 'وحدة اللجنة الطبية',
    }
    for center in HealthCenter.objects.all().iterator():
        update_fields = []
        if not center.name_en:
            center.name_en = center.name
            update_fields.append('name_en')
        if not center.name_ar and center.name in arabic_names:
            center.name_ar = arabic_names[center.name]
            update_fields.append('name_ar')
        if update_fields:
            center.save(update_fields=update_fields)


class Migration(migrations.Migration):
    dependencies = [('health', '0013_healthcenter_unknown_building_type')]

    operations = [
        migrations.AddField(
            model_name='healthcenter',
            name='name_ar',
            field=models.CharField(blank=True, db_index=True, max_length=150),
        ),
        migrations.AddField(
            model_name='healthcenter',
            name='name_en',
            field=models.CharField(blank=True, db_index=True, max_length=150),
        ),
        migrations.RunPython(backfill_bilingual_names, migrations.RunPython.noop),
    ]
''')


# Shared searchable selector: localized selected value, bilingual search, wider readable popup.
write('frontend/src/app/components/HealthCenterAutocomplete.tsx', '''import { Autocomplete, Box, Chip, TextField, Typography } from '@mui/material';

export type HealthCenterOption = {
  id: number | string;
  name: string;
  name_ar?: string;
  name_en?: string;
  code?: string | null;
  region?: string;
  city?: string;
  district?: string;
  building_type?: 'unknown' | 'model' | 'rented' | 'owned' | 'other' | string;
  building_type_label?: string;
  is_active?: boolean;
};

type Props = {
  options: HealthCenterOption[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  allowEmpty?: boolean;
};

function buildingTypeLabel(type: string | undefined, isArabic: boolean) {
  const labels: Record<string, [string, string]> = {
    unknown: ['غير محدد', 'Unspecified'],
    model: ['مبنى نموذجي', 'Model building'],
    rented: ['مبنى مستأجر', 'Rented building'],
    owned: ['مبنى مملوك', 'Owned building'],
    other: ['أخرى', 'Other'],
  };
  const pair = labels[type || ''];
  return pair ? pair[isArabic ? 0 : 1] : '';
}

export function healthCenterDisplayName(option: HealthCenterOption, isArabic: boolean) {
  return (isArabic ? option.name_ar : option.name_en) || option.name || option.name_en || option.name_ar || '';
}

function alternateName(option: HealthCenterOption, isArabic: boolean) {
  const alternate = isArabic ? option.name_en : option.name_ar;
  const primary = healthCenterDisplayName(option, isArabic);
  return alternate && alternate !== primary ? alternate : '';
}

export function HealthCenterAutocomplete({ options, value, onChange, label, placeholder, required, disabled, allowEmpty = false }: Props) {
  const selected = options.find(option => String(option.id) === String(value)) || null;
  const isArabic = /[\\u0600-\\u06FF]/.test(label);
  const activeOptions = options.filter(option => option.is_active !== false || String(option.id) === String(value));

  return <Autocomplete
    fullWidth
    options={activeOptions}
    value={selected}
    disabled={disabled}
    disableClearable={!allowEmpty}
    isOptionEqualToValue={(option, current) => String(option.id) === String(current.id)}
    getOptionLabel={option => healthCenterDisplayName(option, isArabic)}
    filterOptions={(items, state) => {
      const query = state.inputValue.trim().toLocaleLowerCase();
      if (!query) return items;
      return items.filter(option => [
        option.name_ar,
        option.name_en,
        option.name,
        option.code,
        option.region,
        option.city,
        option.district,
      ].filter(Boolean).join(' ').toLocaleLowerCase().includes(query));
    }}
    onChange={(_, option) => onChange(option ? String(option.id) : '')}
    slotProps={{
      popper: {
        sx: {
          width: { xs: 'calc(100vw - 32px) !important', sm: '440px !important' },
          maxWidth: 'calc(100vw - 24px)',
          zIndex: 1600,
        },
      },
      paper: {
        sx: {
          mt: 0.75,
          borderRadius: 2.5,
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: '0 14px 38px rgba(15, 23, 42, 0.16)',
          overflow: 'hidden',
        },
      },
      listbox: {
        sx: { p: 0.75, maxHeight: 320 },
      },
    }}
    renderOption={(props, option) => {
      const primary = healthCenterDisplayName(option, isArabic);
      const secondary = alternateName(option, isArabic);
      const location = [option.region, option.city, option.district].filter(Boolean).join(' · ');
      const building = buildingTypeLabel(option.building_type, isArabic);
      return <Box
        component="li"
        {...props}
        key={option.id}
        dir={isArabic ? 'rtl' : 'ltr'}
        sx={{
          display: 'block !important',
          py: 1.15,
          px: 1.25,
          mb: 0.35,
          borderRadius: 1.75,
          textAlign: isArabic ? 'right' : 'left',
          '&[aria-selected="true"]': { bgcolor: 'action.selected' },
          '&.Mui-focused': { bgcolor: 'action.hover' },
        }}
      >
        <Typography variant="body2" fontWeight={900} noWrap>{primary}</Typography>
        {secondary && <Typography variant="caption" color="text.secondary" display="block" noWrap sx={{ mt: 0.2 }}>{secondary}</Typography>}
        {(location || building) && <Box sx={{ display: 'flex', gap: 0.7, mt: 0.55, alignItems: 'center', flexWrap: 'wrap' }}>
          {location && <Typography variant="caption" color="text.secondary">{location}</Typography>}
          {building && <Chip size="small" variant="outlined" label={building} sx={{ height: 20, '& .MuiChip-label': { px: 0.8, fontSize: '0.68rem' } }} />}
        </Box>}
      </Box>;
    }}
    renderInput={params => <TextField {...params} required={required} label={label} placeholder={placeholder} />}
  />;
}
''')


# Health centers administration page: bilingual names with localized display and clean fallback.
path = 'frontend/src/app/pages/HealthCentersPage.tsx'
source = read(path)
source = replace_once(
    source,
    "type Center = {\n  id: number; name: string; code?: string | null; region: string; city: string; district: string;\n  building_type: 'unknown' | 'model' | 'rented' | 'owned' | 'other'; building_type_label?: string;\n  is_active: boolean; notes?: string; employee_count?: number; user_count?: number;\n};\ntype CenterForm = Omit<Center, 'id' | 'building_type_label' | 'employee_count' | 'user_count'>;\nconst EMPTY_FORM: CenterForm = { name: '', code: '', region: '', city: '', district: '', building_type: 'unknown', is_active: true, notes: '' };",
    "type Center = {\n  id: number; name: string; name_ar?: string; name_en?: string; code?: string | null; region: string; city: string; district: string;\n  building_type: 'unknown' | 'model' | 'rented' | 'owned' | 'other'; building_type_label?: string;\n  is_active: boolean; notes?: string; employee_count?: number; user_count?: number;\n};\ntype CenterForm = { name_ar: string; name_en: string; code: string; region: string; city: string; district: string; building_type: Center['building_type']; is_active: boolean; notes: string };\nconst EMPTY_FORM: CenterForm = { name_ar: '', name_en: '', code: '', region: '', city: '', district: '', building_type: 'unknown', is_active: true, notes: '' };",
    'HealthCenters types',
)
source = replace_once(
    source,
    "    const matchesSearch = !q || [center.name, center.code, center.region, center.city, center.district].filter(Boolean).join(' ').toLowerCase().includes(q);",
    "    const matchesSearch = !q || [center.name_ar, center.name_en, center.name, center.code, center.region, center.city, center.district].filter(Boolean).join(' ').toLowerCase().includes(q);",
    'HealthCenters bilingual search',
)
source = replace_once(
    source,
    "  const buildingLabel = (type: Center['building_type']) => ({ unknown: isRtl ? 'غير محدد' : 'Unspecified', model: isRtl ? 'نموذجي' : 'Model', rented: isRtl ? 'مستأجر' : 'Rented', owned: isRtl ? 'مملوك' : 'Owned', other: isRtl ? 'أخرى' : 'Other' }[type]);\n  function openAdd() { setEditing(null); setForm(EMPTY_FORM); setOpen(true); }\n  function openEdit(center: Center) { setEditing(center); setForm({ name: center.name, code: center.code || '', region: center.region || '', city: center.city || '', district: center.district || '', building_type: center.building_type || 'unknown', is_active: center.is_active, notes: center.notes || '' }); setOpen(true); }",
    "  const buildingLabel = (type: Center['building_type']) => ({ unknown: isRtl ? 'غير محدد' : 'Unspecified', model: isRtl ? 'نموذجي' : 'Model', rented: isRtl ? 'مستأجر' : 'Rented', owned: isRtl ? 'مملوك' : 'Owned', other: isRtl ? 'أخرى' : 'Other' }[type]);\n  const displayName = (center: Center) => (isRtl ? center.name_ar : center.name_en) || center.name || center.name_en || center.name_ar || '—';\n  const secondaryName = (center: Center) => { const value = isRtl ? center.name_en : center.name_ar; return value && value !== displayName(center) ? value : ''; };\n  function openAdd() { setEditing(null); setForm(EMPTY_FORM); setOpen(true); }\n  function openEdit(center: Center) { setEditing(center); setForm({ name_ar: center.name_ar || '', name_en: center.name_en || center.name || '', code: center.code || '', region: center.region || '', city: center.city || '', district: center.district || '', building_type: center.building_type || 'unknown', is_active: center.is_active, notes: center.notes || '' }); setOpen(true); }",
    'HealthCenters localized display helpers',
)
source = replace_once(
    source,
    "    if (!form.name.trim()) return toast.error(isRtl ? 'اسم المركز الصحي مطلوب' : 'Health center name is required');\n    if (form.building_type === 'unknown') return toast.error(isRtl ? 'حدد نوع المبنى قبل الحفظ' : 'Select the building type before saving');\n    setSaving(true);\n    try {\n      const payload = { ...form, name: form.name.trim(), code: form.code?.trim() || null, region: form.region.trim(), city: form.city.trim(), district: form.district.trim(), notes: form.notes?.trim() || '' };",
    "    if (!form.name_ar.trim()) return toast.error(isRtl ? 'اسم المركز الصحي بالعربية مطلوب' : 'Arabic health center name is required');\n    if (!form.name_en.trim()) return toast.error(isRtl ? 'اسم المركز الصحي بالإنجليزية مطلوب' : 'English health center name is required');\n    if (form.building_type === 'unknown') return toast.error(isRtl ? 'حدد نوع المبنى قبل الحفظ' : 'Select the building type before saving');\n    setSaving(true);\n    try {\n      const payload = { ...form, name: form.name_en.trim() || form.name_ar.trim(), name_ar: form.name_ar.trim(), name_en: form.name_en.trim(), code: form.code?.trim() || null, region: form.region.trim(), city: form.city.trim(), district: form.district.trim(), notes: form.notes?.trim() || '' };",
    'HealthCenters bilingual save',
)
source = replace_once(
    source,
    "      <TextField value={search} onChange={e => setSearch(e.target.value)} placeholder={isRtl ? 'بحث باسم المركز أو الكود أو الموقع...' : 'Search center, code, or location...'}",
    "      <TextField value={search} onChange={e => setSearch(e.target.value)} placeholder={isRtl ? 'بحث بالاسم العربي أو الإنجليزي أو الكود أو الموقع...' : 'Search Arabic/English name, code, or location...'}",
    'HealthCenters search placeholder',
)
source = replace_once(
    source,
    "      <TableCell><Typography fontWeight={900}>{center.name}</Typography>{(center.employee_count || center.user_count) ? <Typography variant=\"caption\" color=\"text.secondary\">{isRtl ? 'مرتبط' : 'Linked'}: {center.employee_count || 0} / {center.user_count || 0}</Typography> : null}</TableCell>",
    "      <TableCell><Typography fontWeight={900}>{displayName(center)}</Typography>{secondaryName(center) && <Typography variant=\"caption\" color=\"text.secondary\" display=\"block\">{secondaryName(center)}</Typography>}{(center.employee_count || center.user_count) ? <Typography variant=\"caption\" color=\"text.secondary\" display=\"block\">{isRtl ? 'مرتبط' : 'Linked'}: {center.employee_count || 0} / {center.user_count || 0}</Typography> : null}</TableCell>",
    'HealthCenters table bilingual display',
)
source = replace_once(
    source,
    "      <TextField required label={isRtl ? 'اسم المركز الصحي' : 'Health Center Name'} value={form.name} onChange={e => update('name', e.target.value)} />\n      <TextField label={isRtl ? 'كود المركز' : 'Center Code'}",
    "      <TextField required label={isRtl ? 'اسم المركز الصحي بالعربية' : 'Health Center Name (Arabic)'} value={form.name_ar} onChange={e => update('name_ar', e.target.value)} inputProps={{ dir: 'rtl' }} />\n      <TextField required label={isRtl ? 'اسم المركز الصحي بالإنجليزية' : 'Health Center Name (English)'} value={form.name_en} onChange={e => update('name_en', e.target.value)} inputProps={{ dir: 'ltr' }} />\n      <TextField label={isRtl ? 'كود المركز' : 'Center Code'}",
    'HealthCenters bilingual name fields',
)
write(path, source)


# Employee registry: localize center names in filters, tables, and the selector.
path = 'frontend/src/app/pages/EmployeesPage.tsx'
source = read(path)
source = replace_once(
    source,
    "  name: string;\n  code?: string | null;",
    "  name: string;\n  name_ar?: string;\n  name_en?: string;\n  code?: string | null;",
    'Employees center localized fields',
)
source = replace_once(
    source,
    "function normalizeDate(value?: string | null) {\n  return value ? String(value).slice(0, 10) : '';\n}\n",
    "function normalizeDate(value?: string | null) {\n  return value ? String(value).slice(0, 10) : '';\n}\n\nfunction centerDisplayName(center: ApiHealthCenter, isRtl: boolean) {\n  return (isRtl ? center.name_ar : center.name_en) || center.name || center.name_en || center.name_ar || '-';\n}\n",
    'Employees center display helper',
)
source = replace_once(
    source,
    "    healthCenters.forEach(center => map.set(String(center.id), center.name));\n    return map;\n  }, [healthCenters]);",
    "    healthCenters.forEach(center => map.set(String(center.id), centerDisplayName(center, isRtl)));\n    return map;\n  }, [healthCenters, isRtl]);",
    'Employees localized center map',
)
source = replace_once(
    source,
    "    return employee.health_center_name || centerNameById.get(String(employee.health_center)) || '-';",
    "    return centerNameById.get(String(employee.health_center)) || employee.health_center_name || '-';",
    'Employees localized name priority',
)
source = replace_once(
    source,
    "              {healthCenters.map(center => <MenuItem key={center.id} value={String(center.id)}>{center.name}</MenuItem>)}",
    "              {healthCenters.map(center => <MenuItem key={center.id} value={String(center.id)}>{centerDisplayName(center, isRtl)}</MenuItem>)}",
    'Employees localized center filter',
)
write(path, source)


# User administration: pass bilingual center labels through to the shared selector.
path = 'frontend/src/app/pages/AdminUsersPage.tsx'
source = read(path)
source = replace_once(
    source,
    "  name: string;\n  nameAr?: string;\n  code?: string | null;",
    "  name: string;\n  nameAr?: string;\n  name_ar?: string;\n  name_en?: string;\n  code?: string | null;",
    'AdminUsers center bilingual fields',
)
source = replace_once(
    source,
    "    name: center.name || center.nameAr || '-',\n    nameAr: center.nameAr || center.name,\n    code: center.code || null,",
    "    name: center.name || center.name_en || center.nameAr || center.name_ar || '-',\n    nameAr: center.nameAr || center.name_ar || center.name,\n    name_ar: center.name_ar || center.nameAr || '',\n    name_en: center.name_en || center.name || '',\n    code: center.code || null,",
    'AdminUsers center normalization',
)
write(path, source)

print('Bilingual health-center refinement applied successfully.')
