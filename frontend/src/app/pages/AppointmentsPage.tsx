import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Paper, Typography, Button, Chip, TextField, MenuItem,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, Grid,
  InputAdornment, IconButton, Tooltip,
} from '@mui/material';
import {
  CalendarMonth as CalendarIcon, Add as AddIcon, Search as SearchIcon,
  Edit as EditIcon, CheckCircle as ConfirmIcon, Cancel as CancelIcon,
} from '@mui/icons-material';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../data/roles';
import { mockAppointments, type Appointment } from '../data/mockData';
import { EmployeeQuickSearch, type EmployeeSearchOption } from '../components/EmployeeQuickSearch';
import { CalendarDateField } from '../components/CalendarDateField';
import { DateText } from '../context/DatePreferenceContext';

const APPT_TYPE_LABELS: Record<Appointment['appointmentType'], { ar: string; en: string; color: string }> = {
  periodicExam: { ar: 'فحص دوري', en: 'Periodic Exam', color: '#667eea' },
  vaccination: { ar: 'تطعيم', en: 'Vaccination', color: '#43e97b' },
  clinicVisit: { ar: 'زيارة عيادة', en: 'Clinic Visit', color: '#4facfe' },
  ohVisit: { ar: 'زيارة الصحة المهنية', en: 'OH Visit', color: '#f093fb' },
  needleStickFollowUp: { ar: 'متابعة وخز', en: 'NSI Follow-up', color: '#fa709a' },
  labTest: { ar: 'تحليل', en: 'Lab Test', color: '#764ba2' },
};

const STATUS_CONFIG: Record<Appointment['status'], { ar: string; en: string; color: 'default' | 'success' | 'warning' | 'error' | 'info' | 'primary' }> = {
  new: { ar: 'جديد', en: 'New', color: 'info' },
  confirmed: { ar: 'مؤكد', en: 'Confirmed', color: 'success' },
  completed: { ar: 'مكتمل', en: 'Completed', color: 'default' },
  cancelled: { ar: 'ملغي', en: 'Cancelled', color: 'error' },
  noShow: { ar: 'لم يحضر', en: 'No Show', color: 'warning' },
};

const EMPTY_APPOINTMENT_FORM = {
  employeeId: '', employeeName: '', appointmentType: '', healthCenterId: '1',
  appointmentDate: '', appointmentTime: '', assignedTo: '', notes: '',
};

