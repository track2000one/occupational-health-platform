import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, TextField, InputAdornment,
  MenuItem, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Tooltip,
} from '@mui/material';
import { Grid } from '@mui/material';
import {
  Search as SearchIcon, Add as AddIcon, Edit as EditIcon,
  Upload as UploadIcon, Science as ScienceIcon,
} from '@mui/icons-material';
import { toast } from 'sonner';
import { mockLabTests, mockEmployees, type LabTest } from '../data/mockData';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../data/roles';

export function LabTestsPage() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const isRtl = i18n.language === 'ar';

  const [labTests, setLabTests] = useState<LabTest[]>(mockLabTests);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const [requestOpen, setRequestOpen] = useState(false);
  const [reqForm, setReqForm] = useState({ employeeId: '', testType: '', notes: '' });

  const [resultOpen, setResultOpen] = useState(false);
  const [editTest, setEditTest] = useState<LabTest | null>(null);
  const [resultForm, setResultForm] = useState({ result: '', notes: '' });

  const filteredTests = labTests.filter(test => {
    const matchesSearch = test.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      test.testType.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || test.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  function getStatusColor(status: string) {
    switch (status) {
      case 'completed': return 'success';
      case 'pending': return 'warning';
      case 'missing': return 'error';
      default: return 'default';
    }
  }

  function openResult(test: LabTest) {
    setEditTest(test);
    setResultForm({ result: test.result ?? '', notes: test.notes ?? '' });
    setResultOpen(true);
  }

  function submitRequest() {
    if (!reqForm.employeeId || !reqForm.testType) {
      toast.error(isRtl ? 'يرجى تعبئة الحقول المطلوبة' : 'Please fill required fields');
      return;
    }
    const emp = mockEmployees.find(e => e.id === reqForm.employeeId);
    const newTest: LabTest = {
      id: `LAB-${Date.now()}`,
      employeeId: reqForm.employeeId,
      employeeName: emp?.name ?? reqForm.employeeId,
      testType: reqForm.testType,
      status: 'pending',
      requestedBy: isRtl ? 'المستخدم الحالي' : 'Current User',
      requestedDate: new Date().toISOString().split('T')[0],
      notes: reqForm.notes,
    };
    setLabTests(prev => [newTest, ...prev]);
    setRequestOpen(false);
    setReqForm({ employeeId: '', testType: '', notes: '' });
    toast.success(isRtl ? 'تم إرسال طلب التحليل' : 'Lab test requested successfully');
  }

  function submitResult() {
    if (!resultForm.result) {
      toast.error(isRtl ? 'يرجى إدخال النتيجة' : 'Please enter the result');
      return;
    }
    setLabTests(prev => prev.map(t => t.id === editTest?.id
      ? { ...t, result: resultForm.result, notes: resultForm.notes, status: 'completed', completedDate: new Date().toISOString().split('T')[0] }
      : t
    ));
    setResultOpen(false);
    toast.success(isRtl ? 'تم حفظ نتيجة التحليل' : 'Lab result saved successfully');
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <ScienceIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">{t('labTests')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {isRtl ? 'إدارة طلبات ونتائج التحاليل المخبرية' : 'Manage lab test requests and results'}
            </Typography>
          </Box>
        </Box>
        {can(PERMISSIONS.CREATE_LAB_REQUEST) && (
          <Button variant="contained" startIcon={<AddIcon />}
            onClick={() => setRequestOpen(true)}
            sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            {isRtl ? 'طلب تحليل' : 'Request Lab Test'}
          </Button>
        )}
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: isRtl ? 'إجمالي' : 'Total', value: labTests.length, color: 'primary.main' },
          { label: isRtl ? 'قيد الانتظار' : 'Pending', value: labTests.filter(t => t.status === 'pending').length, color: 'warning.main' },
          { label: isRtl ? 'مكتملة' : 'Completed', value: labTests.filter(t => t.status === 'completed').length, color: 'success.main' },
          { label: isRtl ? 'مفقودة' : 'Missing', value: labTests.filter(t => t.status === 'missing').length, color: 'error.main' },
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
            <TextField fullWidth placeholder={(isRtl ? 'بحث باسم الموظف أو نوع التحليل' : 'Search employee or test type') + '...'}
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField fullWidth select label={t('status')} value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}>
              <MenuItem value="all">{isRtl ? 'الكل' : 'All Statuses'}</MenuItem>
              <MenuItem value="pending">{t('pending')}</MenuItem>
              <MenuItem value="completed">{t('completed')}</MenuItem>
              <MenuItem value="missing">{t('missing')}</MenuItem>
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'رقم التحليل' : 'Test ID'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('employeeName')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('testType')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('result')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('status')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('requestedBy')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('requestedDate')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }} align="center">{t('actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredTests.map(test => (
              <TableRow key={test.id} hover>
                <TableCell><Typography variant="body2" fontFamily="monospace">{test.id}</Typography></TableCell>
                <TableCell><Typography variant="body2" fontWeight="medium">{test.employeeName}</Typography></TableCell>
                <TableCell>{test.testType}</TableCell>
                <TableCell>
                  <Typography variant="body2" color={test.result ? 'text.primary' : 'text.secondary'}>
                    {test.result ?? '-'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip label={t(test.status)} size="small" color={getStatusColor(test.status) as any} />
                </TableCell>
                <TableCell>{test.requestedBy}</TableCell>
                <TableCell>{test.requestedDate}</TableCell>
                <TableCell align="center">
                  {test.status === 'pending' && can(PERMISSIONS.UPDATE_LAB_RESULT) && (
                    <Tooltip title={isRtl ? 'إدخال النتيجة' : 'Enter Result'}>
                      <IconButton size="small" color="primary" onClick={() => openResult(test)}>
                        <UploadIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title={isRtl ? 'تعديل' : 'Edit'}>
                    <IconButton size="small" color="secondary" onClick={() => openResult(test)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Request Lab Test Dialog */}
      <Dialog open={requestOpen} onClose={() => setRequestOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle component="div">
          <Typography variant="h6" component="span" fontWeight="bold">
            {isRtl ? 'طلب تحليل مخبري جديد' : 'Request New Lab Test'}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth select required label={isRtl ? 'الموظف' : 'Employee'}
                value={reqForm.employeeId} onChange={e => setReqForm(p => ({ ...p, employeeId: e.target.value }))}>
                <MenuItem value="">{isRtl ? 'اختر موظفاً' : 'Select Employee'}</MenuItem>
                {mockEmployees.map(emp => <MenuItem key={emp.id} value={emp.id}>{emp.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth select required label={t('testType')}
                value={reqForm.testType} onChange={e => setReqForm(p => ({ ...p, testType: e.target.value }))}>
                <MenuItem value="">{isRtl ? 'اختر نوع التحليل' : 'Select Test Type'}</MenuItem>
                {['Anti-HBs', 'HBsAg', 'HCV', 'HIV', 'PPD', 'Rubella IgG', 'CBC', 'Urine Analysis'].map(t => (
                  <MenuItem key={t} value={t}>{t}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth multiline rows={2} label={t('notes')}
                value={reqForm.notes} onChange={e => setReqForm(p => ({ ...p, notes: e.target.value }))} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRequestOpen(false)}>{t('cancel')}</Button>
          <Button variant="contained" onClick={submitRequest}>{isRtl ? 'إرسال الطلب' : 'Submit Request'}</Button>
        </DialogActions>
      </Dialog>

      {/* Enter Result Dialog */}
      <Dialog open={resultOpen} onClose={() => setResultOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle component="div">
          <Typography variant="h6" component="span" fontWeight="bold">
            {isRtl ? 'إدخال نتيجة التحليل' : 'Enter Lab Result'}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <Box sx={{ p: 1.5, bgcolor: 'grey.50', borderRadius: 1, mb: 1 }}>
                <Typography variant="caption" color="text.secondary">{t('employeeName')}</Typography>
                <Typography variant="body1" fontWeight="medium">{editTest?.employeeName}</Typography>
                <Typography variant="caption" color="text.secondary">{t('testType')}: </Typography>
                <Typography variant="caption" fontWeight="medium">{editTest?.testType}</Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth required label={t('result')} value={resultForm.result}
                onChange={e => setResultForm(p => ({ ...p, result: e.target.value }))}
                placeholder={isRtl ? 'أدخل نتيجة التحليل...' : 'Enter test result...'} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth multiline rows={2} label={t('notes')} value={resultForm.notes}
                onChange={e => setResultForm(p => ({ ...p, notes: e.target.value }))} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResultOpen(false)}>{t('cancel')}</Button>
          <Button variant="contained" onClick={submitResult}>{isRtl ? 'حفظ النتيجة' : 'Save Result'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
