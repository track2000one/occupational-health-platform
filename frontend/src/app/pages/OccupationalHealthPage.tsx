import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, TextField, InputAdornment,
  MenuItem, Dialog, DialogTitle, DialogContent, DialogActions, Alert,
} from '@mui/material';
import { Grid } from '@mui/material';
import {
  HealthAndSafety as OhIcon, Add as AddIcon, Search as SearchIcon,
  CheckCircle as CheckIcon, Warning as WarnIcon,
} from '@mui/icons-material';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../data/roles';
import { EmployeeQuickSearch, type EmployeeSearchOption } from '../components/EmployeeQuickSearch';

interface OhAssessment {
  id: string;
  employeeId: string;
  employeeName: string;
  assessmentDate: string;
  assessmentType: string;
  fitnessDecision: 'fit' | 'fitWithRestrictions' | 'temporarilyUnfit' | 'permanentlyUnfit';
  restrictions?: string;
  nextAssessmentDate?: string;
  assessorName: string;
  notes?: string;
}

const MOCK_ASSESSMENTS: OhAssessment[] = [
  { id: 'OHA-001', employeeId: '1001', employeeName: 'Ahmed Abdullah', assessmentDate: '2024-01-15', assessmentType: 'Pre-employment', fitnessDecision: 'fit', nextAssessmentDate: '2025-01-15', assessorName: 'Dr. Khalid Mansour' },
  { id: 'OHA-002', employeeId: '1002', employeeName: 'Fatima Hassan', assessmentDate: '2024-02-01', assessmentType: 'Periodic', fitnessDecision: 'fitWithRestrictions', restrictions: 'No heavy lifting', nextAssessmentDate: '2024-08-01', assessorName: 'Dr. Khalid Mansour' },
  { id: 'OHA-003', employeeId: '1003', employeeName: 'Mohammed Ali', assessmentDate: '2024-01-20', assessmentType: 'Return to Work', fitnessDecision: 'fit', assessorName: 'Dr. Sarah Mohammed' },
];

const FITNESS_COLORS = { fit: 'success', fitWithRestrictions: 'warning', temporarilyUnfit: 'info', permanentlyUnfit: 'error' } as const;
const FITNESS_LABELS_EN = { fit: 'Fit', fitWithRestrictions: 'Fit with Restrictions', temporarilyUnfit: 'Temporarily Unfit', permanentlyUnfit: 'Permanently Unfit' };
const FITNESS_LABELS_AR = { fit: 'لائق', fitWithRestrictions: 'لائق مع قيود', temporarilyUnfit: 'غير لائق مؤقتاً', permanentlyUnfit: 'غير لائق دائماً' };

const EMPTY_ASSESSMENT_FORM = {
  employeeId: '', employeeName: '', assessmentDate: '', assessmentType: '',
  fitnessDecision: 'fit' as OhAssessment['fitnessDecision'],
  restrictions: '', nextAssessmentDate: '', assessorName: '', notes: '',
};

