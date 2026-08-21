import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, TextField, InputAdornment,
  MenuItem, LinearProgress, Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import { Grid } from '@mui/material';
import {
  Search as SearchIcon, Add as AddIcon, Vaccines as VaccinesIcon,
} from '@mui/icons-material';
import { toast } from 'sonner';
import { mockVaccinations, mockEmployees, type Vaccination } from '../data/mockData';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../data/roles';

export function VaccinationsPage() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const isRtl = i18n.language === 'ar';

  const [vaccinations, setVaccinations] = useState<Vaccination[]>(mockVaccinations);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterVaccine, setFilterVaccine] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    employeeId: '', vaccineType: '', doseNumber: '1' as '1' | '2' | '3',
    doseDate: '', nextDueDate: '', notes: '',
  });

  const filteredVaccinations = vaccinations.filter(vac => {
    const matchesSearch = vac.employeeName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesVaccine = filterVaccine === 'all' || vac.vaccineType === filterVaccine;
    return matchesSearch && matchesVaccine;
  });

  function getStatusColor(status: string) {
    switch (status) {
      case 'immune': return 'success';
      case 'dose3': return 'info';
      case 'dose2': return 'primary';
      case 'dose1': return 'warning';
      case 'refused': return 'error';
      case 'contraindicated': return 'default';
      default: return 'default';
    }
  }

  function getDoseProgress(status: string) {
    switch (status) {
      case 'immune': return 100;
      case 'dose3': return 100;
      case 'dose2': return 66;
      case 'dose1': return 33;
      default: return 0;
    }
  }

  function handleSave() {
    if (!form.employeeId || !form.vaccineType || !form.doseDate) {
      toast.error(isRtl ? 'يرجى تعبئة الحقول المطلوبة' : 'Please fill required fields');
      return;
    }
    const emp = mockEmployees.find(e => e.id === form.employeeId);
    const doseNum = Number(form.doseNumber) as 1 | 2 | 3;
    const doseStatus = doseNum === 1 ? 'dose1' : doseNum === 2 ? 'dose2' : 'dose3';
    const newVac: Vaccination = {
      id: `VAC-${Date.now()}`,
      employeeId: form.employeeId,
      employeeName: emp?.name ?? form.employeeId,
      vaccineType: form.vaccineType,
      doseNumber: doseNum,
      doseDate: form.doseDate,
      nextDueDate: form.nextDueDate || undefined,
      status: doseStatus as Vaccination['status'],
      notes: form.notes,
    };
    setVaccinations(prev => [newVac, ...prev]);
    setDialogOpen(false);
    setForm({ employeeId: '', vaccineType: '', doseNumber: '1', doseDate: '', nextDueDate: '', notes: '' });
    toast.success(isRtl ? 'تم تسجيل التطعيم بنجاح' : 'Vaccination recorded successfully');
  }

  const immuneCount = vaccinations.filter(v => v.status === 'immune' || v.status === 'dose3').length;
  const coverageRate = ((immuneCount / vaccinations.length) * 100).toFixed(1);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <VaccinesIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">{t('vaccinations')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {isRtl ? 'متابعة حالة التطعيم وجدولة الجرعات' : 'Track vaccination status and schedule doses'}
            </Typography>
          </Box>
        </Box>
        {can(PERMISSIONS.CREATE_VACCINATION) && (
          <Button variant="contained" startIcon={<AddIcon />}
            onClick={() => setDialogOpen(true)}
            sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            {isRtl ? 'تسجيل تطعيم' : 'Record Vaccination'}
          </Button>
        )}
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: isRtl ? 'إجمالي السجلات' : 'Total Records', value: vaccinations.length, color: 'primary.main' },
          { label: isRtl ? 'محصّنون بالكامل' : 'Fully Immunized', value: immuneCount, color: 'success.main' },
          { label: isRtl ? 'نسبة التغطية' : 'Coverage Rate', value: `${coverageRate}%`, color: 'info.main' },
          { label: isRtl ? 'سلسلة ناقصة' : 'Incomplete Series', value: vaccinations.filter(v => v.status === 'dose1' || v.status === 'dose2').length, color: 'warning.main' },
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
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField fullWidth placeholder={(isRtl ? 'بحث باسم الموظف' : 'Search employee') + '...'}
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField fullWidth select label={t('vaccineType')} value={filterVaccine}
              onChange={e => setFilterVaccine(e.target.value)}>
              <MenuItem value="all">{isRtl ? 'جميع اللقاحات' : 'All Vaccines'}</MenuItem>
              {['HBV', 'Influenza', 'Rubella', 'PPD'].map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'رقم' : 'ID'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('employeeName')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('vaccineType')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'تقدم الجرعات' : 'Dose Progress'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('vaccineStatus')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('doseDate')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('nextDueDate')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredVaccinations.map(vaccination => (
              <TableRow key={vaccination.id} hover>
                <TableCell><Typography variant="body2" fontFamily="monospace">{vaccination.id}</Typography></TableCell>
                <TableCell><Typography variant="body2" fontWeight="medium">{vaccination.employeeName}</Typography></TableCell>
                <TableCell>{vaccination.vaccineType}</TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: '100%', maxWidth: 100 }}>
                      <LinearProgress variant="determinate" value={getDoseProgress(vaccination.status)}
                        sx={{ height: 8, borderRadius: 4 }} />
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {getDoseProgress(vaccination.status)}%
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  <Chip label={t(vaccination.status)} size="small"
                    color={getStatusColor(vaccination.status) as any} />
                </TableCell>
                <TableCell>{vaccination.doseDate || '-'}</TableCell>
                <TableCell>
                  {vaccination.nextDueDate
                    ? <Typography variant="body2" color="warning.main">{vaccination.nextDueDate}</Typography>
                    : '-'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Record Vaccination Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle component="div">
          <Typography variant="h6" component="span" fontWeight="bold">
            {isRtl ? 'تسجيل تطعيم جديد' : 'Record New Vaccination'}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth select required label={isRtl ? 'الموظف' : 'Employee'}
                value={form.employeeId} onChange={e => setForm(p => ({ ...p, employeeId: e.target.value }))}>
                <MenuItem value="">{isRtl ? 'اختر موظفاً' : 'Select Employee'}</MenuItem>
                {mockEmployees.map(emp => <MenuItem key={emp.id} value={emp.id}>{emp.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth select required label={t('vaccineType')}
                value={form.vaccineType} onChange={e => setForm(p => ({ ...p, vaccineType: e.target.value }))}>
                <MenuItem value="">{isRtl ? 'اختر اللقاح' : 'Select Vaccine'}</MenuItem>
                {['HBV', 'Influenza', 'Rubella', 'PPD', 'COVID-19'].map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth select label={isRtl ? 'رقم الجرعة' : 'Dose Number'}
                value={form.doseNumber} onChange={e => setForm(p => ({ ...p, doseNumber: e.target.value as '1' | '2' | '3' }))}>
                <MenuItem value="1">{isRtl ? 'الجرعة الأولى' : 'Dose 1'}</MenuItem>
                <MenuItem value="2">{isRtl ? 'الجرعة الثانية' : 'Dose 2'}</MenuItem>
                <MenuItem value="3">{isRtl ? 'الجرعة الثالثة' : 'Dose 3'}</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth required label={isRtl ? 'تاريخ الجرعة' : 'Dose Date'} type="date"
                value={form.doseDate} onChange={e => setForm(p => ({ ...p, doseDate: e.target.value }))}
                slotProps={{ inputLabel: { shrink: true } }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label={isRtl ? 'تاريخ الجرعة القادمة' : 'Next Dose Date'} type="date"
                value={form.nextDueDate} onChange={e => setForm(p => ({ ...p, nextDueDate: e.target.value }))}
                slotProps={{ inputLabel: { shrink: true } }} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth multiline rows={2} label={t('notes')}
                value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{t('cancel')}</Button>
          <Button variant="contained" onClick={handleSave}>{isRtl ? 'تسجيل' : 'Record'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
