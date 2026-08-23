import { Box, Typography } from '@mui/material';
import { DatePreferenceToggle } from './DatePreferenceToggle';
import { useDatePreference } from '../context/DatePreferenceContext';

export function DatePreferenceFloating() {
  const { calendar } = useDatePreference();

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: { xs: 14, md: 18 },
        insetInlineStart: { xs: 14, md: 22 },
        zIndex: 1300,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1,
        py: .75,
        borderRadius: 999,
        bgcolor: 'rgba(255,255,255,.86)',
        border: '1px solid rgba(148,163,184,.24)',
        boxShadow: '0 12px 26px rgba(15,23,42,.10)',
        backdropFilter: 'blur(14px)',
      }}
    >
      <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'block' }, fontWeight: 850, color: '#334155' }}>
        التاريخ: {calendar === 'hijri' ? 'هجري' : 'ميلادي'}
      </Typography>
      <DatePreferenceToggle compact />
    </Box>
  );
}
