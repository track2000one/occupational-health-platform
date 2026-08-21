import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, InputAdornment,
  Chip, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, MenuItem, Tooltip, Avatar,
} from '@mui/material';
import { Grid } from '@mui/material';
import {
  Search as SearchIcon, Add as AddIcon, Edit as EditIcon,
  Visibility as VisibilityIcon, FileDownload as FileDownloadIcon,
  People as PeopleIcon, RemoveRedEye as PreviewIcon,
} from '@mui/icons-material';
import { toast } from 'sonner';
import { mockEmployees, mockHealthCenters, type Employee } from '../data/mockData';
import { exportEmployeesHtmlToPdf } from '../utils/browserPdfExport';
import { generateEmployeeReportHTML, printPreview } from '../utils/pdfPreviewHelper';
import { PdfPreviewDialog } from '../components/PdfPreviewDialog';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../data/roles';

const EMPTY_EMPLOYEE: Omit<Employee, 'id'> = {
  nationalId: '', mohId: '', name: '', dateOfBirth: '', mobile: '',
  gender: 'male', maritalStatus: 'single', healthCenterId: '1',
  jobTitle: '', currentJob: '', dateOfStart: '', yearsOfExperience: 0,
};

export function EmployeesPage() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const isRtl = i18n.language === 'ar';

  const [employees, setEmployees] = useState<Employee[]>(mockEmployees);
  const [searchTerm, setSearchTerm] = useState('');
  const [centerFilter, setCenterFilter] = useState('all');
  const [dialogMode, setDialogMode] = useState<'view' | 'add' | 'edit'>('view');
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState<Omit<Employee, 'id'>>(EMPTY_EMPLOYEE);

  // PDF Preview state
  const [openPreview, setOpenPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');

  const filteredEmployees = employees.filter(emp => {
    const matchSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.nationalId.includes(searchTerm) || emp.mohId.includes(searchTerm);
    const matchCenter = centerFilter === 'all' || emp.healthCenterId === centerFilter;
    return matchSearch && matchCenter;
  });

  const getHealthCenterName = (id: string) =>
    mockHealthCenters.find(c => c.id === id)?.name || 'Unknown';

  function openAdd() {
    setForm(EMPTY_EMPLOYEE);
    setDialogMode('add');
    setOpenDialog(true);
  }

  function openEdit(emp: Employee) {
    setForm({ nationalId: emp.nationalId, mohId: emp.mohId, name: emp.name, dateOfBirth: emp.dateOfBirth, mobile: emp.mobile, gender: emp.gender, maritalStatus: emp.maritalStatus, healthCenterId: emp.healthCenterId, jobTitle: emp.jobTitle, currentJob: emp.currentJob, dateOfStart: emp.dateOfStart, yearsOfExperience: emp.yearsOfExperience });
    setSelectedEmployee(emp);
    setDialogMode('edit');
    setOpenDialog(true);
  }

  function openView(emp: Employee) {
    setSelectedEmployee(emp);
    setDialogMode('view');
    setOpenDialog(true);
  }

  function handleSave() {
    if (!form.name || !form.mohId) {
      toast.error(isRtl ? 'يرجى تعبئة الحقول المطلوبة' : 'Please fill required fields');
      return;
    }
    if (nationalIdError) {
      toast.error(nationalIdError);
      return;
    }
    if (dialogMode === 'add') {
      const newEmp: Employee = { ...form, id: `EMP-${Date.now()}` };
      setEmployees(prev => [...prev, newEmp]);
      toast.success(isRtl ? 'تم إضافة الموظف بنجاح' : 'Employee added successfully');
    } else if (dialogMode === 'edit' && selectedEmployee) {
      setEmployees(prev => prev.map(e => e.id === selectedEmployee.id ? { ...form, id: e.id } : e));
      toast.success(isRtl ? 'تم تحديث بيانات الموظف' : 'Employee updated successfully');
    }
    setOpenDialog(false);
  }

  function getReportData() {
    return filteredEmployees.map(e => ({
      mohId: e.mohId,
      name: e.name,
      nationalId: `${e.nationalId.substring(0, 4)}****${e.nationalId.substring(8)}`,
      jobTitle: e.jobTitle,
      healthCenter: getHealthCenterName(e.healthCenterId),
      gender: e.gender,
      maritalStatus: e.maritalStatus,
      dateOfStart: e.dateOfStart,
    }));
  }

  function handlePreview() {
    const html = generateEmployeeReportHTML(getReportData(), isRtl);
    setPreviewHtml(html);
    setOpenPreview(true);
  }

  function handlePrintFromPreview() {
    printPreview(previewHtml, isRtl);
  }

  async function handleDownloadFromPreview() {
    setOpenPreview(false);
    await exportEmployeesHtmlToPdf(getReportData(), isRtl);
    toast.success(isRtl ? 'تم تصدير بيانات الموظفين بصيغة PDF' : 'Employee directory exported as PDF');
  }

  async function handleExport() {
    await exportEmployeesHtmlToPdf(getReportData(), isRtl);
    toast.success(isRtl ? 'تم تصدير بيانات الموظفين بصيغة PDF' : 'Employee directory exported as PDF');
  }

  const isAddOrEdit = dialogMode === 'add' || dialogMode === 'edit';

  // National ID validation state
  const [nationalIdError, setNationalIdError] = useState('');

  function handleNationalIdChange(ev: React.ChangeEvent<HTMLInputElement>) {
    const raw = ev.target.value;
    // Strip non-digits silently
    const digits = raw.replace(/\D/g, '');
    setForm(prev => ({ ...prev, nationalId: digits }));

    if (digits.length === 0) {
      setNationalIdError('');
      return;
    }
    // Uniqueness check — exclude the current employee when editing
    const duplicate = employees.find(
      e => e.nationalId === digits && e.id !== selectedEmployee?.id
    );
    if (duplicate) {
      setNationalIdError(
        isRtl
          ? 'هذا الرقم الوطني مسجّل بالفعل لموظف آخر'
          : 'This National ID is already registered for another employee'
      );
    } else {
      setNationalIdError('');
    }
  }

  function field(key: keyof Omit<Employee, 'id'>) {
    if (!isAddOrEdit) return undefined;
    if (key === 'nationalId') return handleNationalIdChange;
    return (ev: React.ChangeEvent<HTMLInputElement>) =>
      setForm(prev => ({ ...prev, [key]: key === 'yearsOfExperience' ? Number(ev.target.value) : ev.target.value }));
  }

  const val = (key: keyof Omit<Employee, 'id'>) =>
    isAddOrEdit ? form[key] : (selectedEmployee?.[key] ?? '');

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <PeopleIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">{t('employees')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {filteredEmployees.length} {isRtl ? 'موظف' : 'employees'}
            </Typography>
          </Box>
        </Box>
        {can(PERMISSIONS.CREATE_EMPLOYEE) && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}
            sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            {t('addEmployee')}
          </Button>
        )}
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField fullWidth placeholder={t('search') + '...'} value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }} />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <TextField fullWidth select label={t('healthCenter')} value={centerFilter}
              onChange={e => setCenterFilter(e.target.value)}>
              <MenuItem key="all" value="all">{isRtl ? 'جميع المراكز' : 'All Centers'}</MenuItem>
              {mockHealthCenters.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <Box sx={{ display: 'flex', gap: 1, height: '56px' }}>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<PreviewIcon />}
                onClick={handlePreview}
                sx={{
                  height: '100%',
                  borderWidth: 2,
                  borderColor: 'primary.main',
                  color: 'primary.main',
                  fontWeight: 'bold',
                  '&:hover': {
                    borderWidth: 2,
                    borderColor: 'primary.dark',
                    background: 'rgba(102, 126, 234, 0.08)',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
                  },
                  transition: 'all 0.3s ease'
                }}
              >
                {isRtl ? 'معاينة' : 'Preview'}
              </Button>
              <Button
                fullWidth
                variant="contained"
                startIcon={<FileDownloadIcon />}
                onClick={handleExport}
                sx={{
                  height: '100%',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  fontWeight: 'bold',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #5568d3 0%, #6a3f8f 100%)',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 6px 20px rgba(102, 126, 234, 0.4)'
                  },
                  transition: 'all 0.3s ease'
                }}
              >
                {isRtl ? 'تصدير' : 'Export'}
              </Button>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('employeeId')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('fullName')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('nationalId')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('jobTitle')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('healthCenter')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('gender')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }} align="center">{t('actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredEmployees.map(employee => (
              <TableRow key={employee.id} hover>
                <TableCell>
                  <Typography variant="body2" fontFamily="monospace">{employee.mohId}</Typography>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Avatar sx={{ width: 32, height: 32, bgcolor: employee.gender === 'female' ? 'secondary.light' : 'primary.light', fontSize: '0.8rem' }}>
                      {employee.name.charAt(0)}
                    </Avatar>
                    <Typography variant="body2" fontWeight="medium">{employee.name}</Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontFamily="monospace">
                    {employee.nationalId.substring(0, 4)}****{employee.nationalId.substring(8)}
                  </Typography>
                </TableCell>
                <TableCell>{employee.jobTitle}</TableCell>
                <TableCell>{getHealthCenterName(employee.healthCenterId)}</TableCell>
                <TableCell>
                  <Chip label={t(employee.gender)} size="small"
                    color={employee.gender === 'male' ? 'primary' : 'secondary'} />
                </TableCell>
                <TableCell align="center">
                  <Tooltip title={isRtl ? 'عرض' : 'View'}>
                    <IconButton size="small" color="primary" onClick={() => openView(employee)}>
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  {can(PERMISSIONS.UPDATE_EMPLOYEE) && (
                    <Tooltip title={isRtl ? 'تعديل' : 'Edit'}>
                      <IconButton size="small" color="secondary" onClick={() => openEdit(employee)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* View / Add / Edit Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle component="div">
          <Typography variant="h6" component="span" fontWeight="bold">
            {dialogMode === 'add' ? (isRtl ? 'إضافة موظف جديد' : 'Add New Employee')
              : dialogMode === 'edit' ? (isRtl ? 'تعديل بيانات الموظف' : 'Edit Employee')
              : t('employeeDetails')}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            {[
              { key: 'name' as const, label: t('fullName'), required: true },
              { key: 'mohId' as const, label: t('mohId'), required: true },
              { key: 'dateOfBirth' as const, label: t('dateOfBirth'), type: 'date' },
              { key: 'mobile' as const, label: t('mobile') },
              { key: 'jobTitle' as const, label: t('jobTitle') },
              { key: 'currentJob' as const, label: t('currentJob') },
              { key: 'dateOfStart' as const, label: t('dateOfStart'), type: 'date' },
              { key: 'yearsOfExperience' as const, label: t('yearsOfExperience'), type: 'number' },
            ].map(({ key, label, type, required }) => (
              <Grid key={key} size={{ xs: 12, md: 6 }}>
                {isAddOrEdit ? (
                  <TextField fullWidth label={label} type={type || 'text'} required={required}
                    value={form[key]} onChange={field(key)}
                    slotProps={type === 'date' ? { inputLabel: { shrink: true } } : undefined} />
                ) : (
                  <Box>
                    <Typography variant="caption" color="text.secondary">{label}</Typography>
                    <Typography variant="body1" fontWeight="medium">{String(selectedEmployee?.[key] ?? '-')}</Typography>
                  </Box>
                )}
              </Grid>
            ))}

            {/* National ID — special field with digits-only + uniqueness validation */}
            <Grid size={{ xs: 12, md: 6 }}>
              {isAddOrEdit ? (
                <TextField
                  fullWidth
                  required
                  label={t('nationalId')}
                  value={form.nationalId}
                  onChange={handleNationalIdChange}
                  error={!!nationalIdError}
                  helperText={
                    nationalIdError ||
                    (isRtl ? 'أرقام فقط — مفتاح فريد لا يمكن تكراره' : 'Numbers only — unique identifier, cannot be duplicated')
                  }
                  slotProps={{
                    input: {
                      endAdornment: form.nationalId && !nationalIdError ? (
                        <InputAdornment position="end">
                          <Box sx={{ color: 'success.main', display: 'flex', alignItems: 'center' }}>
                            ✓
                          </Box>
                        </InputAdornment>
                      ) : undefined,
                    },
                    htmlInput: { inputMode: 'numeric', maxLength: 10 },
                  }}
                />
              ) : (
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('nationalId')}</Typography>
                  <Typography variant="body1" fontWeight="medium" fontFamily="monospace">
                    {selectedEmployee?.nationalId
                      ? `${selectedEmployee.nationalId.substring(0, 4)}****${selectedEmployee.nationalId.substring(8)}`
                      : '-'}
                  </Typography>
                </Box>
              )}
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              {isAddOrEdit ? (
                <TextField fullWidth select label={t('gender')} value={form.gender}
                  onChange={e => setForm(p => ({ ...p, gender: e.target.value as 'male' | 'female' }))}>
                  <MenuItem key="male" value="male">{t('male')}</MenuItem>
                  <MenuItem key="female" value="female">{t('female')}</MenuItem>
                </TextField>
              ) : (
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('gender')}</Typography>
                  <Typography variant="body1" fontWeight="medium">{t(selectedEmployee?.gender ?? '')}</Typography>
                </Box>
              )}
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              {isAddOrEdit ? (
                <TextField fullWidth select label={t('maritalStatus')} value={form.maritalStatus}
                  onChange={e => setForm(p => ({ ...p, maritalStatus: e.target.value as 'single' | 'married' }))}>
                  <MenuItem key="single" value="single">{t('single')}</MenuItem>
                  <MenuItem key="married" value="married">{t('married')}</MenuItem>
                </TextField>
              ) : (
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('maritalStatus')}</Typography>
                  <Typography variant="body1" fontWeight="medium">{t(selectedEmployee?.maritalStatus ?? '')}</Typography>
                </Box>
              )}
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              {isAddOrEdit ? (
                <TextField fullWidth select label={t('healthCenter')} value={form.healthCenterId}
                  onChange={e => setForm(p => ({ ...p, healthCenterId: e.target.value }))}>
                  {mockHealthCenters.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                </TextField>
              ) : (
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('healthCenter')}</Typography>
                  <Typography variant="body1" fontWeight="medium">
                    {getHealthCenterName(selectedEmployee?.healthCenterId ?? '')}
                  </Typography>
                </Box>
              )}
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>{t('close')}</Button>
          {dialogMode === 'view' && can(PERMISSIONS.UPDATE_EMPLOYEE) && (
            <Button variant="outlined" onClick={() => { if (selectedEmployee) openEdit(selectedEmployee); }}>
              {t('edit')}
            </Button>
          )}
          {isAddOrEdit && (
            <Button variant="contained" onClick={handleSave}>
              {dialogMode === 'add' ? (isRtl ? 'إضافة' : 'Add') : (isRtl ? 'حفظ' : 'Save')}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* PDF Preview Dialog */}
      <PdfPreviewDialog
        open={openPreview}
        onClose={() => setOpenPreview(false)}
        htmlContent={previewHtml}
        onPrint={handlePrintFromPreview}
        onDownload={handleDownloadFromPreview}
      />
    </Box>
  );
}
