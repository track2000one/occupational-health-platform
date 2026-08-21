import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useState } from 'react';
import {
  exportPeriodicExaminationPdf,
  exportVaccinationCoveragePdf,
  exportLabCompletionPdf,
  exportEmployeesPdf,
  type EmployeeRow
} from '../utils/professionalPdfExport';
import {
  Box,
  Paper,
  Typography,
  Card,
  CardContent,
  Button,
  Divider,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip
} from '@mui/material';
import { Grid } from '@mui/material';
import {
  FileDownload as FileDownloadIcon,
  Assessment as AssessmentIcon,
  PieChart as PieChartIcon,
  TrendingUp as TrendingUpIcon,
  PictureAsPdf as PdfIcon,
  People as PeopleIcon
} from '@mui/icons-material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#43e97b', '#fa709a'];

export function ReportsPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';

  const [loadingPeriodic, setLoadingPeriodic] = useState(false);
  const [loadingVaccination, setLoadingVaccination] = useState(false);
  const [loadingLab, setLoadingLab] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('2026');

  async function exportPeriodicExamination() {
    setLoadingPeriodic(true);
    const loadingToast = toast.loading(isRtl ? 'جاري إنشاء التقرير...' : 'Generating PDF report...');
    try {
      await exportPeriodicExaminationPdf(coverageByCenter);
      toast.success(isRtl ? 'تم تصدير تقرير الفحص الدوري بصيغة PDF بنجاح' : 'Periodic Examination Report exported successfully', { id: loadingToast });
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error(isRtl ? 'فشل تصدير التقرير' : 'Failed to export PDF report', { id: loadingToast });
    } finally {
      setLoadingPeriodic(false);
    }
  }

  async function exportVaccinationCoverage() {
    setLoadingVaccination(true);
    const loadingToast = toast.loading(isRtl ? 'جاري إنشاء التقرير...' : 'Generating PDF report...');
    try {
      await exportVaccinationCoveragePdf(vaccineDistribution, monthlyTrend);
      toast.success(isRtl ? 'تم تصدير تقرير التطعيمات بصيغة PDF بنجاح' : 'Vaccination Coverage Report exported successfully', { id: loadingToast });
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error(isRtl ? 'فشل تصدير التقرير' : 'Failed to export PDF report', { id: loadingToast });
    } finally {
      setLoadingVaccination(false);
    }
  }

  async function exportLabCompletion() {
    setLoadingLab(true);
    const loadingToast = toast.loading(isRtl ? 'جاري إنشاء التقرير...' : 'Generating PDF report...');
    try {
      await exportLabCompletionPdf(testCompletionStatus, monthlyTrend);
      toast.success(isRtl ? 'تم تصدير تقرير التحاليل بصيغة PDF بنجاح' : 'Lab Completion Report exported successfully', { id: loadingToast });
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error(isRtl ? 'فشل تصدير التقرير' : 'Failed to export PDF report', { id: loadingToast });
    } finally {
      setLoadingLab(false);
    }
  }

  async function exportEmployees() {
    setLoadingEmployees(true);
    const loadingToast = toast.loading(isRtl ? 'جاري إنشاء تقرير الموظفين...' : 'Generating Employee Directory...');
    try {
      await exportEmployeesPdf(sampleEmployees, isRtl);
      toast.success(isRtl ? 'تم تصدير تقرير الموظفين بصيغة PDF بنجاح' : 'Employee Directory exported successfully', { id: loadingToast });
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error(isRtl ? 'فشل تصدير التقرير' : 'Failed to export PDF report', { id: loadingToast });
    } finally {
      setLoadingEmployees(false);
    }
  }

  const sampleEmployees: EmployeeRow[] = [
    {
      mohId: 'MOH-001',
      name: 'Ahmed Abdullah',
      nationalId: '1234****90',
      jobTitle: 'Nurse',
      healthCenter: 'Central Hospital',
      gender: 'male',
      maritalStatus: 'married',
      dateOfStart: '2010-01-15'
    },
    {
      mohId: 'MOH-002',
      name: 'Fatima Ali',
      nationalId: '2345****12',
      jobTitle: 'Laboratory Technician',
      healthCenter: 'East Medical',
      gender: 'female',
      maritalStatus: 'single',
      dateOfStart: '2015-06-20'
    },
    {
      mohId: 'MOH-003',
      name: 'Mohammed Hassan',
      nationalId: '3456****34',
      jobTitle: 'Doctor',
      healthCenter: 'West Regional',
      gender: 'male',
      maritalStatus: 'married',
      dateOfStart: '2012-03-10'
    }
  ];

  const coverageByCenter = [
    { center: 'Central Hospital', target: 120, examined: 102, percentage: 85 },
    { center: 'East Medical', target: 95, examined: 68, percentage: 72 },
    { center: 'West Regional', target: 80, examined: 73, percentage: 91 },
  ];

  const monthlyTrend = [
    { month: 'Jan', tests: 45, vaccines: 52, visits: 38 },
    { month: 'Feb', tests: 52, vaccines: 61, visits: 42 },
    { month: 'Mar', tests: 48, vaccines: 58, visits: 39 },
    { month: 'Apr', tests: 61, vaccines: 72, visits: 51 },
    { month: 'May', tests: 55, vaccines: 68, visits: 47 },
  ];

  const vaccineDistribution = [
    { name: 'HBV', value: 145, percentage: 35 },
    { name: 'Influenza', value: 210, percentage: 51 },
    { name: 'Rubella', value: 32, percentage: 8 },
    { name: 'Others', value: 25, percentage: 6 },
  ];

  const testCompletionStatus = [
    { name: 'Completed', value: 198, percentage: 67 },
    { name: 'Pending', value: 42, percentage: 14 },
    { name: 'Missing', value: 55, percentage: 19 },
  ];

  return (
    <Box sx={{ direction: isRtl ? 'rtl' : 'ltr' }}>
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
          <div>
            <Typography variant="h4" gutterBottom fontWeight="bold" sx={{ color: '#1e293b' }}>
              {isRtl ? 'التقارير والإحصائيات' : 'Reports & Analytics'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {isRtl ? 'تقارير شاملة ومقاييس أداء احترافية' : 'Comprehensive reports and professional performance metrics'}
            </Typography>
          </div>
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel>{isRtl ? 'الفترة الزمنية' : 'Period'}</InputLabel>
            <Select
              value={selectedPeriod}
              label={isRtl ? 'الفترة الزمنية' : 'Period'}
              onChange={(e) => setSelectedPeriod(e.target.value)}
            >
              <MenuItem value="2026">{isRtl ? 'السنة المالية 2026' : 'Fiscal Year 2026'}</MenuItem>
              <MenuItem value="2025">{isRtl ? 'السنة المالية 2025' : 'Fiscal Year 2025'}</MenuItem>
              <MenuItem value="Q4-2025">{isRtl ? 'الربع الرابع 2025' : 'Q4 2025'}</MenuItem>
              <MenuItem value="Q3-2025">{isRtl ? 'الربع الثالث 2025' : 'Q3 2025'}</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* Quick Stats Summary */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Card sx={{ bgcolor: '#f0f9ff', border: '1px solid #bae6fd' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  {isRtl ? 'إجمالي التقارير' : 'Total Reports'}
                </Typography>
                <Typography variant="h5" fontWeight="bold" color="#0369a1">
                  12
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Card sx={{ bgcolor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  {isRtl ? 'تم تصديرها' : 'Exported'}
                </Typography>
                <Typography variant="h5" fontWeight="bold" color="#16a34a">
                  47
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Card sx={{ bgcolor: '#fef3c7', border: '1px solid #fde68a' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  {isRtl ? 'معدل الاكتمال' : 'Completion Rate'}
                </Typography>
                <Typography variant="h5" fontWeight="bold" color="#ca8a04">
                  89%
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Card sx={{ bgcolor: '#fce7f3', border: '1px solid #fbcfe8' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  {isRtl ? 'آخر تحديث' : 'Last Updated'}
                </Typography>
                <Typography variant="body2" fontWeight="bold" color="#be123c">
                  {isRtl ? 'اليوم' : 'Today'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>

      {/* Featured Report - Employee Directory */}
      <Card
        elevation={0}
        sx={{
          mb: 4,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: '#fff',
          transition: 'all 0.3s ease',
          border: '2px solid transparent',
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: '0 20px 40px rgba(102, 126, 234, 0.3)',
            borderColor: 'rgba(255, 255, 255, 0.3)'
          }
        }}
      >
        <CardContent sx={{ p: 4 }}>
          <Grid container spacing={3} alignItems="center">
            <Grid size={{ xs: 12, md: 8 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, flexDirection: isRtl ? 'row-reverse' : 'row' }}>
                <Box
                  sx={{
                    width: 72,
                    height: 72,
                    borderRadius: 2.5,
                    bgcolor: 'rgba(255, 255, 255, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backdropFilter: 'blur(10px)',
                    boxShadow: '0 8px 16px rgba(0,0,0,0.1)'
                  }}
                >
                  <PeopleIcon sx={{ fontSize: 40, color: '#fff' }} />
                </Box>
                <Box sx={{ flex: 1, textAlign: isRtl ? 'right' : 'left' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1, flexDirection: isRtl ? 'row-reverse' : 'row' }}>
                    <Typography variant="h5" fontWeight="bold">
                      {isRtl ? 'دليل الموظفين الشامل' : 'Complete Employee Directory'}
                    </Typography>
                    <Chip
                      label={isRtl ? 'مميز' : 'Featured'}
                      size="small"
                      sx={{
                        bgcolor: 'rgba(255, 255, 255, 0.3)',
                        color: '#fff',
                        fontWeight: 'bold',
                        fontSize: '0.7rem'
                      }}
                    />
                  </Box>
                  <Typography variant="body2" sx={{ opacity: 0.95, mb: 1.5, lineHeight: 1.6 }}>
                    {isRtl
                      ? 'تقرير تفصيلي يحتوي على جميع بيانات الموظفين، الوظائف، المراكز الصحية، والمعلومات الشخصية'
                      : 'Detailed report containing all employee data, job titles, health centers, and personal information'}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', flexDirection: isRtl ? 'row-reverse' : 'row' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.8)' }} />
                      <Typography variant="caption" sx={{ opacity: 0.9 }}>
                        {isRtl ? '295 موظف' : '295 Employees'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.8)' }} />
                      <Typography variant="caption" sx={{ opacity: 0.9 }}>
                        {isRtl ? '12 مركز صحي' : '12 Health Centers'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.8)' }} />
                      <Typography variant="caption" sx={{ opacity: 0.9 }}>
                        {isRtl ? 'محدّث اليوم' : 'Updated Today'}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Button
                fullWidth
                variant="contained"
                size="large"
                disabled={loadingEmployees}
                startIcon={loadingEmployees ? <CircularProgress size={22} sx={{ color: '#667eea' }} /> : <FileDownloadIcon />}
                onClick={exportEmployees}
                sx={{
                  py: 2,
                  bgcolor: '#fff',
                  color: '#667eea',
                  fontWeight: 'bold',
                  fontSize: '1rem',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
                  '&:hover': {
                    bgcolor: '#f8f9ff',
                    transform: 'scale(1.02)',
                    boxShadow: '0 6px 20px rgba(255, 255, 255, 0.4)'
                  },
                  '&:disabled': {
                    bgcolor: '#e8e8e8',
                    color: '#999'
                  }
                }}
              >
                {loadingEmployees ? (isRtl ? 'جاري التصدير...' : 'Exporting...') : (isRtl ? 'تصدير PDF' : 'Export PDF')}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Section Title */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight="bold" sx={{ mb: 1, color: '#1e293b' }}>
          {isRtl ? 'التقارير التفصيلية' : 'Detailed Reports'}
        </Typography>
        <Divider sx={{ borderColor: '#e2e8f0', borderWidth: 2 }} />
      </Box>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card
            elevation={0}
            sx={{
              height: '100%',
              transition: 'all 0.3s ease',
              border: '1px solid #e2e8f0',
              '&:hover': {
                transform: 'translateY(-6px)',
                boxShadow: '0 12px 24px rgba(102, 126, 234, 0.15)',
                borderColor: '#667eea'
              }
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2.5, gap: 2, flexDirection: isRtl ? 'row-reverse' : 'row' }}>
                <Box
                  sx={{
                    width: 60,
                    height: 60,
                    borderRadius: 2,
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
                    flexShrink: 0
                  }}
                >
                  <AssessmentIcon sx={{ fontSize: 32, color: '#fff' }} />
                </Box>
                <Box sx={{ flex: 1, textAlign: isRtl ? 'right' : 'left' }}>
                  <Typography variant="h6" fontWeight="bold" sx={{ mb: 0.5, color: '#1e293b' }}>
                    {isRtl ? 'الفحص الدوري السنوي' : 'Annual Periodic Examination'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, lineHeight: 1.5 }}>
                    {isRtl ? 'تقرير شامل عن تغطية الفحوصات الدورية' : 'Comprehensive screening coverage report'}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', flexDirection: isRtl ? 'row-reverse' : 'row' }}>
                    <Chip label={isRtl ? 'نسبة الإنجاز: 82%' : 'Coverage: 82%'} size="small" sx={{ bgcolor: '#dbeafe', color: '#1e40af', fontWeight: 600 }} />
                    <Chip label={isRtl ? '3 مراكز' : '3 Centers'} size="small" variant="outlined" />
                  </Box>
                </Box>
              </Box>
              <Divider sx={{ my: 2 }} />
              <Button
                fullWidth
                variant="contained"
                size="large"
                disabled={loadingPeriodic}
                startIcon={loadingPeriodic ? <CircularProgress size={20} color="inherit" /> : <FileDownloadIcon />}
                onClick={exportPeriodicExamination}
                sx={{
                  py: 1.5,
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  fontWeight: 'bold',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #5568d3 0%, #6a3f8f 100%)',
                    boxShadow: '0 8px 20px rgba(102, 126, 234, 0.4)'
                  },
                  '&:disabled': {
                    background: 'linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)',
                  }
                }}
              >
                {loadingPeriodic ? (isRtl ? 'جاري التصدير...' : 'Exporting...') : (isRtl ? 'تصدير PDF' : 'Export PDF')}
              </Button>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card
            elevation={0}
            sx={{
              height: '100%',
              transition: 'all 0.3s ease',
              border: '1px solid #e2e8f0',
              '&:hover': {
                transform: 'translateY(-6px)',
                boxShadow: '0 12px 24px rgba(240, 147, 251, 0.15)',
                borderColor: '#f093fb'
              }
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2.5, gap: 2, flexDirection: isRtl ? 'row-reverse' : 'row' }}>
                <Box
                  sx={{
                    width: 60,
                    height: 60,
                    borderRadius: 2,
                    background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(240, 147, 251, 0.3)',
                    flexShrink: 0
                  }}
                >
                  <PieChartIcon sx={{ fontSize: 32, color: '#fff' }} />
                </Box>
                <Box sx={{ flex: 1, textAlign: isRtl ? 'right' : 'left' }}>
                  <Typography variant="h6" fontWeight="bold" sx={{ mb: 0.5, color: '#1e293b' }}>
                    {isRtl ? 'تغطية التطعيمات' : 'Vaccination Coverage'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, lineHeight: 1.5 }}>
                    {isRtl ? 'إحصائيات برنامج التحصين للموظفين' : 'Employee immunization program statistics'}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', flexDirection: isRtl ? 'row-reverse' : 'row' }}>
                    <Chip label={isRtl ? 'جرعات: 412' : 'Doses: 412'} size="small" sx={{ bgcolor: '#fce7f3', color: '#9f1239', fontWeight: 600 }} />
                    <Chip label={isRtl ? '4 أنواع' : '4 Types'} size="small" variant="outlined" />
                  </Box>
                </Box>
              </Box>
              <Divider sx={{ my: 2 }} />
              <Button
                fullWidth
                variant="contained"
                size="large"
                disabled={loadingVaccination}
                startIcon={loadingVaccination ? <CircularProgress size={20} color="inherit" /> : <FileDownloadIcon />}
                onClick={exportVaccinationCoverage}
                sx={{
                  py: 1.5,
                  background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                  fontWeight: 'bold',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #e07eeb 0%, #e34659 100%)',
                    boxShadow: '0 8px 20px rgba(240, 147, 251, 0.4)'
                  },
                  '&:disabled': {
                    background: 'linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)',
                  }
                }}
              >
                {loadingVaccination ? (isRtl ? 'جاري التصدير...' : 'Exporting...') : (isRtl ? 'تصدير PDF' : 'Export PDF')}
              </Button>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card
            elevation={0}
            sx={{
              height: '100%',
              transition: 'all 0.3s ease',
              border: '1px solid #e2e8f0',
              '&:hover': {
                transform: 'translateY(-6px)',
                boxShadow: '0 12px 24px rgba(67, 233, 123, 0.15)',
                borderColor: '#43e97b'
              }
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2.5, gap: 2, flexDirection: isRtl ? 'row-reverse' : 'row' }}>
                <Box
                  sx={{
                    width: 60,
                    height: 60,
                    borderRadius: 2,
                    background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(67, 233, 123, 0.3)',
                    flexShrink: 0
                  }}
                >
                  <TrendingUpIcon sx={{ fontSize: 32, color: '#fff' }} />
                </Box>
                <Box sx={{ flex: 1, textAlign: isRtl ? 'right' : 'left' }}>
                  <Typography variant="h6" fontWeight="bold" sx={{ mb: 0.5, color: '#1e293b' }}>
                    {isRtl ? 'تقرير التحاليل المخبرية' : 'Lab Completion Report'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, lineHeight: 1.5 }}>
                    {isRtl ? 'حالة إنجاز الفحوصات المخبرية' : 'Laboratory test completion status'}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', flexDirection: isRtl ? 'row-reverse' : 'row' }}>
                    <Chip label={isRtl ? 'مكتمل: 67%' : 'Complete: 67%'} size="small" sx={{ bgcolor: '#d1fae5', color: '#065f46', fontWeight: 600 }} />
                    <Chip label={isRtl ? '295 تحليل' : '295 Tests'} size="small" variant="outlined" />
                  </Box>
                </Box>
              </Box>
              <Divider sx={{ my: 2 }} />
              <Button
                fullWidth
                variant="contained"
                size="large"
                disabled={loadingLab}
                startIcon={loadingLab ? <CircularProgress size={20} color="inherit" /> : <FileDownloadIcon />}
                onClick={exportLabCompletion}
                sx={{
                  py: 1.5,
                  background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
                  fontWeight: 'bold',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #32d768 0%, #27e7c4 100%)',
                    boxShadow: '0 8px 20px rgba(67, 233, 123, 0.4)'
                  },
                  '&:disabled': {
                    background: 'linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)',
                  }
                }}
              >
                {loadingLab ? (isRtl ? 'جاري التصدير...' : 'Exporting...') : (isRtl ? 'تصدير PDF' : 'Export PDF')}
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Charts Section Title */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight="bold" sx={{ mb: 1, color: '#1e293b' }}>
          {isRtl ? 'الرسوم البيانية والتحليلات' : 'Charts & Analytics'}
        </Typography>
        <Divider sx={{ borderColor: '#e2e8f0', borderWidth: 2 }} />
      </Box>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Paper elevation={0} sx={{ p: 3, border: '1px solid #e2e8f0', borderRadius: 2 }}>
            <Box sx={{ mb: 2 }}>
              <Typography variant="h6" gutterBottom fontWeight="bold" sx={{ color: '#1e293b' }}>
                {isRtl ? 'تغطية الفحص الدوري حسب المركز' : 'Periodic Examination Coverage by Center'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {isRtl ? 'نسبة تغطية الفحوصات الدورية السنوية في المراكز الصحية' : 'Annual periodic examination coverage by health center'}
              </Typography>
            </Box>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={coverageByCenter}>
                <CartesianGrid key="grid" strokeDasharray="3 3" />
                <XAxis key="xaxis" dataKey="center" />
                <YAxis key="yaxis" />
                <Tooltip key="tooltip" />
                <Legend key="legend" />
                <Bar key="bar-examined" dataKey="examined" fill="#667eea" name="Examined" />
                <Bar key="bar-target" dataKey="target" fill="#e0e7ff" name="Target" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper elevation={0} sx={{ p: 3, border: '1px solid #e2e8f0', borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom fontWeight="bold" sx={{ color: '#1e293b', mb: 2 }}>
              {isRtl ? 'حالة إنجاز التحاليل' : 'Test Completion Status'}
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  key="pie-test-status"
                  data={testCompletionStatus}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name} (${entry.percentage}%)`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {testCompletionStatus.map((entry, index) => (
                    <Cell key={`test-status-${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip key="tooltip" />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Paper elevation={0} sx={{ p: 3, border: '1px solid #e2e8f0', borderRadius: 2 }}>
            <Box sx={{ mb: 2 }}>
              <Typography variant="h6" gutterBottom fontWeight="bold" sx={{ color: '#1e293b' }}>
                {isRtl ? 'اتجاهات النشاط الشهري' : 'Monthly Activity Trends'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {isRtl ? 'التحاليل المخبرية، التطعيمات، وزيارات العيادة عبر الوقت' : 'Lab tests, vaccinations, and clinic visits over time'}
              </Typography>
            </Box>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyTrend}>
                <CartesianGrid key="grid" strokeDasharray="3 3" />
                <XAxis key="xaxis" dataKey="month" />
                <YAxis key="yaxis" />
                <Tooltip key="tooltip" />
                <Legend key="legend" />
                <Line key="line-tests" type="monotone" dataKey="tests" stroke="#667eea" strokeWidth={2} name="Lab Tests" />
                <Line key="line-vaccines" type="monotone" dataKey="vaccines" stroke="#43e97b" strokeWidth={2} name="Vaccinations" />
                <Line key="line-visits" type="monotone" dataKey="visits" stroke="#fa709a" strokeWidth={2} name="Clinic Visits" />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper elevation={0} sx={{ p: 3, border: '1px solid #e2e8f0', borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom fontWeight="bold" sx={{ color: '#1e293b', mb: 2 }}>
              {isRtl ? 'توزيع اللقاحات' : 'Vaccine Distribution'}
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  key="pie-vaccine-dist"
                  data={vaccineDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name} (${entry.percentage}%)`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {vaccineDistribution.map((entry, index) => (
                    <Cell key={`vaccine-dist-${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip key="tooltip" />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper elevation={0} sx={{ p: 3, border: '1px solid #e2e8f0', borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom fontWeight="bold" sx={{ color: '#1e293b', mb: 2 }}>
              {isRtl ? 'مؤشرات الأداء الرئيسية' : 'Key Performance Indicators'}
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <Box sx={{ p: 2.5, bgcolor: '#eff6ff', borderRadius: 2, border: '1px solid #bfdbfe' }}>
                  <Typography variant="h3" fontWeight="bold" sx={{ color: '#1e40af', mb: 0.5 }}>82%</Typography>
                  <Typography variant="body2" color="text.secondary" fontWeight="medium">
                    {isRtl ? 'التغطية الشاملة' : 'Overall Coverage'}
                  </Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Box sx={{ p: 2.5, bgcolor: '#f0fdf4', borderRadius: 2, border: '1px solid #bbf7d0' }}>
                  <Typography variant="h3" fontWeight="bold" sx={{ color: '#15803d', mb: 0.5 }}>295</Typography>
                  <Typography variant="body2" color="text.secondary" fontWeight="medium">
                    {isRtl ? 'الموظفون النشطون' : 'Active Employees'}
                  </Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Box sx={{ p: 2.5, bgcolor: '#fffbeb', borderRadius: 2, border: '1px solid #fde68a' }}>
                  <Typography variant="h3" fontWeight="bold" sx={{ color: '#b45309', mb: 0.5 }}>42</Typography>
                  <Typography variant="body2" color="text.secondary" fontWeight="medium">
                    {isRtl ? 'الإجراءات المعلقة' : 'Pending Actions'}
                  </Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Box sx={{ p: 2.5, bgcolor: '#fef2f2', borderRadius: 2, border: '1px solid #fecaca' }}>
                  <Typography variant="h3" fontWeight="bold" sx={{ color: '#991b1b', mb: 0.5 }}>98%</Typography>
                  <Typography variant="body2" color="text.secondary" fontWeight="medium">
                    {isRtl ? 'معدل الامتثال' : 'Compliance Rate'}
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
