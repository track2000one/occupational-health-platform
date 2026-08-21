import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, TextField, InputAdornment,
  MenuItem, Dialog, DialogTitle, DialogContent, DialogActions, Avatar,
} from '@mui/material';
import { Grid } from '@mui/material';
import {
  LocalHospital as HospitalIcon, Add as AddIcon, Search as SearchIcon,
  MedicalServices as MedIcon,
} from '@mui/icons-material';
import { toast } from 'sonner';
import { mockClinicVisits, mockEmployees, type ClinicVisit } from '../data/mockData';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../data/roles';

export function ClinicVisitsPage() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const isRtl = i18n.language === 'ar';

  const [visits, setVisits] = useState<ClinicVisit[]>(mockClinicVisits);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    employeeId: '', visitDate: '', clinicType: '', diagnosis: '',
    actionTaken: '', sickLeaveDays: '', followUpDate: '', doctorName: '', notes: '',
  });

  const filtered = visits.filter(v => {
    const matchSearch = v.employeeName.toLowerCase().includes(search.toLowerCase()) ||
      v.diagnosis.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === 'all' || v.clinicType === filterType;
    return matchSearch && matchType;
  });

  function handleSave() {
    if (!form.employeeId || !form.visitDate || !form.diagnosis) {
      toast.error(isRtl ? 'يرجى تعبئة الحقول المطلوبة' : 'Please fill required fields');
      return;
    }
    const emp = mockEmployees.find(e => e.id === form.employeeId);
    const newVisit: ClinicVisit = {
      id: `CV-${Date.now()}`,
      employeeId: form.employeeId,
      employeeName: emp?.name ?? form.employeeId,
      visitDate: form.visitDate,
      clinicType: form.clinicType || 'Employee Clinic',
      diagnosis: form.diagnosis,
      actionTaken: form.actionTaken,
      sickLeaveDays: form.sickLeaveDays ? Number(form.sickLeaveDays) : undefined,
      followUpDate: form.followUpDate || undefined,
      doctorName: form.doctorName || (isRtl ? 'الطبيب المعالج' : 'Attending Doctor'),
      notes: form.notes,
    };
    setVisits(prev => [newVisit, ...prev]);
    setDialogOpen(false);
    setForm({ employeeId: '', visitDate: '', clinicType: '', diagnosis: '', actionTaken: '', sickLeaveDays: '', followUpDate: '', doctorName: '', notes: '' });
    toast.success(isRtl ? 'تم تسجيل الزيارة بنجاح' : 'Visit recorded successfully');
  }

  const clinicTypes = Array.from(new Set(visits.map(v => v.clinicType)));

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <HospitalIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">
              {isRtl ? 'زيارات العيادة' : 'Clinic Visits'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {isRtl ? 'تسجيل ومتابعة زيارات العيادة' : 'Record and track clinic visits'}
            </Typography>
          </Box>
        </Box>
        {can(PERMISSIONS.CREATE_CLINIC_VISIT) && (
          <Button variant="contained" startIcon={<AddIcon />}
            onClick={() => setDialogOpen(true)}
            sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            {isRtl ? 'تسجيل زيارة' : 'Record Visit'}
          </Button>
        )}
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: isRtl ? 'إجمالي الزيارات' : 'Total Visits', value: visits.length, color: 'primary.main' },
          { label: isRtl ? 'هذا الشهر' : 'This Month', value: visits.filter(v => v.visitDate.startsWith('2024-02')).length, color: 'info.main' },
          { label: isRtl ? 'إجازات مرضية' : 'Sick Leave Days', value: visits.reduce((sum, v) => sum + (v.sickLeaveDays ?? 0), 0), color: 'warning.main' },
          { label: isRtl ? 'تتطلب متابعة' : 'Need Follow-up', value: visits.filter(v => v.followUpDate).length, color: 'error.main' },
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
            <TextField fullWidth placeholder={(isRtl ? 'بحث باسم الموظف أو التشخيص' : 'Search employee or diagnosis') + '...'}
              value={search} onChange={e => setSearch(e.target.value)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }} />
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <TextField fullWidth select label={isRtl ? 'نوع العيادة' : 'Clinic Type'} value={filterType}
              onChange={e => setFilterType(e.target.value)}>
              <MenuItem value="all">{isRtl ? 'جميع الأنواع' : 'All Types'}</MenuItem>
              {clinicTypes.map(ct => <MenuItem key={ct} value={ct}>{ct}</MenuItem>)}
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'رقم الزيارة' : 'Visit ID'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('employeeName')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'تاريخ الزيارة' : 'Visit Date'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'نوع العيادة' : 'Clinic Type'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('diagnosis')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'أيام الإجازة' : 'Sick Leave'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'المتابعة' : 'Follow-up'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'الطبيب' : 'Doctor'}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map(visit => (
              <TableRow key={visit.id} hover>
                <TableCell><Typography variant="body2" fontFamily="monospace">{visit.id}</Typography></TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Avatar sx={{ width: 30, height: 30, bgcolor: 'primary.light', fontSize: '0.8rem' }}>
                      {visit.employeeName.charAt(0)}
                    </Avatar>
                    <Typography variant="body2" fontWeight="medium">{visit.employeeName}</Typography>
                  </Box>
                </TableCell>
                <TableCell>{visit.visitDate}</TableCell>
                <TableCell>
                  <Chip label={visit.clinicType} size="small" variant="outlined" />
                </TableCell>
                <TableCell><Typography variant="body2" sx={{ maxWidth: 200 }}>{visit.diagnosis}</Typography></TableCell>
                <TableCell>
                  {visit.sickLeaveDays
                    ? <Chip label={`${visit.sickLeaveDays} ${isRtl ? 'أيام' : 'days'}`} size="small" color="warning" />
                    : <Typography variant="body2" color="text.secondary">—</Typography>}
                </TableCell>
                <TableCell>
                  {visit.followUpDate
                    ? <Typography variant="body2" color="info.main">{visit.followUpDate}</Typography>
                    : <Typography variant="body2" color="text.secondary">—</Typography>}
                </TableCell>
                <TableCell><Typography variant="body2">{visit.doctorName}</Typography></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle component="div">
          <Typography variant="h6" component="span" fontWeight="bold">
            {isRtl ? 'تسجيل زيارة جديدة' : 'Record New Clinic Visit'}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth select required label={isRtl ? 'الموظف' : 'Employee'}
                value={form.employeeId} onChange={e => setForm(p => ({ ...p, employeeId: e.target.value }))}>
                <MenuItem value="">{isRtl ? 'اختر موظفاً' : 'Select Employee'}</MenuItem>
                {mockEmployees.map(emp => <MenuItem key={emp.id} value={emp.id}>{emp.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth required label={isRtl ? 'تاريخ الزيارة' : 'Visit Date'} type="date"
                value={form.visitDate} onChange={e => setForm(p => ({ ...p, visitDate: e.target.value }))}
                slotProps={{ inputLabel: { shrink: true } }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth select label={isRtl ? 'نوع العيادة' : 'Clinic Type'}
                value={form.clinicType} onChange={e => setForm(p => ({ ...p, clinicType: e.target.value }))}>
                <MenuItem value="Employee Clinic">Employee Clinic</MenuItem>
                <MenuItem value="Occupational Health">Occupational Health</MenuItem>
                <MenuItem value="Emergency">Emergency</MenuItem>
                <MenuItem value="Specialist">Specialist</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label={isRtl ? 'اسم الطبيب' : 'Doctor Name'}
                value={form.doctorName} onChange={e => setForm(p => ({ ...p, doctorName: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth required multiline rows={2} label={t('diagnosis')}
                value={form.diagnosis} onChange={e => setForm(p => ({ ...p, diagnosis: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth multiline rows={2} label={isRtl ? 'الإجراء المتخذ' : 'Action Taken'}
                value={form.actionTaken} onChange={e => setForm(p => ({ ...p, actionTaken: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label={isRtl ? 'أيام الإجازة المرضية' : 'Sick Leave Days'} type="number"
                value={form.sickLeaveDays} onChange={e => setForm(p => ({ ...p, sickLeaveDays: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label={isRtl ? 'تاريخ المتابعة' : 'Follow-up Date'} type="date"
                value={form.followUpDate} onChange={e => setForm(p => ({ ...p, followUpDate: e.target.value }))}
                slotProps={{ inputLabel: { shrink: true } }} />
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
