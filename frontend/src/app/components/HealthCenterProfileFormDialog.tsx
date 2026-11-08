import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, MenuItem, Paper, Stack, Switch, TextField, Typography,
} from '@mui/material';

export type HealthCenterFormValues = {
  name_ar: string; name_en: string; code: string; alternate_name: string;
  region: string; city: string; district: string; manager_name: string;
  proposed_parent_name: string; proposed_sector_name: string;
  organizational_source_reference: string; supporting_document_reference: string;
  building_type: 'unknown' | 'model' | 'rented' | 'owned' | 'other';
  is_active: boolean; notes: string;
};
export type CenterUnitDraft = {
  id: number; name: string; code: string; is_approved: boolean; parent_name: string;
};
type ExistingCenter = {
  id: number; name: string; alias_names?: string[];
  approval_status?: 'pending' | 'approved' | 'revoked';
  approval_reference?: string;
};

export function HealthCenterProfileFormDialog({
  open, onClose, onSave, saving, editing, form, onChange, sectorSuggestions,
  centerUnits, unitName, onUnitNameChange, unitReference, onUnitReferenceChange,
  unitBusy, unitsLoadError, onReloadUnits, onCreateUnit,
}: {
  open: boolean; onClose: () => void; onSave: () => void;
  saving: boolean; editing: ExistingCenter | null;
  form: HealthCenterFormValues;
  onChange: <K extends keyof HealthCenterFormValues>(
    key: K, value: HealthCenterFormValues[K],
  ) => void;
  sectorSuggestions: string[];
  centerUnits: CenterUnitDraft[]; unitName: string;
  onUnitNameChange: (value: string) => void;
  unitReference: string; onUnitReferenceChange: (value: string) => void;
  unitBusy: boolean; unitsLoadError: string;
  onReloadUnits: () => void; onCreateUnit: () => void;
}) {
  const sectionStyle = { p: 2, borderRadius: 2 };
  const formGrid = {
    display: 'grid',
    gridTemplateColumns: { xs: '1fr', md: 'repeat(2,minmax(0,1fr))' },
    gap: 2,
  } as const;

  return <Dialog open={open} onClose={() => !saving && onClose()}
    maxWidth="md" fullWidth dir="rtl"
    PaperProps={{ sx: { borderRadius: 3 } }}>
    <DialogTitle fontWeight={900}>
      {editing ? 'تعديل المركز الصحي' : 'إضافة مركز صحي'}
    </DialogTitle>
    <DialogContent dividers>
      <Stack gap={2.5} sx={{ py: 1 }}>
        <Paper variant="outlined" sx={sectionStyle}>
          <Typography fontWeight={900} sx={{ mb: 2 }}>أولًا: البيانات الأساسية والموقع</Typography>
          <Box sx={formGrid}>
            <TextField required label="اسم المركز الصحي بالعربية" value={form.name_ar}
              onChange={e => onChange('name_ar', e.target.value)} inputProps={{ dir: 'rtl' }}/>
            <TextField label="اسم المركز بالإنجليزية (اختياري)" value={form.name_en}
              onChange={e => onChange('name_en', e.target.value)} inputProps={{ dir: 'ltr' }}/>
            <TextField label="كود المركز الرسمي (إن وُجد)" value={form.code}
              onChange={e => onChange('code', e.target.value.toUpperCase())}
              helperText="لا تستخدم رمز TMP على أنه رمز رسمي معتمد."/>
            <TextField label="اسم سابق أو بديل للمركز" value={form.alternate_name}
              onChange={e => onChange('alternate_name', e.target.value)}
              helperText="للتعرف على أسماء المركز القديمة في ملفات Excel دون تغيير معرّفه."/>
            {editing && !!editing.alias_names?.length &&
              <Box sx={{ gridColumn: '1 / -1' }}>
                <Typography variant="caption" color="text.secondary">
                  الأسماء التاريخية للمركز (محفوظة للمراجعة)
                </Typography>
                <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mt: 0.5 }}>
                  {editing.alias_names.map(name =>
                    <Chip key={name} size="small" variant="outlined" label={name}/>)}
                </Stack>
              </Box>}
            <TextField label="المنطقة" value={form.region}
              onChange={e => onChange('region', e.target.value)}/>
            <TextField label="المدينة" value={form.city}
              onChange={e => onChange('city', e.target.value)}/>
            <TextField label="الحي" value={form.district}
              onChange={e => onChange('district', e.target.value)}/>
            <TextField label="مدير المركز (بعد التحقق)" value={form.manager_name}
              onChange={e => onChange('manager_name', e.target.value)}
              helperText="اترك الاسم فارغًا ما لم تُتحقق بيانات المدير رسميًا."/>
            <TextField select label="نوع المبنى" value={form.building_type}
              onChange={e => onChange('building_type',
                e.target.value as HealthCenterFormValues['building_type'])}>
              <MenuItem value="unknown">غير محدد</MenuItem>
              <MenuItem value="model">مبنى نموذجي</MenuItem>
              <MenuItem value="rented">مبنى مستأجر</MenuItem>
              <MenuItem value="owned">مبنى مملوك</MenuItem>
              <MenuItem value="other">أخرى</MenuItem>
            </TextField>
          </Box>
        </Paper>

        <Paper variant="outlined" sx={sectionStyle}>
          <Typography fontWeight={900} sx={{ mb: 1 }}>ثانيًا: التبعية التنظيمية المقترحة</Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            بيانات Excel هنا للمراجعة فقط. تحديد الجهة أو القطاع لا يعتمد
            التبعية ولا ينقل أي موظف؛ اعتماد الهيكل التنظيمي إجراء مستقل.
          </Alert>
          <Box sx={formGrid}>
            <TextField label="الجهة الأم (مقترحة)" value={form.proposed_parent_name}
              onChange={e => onChange('proposed_parent_name', e.target.value)}
              helperText="مثال من المصدر: الرعاية الأولية والمجتمعية."/>
            <TextField select label="القطاع المقترح" value={form.proposed_sector_name}
              onChange={e => onChange('proposed_sector_name', e.target.value)}>
              <MenuItem value="">غير محدد — يحتاج مراجعة</MenuItem>
              {!!form.proposed_sector_name &&
                !sectorSuggestions.includes(form.proposed_sector_name) &&
                <MenuItem value={form.proposed_sector_name}>
                  {form.proposed_sector_name} (اسم سابق)
                </MenuItem>}
              {sectorSuggestions.map(sector =>
                <MenuItem key={sector} value={sector}>{sector}</MenuItem>)}
            </TextField>
            <TextField label="مرجع الصف أو الورقة في Excel" value={form.organizational_source_reference}
              onChange={e => onChange('organizational_source_reference', e.target.value)}
              helperText="لحفظ مصدر التبعية المقترحة، وليس كقرار اعتماد رسمي."
              sx={{ gridColumn: { md: '1 / -1' } }}/>
          </Box>
        </Paper>

        <Paper variant="outlined" sx={sectionStyle}>
          <Typography fontWeight={900} sx={{ mb: 1 }}>ثالثًا: التوثيق والاعتماد</Typography>
          <Alert severity="warning" sx={{ mb: 2 }}>
            حالة «نشط» تعني التشغيل فقط؛ لا تعني اعتماد المركز أو القطاع.
            لا يكفي إدخال رقم مستند لاعتماد المركز تلقائيًا.
          </Alert>
          <Box sx={formGrid}>
            <TextField label="حالة اعتماد مرجع المركز" disabled
              value={editing?.approval_status === 'approved' ? 'موثق بقرار رسمي'
                : editing?.approval_status === 'revoked' ? 'أُلغي التوثيق'
                : 'بانتظار التوثيق'}/>
            <TextField label="مرجع الاعتماد الرسمي" disabled
              value={editing?.approval_reference || 'لا يوجد اعتماد مسجل'}/>
            <TextField label="مرجع مستند داعم (اختياري)"
              value={form.supporting_document_reference}
              onChange={e => onChange('supporting_document_reference', e.target.value)}
              helperText="حفظ للرجوع إليه فقط؛ الاعتماد الرسمي قرار مستقل بصلاحية مخوّلة."
              sx={{ gridColumn: { md: '1 / -1' } }}/>
            <TextField multiline minRows={2} label="ملاحظات"
              value={form.notes} onChange={e => onChange('notes', e.target.value)}
              sx={{ gridColumn: { md: '1 / -1' } }}/>
            <Stack direction="row" alignItems="center" gap={1}
              sx={{ gridColumn: { md: '1 / -1' } }}>
              <Switch checked={form.is_active} onChange={e => onChange('is_active', e.target.checked)}/>
              <Typography>المركز نشط ومتاح في قوائم التشغيل (لا يعني الاعتماد التنظيمي)</Typography>
            </Stack>
          </Box>
        </Paper>

        <Paper variant="outlined" sx={sectionStyle}>
          <Typography fontWeight={900} sx={{ mb: 1 }}>
            رابعًا: الوحدات التابعة للمركز
          </Typography>
          {!editing ? <Alert severity="info">
            احفظ بيانات المركز أولًا، ثم أضف الوحدات كسجلات مستقلة قابلة للمراجعة.
          </Alert> : <Stack gap={1.5}>
            <Typography variant="body2" color="text.secondary">
              عدد الوحدات المرتبطة: {centerUnits.length} — الوحدات الجديدة تبقى بانتظار الاعتماد.
            </Typography>
            {!!unitsLoadError && <Alert severity="error">
              {unitsLoadError}
              <Button size="small" onClick={onReloadUnits}>إعادة المحاولة</Button>
            </Alert>}
            <Stack direction="row" gap={0.75} flexWrap="wrap">
              {centerUnits.map(unit =>
                <Chip key={unit.id} size="small" variant="outlined"
                  color={unit.is_approved ? 'success' : 'warning'}
                  label={unit.name + ' — ' + (unit.is_approved ? 'معتمدة' : 'مقترحة')}/>)}
            </Stack>
            <Box sx={formGrid}>
              <TextField label="اسم وحدة جديدة" value={unitName}
                onChange={e => onUnitNameChange(e.target.value)}
                helperText="مثال: وحدة التمريض، دون تكرارها في المركز نفسه."/>
              <TextField label="مرجع الوحدة في Excel أو المستند" value={unitReference}
                onChange={e => onUnitReferenceChange(e.target.value)}/>
            </Box>
            <Button variant="outlined" disabled={unitBusy || unitName.trim().length < 3}
              onClick={onCreateUnit}>
              {unitBusy ? 'جارٍ الحفظ...' : 'إضافة وحدة للمراجعة'}
            </Button>
            <Typography variant="caption" color="text.secondary">
              إضافة وحدة عملية مستقلة. احفظ أي تغييرات على بيانات المركز قبلها.
            </Typography>
          </Stack>}
        </Paper>
      </Stack>
    </DialogContent>
    <DialogActions sx={{ p: 2, gap: 1 }}>
      <Button disabled={saving} onClick={onClose}>إلغاء</Button>
      <Button variant="contained" disabled={saving || !form.name_ar.trim()} onClick={onSave}>
        {saving ? 'جارٍ الحفظ...' : 'حفظ بيانات المركز'}
      </Button>
    </DialogActions>
  </Dialog>;
}
