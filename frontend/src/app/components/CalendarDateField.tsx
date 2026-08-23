import { useEffect, useRef, useState } from 'react';
import { Box, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { useDatePreference } from '../context/DatePreferenceContext';
import { gregorianToHijri, hijriToGregorian, normalizeDateDigits } from '../utils/calendarDate';

type CalendarDateFieldProps = {
  label: string;
  value: string;
  onChange: (isoGregorianDate: string) => void;
  required?: boolean;
  disabled?: boolean;
  helperText?: string;
  fullWidth?: boolean;
  sx?: SxProps<Theme>;
};

export function CalendarDateField({
  label,
  value,
  onChange,
  required = false,
  disabled = false,
  helperText,
  fullWidth = true,
  sx,
}: CalendarDateFieldProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';
  const { calendar, setCalendar } = useDatePreference();
  const [hijriDraft, setHijriDraft] = useState(() => gregorianToHijri(value));
  const [invalidHijri, setInvalidHijri] = useState(false);
  const pendingInternalValue = useRef<string | undefined>(undefined);

  useEffect(() => {
    const internalValue = pendingInternalValue.current;
    pendingInternalValue.current = undefined;
    if (internalValue === value) return;
    if (calendar === 'hijri') setHijriDraft(gregorianToHijri(value));
    setInvalidHijri(false);
  }, [value]);

  useEffect(() => {
    if (calendar === 'hijri') setHijriDraft(gregorianToHijri(value));
    setInvalidHijri(false);
  }, [calendar]);

  const emitChange = (nextValue: string) => {
    pendingInternalValue.current = nextValue;
    onChange(nextValue);
  };

  const handleHijriChange = (rawValue: string) => {
    const normalized = normalizeDateDigits(rawValue).replace(/[/.]/g, '-').slice(0, 10);
    setHijriDraft(normalized);
    setInvalidHijri(false);

    if (!normalized) {
      emitChange('');
      return;
    }
    if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) {
      emitChange('');
      return;
    }

    const converted = hijriToGregorian(normalized);
    setInvalidHijri(!converted);
    emitChange(converted ?? '');
  };

  return (
    <Box sx={sx}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 0.5 }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={calendar}
          onChange={(_, next) => next && setCalendar(next)}
          aria-label={isRtl ? 'نوع التقويم' : 'Calendar type'}
          disabled={disabled}
          sx={{
            direction: 'ltr',
            '& .MuiToggleButton-root': { py: 0.15, px: 1, fontSize: 11, lineHeight: 1.5 },
          }}
        >
          <ToggleButton value="gregorian">{isRtl ? 'ميلادي' : 'Gregorian'}</ToggleButton>
          <ToggleButton value="hijri">{isRtl ? 'هجري' : 'Hijri'}</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <TextField
        fullWidth={fullWidth}
        required={required}
        disabled={disabled}
        label={label}
        type={calendar === 'gregorian' ? 'date' : 'text'}
        value={calendar === 'gregorian' ? value : hijriDraft}
        onChange={event => calendar === 'gregorian' ? onChange(event.target.value) : handleHijriChange(event.target.value)}
        error={invalidHijri}
        helperText={invalidHijri
          ? (isRtl ? 'تاريخ هجري غير صحيح' : 'Invalid Hijri date')
          : helperText || (calendar === 'hijri' ? (isRtl ? 'الصيغة: سسسس-شش-يي (أم القرى)' : 'Format: YYYY-MM-DD (Umm al-Qura)') : undefined)}
        placeholder={calendar === 'hijri' ? '1448-01-01' : undefined}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { inputMode: calendar === 'hijri' ? 'numeric' : undefined } }}
      />
      {calendar === 'hijri' && value && !invalidHijri && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
          {isRtl ? `يُحفظ ميلاديًا: ${value}` : `Stored as Gregorian: ${value}`}
        </Typography>
      )}
    </Box>
  );
}