export function AppointmentsPage() {
  const { i18n } = useTranslation();
  const { can } = useAuth();
  const isRtl = i18n.language === 'ar';

  const [appointments, setAppointments] = useState<Appointment[]>(mockAppointments);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [openDialog, setOpenDialog] = useState(false);
  const [editAppt, setEditAppt] = useState<Appointment | null>(null);
  const [apptForm, setApptForm] = useState(EMPTY_APPOINTMENT_FORM);

  useEffect(() => {
    if (editAppt) {
      setApptForm({
        employeeId: editAppt.employeeId,
        employeeName: editAppt.employeeName,
        appointmentType: editAppt.appointmentType,
        healthCenterId: editAppt.healthCenterId,
        appointmentDate: editAppt.appointmentDate,
        appointmentTime: editAppt.appointmentTime,
        assignedTo: editAppt.assignedTo,
        notes: editAppt.notes ?? '',
      });
    } else {
      setApptForm(EMPTY_APPOINTMENT_FORM);
    }
  }, [editAppt, openDialog]);

  const filtered = appointments.filter(a => {
    const matchSearch = a.employeeName.toLowerCase().includes(search.toLowerCase()) || a.id.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || a.status === filterStatus;
    const matchType = filterType === 'all' || a.appointmentType === filterType;
    return matchSearch && matchStatus && matchType;
  });

  function updateStatus(id: string, status: Appointment['status']) {
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status } : a));
  }

  function handleEmployeeSelect(employeeId: string, employee: EmployeeSearchOption | null) {
    setApptForm(prev => ({
      ...prev,
      employeeId,
      employeeName: employee?.name || '',
      healthCenterId: employee?.health_center ? String(employee.health_center) : prev.healthCenterId,
    }));
  }

  const stats = {
    new: appointments.filter(a => a.status === 'new').length,
    confirmed: appointments.filter(a => a.status === 'confirmed').length,
    completed: appointments.filter(a => a.status === 'completed').length,
    noShow: appointments.filter(a => a.status === 'noShow').length,
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <CalendarIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">
              {isRtl ? 'إدارة المواعيد' : 'Appointments'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {isRtl ? 'جدولة ومتابعة مواعيد الموظفين' : 'Schedule and track employee appointments'}
            </Typography>
          </Box>
        </Box>
        {can(PERMISSIONS.CREATE_CLINIC_VISIT) && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditAppt(null); setOpenDialog(true); }}
            sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            {isRtl ? 'إضافة موعد' : 'Add Appointment'}
          </Button>
        )}
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {([['new', isRtl ? 'جديد' : 'New', '#4facfe'], ['confirmed', isRtl ? 'مؤكد' : 'Confirmed', '#43e97b'], ['completed', isRtl ? 'مكتمل' : 'Completed', '#667eea'], ['noShow', isRtl ? 'لم يحضر' : 'No Show', '#fa709a']] as const).map(([key, label, color]) => (
          <Grid key={key} size={{ xs: 6, sm: 3 }}>
            <Paper sx={{ p: 2, textAlign: 'center', borderTop: `4px solid ${color}` }}>
              <Typography variant="h4" fontWeight="bold" color={color}>{stats[key]}</Typography>
              <Typography variant="body2" color="text.secondary">{label}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 5 }}>
            <TextField fullWidth size="small" placeholder={isRtl ? 'بحث بالاسم أو رقم الموعد...' : 'Search by name or ID...'}
              value={search} onChange={e => setSearch(e.target.value)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }} />
          </Grid>
          <Grid size={{ xs: 6, md: 3.5 }}>
            <TextField fullWidth select size="small" label={isRtl ? 'الحالة' : 'Status'} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <MenuItem value="all">{isRtl ? 'الكل' : 'All'}</MenuItem>
              {Object.entries(STATUS_CONFIG).map(([key, val]) => (
                <MenuItem key={key} value={key}>{isRtl ? val.ar : val.en}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 6, md: 3.5 }}>
            <TextField fullWidth select size="small" label={isRtl ? 'النوع' : 'Type'} value={filterType} onChange={e => setFilterType(e.target.value)}>
              <MenuItem value="all">{isRtl ? 'الكل' : 'All Types'}</MenuItem>
              {Object.entries(APPT_TYPE_LABELS).map(([key, val]) => (
                <MenuItem key={key} value={key}>{isRtl ? val.ar : val.en}</MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'رقم الموعد' : 'ID'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'الموظف' : 'Employee'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'النوع' : 'Type'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'التاريخ والوقت' : 'Date & Time'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'المسؤول' : 'Assigned To'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'الحالة' : 'Status'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }} align="center">{isRtl ? 'إجراءات' : 'Actions'}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((appt) => {
              const typeConf = APPT_TYPE_LABELS[appt.appointmentType];
              const statConf = STATUS_CONFIG[appt.status];
              return (
                <TableRow key={appt.id} hover>
                  <TableCell><Typography variant="body2" fontFamily="monospace">{appt.id}</Typography></TableCell>
                  <TableCell><Typography variant="body2" fontWeight="medium">{appt.employeeName}</Typography></TableCell>
                  <TableCell>
                    <Chip label={isRtl ? typeConf.ar : typeConf.en} size="small"
                      sx={{ bgcolor: `${typeConf.color}20`, color: typeConf.color, fontWeight: 600 }} />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2"><DateText value={appt.appointmentDate} /></Typography>
                    <Typography variant="caption" color="text.secondary">{appt.appointmentTime}</Typography>
                  </TableCell>
                  <TableCell><Typography variant="body2">{appt.assignedTo}</Typography></TableCell>
                  <TableCell><Chip label={isRtl ? statConf.ar : statConf.en} size="small" color={statConf.color} /></TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                      {appt.status === 'new' && (
                        <Tooltip title={isRtl ? 'تأكيد' : 'Confirm'}>
                          <IconButton size="small" color="success" onClick={() => updateStatus(appt.id, 'confirmed')}><ConfirmIcon fontSize="small" /></IconButton>
                        </Tooltip>
                      )}
                      {appt.status === 'confirmed' && (
                        <Tooltip title={isRtl ? 'تحديد كمكتمل' : 'Mark Completed'}>
                          <IconButton size="small" color="primary" onClick={() => updateStatus(appt.id, 'completed')}><ConfirmIcon fontSize="small" /></IconButton>
                        </Tooltip>
                      )}
                      {(appt.status === 'new' || appt.status === 'confirmed') && (
                        <Tooltip title={isRtl ? 'إلغاء' : 'Cancel'}>
                          <IconButton size="small" color="error" onClick={() => updateStatus(appt.id, 'cancelled')}><CancelIcon fontSize="small" /></IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title={isRtl ? 'تعديل' : 'Edit'}>
                        <IconButton size="small" color="secondary" onClick={() => { setEditAppt(appt); setOpenDialog(true); }}><EditIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle component="div">
          <Typography variant="h6" component="span">
            {editAppt ? (isRtl ? 'تعديل موعد' : 'Edit Appointment') : (isRtl ? 'إضافة موعد جديد' : 'Add New Appointment')}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <EmployeeQuickSearch
                required
                value={apptForm.employeeId}
                onChange={handleEmployeeSelect}
                label={isRtl ? 'بحث الموظف' : 'Employee quick search'}
                helperText={isRtl ? 'بحث بالاسم أو الهوية أو الرقم الوظيفي أو الجوال' : 'Search by name, ID, employee number, or mobile'}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth select label={isRtl ? 'نوع الموعد' : 'Appointment Type'}
                value={apptForm.appointmentType} onChange={e => setApptForm(p => ({ ...p, appointmentType: e.target.value }))}>
                <MenuItem value="">{isRtl ? 'اختر النوع' : 'Select Type'}</MenuItem>
                {Object.entries(APPT_TYPE_LABELS).map(([key, val]) => (
                  <MenuItem key={key} value={key}>{isRtl ? val.ar : val.en}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth select label={isRtl ? 'المركز الصحي' : 'Health Center'}
                value={apptForm.healthCenterId} onChange={e => setApptForm(p => ({ ...p, healthCenterId: e.target.value }))}>
                <MenuItem value="1">المستشفى المركزي</MenuItem>
                <MenuItem value="2">المركز الطبي الشرقي</MenuItem>
                <MenuItem value="3">العيادة الإقليمية الغربية</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <CalendarDateField label={isRtl ? 'التاريخ' : 'Date'}
                value={apptForm.appointmentDate} onChange={value => setApptForm(p => ({ ...p, appointmentDate: value }))} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label={isRtl ? 'الوقت' : 'Time'} type="time"
                value={apptForm.appointmentTime} onChange={e => setApptForm(p => ({ ...p, appointmentTime: e.target.value }))}
                slotProps={{ inputLabel: { shrink: true } }} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth label={isRtl ? 'المسؤول' : 'Assigned To'}
                value={apptForm.assignedTo} onChange={e => setApptForm(p => ({ ...p, assignedTo: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth multiline rows={2} label={isRtl ? 'ملاحظات' : 'Notes'}
                value={apptForm.notes} onChange={e => setApptForm(p => ({ ...p, notes: e.target.value }))} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>{isRtl ? 'إلغاء' : 'Cancel'}</Button>
          <Button variant="contained" onClick={() => {
            if (editAppt) {
              setAppointments(prev => prev.map(a => a.id === editAppt.id ? {
                ...a,
                ...apptForm,
                employeeName: apptForm.employeeName || a.employeeName,
                appointmentType: (apptForm.appointmentType || a.appointmentType) as Appointment['appointmentType'],
              } : a));
              toast.success(isRtl ? 'تم تحديث الموعد' : 'Appointment updated');
            } else {
              const newAppt: Appointment = {
                id: `APT-${Date.now()}`,
                employeeId: apptForm.employeeId,
                employeeName: apptForm.employeeName || (isRtl ? 'موظف' : 'Employee'),
                appointmentType: (apptForm.appointmentType || 'clinicVisit') as Appointment['appointmentType'],
                appointmentDate: apptForm.appointmentDate || new Date().toISOString().split('T')[0],
                appointmentTime: apptForm.appointmentTime || '09:00',
                healthCenterId: apptForm.healthCenterId,
                assignedTo: apptForm.assignedTo || (isRtl ? 'الطبيب المناوب' : 'On-call Physician'),
                status: 'new',
                notes: apptForm.notes,
              };
              setAppointments(prev => [newAppt, ...prev]);
              toast.success(isRtl ? 'تم إضافة الموعد' : 'Appointment added');
            }
            setOpenDialog(false);
          }}>{isRtl ? 'حفظ' : 'Save'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
