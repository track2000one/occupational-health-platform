import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, TextField, MenuItem,
  Alert, LinearProgress, List, ListItem, ListItemIcon, ListItemText,
  Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material';
import { Grid } from '@mui/material';
import {
  DataObject as DataIcon, CheckCircle as OkIcon, Warning as WarnIcon,
  Error as ErrorIcon, ExpandMore as ExpandMoreIcon, Refresh as RefreshIcon,
} from '@mui/icons-material';
import { toast } from 'sonner';
import { mockEmployees, mockLabTests, mockVaccinations } from '../data/mockData';

interface DataIssue {
  id: string;
  module: string;
  issueType: 'missing' | 'duplicate' | 'invalid' | 'outdated';
  description: string;
  descriptionAr: string;
  affectedCount: number;
  severity: 'high' | 'medium' | 'low';
}

const DATA_ISSUES: DataIssue[] = [
  { id: 'DQ-001', module: 'Employees', issueType: 'missing', description: 'Employees missing date of birth', descriptionAr: 'موظفون بدون تاريخ ميلاد', affectedCount: 12, severity: 'medium' },
  { id: 'DQ-002', module: 'Lab Tests', issueType: 'missing', description: 'Lab tests without results past due date', descriptionAr: 'تحاليل بدون نتائج تجاوزت موعدها', affectedCount: 8, severity: 'high' },
  { id: 'DQ-003', module: 'Vaccinations', issueType: 'outdated', description: 'Incomplete vaccination series (doses overdue)', descriptionAr: 'جرعات تطعيم متأخرة', affectedCount: 23, severity: 'high' },
  { id: 'DQ-004', module: 'Employees', issueType: 'missing', description: 'Employees missing mobile number', descriptionAr: 'موظفون بدون رقم جوال', affectedCount: 5, severity: 'low' },
  { id: 'DQ-005', module: 'Employees', issueType: 'missing', description: 'Employees without periodic exam this year', descriptionAr: 'موظفون لم يُجروا الفحص الدوري هذا العام', affectedCount: 52, severity: 'high' },
  { id: 'DQ-006', module: 'Medical Committee', issueType: 'outdated', description: 'Referrals pending decision over 30 days', descriptionAr: 'إحالات بانتظار قرار لأكثر من 30 يوماً', affectedCount: 3, severity: 'medium' },
];

const SEVERITY_CONFIG = {
  high: { color: 'error' as const, labelEn: 'High', labelAr: 'عالية' },
  medium: { color: 'warning' as const, labelEn: 'Medium', labelAr: 'متوسطة' },
  low: { color: 'info' as const, labelEn: 'Low', labelAr: 'منخفضة' },
};

const ISSUE_TYPE_CONFIG = {
  missing: { labelEn: 'Missing Data', labelAr: 'بيانات مفقودة', icon: <ErrorIcon sx={{ fontSize: 16 }} /> },
  duplicate: { labelEn: 'Duplicate', labelAr: 'مكرر', icon: <WarnIcon sx={{ fontSize: 16 }} /> },
  invalid: { labelEn: 'Invalid', labelAr: 'غير صالح', icon: <ErrorIcon sx={{ fontSize: 16 }} /> },
  outdated: { labelEn: 'Outdated', labelAr: 'غير محدّث', icon: <WarnIcon sx={{ fontSize: 16 }} /> },
};

