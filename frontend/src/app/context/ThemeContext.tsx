import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export interface AppPalette {
  id: string;
  nameEn: string;
  nameAr: string;
  /** [color1, color2, color3, color4] swatches shown in the picker */
  swatches: [string, string, string, string];
  primary: string;
  primaryDark: string;
  secondary: string;
  background: string;
  paper: string;
  drawerGradient: string;
}

export const PALETTES: AppPalette[] = [
  {
    id: 'default',
    nameEn: 'Clinical Executive',
    nameAr: 'الصحة التنفيذي',
    swatches: ['#064E4B', '#0F766E', '#2563EB', '#EFF6F6'],
    primary: '#0F766E',
    primaryDark: '#064E4B',
    secondary: '#2563EB',
    background: '#EFF6F6',
    paper: '#FFFFFF',
    drawerGradient: 'linear-gradient(140deg, #064E4B 0%, #0F766E 58%, #2563EB 135%)',
  },
  {
    id: 'health-premium',
    nameEn: 'Azure Care',
    nameAr: 'العناية الزرقاء',
    swatches: ['#1E3A8A', '#2563EB', '#0891B2', '#F1F6FD'],
    primary: '#2563EB',
    primaryDark: '#1E3A8A',
    secondary: '#0891B2',
    background: '#F1F6FD',
    paper: '#FFFFFF',
    drawerGradient: 'linear-gradient(140deg, #1E3A8A 0%, #2563EB 58%, #0891B2 130%)',
  },
  {
    id: 'iau-deeds',
    nameEn: 'IAU Identity',
    nameAr: 'هوية الجامعة',
    swatches: ['#172A43', '#2F4A68', '#B6843F', '#F4F0E9'],
    primary: '#2F4A68',
    primaryDark: '#172A43',
    secondary: '#B6843F',
    background: '#F4F0E9',
    paper: '#FFFCF7',
    drawerGradient: 'linear-gradient(140deg, #172A43 0%, #2F4A68 62%, #A87837 135%)',
  },
  {
    id: 'ocean',
    nameEn: 'Deep Ocean',
    nameAr: 'المحيط العميق',
    swatches: ['#0C4A6E', '#0369A1', '#0D9488', '#EFF7FA'],
    primary: '#0369A1',
    primaryDark: '#0C4A6E',
    secondary: '#0D9488',
    background: '#EFF7FA',
    paper: '#FCFEFF',
    drawerGradient: 'linear-gradient(140deg, #0C4A6E 0%, #0369A1 58%, #0D9488 132%)',
  },
  {
    id: 'spring',
    nameEn: 'Mint Coral',
    nameAr: 'النعناع المرجاني',
    swatches: ['#115E59', '#0F766E', '#D95F69', '#F2FAF7'],
    primary: '#0F766E',
    primaryDark: '#115E59',
    secondary: '#D95F69',
    background: '#F2FAF7',
    paper: '#FFFDFC',
    drawerGradient: 'linear-gradient(140deg, #115E59 0%, #0F766E 62%, #D95F69 138%)',
  },
  {
    id: 'forest',
    nameEn: 'Emerald Care',
    nameAr: 'العناية الزمردية',
    swatches: ['#064E3B', '#047857', '#65A30D', '#F0F7F3'],
    primary: '#047857',
    primaryDark: '#064E3B',
    secondary: '#65A30D',
    background: '#F0F7F3',
    paper: '#FCFEFD',
    drawerGradient: 'linear-gradient(140deg, #064E3B 0%, #047857 62%, #65A30D 138%)',
  },
  {
    id: 'sunset',
    nameEn: 'Amber Navy',
    nameAr: 'العنبر والكحلي',
    swatches: ['#78350F', '#B45309', '#1D4ED8', '#FBF6ED'],
    primary: '#B45309',
    primaryDark: '#78350F',
    secondary: '#1D4ED8',
    background: '#FBF6ED',
    paper: '#FFFEFB',
    drawerGradient: 'linear-gradient(140deg, #78350F 0%, #B45309 60%, #1D4ED8 145%)',
  },
  {
    id: 'blossom',
    nameEn: 'Berry Violet',
    nameAr: 'التوت البنفسجي',
    swatches: ['#831843', '#BE185D', '#7C3AED', '#FFF2F7'],
    primary: '#BE185D',
    primaryDark: '#831843',
    secondary: '#7C3AED',
    background: '#FFF2F7',
    paper: '#FFFCFD',
    drawerGradient: 'linear-gradient(140deg, #831843 0%, #BE185D 60%, #7C3AED 138%)',
  },
  {
    id: 'ember',
    nameEn: 'Crimson',
    nameAr: 'القرمزي',
    swatches: ['#7F1D1D', '#B91C1C', '#D97706', '#FFF3F2'],
    primary: '#B91C1C',
    primaryDark: '#7F1D1D',
    secondary: '#D97706',
    background: '#FFF3F2',
    paper: '#FFFFFF',
    drawerGradient: 'linear-gradient(140deg, #7F1D1D 0%, #B91C1C 62%, #D97706 140%)',
  },
  {
    id: 'navy',
    nameEn: 'Executive Navy',
    nameAr: 'الكحلي التنفيذي',
    swatches: ['#0F172A', '#1E3A5F', '#0E7490', '#EEF3F8'],
    primary: '#1E3A5F',
    primaryDark: '#0F172A',
    secondary: '#0E7490',
    background: '#EEF3F8',
    paper: '#FBFDFE',
    drawerGradient: 'linear-gradient(140deg, #0F172A 0%, #1E3A5F 62%, #0E7490 138%)',
  },
  {
    id: 'slate',
    nameEn: 'Graphite Teal',
    nameAr: 'الجرافيت الفيروزي',
    swatches: ['#0F172A', '#334155', '#0F766E', '#F1F5F9'],
    primary: '#334155',
    primaryDark: '#0F172A',
    secondary: '#0F766E',
    background: '#F1F5F9',
    paper: '#FCFDFE',
    drawerGradient: 'linear-gradient(140deg, #0F172A 0%, #334155 62%, #0F766E 138%)',
  },
  {
    id: 'royal',
    nameEn: 'Royal Indigo',
    nameAr: 'النيلي الملكي',
    swatches: ['#312E81', '#4338CA', '#B8872F', '#F4F3FA'],
    primary: '#4338CA',
    primaryDark: '#312E81',
    secondary: '#B8872F',
    background: '#F4F3FA',
    paper: '#FFFFFF',
    drawerGradient: 'linear-gradient(140deg, #312E81 0%, #4338CA 62%, #B8872F 142%)',
  },
];

