import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import {
  AccessibilityNew as AccessibilityIcon,
  CheckCircle as CheckCircleIcon,
  ColorLens as ColorLensIcon,
  FormatColorText as FormatColorTextIcon,
  FormatLineSpacing as LineSpacingIcon,
  FormatSize as FormatSizeIcon,
  Palette as PaletteIcon,
  RestartAlt as RestartAltIcon,
  SettingsSuggest as SettingsSuggestIcon,
  TextFields as TextFieldsIcon,
} from '@mui/icons-material';
import {
  FONT_OPTIONS,
  PALETTES,
  useAppTheme,
  type AppTypographySettings,
} from '../context/ThemeContext';

const TEXT_COLORS = ['#111827', '#1F2937', '#1D344D', '#0B5D59', '#173B57'];

function luminance(hex: string) {
  const rgb = hex.replace('#', '').match(/.{2}/g)?.map(value => Number.parseInt(value, 16) / 255) ?? [0, 0, 0];
  const linear = rgb.map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrastRatio(foreground: string, background: string) {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

function SettingHeading({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 2 }}>
      <Box sx={{ width: 42, height: 42, display: 'grid', placeItems: 'center', borderRadius: 2.5, bgcolor: 'primary.main', color: 'white' }}>
        {icon}
      </Box>
      <Box>
        <Typography variant="h6" fontWeight={850}>{title}</Typography>
        <Typography variant="body2" color="text.secondary">{description}</Typography>
      </Box>
    </Stack>
  );
}