export function DataQualityPage() {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';

  const [severityFilter, setSeverityFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [dismissed, setDismissed] = useState<string[]>([]);

  const totalEmployees = mockEmployees.length;
  const completedLabs = mockLabTests.filter(t => t.status === 'completed').length;
  const labCompletion = Math.round((completedLabs / mockLabTests.length) * 100);
  const immuneVac = mockVaccinations.filter(v => v.status === 'immune' || v.status === 'dose3').length;
  const vacCoverage = Math.round((immuneVac / mockVaccinations.length) * 100);

  const activeIssues = DATA_ISSUES.filter(i => !dismissed.includes(i.id));
  const filtered = activeIssues.filter(i => {
    const matchSev = severityFilter === 'all' || i.severity === severityFilter;
    const matchMod = moduleFilter === 'all' || i.module === moduleFilter;
    return matchSev && matchMod;
  });

  const highCount = activeIssues.filter(i => i.severity === 'high').length;
  const totalAffected = activeIssues.reduce((sum, i) => sum + i.affectedCount, 0);
  const modules = Array.from(new Set(DATA_ISSUES.map(i => i.module)));

  function runCheck() {
    toast.success(isRtl ? 'جارٍ إعادة فحص جودة البيانات...' : 'Re-running data quality checks...');
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <DataIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">
              {isRtl ? 'جودة البيانات' : 'Data Quality'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {isRtl ? 'مراقبة اكتمال البيانات وجودتها' : 'Monitor data completeness and quality'}
            </Typography>
          </Box>
        </Box>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={runCheck}>
          {isRtl ? 'إعادة الفحص' : 'Re-run Checks'}
        </Button>
      </Box>

      {highCount > 0 && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {isRtl
            ? `يوجد ${highCount} مشكلة عالية الأولوية تتطلب معالجة عاجلة.`
            : `There are ${highCount} high-priority data quality issues requiring immediate attention.`}
        </Alert>
      )}

      {/* Quality Metrics */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: isRtl ? 'إجمالي المشاكل' : 'Total Issues', value: activeIssues.length, color: 'text.primary' },
          { label: isRtl ? 'عالية الأولوية' : 'High Priority', value: highCount, color: 'error.main' },
          { label: isRtl ? 'السجلات المتأثرة' : 'Affected Records', value: totalAffected, color: 'warning.main' },
          { label: isRtl ? 'إجمالي الموظفين' : 'Total Employees', value: totalEmployees, color: 'primary.main' },
        ].map(s => (
          <Grid key={s.label} size={{ xs: 6, sm: 3 }}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4" fontWeight="bold" color={s.color}>{s.value}</Typography>
              <Typography variant="body2" color="text.secondary">{s.label}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* Completion Metrics */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" fontWeight="bold" gutterBottom>
          {isRtl ? 'مؤشرات الاكتمال' : 'Completion Indicators'}
        </Typography>
        <Grid container spacing={3} sx={{ mt: 1 }}>
          {[
            { label: isRtl ? 'اكتمال التحاليل' : 'Lab Test Completion', value: labCompletion, color: labCompletion > 70 ? '#43e97b' : '#fa709a' },
            { label: isRtl ? 'تغطية التطعيمات' : 'Vaccination Coverage', value: vacCoverage, color: vacCoverage > 80 ? '#43e97b' : '#ffd700' },
            { label: isRtl ? 'اكتمال بيانات الموظفين' : 'Employee Data Completeness', value: Math.round(((totalEmployees - 12) / totalEmployees) * 100), color: '#4facfe' },
          ].map(m => (
            <Grid key={m.label} size={{ xs: 12, md: 4 }}>
              <Typography variant="body2" fontWeight="medium" gutterBottom>{m.label}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ flex: 1 }}>
                  <LinearProgress variant="determinate" value={m.value}
                    sx={{ height: 12, borderRadius: 6, '& .MuiLinearProgress-bar': { bgcolor: m.color } }} />
                </Box>
                <Typography variant="body2" fontWeight="bold" sx={{ minWidth: 40 }}>{m.value}%</Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Paper>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth select label={isRtl ? 'درجة الأهمية' : 'Severity'} value={severityFilter}
              onChange={e => setSeverityFilter(e.target.value)}>
              <MenuItem value="all">{isRtl ? 'الكل' : 'All'}</MenuItem>
              {Object.entries(SEVERITY_CONFIG).map(([key, val]) => (
                <MenuItem key={key} value={key}>{isRtl ? val.labelAr : val.labelEn}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth select label={isRtl ? 'القسم' : 'Module'} value={moduleFilter}
              onChange={e => setModuleFilter(e.target.value)}>
              <MenuItem value="all">{isRtl ? 'الكل' : 'All Modules'}</MenuItem>
              {modules.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      {/* Issues List */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'المشكلة' : 'Issue'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'القسم' : 'Module'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'النوع' : 'Type'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'السجلات المتأثرة' : 'Affected'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'الأهمية' : 'Severity'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }} align="center">{isRtl ? 'إجراء' : 'Action'}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map(issue => (
              <TableRow key={issue.id} hover>
                <TableCell>
                  <Typography variant="body2" fontWeight="medium">
                    {isRtl ? issue.descriptionAr : issue.description}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">{issue.id}</Typography>
                </TableCell>
                <TableCell><Chip label={issue.module} size="small" variant="outlined" /></TableCell>
                <TableCell>
                  <Chip
                    icon={ISSUE_TYPE_CONFIG[issue.issueType].icon}
                    label={isRtl ? ISSUE_TYPE_CONFIG[issue.issueType].labelAr : ISSUE_TYPE_CONFIG[issue.issueType].labelEn}
                    size="small" variant="outlined" />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight="bold">{issue.affectedCount}</Typography>
                </TableCell>
                <TableCell>
                  <Chip label={isRtl ? SEVERITY_CONFIG[issue.severity].labelAr : SEVERITY_CONFIG[issue.severity].labelEn}
                    size="small" color={SEVERITY_CONFIG[issue.severity].color} />
                </TableCell>
                <TableCell align="center">
                  <Button size="small" variant="outlined" color="success"
                    onClick={() => { setDismissed(prev => [...prev, issue.id]); toast.success(isRtl ? 'تم حل المشكلة' : 'Issue resolved'); }}>
                    {isRtl ? 'تم الحل' : 'Resolved'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                  <OkIcon sx={{ fontSize: 48, color: 'success.light', mb: 1 }} />
                  <Typography variant="body1" color="text.secondary">
                    {isRtl ? 'لا توجد مشاكل في جودة البيانات' : 'No data quality issues found'}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Best Practices */}
      <Paper sx={{ p: 3, mt: 3 }}>
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography fontWeight="bold">
              {isRtl ? 'أفضل ممارسات جودة البيانات' : 'Data Quality Best Practices'}
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <List dense>
              {[
                isRtl ? 'تحديث بيانات الموظفين بشكل دوري' : 'Update employee data periodically',
                isRtl ? 'إدخال نتائج التحاليل فور صدورها' : 'Enter lab results as soon as available',
                isRtl ? 'متابعة جرعات التطعيم المتأخرة' : 'Follow up on overdue vaccination doses',
                isRtl ? 'إجراء الفحص الدوري السنوي لجميع الموظفين' : 'Conduct annual periodic exams for all employees',
              ].map((item, i) => (
                <ListItem key={i}>
                  <ListItemIcon><OkIcon color="success" fontSize="small" /></ListItemIcon>
                  <ListItemText primary={item} />
                </ListItem>
              ))}
            </List>
          </AccordionDetails>
        </Accordion>
      </Paper>
    </Box>
  );
}
