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
        bottom: 18,
        [isRtl ? 'left' : 'right']: 18,
        zIndex: 1300,
        display: 'flex',
        flexDirection: 'column',
        alignItems: isRtl ? 'flex-start' : 'flex-end',
        gap: 1,
      }}
    >
      <Collapse in={open} unmountOnExit>
        <Paper
          elevation={0}
          sx={{
            p: 1.25,
            borderRadius: 4,
            width: 245,
            maxHeight: 390,
            overflowY: 'auto',
            mb: 1,
            background: 'rgba(248,250,252,.94)',
            border: '1px solid rgba(255,255,255,.72)',
            backdropFilter: 'blur(18px)',
            boxShadow: '10px 10px 24px rgba(156,169,184,.28), -8px -8px 22px rgba(255,255,255,.82)',
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75, px: 0.5 }}>
            <Typography variant="subtitle2" fontWeight={850} sx={{ color: '#111827' }}>
              {isRtl ? 'الثيم' : 'Theme'}
            </Typography>
            <IconButton size="small" onClick={() => setOpen(false)} sx={{ width: 28, height: 28 }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.55 }}>
            {PALETTES.map((p) => (
              <Box
                key={p.id}
                onClick={() => setPaletteId(p.id)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.85,
                  minHeight: 34,
                  px: 0.9,
                  py: 0.55,
                  borderRadius: 999,
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: current.id === p.id ? p.primary : 'rgba(148,163,184,.18)',
                  bgcolor: current.id === p.id ? '#FFFFFF' : 'rgba(248,250,252,.52)',
                  boxShadow: current.id === p.id
                    ? `4px 4px 10px ${p.primary}22, -4px -4px 10px rgba(255,255,255,.9)`
                    : 'none',
                  transition: 'all 0.18s ease',
                  '&:hover': {
                    bgcolor: '#FFFFFF',
                    transform: 'translateY(-1px)',
                    borderColor: `${p.primary}88`,
                  },
                }}
              >
                <Box sx={{ display: 'flex', gap: 0.35, flexShrink: 0 }}>
                  {p.swatches.map((color, i) => (
                    <Box
                      key={i}
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        bgcolor: color,
                        border: '1px solid rgba(15,23,42,0.12)',
                      }}
                    />
                  ))}
                </Box>
                <Typography
                  variant="caption"
                  noWrap
                  sx={{
                    color: current.id === p.id ? '#111827' : '#475569',
                    fontWeight: current.id === p.id ? 850 : 650,
                    fontSize: '0.72rem',
                  }}
                >
                  {isRtl ? p.nameAr : p.nameEn}
                </Typography>
              </Box>
            ))}
          </Box>
        </Paper>
      </Collapse>

      <Tooltip title={isRtl ? 'تغيير الثيم' : 'Change theme'} placement={isRtl ? 'right' : 'left'}>
        <IconButton
          onClick={() => setOpen(v => !v)}
          sx={{
            width: 42,
            height: 42,
            background: current.drawerGradient,
            color: 'white',
            border: '1px solid rgba(255,255,255,.58)',
            boxShadow: `7px 7px 16px ${current.primary}30, -6px -6px 14px rgba(255,255,255,.82)`,
            '&:hover': {
              background: current.drawerGradient,
              transform: 'translateY(-1px)',
              boxShadow: `9px 9px 20px ${current.primary}38, -7px -7px 16px rgba(255,255,255,.9)`,
            },
          }}
        >
          <PaletteIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