export function OccupationalHealthPage() {
  const { i18n } = useTranslation();
  const { can } = useAuth();
  const isRtl = i18n.language === 'ar';

  const [assessments, setAssessments] = useState<OhAssessment[]>(MOCK_ASSESSMENTS);
  const [search, setSearch] = useState('');
  const [filterDecision, setFilterDecision] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_ASSESSMENT_FORM);

  const filtered = assessments.filter(a => {
    const matchSearch = a.employeeName.toLowerCase().includes(search.toLowerCase());
    const matchDecision = filterDecision === 'all' || a.fitnessDecision === filterDecision;
    return matchSearch && matchDecision;
  });

  function handleEmployeeSelect(employeeId: string, employee: EmployeeSearchOption | null) {
    setForm(prev => ({ ...prev, employeeId, employeeName: employee?.name || '' }));
  }

  function handleSave() {
    if (!form.employeeId || !form.assessmentDate) {
      toast.error(isRtl ? 'يرجى تعبئة الحقول المطلوبة' : 'Please fill required fields');
      return;
    }
    const newAssessment: OhAssessment = {
      id: `OHA-${Date.now()}`,
      employeeId: form.employeeId,
      employeeName: form.employeeName || form.employeeId,
      assessmentDate: form.assessmentDate,
      assessmentType: form.assessmentType || 'Periodic',
      fitnessDecision: form.fitnessDecision,
      restrictions: form.restrictions || undefined,
      nextAssessmentDate: form.nextAssessmentDate || undefined,
      assessorName: form.assessorName || (isRtl ? 'طبيب الصحة المهنية' : 'OH Physician'),
      notes: form.notes,
    };
    setAssessments(prev => [newAssessment, ...prev]);
    setDialogOpen(false);
    setForm(EMPTY_ASSESSMENT_FORM);
    toast.success(isRtl ? 'تم تسجيل تقييم الصحة المهنية' : 'OH assessment recorded');
  }

  const fitCount = assessments.filter(a => a.fitnessDecision === 'fit').length;
  const restrictedCount = assessments.filter(a => a.fitnessDecision === 'fitWithRestrictions').length;
  const unfitCount = assessments.filter(a => a.fitnessDecision === 'temporarilyUnfit' || a.fitnessDecision === 'permanentlyUnfit').length;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <OhIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">
              {isRtl ? 'الصحة المهنية' : 'Occupational Health'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {isRtl ? 'تقييمات اللياقة للعمل وقرارات الصحة المهنية' : 'Fitness for work assessments and OH decisions'}
            </Typography>
          </Box>
        </Box>
        {can(PERMISSIONS.CREATE_OH_VISIT) && (
          <Button variant="contained" startIcon={<AddIcon />}
            onClick={() => setDialogOpen(true)}
            sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            {isRtl ? 'تقييم جديد' : 'New Assessment'}
          </Button>
        )}
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        {isRtl
          ? 'تقييمات الصحة المهنية تحدد مدى لياقة الموظف للعمل. يجب إجراؤها بشكل دوري.'
          : 'Occupational health assessments determine fitness for work and must be conducted periodically.'}
      </Alert>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: isRtl ? 'إجمالي التقييمات' : 'Total Assessments', value: assessments.length, color: 'primary.main' },
          { label: isRtl ? 'لائق' : 'Fit for Work', value: fitCount, color: 'success.main', icon: <CheckIcon /> },
          { label: isRtl ? 'لائق مع قيود' : 'With Restrictions', value: restrictedCount, color: 'warning.main' },
          { label: isRtl ? 'غير لائق' : 'Unfit', value: unfitCount, color: 'error.main', icon: <WarnIcon /> },
        ].map(s => (
          <Grid key={s.label} size={{ xs: 6, sm: 3 }}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4" fontWeight="bold" color={s.color}>{s.value}</Typography>
              <Typography variant="body2" color="text.secondary">{s.label}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 7 }}>
            <TextField fullWidth placeholder={(isRtl ? 'بحث باسم الموظف' : 'Search employee') + '...'}
              value={search} onChange={e => setSearch(e.target.value)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }} />
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <TextField fullWidth select label={isRtl ? 'قرار اللياقة' : 'Fitness Decision'} value={filterDecision}
              onChange={e => setFilterDecision(e.target.value)}>
              <MenuItem value="all">{isRtl ? 'الكل' : 'All'}</MenuItem>
              {Object.entries(FITNESS_LABELS_EN).map(([key, label]) => (
                <MenuItem key={key} value={key}>{isRtl ? FITNESS_LABELS_AR[key as keyof typeof FITNESS_LABELS_AR] : label}</MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'رقم' : 'ID'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'الموظف' : 'Employee'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'تاريخ التقييم' : 'Assessment Date'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'نوع التقييم' : 'Type'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'قرار اللياقة' : 'Fitness Decision'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'القيود' : 'Restrictions'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'التقييم القادم' : 'Next Assessment'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'المقيِّم' : 'Assessor'}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map(assessment => (
              <TableRow key={assessment.id} hover>
                <TableCell><Typography variant="body2" fontFamily="monospace">{assessment.id}</Typography></TableCell>
                <TableCell><Typography variant="body2" fontWeight="medium">{assessment.employeeName}</Typography></TableCell>
                <TableCell>{assessment.assessmentDate}</TableCell>
                <TableCell><Chip label={assessment.assessmentType} size="small" variant="outlined" /></TableCell>
                <TableCell><Chip label={isRtl ? FITNESS_LABELS_AR[assessment.fitnessDecision] : FITNESS_LABELS_EN[assessment.fitnessDecision]} size="small" color={FITNESS_COLORS[assessment.fitnessDecision]} /></TableCell>
                <TableCell><Typography variant="body2" color={assessment.restrictions ? 'warning.main' : 'text.secondary'}>{assessment.restrictions ?? '—'}</Typography></TableCell>
                <TableCell>{assessment.nextAssessmentDate ? <Typography variant="body2" color="info.main">{assessment.nextAssessmentDate}</Typography> : <Typography variant="body2" color="text.secondary">—</Typography>}</TableCell>
                <TableCell><Typography variant="body2">{assessment.assessorName}</Typography></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle component="div">
          <Typography variant="h6" component="span" fontWeight="bold">
            {isRtl ? 'تسجيل تقييم الصحة المهنية' : 'Record OH Assessment'}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <EmployeeQuickSearch
                required
                value={form.employeeId}
                onChange={handleEmployeeSelect}
                label={isRtl ? 'بحث الموظف' : 'Employee quick search'}
                helperText={isRtl ? 'بحث بالاسم أو الهوية أو الرقم الوظيفي أو الجوال' : 'Search by name, ID, employee number, or mobile'}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth required label={isRtl ? 'تاريخ التقييم' : 'Assessment Date'} type="date"
                value={form.assessmentDate} onChange={e => setForm(p => ({ ...p, assessmentDate: e.target.value }))}
                slotProps={{ inputLabel: { shrink: true } }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth select label={isRtl ? 'نوع التقييم' : 'Assessment Type'}
                value={form.assessmentType} onChange={e => setForm(p => ({ ...p, assessmentType: e.target.value }))}>
                {['Pre-employment', 'Periodic', 'Return to Work', 'Special', 'Exit'].map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth select required label={isRtl ? 'قرار اللياقة' : 'Fitness Decision'}
                value={form.fitnessDecision} onChange={e => setForm(p => ({ ...p, fitnessDecision: e.target.value as OhAssessment['fitnessDecision'] }))}>
                {Object.entries(FITNESS_LABELS_EN).map(([key, label]) => (
                  <MenuItem key={key} value={key}>{isRtl ? FITNESS_LABELS_AR[key as keyof typeof FITNESS_LABELS_AR] : label}</MenuItem>
                ))}
              </TextField>
            </Grid>
            {form.fitnessDecision === 'fitWithRestrictions' && (
              <Grid size={{ xs: 12 }}>
                <TextField fullWidth label={isRtl ? 'القيود' : 'Restrictions'} value={form.restrictions}
                  onChange={e => setForm(p => ({ ...p, restrictions: e.target.value }))} />
              </Grid>
            )}
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label={isRtl ? 'التقييم القادم' : 'Next Assessment Date'} type="date"
                value={form.nextAssessmentDate} onChange={e => setForm(p => ({ ...p, nextAssessmentDate: e.target.value }))}
                slotProps={{ inputLabel: { shrink: true } }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label={isRtl ? 'اسم المقيِّم' : 'Assessor Name'}
                value={form.assessorName} onChange={e => setForm(p => ({ ...p, assessorName: e.target.value }))} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{isRtl ? 'إلغاء' : 'Cancel'}</Button>
          <Button variant="contained" onClick={handleSave}>{isRtl ? 'حفظ' : 'Save'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
