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
  sidebarBackground: string;
  sidebarItem: string;
  sidebarText: string;
  activeItemBackground: string;
  activeItemText: string;
  drawerGradient: string;
  isCustom?: boolean;
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
  fontId: 'ibm-plex',
  fontSize: 18,
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
    id: 'silver-trial', nameEn: 'Sculpted Medical Colors — Trial', nameAr: 'الطبي المجسّم الملوّن — تجريبي',
    swatches: ['#173B66', '#246B9B', '#16857C', '#FFFFFF'],
    primary: '#246B9B', primaryDark: '#173B66', secondary: '#16857C',
    background: '#FFFFFF', paper: '#F8FCFF',
    sidebarBackground: '#FAF8F2', sidebarItem: '#FFFFFF', sidebarText: '#173B66',
    activeItemBackground: '#EDEDED', activeItemText: '#292F38',
    drawerGradient: 'linear-gradient(135deg, #173B66, #16857C)',
  },
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
    sidebarBackground: '#F4F8F8',
    sidebarItem: '#FFFFFF',
    sidebarText: '#173B43',
    activeItemBackground: '#E2F1EF',
    activeItemText: '#0B5D59',
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
    sidebarBackground: '#F3F7FA',
    sidebarItem: '#FFFFFF',
    sidebarText: '#173B57',
    activeItemBackground: '#E2EDF5',
    activeItemText: '#174A73',
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
    sidebarBackground: '#F1F4F7',
    sidebarItem: '#FFFFFF',
    sidebarText: '#17283D',
    activeItemBackground: '#E2E8EE',
    activeItemText: '#17283D',
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
    sidebarBackground: '#F5F1EB',
    sidebarItem: '#FFFEFC',
    sidebarText: '#1D344D',
    activeItemBackground: '#E9E2D8',
    activeItemText: '#1D344D',
    drawerGradient: 'linear-gradient(135deg, #1D344D 0%, #3E5879 100%)',
  },
];

export const DEFAULT_PALETTE = PALETTES.find(palette => palette.id === 'health-premium')!;

interface ThemeContextValue {
  palette: AppPalette;
  availablePalettes: AppPalette[];
  customPalettes: AppPalette[];
  setPaletteId: (id: string) => void;
  updatePalette: (colors: Partial<AppPalette>) => void;
  saveCustomPalette: (name: string) => AppPalette | null;
  updateCustomPalette: (id: string, name?: string) => void;
  deleteCustomPalette: (id: string) => void;
  resetPalette: () => void;
  typography: AppTypographySettings;
  updateTypography: (settings: Partial<AppTypographySettings>) => void;
  resetTypography: () => void;
}

const ThemeCtx = createContext<ThemeContextValue>({
  palette: DEFAULT_PALETTE,
  availablePalettes: PALETTES,
  customPalettes: [],
  setPaletteId: () => {},
  updatePalette: () => {},
  saveCustomPalette: () => null,
  updateCustomPalette: () => {},
  deleteCustomPalette: () => {},
  resetPalette: () => {},
  typography: DEFAULT_TYPOGRAPHY_SETTINGS,
  updateTypography: () => {},
  resetTypography: () => {},
});

const STORAGE_KEY = 'app-palette-id';
const ACTIVE_PALETTE_STORAGE_KEY = 'app-active-palette-v2';
const CUSTOM_PALETTES_STORAGE_KEY = 'app-custom-palettes-v1';
const TYPOGRAPHY_STORAGE_KEY = 'app-typography-settings-v1';

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function normalizePalette(value: Partial<AppPalette>, fallback: AppPalette = DEFAULT_PALETTE): AppPalette {
  const color = (candidate: unknown, defaultColor: string) => isHexColor(candidate) ? candidate : defaultColor;
  const primary = color(value.primary, fallback.primary);
  const primaryDark = color(value.primaryDark, fallback.primaryDark);
  const secondary = color(value.secondary, fallback.secondary);
  const background = color(value.background, fallback.background);

  return {
    id: typeof value.id === 'string' && value.id ? value.id : fallback.id,
    nameAr: typeof value.nameAr === 'string' && value.nameAr.trim() ? value.nameAr.trim().slice(0, 50) : fallback.nameAr,
    nameEn: typeof value.nameEn === 'string' && value.nameEn.trim() ? value.nameEn.trim().slice(0, 50) : fallback.nameEn,
    swatches: [primaryDark, primary, secondary, background],
    primary,
    primaryDark,
    secondary,
    background,
    paper: color(value.paper, fallback.paper),
    sidebarBackground: color(value.sidebarBackground, fallback.sidebarBackground),
    sidebarItem: color(value.sidebarItem, fallback.sidebarItem),
    sidebarText: color(value.sidebarText, fallback.sidebarText),
    activeItemBackground: color(value.activeItemBackground, fallback.activeItemBackground),
    activeItemText: color(value.activeItemText, fallback.activeItemText),
    drawerGradient: `linear-gradient(135deg, ${primaryDark} 0%, ${primary} 100%)`,
    isCustom: Boolean(value.isCustom),
  };
}

function loadCustomPalettes(): AppPalette[] {
  try {
    const stored = JSON.parse(localStorage.getItem(CUSTOM_PALETTES_STORAGE_KEY) || '[]');
    if (!Array.isArray(stored)) return [];
    return stored
      .filter(item => item && typeof item === 'object' && typeof item.id === 'string' && item.id.startsWith('custom-'))
      .slice(-12)
      .map(item => normalizePalette({ ...item, isCustom: true }));
  } catch {
    return [];
  }
}

