import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Stepper, Step, StepLabel,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  IconButton, Tooltip,
} from '@mui/material';
import { Grid } from '@mui/material';
import {
  Add as AddIcon, Gavel as GavelIcon, Description as DescriptionIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { toast } from 'sonner';
import { mockMedicalCommitteeReferrals, type MedicalCommitteeReferral } from '../data/mockData';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../data/roles';
import { EmployeeQuickSearch, type EmployeeSearchOption } from '../components/EmployeeQuickSearch';
import { CalendarDateField } from '../components/CalendarDateField';
import { DateText } from '../context/DatePreferenceContext';

const STEPS = ['Draft', 'Submitted', 'Under Review', 'Decision Issued', 'Closed'];
const EMPTY_REFERRAL_FORM = { employeeId: '', employeeName: '', diagnosis: '', recommendation: '', notes: '' };

export function MedicalCommitteePage() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const isRtl = i18n.language === 'ar';

  const [referrals, setReferrals] = useState<MedicalCommitteeReferral[]>(mockMedicalCommitteeReferrals);
  const [referOpen, setReferOpen] = useState(false);
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [editReferral, setEditReferral] = useState<MedicalCommitteeReferral | null>(null);

  const [form, setForm] = useState(EMPTY_REFERRAL_FORM);
  const [decisionForm, setDecisionForm] = useState({ decision: '', decisionDate: '', status: 'underReview' as MedicalCommitteeReferral['status'] });

  function getStatusColor(status: string) {
    switch (status) {
      case 'decisionIssued': return 'success';
      case 'underReview': return 'info';
      case 'submitted': return 'warning';
      case 'draft': return 'default';
      case 'closed': return 'success';
      default: return 'default';
    }
  }

  function handleEmployeeSelect(employeeId: string, employee: EmployeeSearchOption | null) {
    setForm(prev => ({ ...prev, employeeId, employeeName: employee?.name || '' }));
  }

  function submitReferral() {
    if (!form.employeeId || !form.diagnosis) {
      toast.error(isRtl ? 'يرجى تعبئة الحقول المطلوبة' : 'Please fill required fields');
      return;
    }
    const newRef: MedicalCommitteeReferral = {
      id: `MC-${Date.now()}`,
      employeeId: form.employeeId,
      employeeName: form.employeeName || form.employeeId,
      transactionNumber: `TXN-${Date.now()}`,
      diagnosis: form.diagnosis,
      recommendation: form.recommendation,
      doctorName: isRtl ? 'الطبيب المعالج' : 'Attending Physician',
      status: 'submitted',
      notes: form.notes,
    };
    setReferrals(prev => [newRef, ...prev]);
    setReferOpen(false);
    setForm(EMPTY_REFERRAL_FORM);
    toast.success(isRtl ? 'تم إحالة الموظف للهيئة الطبية' : 'Employee referred to medical committee');
  }

  function openDecision(referral: MedicalCommitteeReferral) {
    setEditReferral(referral);
    setDecisionForm({
      decision: referral.decision ?? '',
      decisionDate: referral.decisionDate || new Date().toISOString().slice(0, 10),
      status: referral.status,
    });
    setDecisionOpen(true);
  }

  function saveDecision() {
    if (!decisionForm.decisionDate) {
      toast.error(isRtl ? 'يرجى إدخال تاريخ القرار' : 'Please enter the decision date');
      return;
    }
    setReferrals(prev => prev.map(r => r.id === editReferral?.id
      ? { ...r, decision: decisionForm.decision, status: decisionForm.status, decisionDate: decisionForm.decisionDate }
      : r
    ));
    setDecisionOpen(false);
    toast.success(isRtl ? 'تم حفظ القرار' : 'Decision saved successfully');
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <GavelIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">{t('medicalCommittee')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {isRtl ? 'إحالات الهيئة الطبية وقراراتها' : 'Medical committee referrals and decisions'}
            </Typography>
          </Box>
        </Box>
        {can(PERMISSIONS.CREATE_REFERRAL) && (
          <Button variant="contained" startIcon={<AddIcon />}
            onClick={() => setReferOpen(true)}
            sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            {t('referToCommittee')}
          </Button>
        )}
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: isRtl ? 'إجمالي الإحالات' : 'Total Referrals', value: referrals.length, icon: <GavelIcon sx={{ fontSize: 36, color: 'primary.main' }} /> },
          { label: isRtl ? 'قيد المراجعة' : 'Under Review', value: referrals.filter(r => r.status === 'underReview').length, icon: null, color: 'warning.main' },
          { label: isRtl ? 'قرارات صادرة' : 'Decisions Issued', value: referrals.filter(r => r.status === 'decisionIssued').length, icon: null, color: 'success.main' },
          { label: isRtl ? 'مسودات' : 'Drafts', value: referrals.filter(r => r.status === 'draft').length, icon: <DescriptionIcon sx={{ fontSize: 36, color: 'grey.400' }} />, color: 'text.secondary' },
        ].map((s, i) => (
          <Grid key={i} size={{ xs: 6, sm: 3 }}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              {s.icon}
              <Typography variant="h4" fontWeight="bold" color={s.color ?? 'text.primary'}>{s.value}</Typography>
              <Typography variant="body2" color="text.secondary">{s.label}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <TableContainer component={Paper} sx={{ mb: 3 }}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('transactionNumber')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('employeeName')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('diagnosis')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('recommendation')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('decision')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('decisionDate')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('status')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }} align="center">{t('actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {referrals.map(referral => (
              <TableRow key={referral.id} hover>
                <TableCell><Typography variant="body2" fontFamily="monospace">{referral.transactionNumber}</Typography></TableCell>
                <TableCell><Typography variant="body2" fontWeight="medium">{referral.employeeName}</Typography></TableCell>
                <TableCell><Typography variant="body2" sx={{ maxWidth: 180 }}>{referral.diagnosis}</Typography></TableCell>
                <TableCell><Typography variant="body2" color={referral.recommendation ? 'text.primary' : 'text.secondary'} sx={{ maxWidth: 180 }}>{referral.recommendation || (isRtl ? 'قيد الانتظار' : 'Pending')}</Typography></TableCell>
                <TableCell><Typography variant="body2" color={referral.decision ? 'text.primary' : 'text.secondary'} sx={{ maxWidth: 180 }}>{referral.decision || (isRtl ? 'قيد الانتظار' : 'Pending')}</Typography></TableCell>
                <TableCell><DateText value={referral.decisionDate} /></TableCell>
                <TableCell><Chip label={t(referral.status)} size="small" color={getStatusColor(referral.status) as any} /></TableCell>
                <TableCell align="center">
                  <Tooltip title={isRtl ? 'إدخال القرار' : 'Enter Decision'}>
                    <IconButton size="small" color="primary" onClick={() => openDecision(referral)}><EditIcon fontSize="small" /></IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom fontWeight="bold">
          {isRtl ? 'مسار سير عملية الإحالة' : 'Referral Process Workflow'}
        </Typography>
        <Stepper activeStep={2} alternativeLabel sx={{ mt: 3 }}>
          {STEPS.map(label => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
        </Stepper>
      </Paper>

      <Dialog open={referOpen} onClose={() => setReferOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle component="div">
          <Typography variant="h6" component="span" fontWeight="bold">
            {isRtl ? 'إحالة موظف للهيئة الطبية' : 'Refer Employee to Medical Committee'}
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
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth required multiline rows={2} label={t('diagnosis')}
                value={form.diagnosis} onChange={e => setForm(p => ({ ...p, diagnosis: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth multiline rows={2} label={t('recommendation')}
                value={form.recommendation} onChange={e => setForm(p => ({ ...p, recommendation: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth multiline rows={2} label={t('notes')}
                value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReferOpen(false)}>{t('cancel')}</Button>
          <Button variant="contained" onClick={submitReferral}>{isRtl ? 'إحالة' : 'Refer'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={decisionOpen} onClose={() => setDecisionOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle component="div">
          <Typography variant="h6" component="span" fontWeight="bold">
            {isRtl ? 'إدخال قرار الهيئة' : 'Enter Committee Decision'}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {editReferral?.employeeName} — {editReferral?.transactionNumber}
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth select label={t('status')} value={decisionForm.status}
                onChange={e => setDecisionForm(p => ({ ...p, status: e.target.value as MedicalCommitteeReferral['status'] }))}>
                <MenuItem value="underReview">{isRtl ? 'قيد المراجعة' : 'Under Review'}</MenuItem>
                <MenuItem value="decisionIssued">{isRtl ? 'صدر القرار' : 'Decision Issued'}</MenuItem>
                <MenuItem value="closed">{isRtl ? 'مغلق' : 'Closed'}</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth multiline rows={3} label={t('decision')} value={decisionForm.decision}
                onChange={e => setDecisionForm(p => ({ ...p, decision: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <CalendarDateField required label={isRtl ? 'تاريخ القرار' : 'Decision Date'}
                value={decisionForm.decisionDate} onChange={value => setDecisionForm(p => ({ ...p, decisionDate: value }))} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDecisionOpen(false)}>{t('cancel')}</Button>
          <Button variant="contained" onClick={saveDecision}>{isRtl ? 'حفظ القرار' : 'Save Decision'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