export function AppearanceSettingsPage() {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';
  const {
    palette,
    setPaletteId,
    typography,
    updateTypography,
    resetTypography,
  } = useAppTheme();
  const [colorInput, setColorInput] = useState(typography.textColor);

  useEffect(() => setColorInput(typography.textColor), [typography.textColor]);

  const minimumContrast = useMemo(
    () => Math.min(contrastRatio(typography.textColor, palette.paper), contrastRatio(typography.textColor, palette.background)),
    [typography.textColor, palette.paper, palette.background],
  );

  const colorIsReadable = (color: string) => (
    /^#[0-9a-f]{6}$/i.test(color)
    && Math.min(contrastRatio(color, palette.paper), contrastRatio(color, palette.background)) >= 4.5
  );

  const chooseColor = (color: string) => {
    setColorInput(color);
    if (colorIsReadable(color)) updateTypography({ textColor: color });
  };

  const update = <K extends keyof AppTypographySettings>(key: K, value: AppTypographySettings[K]) => {
    updateTypography({ [key]: value });
  };

  return (
    <Box sx={{ direction: isRtl ? 'rtl' : 'ltr' }}>
      <Paper
        sx={{
          p: { xs: 2.25, md: 3 },
          mb: 3,
          color: 'white',
          overflow: 'hidden',
          position: 'relative',
          background: palette.drawerGradient,
        }}
      >
        <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center">
            <Box sx={{ width: 52, height: 52, display: 'grid', placeItems: 'center', borderRadius: 3, bgcolor: 'rgba(255,255,255,.16)', border: '1px solid rgba(255,255,255,.28)' }}>
              <SettingsSuggestIcon fontSize="large" />
            </Box>
            <Box sx={{ textAlign: isRtl ? 'right' : 'left' }}>
              <Typography variant="h4" sx={{ color: 'white', fontWeight: 900 }}>
                {isRtl ? 'إعدادات المظهر والقراءة' : 'Appearance & Reading Settings'}
              </Typography>
              <Typography sx={{ mt: .5, opacity: .92 }}>
                {isRtl ? 'خصص الخط والحجم والألوان بما يناسب راحتك أثناء استخدام المنصة.' : 'Personalize typography and colors for comfortable daily use.'}
              </Typography>
            </Box>
          </Stack>
          <Button
            variant="contained"
            color="inherit"
            startIcon={<RestartAltIcon />}
            onClick={resetTypography}
            sx={{ color: palette.primaryDark, bgcolor: 'white', flexShrink: 0 }}
          >
            {isRtl ? 'استعادة الافتراضي' : 'Restore Defaults'}
          </Button>
        </Stack>
      </Paper>

      <Alert severity="success" icon={<CheckCircleIcon />} sx={{ mb: 3 }}>
        {isRtl ? 'تُطبّق التغييرات مباشرة وتُحفظ تلقائيًا على هذا الجهاز.' : 'Changes apply immediately and are saved automatically on this device.'}
      </Alert>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Stack spacing={2.5}>
            <Paper sx={{ p: { xs: 2, md: 2.75 } }}>
              <SettingHeading
                icon={<PaletteIcon />}
                title={isRtl ? 'الهوية اللونية' : 'Color Theme'}
                description={isRtl ? 'اختر هوية رسمية مناسبة لبيئة العمل الصحية.' : 'Choose an official theme suited to healthcare work.'}
              />
              <Grid container spacing={1.5}>
                {PALETTES.map(option => {
                  const selected = option.id === palette.id;
                  return (
                    <Grid key={option.id} size={{ xs: 12, sm: 6 }}>
                      <Paper
                        variant="outlined"
                        onClick={() => setPaletteId(option.id)}
                        sx={{
                          p: 1.5,
                          cursor: 'pointer',
                          borderWidth: selected ? 2 : 1,
                          borderColor: selected ? option.primary : 'divider',
                          bgcolor: selected ? `${option.primary}0D` : 'background.paper',
                          boxShadow: selected ? `0 8px 20px ${option.primary}1F` : 'none',
                        }}
                      >
                        <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={1.25} alignItems="center" justifyContent="space-between">
                          <Box sx={{ textAlign: isRtl ? 'right' : 'left' }}>
                            <Typography fontWeight={850}>{isRtl ? option.nameAr : option.nameEn}</Typography>
                            <Stack direction="row" spacing={.5} sx={{ mt: .75 }}>
                              {option.swatches.map(color => <Box key={color} sx={{ width: 17, height: 17, borderRadius: '50%', bgcolor: color, border: '1px solid rgba(15,23,42,.12)' }} />)}
                            </Stack>
                          </Box>
                          {selected && <CheckCircleIcon sx={{ color: option.primary }} />}
                        </Stack>
                      </Paper>
                    </Grid>
                  );
                })}
              </Grid>
            </Paper>

            <Paper sx={{ p: { xs: 2, md: 2.75 } }}>
              <SettingHeading
                icon={<TextFieldsIcon />}
                title={isRtl ? 'إعدادات الخط' : 'Typography'}
                description={isRtl ? 'تحكم في نوع الخط وحجمه وسماكته وتباعد الأسطر.' : 'Control font family, size, weight, and line spacing.'}
              />
              <Grid container spacing={2.5}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel>{isRtl ? 'نوع الخط' : 'Font Family'}</InputLabel>
                    <Select
                      value={typography.fontId}
                      label={isRtl ? 'نوع الخط' : 'Font Family'}
                      onChange={event => update('fontId', event.target.value as AppTypographySettings['fontId'])}
                    >
                      {FONT_OPTIONS.map(font => <MenuItem key={font.id} value={font.id}>{isRtl ? font.nameAr : font.nameEn}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel>{isRtl ? 'سماكة الخط' : 'Font Weight'}</InputLabel>
                    <Select
                      value={typography.fontWeight}
                      label={isRtl ? 'سماكة الخط' : 'Font Weight'}
                      onChange={event => update('fontWeight', Number(event.target.value) as AppTypographySettings['fontWeight'])}
                    >
                      <MenuItem value={400}>{isRtl ? 'عادي' : 'Regular'}</MenuItem>
                      <MenuItem value={500}>{isRtl ? 'متوسط' : 'Medium'}</MenuItem>
                      <MenuItem value={600}>{isRtl ? 'شبه عريض' : 'Semi Bold'}</MenuItem>
                      <MenuItem value={700}>{isRtl ? 'عريض' : 'Bold'}</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: .5 }}>
                    <FormatSizeIcon color="primary" />
                    <Typography fontWeight={800}>{isRtl ? 'حجم الخط' : 'Font Size'}</Typography>
                    <Chip size="small" label={`${typography.fontSize}px`} color="primary" variant="outlined" />
                  </Stack>
                  <Slider
                    value={typography.fontSize}
                    min={14}
                    max={20}
                    step={1}
                    marks={[14, 16, 18, 20].map(value => ({ value, label: String(value) }))}
                    onChange={(_, value) => update('fontSize', value as number)}
                    valueLabelDisplay="auto"
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: .5 }}>
                    <LineSpacingIcon color="primary" />
                    <Typography fontWeight={800}>{isRtl ? 'تباعد الأسطر' : 'Line Spacing'}</Typography>
                    <Chip size="small" label={typography.lineHeight.toFixed(2)} color="primary" variant="outlined" />
                  </Stack>
                  <Slider
                    value={typography.lineHeight}
                    min={1.35}
                    max={1.9}
                    step={.05}
                    marks={[1.35, 1.55, 1.75, 1.9].map(value => ({ value, label: String(value) }))}
                    onChange={(_, value) => update('lineHeight', value as number)}
                    valueLabelDisplay="auto"
                  />
                </Grid>
              </Grid>
            </Paper>

            <Paper sx={{ p: { xs: 2, md: 2.75 } }}>
              <SettingHeading
                icon={<FormatColorTextIcon />}
                title={isRtl ? 'لون النص ووضوحه' : 'Text Color & Readability'}
                description={isRtl ? 'اختر لونًا داكنًا مريحًا مع فحص تلقائي للتباين.' : 'Choose a comfortable dark color with automatic contrast checking.'}
              />
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
                {TEXT_COLORS.map(color => (
                  <Box
                    key={color}
                    onClick={() => chooseColor(color)}
                    aria-label={color}
                    sx={{
                      width: 42,
                      height: 42,
                      borderRadius: 2.25,
                      bgcolor: color,
                      cursor: 'pointer',
                      border: typography.textColor.toLowerCase() === color.toLowerCase() ? `3px solid ${palette.primary}` : '3px solid white',
                      outline: '1px solid rgba(148,163,184,.45)',
                      boxShadow: typography.textColor.toLowerCase() === color.toLowerCase() ? `0 0 0 3px ${palette.primary}22` : 'none',
                    }}
                  />
                ))}
                <TextField
                  type="color"
                  label={isRtl ? 'لون مخصص' : 'Custom Color'}
                  value={colorInput}
                  onChange={event => chooseColor(event.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 120, '& input': { height: 22, cursor: 'pointer' } }}
                />
              </Stack>
              {!colorIsReadable(colorInput) && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  {isRtl ? 'لم يُطبّق اللون لأنه لا يحقق تباينًا كافيًا مع خلفية المنصة.' : 'This color was not applied because it lacks sufficient contrast.'}
                </Alert>
              )}
              <Chip
                icon={<AccessibilityIcon />}
                color={minimumContrast >= 7 ? 'success' : 'primary'}
                variant="outlined"
                label={isRtl ? `نسبة التباين ${minimumContrast.toFixed(1)}:1` : `Contrast ${minimumContrast.toFixed(1)}:1`}
              />
              <Divider sx={{ my: 2.25 }} />
              <Grid container spacing={1.5}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Paper variant="outlined" sx={{ px: 1.75, py: 1 }}>
                    <FormControlLabel
                      control={<Switch checked={typography.highContrast} onChange={event => update('highContrast', event.target.checked)} />}
                      label={isRtl ? 'تباين عالٍ للحدود والنصوص' : 'High contrast borders and text'}
                    />
                  </Paper>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Paper variant="outlined" sx={{ px: 1.75, py: 1 }}>
                    <FormControlLabel
                      control={<Switch checked={typography.reduceMotion} onChange={event => update('reduceMotion', event.target.checked)} />}
                      label={isRtl ? 'تقليل الحركة والمؤثرات' : 'Reduce motion and effects'}
                    />
                  </Paper>
                </Grid>
              </Grid>
            </Paper>
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper sx={{ p: { xs: 2, md: 2.5 }, position: { lg: 'sticky' }, top: { lg: 92 } }}>
            <SettingHeading
              icon={<ColorLensIcon />}
              title={isRtl ? 'معاينة مباشرة' : 'Live Preview'}
              description={isRtl ? 'مثال على شكل النص بالإعدادات الحالية.' : 'A sample using your current settings.'}
            />
            <Box
              sx={{
                p: 2.5,
                borderRadius: 3,
                bgcolor: palette.paper,
                color: typography.textColor,
                border: `1px solid ${palette.primary}35`,
                boxShadow: `inset 0 0 0 1px ${palette.primary}0D`,
              }}
            >
              <Typography variant="overline" color="primary.main" fontWeight={850}>
                {isRtl ? 'منصة الصحة المهنية' : 'Occupational Health'}
              </Typography>
              <Typography variant="h5" sx={{ mt: .75, color: typography.textColor }}>
                {isRtl ? 'سهولة القراءة تبدأ بخط واضح' : 'Comfort starts with clear typography'}
              </Typography>
              <Typography sx={{ mt: 1.5, color: typography.textColor, fontWeight: typography.fontWeight, lineHeight: typography.lineHeight }}>
                {isRtl
                  ? 'يمكنك الآن تخصيص نوع الخط وحجمه ولونه وتباعد الأسطر لتصبح تجربة الاستخدام اليومية أكثر وضوحًا وراحة.'
                  : 'You can now customize the font, size, color, and line spacing for a clearer daily experience.'}
              </Typography>
              <Divider sx={{ my: 2 }} />
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Chip label={isRtl ? 'سجل موظف' : 'Employee Record'} color="primary" />
                <Chip label={isRtl ? 'زيارة مكتملة' : 'Completed Visit'} color="success" variant="outlined" />
              </Stack>
            </Box>
            <Stack spacing={1.1} sx={{ mt: 2 }}>
              <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">{isRtl ? 'الخط' : 'Font'}</Typography><Typography fontWeight={850}>{isRtl ? FONT_OPTIONS.find(font => font.id === typography.fontId)?.nameAr : FONT_OPTIONS.find(font => font.id === typography.fontId)?.nameEn}</Typography></Stack>
              <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">{isRtl ? 'الحجم' : 'Size'}</Typography><Typography fontWeight={850}>{typography.fontSize}px</Typography></Stack>
              <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">{isRtl ? 'السماكة' : 'Weight'}</Typography><Typography fontWeight={850}>{typography.fontWeight}</Typography></Stack>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
