import { Button, ButtonGroup, Tooltip } from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { useDatePreference } from '../context/DatePreferenceContext';

export function DatePreferenceToggle({ compact = false }: { compact?: boolean }) {
  const { calendar, setCalendar } = useDatePreference();

  return (
    <Tooltip title="اختيار نظام التاريخ في العرض والطباعة">
      <ButtonGroup
        variant="outlined"
        size="small"
        sx={{
          bgcolor: 'rgba(255,255,255,.72)',
          borderRadius: 999,
          boxShadow: '0 8px 18px rgba(15,23,42,.06)',
          '& .MuiButton-root': {
            minWidth: compact ? 42 : 58,
            height: compact ? 34 : 36,
            px: compact ? .85 : 1.2,
            borderRadius: '999px !important',
            fontWeight: 850,
          },
        }}
      >
        {!compact && (
          <Button disabled sx={{ color: '#64748B !important' }}>
            <CalendarMonthIcon fontSize="small" />
          </Button>
        )}
        <Button
          onClick={() => setCalendar('gregorian')}
          variant={calendar === 'gregorian' ? 'contained' : 'outlined'}
        >
          م
        </Button>
        <Button
          onClick={() => setCalendar('hijri')}
          variant={calendar === 'hijri' ? 'contained' : 'outlined'}
        >
          هـ
        </Button>
      </ButtonGroup>
    </Tooltip>
  );
}
