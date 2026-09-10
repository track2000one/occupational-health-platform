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
    nameEn: 'Official Healthcare',
    nameAr: 'الصحة الرسمي',
    swatches: ['#0B5D59', '#147D77', '#D9EFED', '#F4F8F8'],
    primary: '#147D77',
    primaryDark: '#0B5D59',
    secondary: '#2F6F8F',
    background: '#F4F8F8',
    paper: '#FFFFFF',
    drawerGradient: 'linear-gradient(135deg, #0B5D59 0%, #147D77 100%)',
  },
  {
    id: 'health-premium',
    nameEn: 'Medical Blue',
    nameAr: 'الأزرق الطبي',
    swatches: ['#174A73', '#246B9B', '#DCEAF4', '#F5F8FB'],
    primary: '#246B9B',
    primaryDark: '#174A73',
    secondary: '#25847F',
    background: '#F5F8FB',
    paper: '#FFFFFF',
    drawerGradient: 'linear-gradient(135deg, #174A73 0%, #246B9B 100%)',
  },
  {
    id: 'navy',
    nameEn: 'Institutional Navy',
    nameAr: 'الكحلي المؤسسي',
    swatches: ['#17283D', '#2E4A66', '#DCE5EC', '#F4F6F8'],
    primary: '#2E4A66',
    primaryDark: '#17283D',
    secondary: '#357A88',
    background: '#F4F6F8',
    paper: '#FFFFFF',
    drawerGradient: 'linear-gradient(135deg, #17283D 0%, #2E4A66 100%)',
  },
  {
    id: 'iau-deeds',
    nameEn: 'University Official',
    nameAr: 'الجامعة الرسمي',
    swatches: ['#1D344D', '#3E5879', '#B38A55', '#F6F3EE'],
    primary: '#3E5879',
    primaryDark: '#1D344D',
    secondary: '#9A7444',
    background: '#F6F3EE',
    paper: '#FFFEFC',
    drawerGradient: 'linear-gradient(135deg, #1D344D 0%, #3E5879 100%)',
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
  if (Number.isNaN(numeric)) return '20, 125, 119';

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
