import React, { createContext, useContext, useState, useMemo } from 'react';

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
    nameEn: 'Neo Health',
    nameAr: 'الصحة النيو',
    swatches: ['#E9EDF3', '#FFFFFF', '#2FBF9F', '#6C7EF8'],
    primary: '#2FBF9F',
    primaryDark: '#0F9F85',
    secondary: '#6C7EF8',
    background: '#E9EDF3',
    paper: '#F3F6FA',
    drawerGradient: 'linear-gradient(145deg, #F8FAFC 0%, #E9EDF3 52%, #DDE5EF 100%)',
  },
  {
    id: 'health-premium',
    nameEn: 'Health Premium',
    nameAr: 'الصحة الاحترافي',
    swatches: ['#6C7EF8', '#2FBF9F', '#F8FAFC', '#E0E7FF'],
    primary: '#6C7EF8',
    primaryDark: '#4F46E5',
    secondary: '#2FBF9F',
    background: '#F5F8FF',
    paper: '#FFFFFF',
    drawerGradient: 'linear-gradient(145deg, #4F46E5 0%, #6C7EF8 48%, #2FBF9F 100%)',
  },
  {
    id: 'iau-deeds',
    nameEn: 'IAU Deeds Style',
    nameAr: 'نمط منصة الصكوك',
    swatches: ['#213555', '#3E5879', '#D8C4B6', '#F5EFE7'],
    primary: '#3E5879',
    primaryDark: '#213555',
    secondary: '#B9895B',
    background: '#F5EFE7',
    paper: '#FFFDF9',
    drawerGradient: 'linear-gradient(145deg, #213555 0%, #3E5879 58%, #B9895B 100%)',
  },
  {
    id: 'ocean',
    nameEn: 'Ocean',
    nameAr: 'المحيط',
    swatches: ['#81A6C6', '#FBF3D5', '#D6DAC8', '#9CAFAA'],
    primary: '#81A6C6',
    primaryDark: '#5d88b0',
    secondary: '#9CAFAA',
    background: '#FBF3D5',
    paper: '#fefcf4',
    drawerGradient: 'linear-gradient(135deg, #81A6C6 0%, #9CAFAA 100%)',
  },
  {
    id: 'spring',
    nameEn: 'Spring',
    nameAr: 'الربيع',
    swatches: ['#BADFDB', '#FFA4A4', '#FCF9EA', '#FFBDBD'],
    primary: '#BADFDB',
    primaryDark: '#7ec4bf',
    secondary: '#FFA4A4',
    background: '#FCF9EA',
    paper: '#ffffff',
    drawerGradient: 'linear-gradient(135deg, #BADFDB 0%, #FFA4A4 100%)',
  },
  {
    id: 'forest',
    nameEn: 'Forest',
    nameAr: 'الغابة',
    swatches: ['#80A1BA', '#91C4C3', '#B4DEBD', '#FFF7DD'],
    primary: '#80A1BA',
    primaryDark: '#5a84a3',
    secondary: '#91C4C3',
    background: '#FFF7DD',
    paper: '#fffef8',
    drawerGradient: 'linear-gradient(135deg, #80A1BA 0%, #91C4C3 100%)',
  },
  {
    id: 'sunset',
    nameEn: 'Sunset',
    nameAr: 'الغروب',
    swatches: ['#A2D2DF', '#F6EFBD', '#E4C087', '#BC7C7C'],
    primary: '#A2D2DF',
    primaryDark: '#6cb8cc',
    secondary: '#E4C087',
    background: '#F6EFBD',
    paper: '#fffef5',
    drawerGradient: 'linear-gradient(135deg, #A2D2DF 0%, #E4C087 100%)',
  },
  {
    id: 'blossom',
    nameEn: 'Blossom',
    nameAr: 'الزهور',
    swatches: ['#E78895', '#BED1CF', '#FFF7F1', '#FFE4C9'],
    primary: '#E78895',
    primaryDark: '#c9606f',
    secondary: '#BED1CF',
    background: '#FFF7F1',
    paper: '#fffcf9',
    drawerGradient: 'linear-gradient(135deg, #E78895 0%, #BED1CF 100%)',
  },
  {
    id: 'ember',
    nameEn: 'Ember',
    nameAr: 'الجمر',
    swatches: ['#280905', '#740A03', '#C3110C', '#E6501B'],
    primary: '#C3110C',
    primaryDark: '#740A03',
    secondary: '#E6501B',
    background: '#fff8f7',
    paper: '#ffffff',
    drawerGradient: 'linear-gradient(135deg, #740A03 0%, #C3110C 100%)',
  },
  {
    id: 'navy',
    nameEn: 'Navy',
    nameAr: 'الكحلي',
    swatches: ['#19183B', '#708993', '#A1C2BD', '#E7F2EF'],
    primary: '#708993',
    primaryDark: '#19183B',
    secondary: '#A1C2BD',
    background: '#E7F2EF',
    paper: '#f4faf9',
    drawerGradient: 'linear-gradient(135deg, #19183B 0%, #708993 100%)',
  },
  {
    id: 'slate',
    nameEn: 'Slate',
    nameAr: 'الصخري',
    swatches: ['#0F0E0E', '#541212', '#468A9A', '#EEEEEE'],
    primary: '#468A9A',
    primaryDark: '#2f6676',
    secondary: '#541212',
    background: '#EEEEEE',
    paper: '#f8f8f8',
    drawerGradient: 'linear-gradient(135deg, #541212 0%, #468A9A 100%)',
  },
  {
    id: 'royal',
    nameEn: 'Royal',
    nameAr: 'الملكي',
    swatches: ['#213555', '#3E5879', '#D8C4B6', '#F5EFE7'],
    primary: '#3E5879',
    primaryDark: '#213555',
    secondary: '#D8C4B6',
    background: '#F5EFE7',
    paper: '#fdfaf7',
    drawerGradient: 'linear-gradient(135deg, #213555 0%, #3E5879 100%)',
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

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const stored = localStorage.getItem(STORAGE_KEY);
  const initial = PALETTES.find(p => p.id === stored) ?? PALETTES[0];
  const [palette, setPalette] = useState<AppPalette>(initial);

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