interface ThemeContextValue {
  palette: AppPalette;
  setPaletteId: (id: string) => void;
}

const ThemeCtx = createContext<ThemeContextValue>({
  palette: PALETTES[0],
  setPaletteId: () => {},
});

const STORAGE_KEY = 'app-palette-id';

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map(char => char + char).join('')
    : normalized;

  const numeric = Number.parseInt(value, 16);
  if (Number.isNaN(numeric)) return '15, 118, 110';

  return [
    (numeric >> 16) & 255,
    (numeric >> 8) & 255,
    numeric & 255,
  ].join(', ');
}

function setCssVariable(name: string, value: string) {
  document.documentElement.style.setProperty(name, value);
}

function applyPaletteCssVariables(palette: AppPalette) {
  if (typeof document === 'undefined') return;

  const primaryRgb = hexToRgb(palette.primary);
  const primaryDarkRgb = hexToRgb(palette.primaryDark);
  const secondaryRgb = hexToRgb(palette.secondary);
  const paperRgb = hexToRgb(palette.paper);

  const vars: Record<string, string> = {
    '--oh-primary': palette.primary,
    '--oh-primary-dark': palette.primaryDark,
    '--oh-primary-rgb': primaryRgb,
    '--oh-primary-dark-rgb': primaryDarkRgb,
    '--oh-secondary': palette.secondary,
    '--oh-secondary-rgb': secondaryRgb,
    '--oh-success': palette.primary,
    '--oh-soft': palette.background,
    '--oh-surface': palette.paper,
    '--oh-glass': `rgba(${paperRgb}, 0.72)`,
    '--oh-card-gradient': `linear-gradient(145deg, ${palette.paper} 0%, ${palette.background} 100%)`,
    '--oh-main-gradient': `radial-gradient(circle at 8% 10%, rgba(${primaryRgb}, .12) 0, transparent 28%), radial-gradient(circle at 95% 0%, rgba(${secondaryRgb}, .10) 0, transparent 30%), linear-gradient(180deg, ${palette.paper} 0%, ${palette.background} 100%)`,
    '--oh-button-shadow': `7px 7px 15px rgba(${primaryRgb}, 0.30), -6px -6px 14px rgba(255, 255, 255, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.32)`,
    '--background': palette.background,
    '--foreground': '#111827',
    '--card': palette.paper,
    '--popover': palette.paper,
    '--primary': palette.primary,
    '--secondary': `rgba(${secondaryRgb}, 0.14)`,
    '--accent': `rgba(${secondaryRgb}, 0.12)`,
    '--ring': palette.primary,
    '--input': palette.paper,
    '--input-background': palette.paper,
    '--chart-1': palette.primary,
    '--chart-2': palette.secondary,
    '--sidebar': palette.background,
    '--sidebar-primary': palette.primary,
    '--sidebar-accent': palette.paper,
    '--sidebar-ring': palette.primary,
  };

  Object.entries(vars).forEach(([name, value]) => setCssVariable(name, value));
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const stored = localStorage.getItem(STORAGE_KEY);
  const initial = PALETTES.find(p => p.id === stored) ?? PALETTES[0];
  const [palette, setPalette] = useState<AppPalette>(initial);

  useEffect(() => {
    applyPaletteCssVariables(palette);
  }, [palette]);

  const setPaletteId = (id: string) => {
    const found = PALETTES.find(p => p.id === id);
    if (found) {
      setPalette(found);
      localStorage.setItem(STORAGE_KEY, id);
    }
  };

  const value = useMemo(() => ({ palette, setPaletteId }), [palette]);

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useAppTheme() {
  return useContext(ThemeCtx);
}
