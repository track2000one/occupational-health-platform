import { Autocomplete, Box, Chip, TextField, Typography } from '@mui/material';

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
  const isArabic = /[\u0600-\u06FF]/.test(label);
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