function loadInitialPalette(customPalettes: AppPalette[]): AppPalette {
  try {
    const active = localStorage.getItem(ACTIVE_PALETTE_STORAGE_KEY);
    if (active) {
      const parsed = JSON.parse(active) as Partial<AppPalette>;
      if (parsed.id === 'silver-trial' && parsed.sidebarBackground === '#DCECF5') {
        parsed.sidebarBackground = '#FAF8F2';
        if (parsed.sidebarItem === '#ECF5FA') parsed.sidebarItem = '#FFFFFF';
      }
      if (parsed.id === 'silver-trial' && parsed.background === '#EAF4FA') {
        parsed.background = '#FFFFFF';
      }
      if (parsed.id === 'silver-trial' && parsed.activeItemBackground === '#246B9B' && parsed.activeItemText === '#FFFFFF') {
        parsed.activeItemBackground = '#EDEDED';
        parsed.activeItemText = '#292F38';
      }
      if (parsed.id === 'silver-trial' && parsed.primary === '#454B54' && parsed.background === '#DEDEDE') {
        return PALETTES.find(item => item.id === 'silver-trial')!;
      }
      const fallback = [...PALETTES, ...customPalettes].find(item => item.id === parsed.id) ?? DEFAULT_PALETTE;
      return normalizePalette(parsed, fallback);
    }
  } catch {
    // Fall back to the legacy palette id below.
  }

  const storedId = localStorage.getItem(STORAGE_KEY);
  return [...PALETTES, ...customPalettes].find(item => item.id === storedId) ?? DEFAULT_PALETTE;
}

function persistActivePalette(palette: AppPalette) {
  localStorage.setItem(STORAGE_KEY, palette.id);
  localStorage.setItem(ACTIVE_PALETTE_STORAGE_KEY, JSON.stringify(palette));
}

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
  document.documentElement.dataset.visualStyle = palette.id === 'silver-trial' ? 'silver' : 'standard';

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
    '--sidebar': palette.sidebarBackground,
    '--sidebar-primary': palette.primary,
    '--sidebar-accent': palette.sidebarItem,
    '--sidebar-foreground': palette.sidebarText,
    '--sidebar-accent-foreground': palette.sidebarText,
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
  const [customPalettes, setCustomPalettes] = useState<AppPalette[]>(loadCustomPalettes);
  const [palette, setPalette] = useState<AppPalette>(() => loadInitialPalette(loadCustomPalettes()));
  const [typography, setTypography] = useState<AppTypographySettings>(loadTypographySettings);
  const availablePalettes = useMemo(() => [...PALETTES, ...customPalettes], [customPalettes]);

  useEffect(() => {
    applyPaletteCssVariables(palette);
    applyTypographyCssVariables(typography);
  }, [palette, typography]);

  const setPaletteId = (id: string) => {
    const found = availablePalettes.find(p => p.id === id);
    if (found) {
      setPalette(found);
      persistActivePalette(found);
    }
  };

  const updatePalette = (colors: Partial<AppPalette>) => {
    setPalette(current => {
      const next = normalizePalette({ ...current, ...colors }, current);
      persistActivePalette(next);
      return next;
    });
  };

  const saveCustomPalette = (name: string) => {
    const trimmedName = name.trim().slice(0, 50);
    if (!trimmedName) return null;

    const next = normalizePalette({
      ...palette,
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      nameAr: trimmedName,
      nameEn: trimmedName,
      isCustom: true,
    });

    setCustomPalettes(current => {
      const updated = [...current, next].slice(-12);
      localStorage.setItem(CUSTOM_PALETTES_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
    setPalette(next);
    persistActivePalette(next);
    return next;
  };

  const updateCustomPalette = (id: string, name?: string) => {
    if (!id.startsWith('custom-')) return;
    const currentName = customPalettes.find(item => item.id === id)?.nameAr ?? palette.nameAr;
    const next = normalizePalette({
      ...palette,
      id,
      nameAr: name?.trim() || currentName,
      nameEn: name?.trim() || currentName,
      isCustom: true,
    });
    setCustomPalettes(current => {
      const updated = current.map(item => item.id === id ? next : item);
      localStorage.setItem(CUSTOM_PALETTES_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
    setPalette(next);
    persistActivePalette(next);
  };

  const deleteCustomPalette = (id: string) => {
    if (!id.startsWith('custom-')) return;
    setCustomPalettes(current => {
      const updated = current.filter(item => item.id !== id);
      localStorage.setItem(CUSTOM_PALETTES_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
    if (palette.id === id) {
      setPalette(DEFAULT_PALETTE);
      persistActivePalette(DEFAULT_PALETTE);
    }
  };

  const resetPalette = () => {
    setPalette(DEFAULT_PALETTE);
    persistActivePalette(DEFAULT_PALETTE);
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
    () => ({
      palette,
      availablePalettes,
      customPalettes,
      setPaletteId,
      updatePalette,
      saveCustomPalette,
      updateCustomPalette,
      deleteCustomPalette,
      resetPalette,
      typography,
      updateTypography,
      resetTypography,
    }),
    [palette, availablePalettes, customPalettes, typography],
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useAppTheme() {
  return useContext(ThemeCtx);
}
