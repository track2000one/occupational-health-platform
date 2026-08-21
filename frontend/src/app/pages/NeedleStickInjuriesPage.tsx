import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Alert, AlertTitle,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  IconButton, Tooltip,
} from '@mui/material';
import { Grid } from '@mui/material';
import {
  Add as AddIcon, Warning as WarningIcon, CheckCircle as CheckCircleIcon,
  HourglassEmpty as HourglassEmptyIcon, Edit as EditIcon,
} from '@mui/icons-material';
import { toast } from 'sonner';
import { mockNeedleStickInjuries, mockEmployees, type NeedleStickInjury } from '../data/mockData';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../data/roles';

export function NeedleStickInjuriesPage() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const isRtl = i18n.language === 'ar';

  const [injuries, setInjuries] = useState<NeedleStickInjury[]>(mockNeedleStickInjuries);
  const [reportOpen, setReportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editInjury, setEditInjury] = useState<NeedleStickInjury | null>(null);
  const [form, setForm] = useState({
    employeeId: '', exposureDate: '', workplace: '', injuryMethod: '',
    sourceKnown: 'false', actionTaken: '', notes: '',
  });
  const [statusForm, setStatusForm] = useState<NeedleStickInjury['status']>('underReview');

  function getStatusColor(status: string) {
    switch (status) {
      case 'closed': return 'success';
      case 'underReview': return 'warning';
      case 'followUpRequired': return 'info';
      case 'new': return 'error';
      default: return 'default';
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'closed': return <CheckCircleIcon />;
      case 'underReview': return <HourglassEmptyIcon />;
      default: return <WarningIcon />;
    }
  }

  function submitReport() {
    if (!form.employeeId || !form.exposureDate || !form.workplace) {
      toast.error(isRtl ? 'يرجى تعبئة الحقول المطلوبة' : 'Please fill required fields');
      return;
    }
    const emp = mockEmployees.find(e => e.id === form.employeeId);
    const newInjury: NeedleStickInjury = {
      id: `NSI-${Date.now()}`,
      employeeId: form.employeeId,
      employeeName: emp?.name ?? form.employeeId,
      exposureDate: form.exposureDate,
      workplace: form.workplace,
      injuryMethod: form.injuryMethod,
      sourceKnown: form.sourceKnown === 'true',
      actionTaken: form.actionTaken,
      followUpRequired: true,
      status: 'new',
      notes: form.notes,
    };
    setInjuries(prev => [newInjury, ...prev]);
    setReportOpen(false);
    setForm({ employeeId: '', exposureDate: '', workplace: '', injuryMethod: '', sourceKnown: 'false', actionTaken: '', notes: '' });
    toast.success(isRtl ? 'تم تسجيل حادثة الوخز بنجاح' : 'Needle stick injury reported successfully');
  }

  function openEdit(injury: NeedleStickInjury) {
    setEditInjury(injury);
    setStatusForm(injury.status);
    setEditOpen(true);
  }

  function saveStatus() {
    setInjuries(prev => prev.map(i => i.id === editInjury?.id ? { ...i, status: statusForm } : i));
    setEditOpen(false);
    toast.success(isRtl ? 'تم تحديث حالة القضية' : 'Case status updated');
  }

  const activeInjuries = injuries.filter(i => i.status !== 'closed').length;
  const closedInjuries = injuries.filter(i => i.status === 'closed').length;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <WarningIcon sx={{ fontSize: 32, color: 'error.main' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">{t('needleStickInjury')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {isRtl ? 'تتبع وإدارة حوادث التعرض المهني' : 'Occupational exposure incident tracking and management'}
            </Typography>
          </Box>
        </Box>
        {can(PERMISSIONS.CREATE_NEEDLE_STICK) && (
          <Button variant="contained" startIcon={<AddIcon />}
            onClick={() => setReportOpen(true)}
            sx={{ background: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%)' }}>
            {t('reportInjury')}
          </Button>
        )}
      </Box>

      <Alert severity="warning" sx={{ mb: 3 }}>
        <AlertTitle>{isRtl ? 'بروتوكول السلامة المهمة' : 'Important Safety Protocol'}</AlertTitle>
        {isRtl
          ? 'يجب الإبلاغ عن جميع حوادث الوخز بالإبرة فوراً للتقييم الطبي المناسب والمتابعة.'
          : 'All needle stick injuries must be reported immediately for proper medical evaluation and follow-up.'}
      </Alert>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 2, textAlign: 'center', border: '2px solid', borderColor: 'error.main' }}>
            <WarningIcon sx={{ fontSize: 40, color: 'error.main', mb: 1 }} />
            <Typography variant="h4" fontWeight="bold" color="error.main">{activeInjuries}</Typography>
            <Typography variant="body2" color="text.secondary">{isRtl ? 'قضايا نشطة' : 'Active Cases'}</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h4" fontWeight="bold">{injuries.length}</Typography>
            <Typography variant="body2" color="text.secondary">{isRtl ? 'إجمالي التقارير' : 'Total Reports (YTD)'}</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 2, textAlign: 'center', border: '2px solid', borderColor: 'success.main' }}>
            <CheckCircleIcon sx={{ fontSize: 40, color: 'success.main', mb: 1 }} />
            <Typography variant="h4" fontWeight="bold" color="success.main">{closedInjuries}</Typography>
            <Typography variant="body2" color="text.secondary">{isRtl ? 'قضايا مغلقة' : 'Closed Cases'}</Typography>
          </Paper>
        </Grid>
      </Grid>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'رقم القضية' : 'Case ID'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('employeeName')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('exposureDate')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('workplace')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('injuryMethod')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('sourceKnown')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('followUpRequired')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('injuryStatus')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }} align="center">{t('actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {injuries.map(injury => (
              <TableRow key={injury.id} hover>
                <TableCell><Typography variant="body2" fontFamily="monospace">{injury.id}</Typography></TableCell>
                <TableCell><Typography variant="body2" fontWeight="medium">{injury.employeeName}</Typography></TableCell>
                <TableCell>{injury.exposureDate}</TableCell>
                <TableCell>{injury.workplace}</TableCell>
                <TableCell><Typography variant="body2" sx={{ maxWidth: 180 }}>{injury.injuryMethod}</Typography></TableCell>
                <TableCell>
                  <Chip label={injury.sourceKnown ? (isRtl ? 'نعم' : 'Yes') : (isRtl ? 'غير معروف' : 'Unknown')}
                    size="small" color={injury.sourceKnown ? 'info' : 'default'} />
                </TableCell>
                <TableCell>
                  <Chip label={injury.followUpRequired ? (isRtl ? 'نعم' : 'Yes') : (isRtl ? 'لا' : 'No')}
                    size="small" color={injury.followUpRequired ? 'warning' : 'success'} />
                </TableCell>
                <TableCell>
                  <Chip icon={getStatusIcon(injury.status)} label={t(injury.status)}
                    size="small" color={getStatusColor(injury.status) as any} />
                </TableCell>
                <TableCell align="center">
                  <Tooltip title={isRtl ? 'تحديث الحالة' : 'Update Status'}>
                    <IconButton size="small" color="secondary" onClick={() => openEdit(injury)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Report Injury Dialog */}
      <Dialog open={reportOpen} onClose={() => setReportOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle component="div">
          <Typography variant="h6" component="span" fontWeight="bold">
            {isRtl ? 'تسجيل حادثة وخز بالإبرة' : 'Report Needle Stick Injury'}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth select required label={isRtl ? 'الموظف المصاب' : 'Affected Employee'}
                value={form.employeeId} onChange={e => setForm(p => ({ ...p, employeeId: e.target.value }))}>
                <MenuItem key="" value="">{isRtl ? 'اختر موظفاً' : 'Select Employee'}</MenuItem>
                {mockEmployees.map(emp => <MenuItem key={emp.id} value={emp.id}>{emp.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth required label={t('exposureDate')} type="date"
                value={form.exposureDate} onChange={e => setForm(p => ({ ...p, exposureDate: e.target.value }))}
                slotProps={{ inputLabel: { shrink: true } }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth required label={t('workplace')}
                value={form.workplace} onChange={e => setForm(p => ({ ...p, workplace: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth label={t('injuryMethod')} multiline rows={2}
                value={form.injuryMethod} onChange={e => setForm(p => ({ ...p, injuryMethod: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth select label={t('sourceKnown')}
                value={form.sourceKnown} onChange={e => setForm(p => ({ ...p, sourceKnown: e.target.value }))}>
                <MenuItem key="true" value="true">{isRtl ? 'نعم' : 'Yes'}</MenuItem>
                <MenuItem key="false" value="false">{isRtl ? 'غير معروف' : 'Unknown'}</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth multiline rows={2} label={isRtl ? 'الإجراء المتخذ' : 'Action Taken'}
                value={form.actionTaken} onChange={e => setForm(p => ({ ...p, actionTaken: e.target.value }))} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReportOpen(false)}>{t('cancel')}</Button>
          <Button variant="contained" color="error" onClick={submitReport}>
            {isRtl ? 'تسجيل الحادثة' : 'Submit Report'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Update Status Dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle component="div">
          <Typography variant="h6" component="span" fontWeight="bold">
            {isRtl ? 'تحديث حالة القضية' : 'Update Case Status'}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{editInjury?.employeeName}</Typography>
          <TextField fullWidth select label={t('injuryStatus')} value={statusForm}
            onChange={e => setStatusForm(e.target.value as NeedleStickInjury['status'])}>
            <MenuItem key="new" value="new">{isRtl ? 'جديد' : 'New'}</MenuItem>
            <MenuItem key="underReview" value="underReview">{isRtl ? 'قيد المراجعة' : 'Under Review'}</MenuItem>
            <MenuItem key="followUpRequired" value="followUpRequired">{isRtl ? 'يتطلب متابعة' : 'Follow-up Required'}</MenuItem>
            <MenuItem key="closed" value="closed">{isRtl ? 'مغلق' : 'Closed'}</MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>{t('cancel')}</Button>
          <Button variant="contained" onClick={saveStatus}>{t('save') ?? 'Save'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
