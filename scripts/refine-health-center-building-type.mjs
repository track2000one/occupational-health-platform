import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, value) { fs.writeFileSync(path, value); }
function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Missing patch target: ${label}`);
  return source.replace(search, replacement);
}

{
  const path = 'backend/health/models.py';
  let source = read(path);
  source = replaceOnce(source,
`    class BuildingType(models.TextChoices):
        MODEL = 'model', 'Model'
        RENTED = 'rented', 'Rented'
        OWNED = 'owned', 'Owned'
        OTHER = 'other', 'Other'
`,
`    class BuildingType(models.TextChoices):
        UNKNOWN = 'unknown', 'Unspecified'
        MODEL = 'model', 'Model'
        RENTED = 'rented', 'Rented'
        OWNED = 'owned', 'Owned'
        OTHER = 'other', 'Other'
`, 'building type choices');
  source = replaceOnce(source,
"    building_type = models.CharField(max_length=20, choices=BuildingType.choices, default=BuildingType.MODEL, db_index=True)",
"    building_type = models.CharField(max_length=20, choices=BuildingType.choices, default=BuildingType.UNKNOWN, db_index=True)", 'building type default');
  write(path, source);
}

fs.writeFileSync('backend/health/migrations/0013_healthcenter_unknown_building_type.py', `from django.db import migrations, models


def mark_legacy_centers_unknown(apps, schema_editor):
    HealthCenter = apps.get_model('health', 'HealthCenter')
    HealthCenter.objects.filter(created_at__isnull=True, building_type='model').update(building_type='unknown')


class Migration(migrations.Migration):
    dependencies = [('health', '0012_healthcenter_master_data')]

    operations = [
        migrations.RunPython(mark_legacy_centers_unknown, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='healthcenter',
            name='building_type',
            field=models.CharField(
                choices=[('unknown', 'Unspecified'), ('model', 'Model'), ('rented', 'Rented'), ('owned', 'Owned'), ('other', 'Other')],
                db_index=True,
                default='unknown',
                max_length=20,
            ),
        ),
    ]
`);

{
  const path = 'frontend/src/app/components/HealthCenterAutocomplete.tsx';
  let source = read(path);
  source = replaceOnce(source,
"  building_type?: 'model' | 'rented' | 'owned' | 'other' | string;",
"  building_type?: 'unknown' | 'model' | 'rented' | 'owned' | 'other' | string;", 'autocomplete type');
  source = replaceOnce(source,
"  const labels: Record<string, [string, string]> = {\n    model: ['مبنى نموذجي', 'Model building'],",
"  const labels: Record<string, [string, string]> = {\n    unknown: ['غير محدد', 'Unspecified'],\n    model: ['مبنى نموذجي', 'Model building'],", 'autocomplete unknown label');
  write(path, source);
}

{
  const path = 'frontend/src/app/pages/HealthCentersPage.tsx';
  let source = read(path);
  source = replaceOnce(source,
"  building_type: 'model' | 'rented' | 'owned' | 'other'; building_type_label?: string;",
"  building_type: 'unknown' | 'model' | 'rented' | 'owned' | 'other'; building_type_label?: string;", 'page center building type');
  source = replaceOnce(source,
"const EMPTY_FORM: CenterForm = { name: '', code: '', region: '', city: '', district: '', building_type: 'model', is_active: true, notes: '' };",
"const EMPTY_FORM: CenterForm = { name: '', code: '', region: '', city: '', district: '', building_type: 'unknown', is_active: true, notes: '' };", 'page empty form');
  source = replaceOnce(source,
"  const buildingLabel = (type: Center['building_type']) => ({ model: isRtl ? 'نموذجي' : 'Model', rented: isRtl ? 'مستأجر' : 'Rented', owned: isRtl ? 'مملوك' : 'Owned', other: isRtl ? 'أخرى' : 'Other' }[type]);",
"  const buildingLabel = (type: Center['building_type']) => ({ unknown: isRtl ? 'غير محدد' : 'Unspecified', model: isRtl ? 'نموذجي' : 'Model', rented: isRtl ? 'مستأجر' : 'Rented', owned: isRtl ? 'مملوك' : 'Owned', other: isRtl ? 'أخرى' : 'Other' }[type]);", 'page building label');
  source = replaceOnce(source,
"  function openEdit(center: Center) { setEditing(center); setForm({ name: center.name, code: center.code || '', region: center.region || '', city: center.city || '', district: center.district || '', building_type: center.building_type || 'model', is_active: center.is_active, notes: center.notes || '' }); setOpen(true); }",
"  function openEdit(center: Center) { setEditing(center); setForm({ name: center.name, code: center.code || '', region: center.region || '', city: center.city || '', district: center.district || '', building_type: center.building_type || 'unknown', is_active: center.is_active, notes: center.notes || '' }); setOpen(true); }", 'page edit fallback');
  source = replaceOnce(source,
"    if (!form.name.trim()) return toast.error(isRtl ? 'اسم المركز الصحي مطلوب' : 'Health center name is required');\n    setSaving(true);",
"    if (!form.name.trim()) return toast.error(isRtl ? 'اسم المركز الصحي مطلوب' : 'Health center name is required');\n    if (form.building_type === 'unknown') return toast.error(isRtl ? 'حدد نوع المبنى قبل الحفظ' : 'Select the building type before saving');\n    setSaving(true);", 'page save validation');
  source = replaceOnce(source,
"      <TextField select label={isRtl ? 'نوع المبنى' : 'Building Type'} value={form.building_type} onChange={e => update('building_type', e.target.value as CenterForm['building_type'])}><MenuItem value=\"model\">{isRtl ? 'مبنى نموذجي' : 'Model building'}</MenuItem>",
"      <TextField required select label={isRtl ? 'نوع المبنى' : 'Building Type'} value={form.building_type} onChange={e => update('building_type', e.target.value as CenterForm['building_type'])}><MenuItem value=\"unknown\" disabled>{isRtl ? 'اختر نوع المبنى' : 'Select building type'}</MenuItem><MenuItem value=\"model\">{isRtl ? 'مبنى نموذجي' : 'Model building'}</MenuItem>", 'page building select');
  write(path, source);
}

console.log('Building type refinement applied.');
