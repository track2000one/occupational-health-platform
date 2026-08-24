import { useEffect, useMemo, useState } from 'react';
import {
  Box, Button, IconButton, InputAdornment, MenuItem, Popover, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import {
  CalendarMonth as CalendarMonthIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useDatePreference } from '../context/DatePreferenceContext';
import {
  daysInHijriMonth,
  formatIsoDate,
  gregorianToHijri,
  gregorianToHijriParts,
  hijriToGregorian,
  MAX_HIJRI_YEAR,
  MIN_HIJRI_YEAR,
} from '../utils/calendarDate';

const HIJRI_MONTHS_AR = [
  'محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة',
  'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة',
];
const HIJRI_MONTHS_EN = [
  'Muharram', 'Safar', 'Rabi I', 'Rabi II', 'Jumada I', 'Jumada II',
  'Rajab', 'Shaaban', 'Ramadan', 'Shawwal', 'Dhul Qidah', 'Dhul Hijjah',
];
const WEEKDAYS_AR = ['أحد', 'اثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'];
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HIJRI_YEARS = Array.from(
  { length: MAX_HIJRI_YEAR - MIN_HIJRI_YEAR + 1 },
  (_, index) => MIN_HIJRI_YEAR + index,
);

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
  const todayIso = new Date().toISOString().slice(0, 10);
  const initialHijri = gregorianToHijriParts(value) || gregorianToHijriParts(todayIso) || { year: 1448, month: 1, day: 1 };
  const [hijriDisplay, setHijriDisplay] = useState(() => gregorianToHijri(value));
  const [calendarAnchor, setCalendarAnchor] = useState<HTMLElement | null>(null);
  const [visibleYear, setVisibleYear] = useState(initialHijri.year);
  const [visibleMonth, setVisibleMonth] = useState(initialHijri.month);

  useEffect(() => {
    if (calendar === 'hijri') setHijriDisplay(gregorianToHijri(value));
  }, [calendar, value]);

  const selectedHijri = gregorianToHijri(value);
  const todayHijri = gregorianToHijri(todayIso);
  const monthNames = isRtl ? HIJRI_MONTHS_AR : HIJRI_MONTHS_EN;
  const weekdayNames = isRtl ? WEEKDAYS_AR : WEEKDAYS_EN;

  const monthGrid = useMemo(() => {
    const days = daysInHijriMonth(visibleYear, visibleMonth);
    const firstIso = hijriToGregorian(formatIsoDate({ year: visibleYear, month: visibleMonth, day: 1 }));
    const firstWeekday = firstIso ? new Date(`${firstIso}T00:00:00Z`).getUTCDay() : 0;
    return [
      ...Array.from({ length: firstWeekday }, () => null),
      ...Array.from({ length: days }, (_, index) => index + 1),
    ];
  }, [visibleMonth, visibleYear]);

  const openHijriCalendar = (anchor: HTMLElement) => {
    const active = gregorianToHijriParts(value) || gregorianToHijriParts(todayIso);
    if (active) {
      setVisibleYear(active.year);
      setVisibleMonth(active.month);
    }
    setCalendarAnchor(anchor);
  };

  const changeMonth = (amount: number) => {
    let nextMonth = visibleMonth + amount;
    let nextYear = visibleYear;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    } else if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    if (nextYear < MIN_HIJRI_YEAR || nextYear > MAX_HIJRI_YEAR) return;
    setVisibleMonth(nextMonth);
    setVisibleYear(nextYear);
  };

  const selectHijriDay = (day: number) => {
    const hijri = formatIsoDate({ year: visibleYear, month: visibleMonth, day });
    const gregorian = hijriToGregorian(hijri);
    if (!gregorian) return;
    setHijriDisplay(hijri);
    onChange(gregorian);
    setCalendarAnchor(null);
  };

  const clearDate = () => {
    setHijriDisplay('');
    onChange('');
    setCalendarAnchor(null);
  };

  const previousIcon = isRtl ? <ChevronRightIcon /> : <ChevronLeftIcon />;
  const nextIcon = isRtl ? <ChevronLeftIcon /> : <ChevronRightIcon />;

  return (
    <Box sx={sx}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 0.5 }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={calendar}
          onChange={(_, next) => {
            if (!next) return;
            setCalendarAnchor(null);
            setCalendar(next);
          }}
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
        value={calendar === 'gregorian' ? value : hijriDisplay}
        onChange={event => calendar === 'gregorian' && onChange(event.target.value)}
        onClick={event => calendar === 'hijri' && !disabled && openHijriCalendar(event.currentTarget)}
        helperText={helperText || (calendar === 'hijri'
          ? (isRtl ? 'اختر تاريخًا صحيحًا من تقويم أم القرى' : 'Choose a valid date from the Umm al-Qura calendar')
          : undefined)}
        placeholder={calendar === 'hijri' ? (isRtl ? 'اختر من التقويم' : 'Choose from calendar') : undefined}
        slotProps={{
          inputLabel: { shrink: true },
          input: {
            readOnly: calendar === 'hijri',
            endAdornment: calendar === 'hijri' ? (
              <InputAdornment position="end">
                {value && (
                  <IconButton size="small" disabled={disabled} aria-label={isRtl ? 'مسح التاريخ' : 'Clear date'}
                    onClick={event => { event.stopPropagation(); clearDate(); }}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                )}
                <IconButton size="small" disabled={disabled} aria-label={isRtl ? 'فتح التقويم الهجري' : 'Open Hijri calendar'}
                  onClick={event => { event.stopPropagation(); openHijriCalendar(event.currentTarget); }}>
                  <CalendarMonthIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          },
        }}
      />

      {calendar === 'hijri' && value && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
          {isRtl ? `يُحفظ ميلاديًا: ${value}` : `Stored as Gregorian: ${value}`}
        </Typography>
      )}

      <Popover
        open={Boolean(calendarAnchor)}
        anchorEl={calendarAnchor}
        onClose={() => setCalendarAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: isRtl ? 'right' : 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: isRtl ? 'right' : 'left' }}
        slotProps={{ paper: { sx: { p: 1.5, mt: 0.5, width: 340, maxWidth: 'calc(100vw - 24px)', borderRadius: 3 } } }}
      >
        <Box dir={isRtl ? 'rtl' : 'ltr'}>
          <Typography fontWeight={900} sx={{ mb: 1 }}>
            {isRtl ? 'اختيار التاريخ الهجري — أم القرى' : 'Select Hijri date — Umm al-Qura'}
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '36px 1fr 92px 36px', gap: 0.75, alignItems: 'center', mb: 1.25 }}>
            <IconButton size="small" onClick={() => changeMonth(-1)} aria-label={isRtl ? 'الشهر السابق' : 'Previous month'}>{previousIcon}</IconButton>
            <TextField select size="small" value={visibleMonth} onChange={event => setVisibleMonth(Number(event.target.value))}>
              {monthNames.map((month, index) => <MenuItem key={month} value={index + 1}>{month}</MenuItem>)}
            </TextField>
            <TextField select size="small" value={visibleYear} onChange={event => setVisibleYear(Number(event.target.value))}>
              {HIJRI_YEARS.map(year => <MenuItem key={year} value={year}>{year}</MenuItem>)}
            </TextField>
            <IconButton size="small" onClick={() => changeMonth(1)} aria-label={isRtl ? 'الشهر التالي' : 'Next month'}>{nextIcon}</IconButton>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.35 }}>
            {weekdayNames.map(day => (
              <Typography key={day} variant="caption" align="center" fontWeight={900} color="text.secondary" sx={{ py: 0.5 }}>{day}</Typography>
            ))}
            {monthGrid.map((day, index) => {
              if (!day) return <Box key={`empty-${index}`} sx={{ height: 36 }} />;
              const hijri = formatIsoDate({ year: visibleYear, month: visibleMonth, day });
              const selected = hijri === selectedHijri;
              const today = hijri === todayHijri;
              return (
                <Button
                  key={hijri}
                  size="small"
                  variant={selected ? 'contained' : 'text'}
                  onClick={() => selectHijriDay(day)}
                  sx={{
                    minWidth: 0, height: 36, p: 0, borderRadius: 2,
                    fontWeight: selected || today ? 950 : 650,
                    border: '1px solid',
                    borderColor: today && !selected ? 'primary.main' : 'transparent',
                  }}
                >
                  {day}
                </Button>
              );
            })}
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
            <Button size="small" color="inherit" onClick={clearDate}>{isRtl ? 'مسح التاريخ' : 'Clear'}</Button>
            <Typography variant="caption" color="text.secondary">{isRtl ? 'لا يقبل إلا تاريخًا صالحًا' : 'Only valid dates are accepted'}</Typography>
          </Box>
        </Box>
      </Popover>
    </Box>
  );
}
