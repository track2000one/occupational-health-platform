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

export type AppFontId = 'fanan' | 'ibm-plex' | 'tahoma';

export interface AppTypographySettings {
  fontId: AppFontId;
  fontSize: number;
  fontWeight: 400 | 500 | 600 | 700;
  lineHeight: number;
  textColor: string;
  highContrast: boolean;
  reduceMotion: boolean;
}

export const FONT_OPTIONS: Array<{ id: AppFontId; nameAr: string; nameEn: string; family: string }> = [
  {
    id: 'fanan',
    nameAr: 'فنان',
    nameEn: 'Fanan',
    family: "'Fanan', 'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif",
  },
  {
    id: 'ibm-plex',
    nameAr: 'IBM Plex عربي',
    nameEn: 'IBM Plex Arabic',
    family: "'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif",
  },
  {
    id: 'tahoma',
    nameAr: 'Tahoma كلاسيكي',
    nameEn: 'Tahoma Classic',
    family: "Tahoma, 'Segoe UI', Arial, sans-serif",
  },
];

export const DEFAULT_TYPOGRAPHY_SETTINGS: AppTypographySettings = {
  fontId: 'fanan',
  fontSize: 16,
  fontWeight: 400,
  lineHeight: 1.55,
  textColor: '#111827',
  highContrast: false,
  reduceMotion: false,
};

export function getFontFamily(fontId: AppFontId) {
  return FONT_OPTIONS.find(option => option.id === fontId)?.family ?? FONT_OPTIONS[0].family;
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
  typography: AppTypographySettings;
  updateTypography: (settings: Partial<AppTypographySettings>) => void;
  resetTypography: () => void;
}

const ThemeCtx = createContext<ThemeContextValue>({
  palette: PALETTES[0],
  setPaletteId: () => {},
  typography: DEFAULT_TYPOGRAPHY_SETTINGS,
  updateTypography: () => {},
  resetTypography: () => {},
});

const STORAGE_KEY = 'app-palette-id';
const TYPOGRAPHY_STORAGE_KEY = 'app-typography-settings-v1';

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

function normalizeTypographySettings(value: Partial<AppTypographySettings> | null): AppTypographySettings {
  const validFont = FONT_OPTIONS.some(option => option.id === value?.fontId)
    ? value!.fontId as AppFontId
    : DEFAULT_TYPOGRAPHY_SETTINGS.fontId;
  const validWeights = [400, 500, 600, 700] as const;
  const requestedWeight = Number(value?.fontWeight);

  return {
    fontId: validFont,
    fontSize: Math.min(20, Math.max(14, Number(value?.fontSize) || DEFAULT_TYPOGRAPHY_SETTINGS.fontSize)),
    fontWeight: validWeights.includes(requestedWeight as typeof validWeights[number])
      ? requestedWeight as AppTypographySettings['fontWeight']
      : DEFAULT_TYPOGRAPHY_SETTINGS.fontWeight,
    lineHeight: Math.min(1.9, Math.max(1.35, Number(value?.lineHeight) || DEFAULT_TYPOGRAPHY_SETTINGS.lineHeight)),
    textColor: /^#[0-9a-f]{6}$/i.test(value?.textColor || '')
      ? value!.textColor!
      : DEFAULT_TYPOGRAPHY_SETTINGS.textColor,
    highContrast: Boolean(value?.highContrast),
    reduceMotion: Boolean(value?.reduceMotion),
  };
}

function loadTypographySettings() {
  try {
    const stored = localStorage.getItem(TYPOGRAPHY_STORAGE_KEY);
    return normalizeTypographySettings(stored ? JSON.parse(stored) : null);
  } catch {
    return DEFAULT_TYPOGRAPHY_SETTINGS;
  }
}

function applyTypographyCssVariables(settings: AppTypographySettings) {
  if (typeof document === 'undefined') return;

  setCssVariable('--app-font-family', getFontFamily(settings.fontId));
  setCssVariable('--font-size', `${settings.fontSize}px`);
  setCssVariable('--font-weight-normal', String(settings.fontWeight));
  setCssVariable('--font-weight-medium', String(Math.min(800, settings.fontWeight + 200)));
  setCssVariable('--app-line-height', String(settings.lineHeight));
  setCssVariable('--app-text-color', settings.textColor);
  setCssVariable('--foreground', settings.textColor);
  setCssVariable('--card-foreground', settings.textColor);
  setCssVariable('--popover-foreground', settings.textColor);
  setCssVariable('--oh-navy', settings.textColor);
  document.documentElement.dataset.highContrast = String(settings.highContrast);
  document.documentElement.dataset.reduceMotion = String(settings.reduceMotion);
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const stored = localStorage.getItem(STORAGE_KEY);
  const initial = PALETTES.find(p => p.id === stored) ?? PALETTES[0];
  const [palette, setPalette] = useState<AppPalette>(initial);
  const [typography, setTypography] = useState<AppTypographySettings>(loadTypographySettings);

  useEffect(() => {
    applyPaletteCssVariables(palette);
    applyTypographyCssVariables(typography);
  }, [palette, typography]);

  const setPaletteId = (id: string) => {
    const found = PALETTES.find(p => p.id === id);
    if (found) {
      setPalette(found);
      localStorage.setItem(STORAGE_KEY, id);
    }
  };

  const updateTypography = (settings: Partial<AppTypographySettings>) => {
    setTypography(current => {
      const next = normalizeTypographySettings({ ...current, ...settings });
      localStorage.setItem(TYPOGRAPHY_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const resetTypography = () => {
    setTypography(DEFAULT_TYPOGRAPHY_SETTINGS);
    localStorage.setItem(TYPOGRAPHY_STORAGE_KEY, JSON.stringify(DEFAULT_TYPOGRAPHY_SETTINGS));
  };

  const value = useMemo(
    () => ({ palette, setPaletteId, typography, updateTypography, resetTypography }),
    [palette, typography],
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useAppTheme() {
  return useContext(ThemeCtx);
}
