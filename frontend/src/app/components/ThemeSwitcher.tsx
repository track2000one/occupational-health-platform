import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Tooltip,
  IconButton,
  Paper,
  Typography,
  Collapse,
} from '@mui/material';
import { Palette as PaletteIcon, Close as CloseIcon } from '@mui/icons-material';
import { PALETTES, useAppTheme } from '../context/ThemeContext';

export function ThemeSwitcher() {
  const { palette: current, setPaletteId } = useAppTheme();
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';
  const [open, setOpen] = useState(false);

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 24,
        [isRtl ? 'left' : 'right']: 24,
        zIndex: 1400,
        display: 'flex',
        flexDirection: 'column',
        alignItems: isRtl ? 'flex-start' : 'flex-end',
        gap: 1,
      }}
    >
      <Collapse in={open} unmountOnExit>
        <Paper
          elevation={8}
          sx={{
            p: 2,
            borderRadius: 3,
            minWidth: 220,
            mb: 1,
            background: '#fff',
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography variant="subtitle2" fontWeight="bold">
              {isRtl ? 'لون الواجهة' : 'Interface Color'}
            </Typography>
            <IconButton size="small" onClick={() => setOpen(false)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {PALETTES.map((p) => (
              <Box
                key={p.id}
                onClick={() => setPaletteId(p.id)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  p: 1,
                  borderRadius: 2,
                  cursor: 'pointer',
                  border: '2px solid',
                  borderColor: current.id === p.id ? p.primary : 'transparent',
                  bgcolor: current.id === p.id ? `${p.background}88` : 'transparent',
                  transition: 'all 0.2s',
                  '&:hover': {
                    bgcolor: `${p.background}66`,
                  },
                }}
              >
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  {p.swatches.map((color, i) => (
                    <Box
                      key={i}
                      sx={{
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        bgcolor: color,
                        border: '1px solid rgba(0,0,0,0.1)',
                      }}
                    />
                  ))}
                </Box>
                <Typography variant="caption" fontWeight={current.id === p.id ? 'bold' : 'normal'}>
                  {isRtl ? p.nameAr : p.nameEn}
                </Typography>
              </Box>
            ))}
          </Box>
        </Paper>
      </Collapse>

      <Tooltip title={isRtl ? 'تغيير اللون' : 'Change theme'} placement={isRtl ? 'right' : 'left'}>
        <IconButton
          onClick={() => setOpen(v => !v)}
          sx={{
            width: 48,
            height: 48,
            background: current.drawerGradient,
            color: 'white',
            boxShadow: 4,
            '&:hover': {
              background: current.drawerGradient,
              opacity: 0.9,
            },
          }}
        >
          <PaletteIcon />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
