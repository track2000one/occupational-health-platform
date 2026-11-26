import { useMemo } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Autocomplete,
  Grid, Stack, TextField, Typography,
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import {
  ORG_LEVELS, ORGANIZATIONAL_SUGGESTIONS, TOP_LEVELS,
  type OrgLevel, type EmployeeOrgHierarchy,
} from '../data/employeeOrganizationalHierarchy';

type Affiliation = 'center' | 'department';

type Props = {
  value: EmployeeOrgHierarchy;
  affiliationKind: Affiliation;
  selectedCenterNames: string[];
  selectedDepartmentNames: string[];
  selectedUnitNames: string[];
  isReadOnly: boolean;
  isSuperuser: boolean;
  defaultExpanded: boolean;
  reason: string;
  onReasonChange: (reason: string) => void;
  onChange: (key: OrgLevel, value: string) => void;
  mode: 'view' | 'add' | 'edit';
};

/** Manual employee entry uses the same 13 source fields as Excel V4.
 * Source fields never create or transfer approved health-center/org relations.
 */
export function EmployeeOrganizationalFields({
  value, affiliationKind, selectedCenterNames, selectedDepartmentNames,
  selectedUnitNames, isReadOnly, isSuperuser, defaultExpanded,
  reason, onReasonChange, onChange, mode,
}: Props) {
  const suggestions = useMemo(() => {
    const result: Partial<Record<OrgLevel, string[]>> = {};
    for (const { key } of ORG_LEVELS) {
      const custom =
        key === 'health_center' ? selectedCenterNames :
        key === 'department' ? selectedDepartmentNames :
        key === 'sub_unit' ? selectedUnitNames : [];
      result[key] = [...new Set([
        ...(ORGANIZATIONAL_SUGGESTIONS[key] || []), ...custom,
        'لا ينطبق', 'غير محدد في المصدر',
      ])];
    }
    return result;
  }, [selectedCenterNames, selectedDepartmentNames, selectedUnitNames]);

  return <Accordion defaultExpanded={defaultExpanded} disableGutters
    sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2,
      '&:before': { display: 'none' } }}>
    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
      <Stack spacing={0.5}>
        <Typography fontWeight={800}>الهيكلة التنظيمية — القالب V4</Typography>
        <Typography variant="caption" color="text.secondary">
          كل مستوى في حقل مستقل. المسميات الوصفية لا تُعد وحدات تنظيمية معتمدة.
        </Typography>
      </Stack>
    </AccordionSummary>
    <AccordionDetails>
      <Alert severity="info" sx={{ mb: 2 }}>
        اختر المركز أو القسم المعتمد؛ تُملأ مستويات التبعية تلقائيًا من التسلسل المعتمد.
        البيانات الوصفية غير المتوفرة تستكمل من المصدر دون إنشاء تبعية جديدة.
      </Alert>
      {!isSuperuser && !isReadOnly && <Alert severity="warning" sx={{ mb: 2 }}>
        تعديل المصدر التنظيمي متاح للمسؤول الأعلى فقط، أما ربط المركز أو القسم المعتمد
        فيخضع لصلاحيات إدارة الموظفين المعتادة.
      </Alert>}
      <Grid container spacing={2}>
        {ORG_LEVELS.filter(({ key }) => key !== 'holding_company').map(({ key, label }) => {
          const isTop = key in TOP_LEVELS;
          const assignedCenter = key === 'health_center' && affiliationKind === 'center';
          const assignedDepartment = key === 'department' && affiliationKind === 'department';
          const derived = mode === 'add' && ['main_administration', 'sub_administration',
            'department', 'sub_unit', 'consultative_sector', 'health_center'].includes(key);
          const locked = isReadOnly || !isSuperuser || isTop ||
            assignedCenter || assignedDepartment || derived;
          return <Grid key={key} size={{ xs: 12, md: 6 }}>
            {locked ? <TextField
              fullWidth label={label} size="small" value={value[key] || '—'}
              slotProps={{ input: { readOnly: true }, inputLabel: { shrink: true } }}
              sx={{ '& .MuiInputBase-input': { fontWeight: 600, color: 'text.primary' },
                '& .MuiOutlinedInput-root': { bgcolor: 'action.hover' } }}
              helperText={derived ? 'يُحدد تلقائيًا من الجهة المعتمدة' : isTop ? 'مستوى ثابت' :
                (assignedCenter || assignedDepartment) ? 'مرتبط بالجهة المعتمدة المختارة' : 'للقراءة فقط'}
            /> : <Autocomplete freeSolo options={suggestions[key] || []}
              value={value[key]}
              inputValue={value[key] || ''}
              onChange={(_, selected) => onChange(key, selected || '')}
              onInputChange={(_, typed, reason) => {
                if (reason === 'input') onChange(key, typed);
              }}
              renderInput={params => <TextField {...params} fullWidth
                label={label} size="small"
                
                helperText="اختر من المقترحات أو اكتب المسمى من المصدر؛ لا يُعتمد تلقائيًا" />}
            />}
          </Grid>;
        })}
        {mode === 'edit' && isSuperuser && <Grid size={{ xs: 12 }}>
          <TextField fullWidth multiline minRows={2}
            label="سبب تصحيح مسميات تنظيمية مثبتة سابقًا"
            value={reason} onChange={event => onReasonChange(event.target.value)}
            disabled={isReadOnly}
            helperText="يلزم سبب توثيقي من 10 أحرف على الأقل عند تغيير قيمة مسجلة. لا ينقل ذلك الموظف بين المراكز والأقسام." />
        </Grid>}
      </Grid>
    </AccordionDetails>
  </Accordion>;
}
