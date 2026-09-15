import { Autocomplete, Box, Chip, TextField, Typography } from '@mui/material';

export type HealthCenterOption = {
  id: number | string;
  name: string;
  code?: string | null;
  region?: string;
  city?: string;
  district?: string;
  building_type?: 'model' | 'rented' | 'owned' | 'other' | string;
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
    model: ['مبنى نموذجي', 'Model building'],
    rented: ['مبنى مستأجر', 'Rented building'],
    owned: ['مبنى مملوك', 'Owned building'],
    other: ['أخرى', 'Other'],
  };
  const pair = labels[type || ''];
  return pair ? pair[isArabic ? 0 : 1] : '';
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
    getOptionLabel={option => option.name || ''}
    onChange={(_, option) => onChange(option ? String(option.id) : '')}
    renderOption={(props, option) => {
      const meta = [option.region, option.city, option.district].filter(Boolean).join(' · ');
      const building = buildingTypeLabel(option.building_type, isArabic);
      return <Box component="li" {...props} key={option.id} sx={{ display: 'block !important', py: 1.1 }}>
        <Typography variant="body2" fontWeight={850}>{option.name}</Typography>
        {(meta || building) && <Box sx={{ display: 'flex', gap: .7, mt: .35, alignItems: 'center', flexWrap: 'wrap' }}>
          {meta && <Typography variant="caption" color="text.secondary">{meta}</Typography>}
          {building && <Chip size="small" variant="outlined" label={building} sx={{ height: 20 }} />}
        </Box>}
      </Box>;
    }}
    renderInput={params => <TextField {...params} required={required} label={label} placeholder={placeholder} />}
  />;
}
