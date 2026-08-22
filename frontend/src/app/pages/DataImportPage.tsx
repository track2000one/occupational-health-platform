import { useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  LinearProgress,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  Security as SecurityIcon,
  Preview as PreviewIcon,
  Storage as StorageIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { getAccessToken } from '../context/AuthContext';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/$/, '');

type ImportResult = {
  batch_id?: number;
  mode: 'preview' | 'commit';
  file_name: string;
  sheet_name: string;
  available_sheets: string[];
  detected_headers: string[];
  mapped_fields: Record<string, number>;
  summary: {
    total_rows: number;
    valid_rows: number;
    duplicate_rows: number;
    errors_count: number;
    skipped_rows: number;
    imported_employees: number;
    imported_clinic_visits: number;
  };
  duplicates: { row: number; national_id: string; name: string; reason: string }[];
  errors: { row: number; reason: string }[];
  preview_rows: Record<string, string | number | null>[];
  privacy_note: string;
};

function summaryCard(label: string, value: number | string, color: string) {
  return (
    <Card sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
      <CardContent>
        <Typography color="text.secondary" variant="body2">{label}</Typography>
        <Typography variant="h4" fontWeight={900} sx={{ color }}>{value}</Typography>
      </CardContent>
    </Card>
  );
}

export function DataImportPage() {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';
  const [file, setFile] = useState<File | null>(null);
  const [sheetName, setSheetName] = useState('');
  const [commitMode, setCommitMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] || null;
    setFile(selected);
    setResult(null);
  };

  const upload = async () => {
    if (!file) {
      toast.error(isRtl ? 'اختر ملف Excel أولًا' : 'Select an Excel file first');
      return;
    }
    const token = getAccessToken();
    if (!token) {
      toast.error(isRtl ? 'انتهت الجلسة. سجّل الدخول مرة أخرى.' : 'Session expired. Login again.');
      return;
    }

    setLoading(true);
    const loadingToast = toast.loading(commitMode ? (isRtl ? 'جاري الاستيراد إلى قاعدة البيانات...' : 'Importing into database...') : (isRtl ? 'جاري فحص الملف...' : 'Validating file...'));
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('commit', commitMode ? 'true' : 'false');
      if (sheetName.trim()) form.append('sheetName', sheetName.trim());

      const response = await fetch(`${API_BASE_URL}/excel-import/upload/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || body.file || 'Import failed');
      setResult(body as ImportResult);
      toast.success(commitMode ? (isRtl ? 'تم الحفظ في PostgreSQL بنجاح' : 'Committed to PostgreSQL') : (isRtl ? 'تم فحص الملف بنجاح' : 'File validated successfully'), { id: loadingToast });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (isRtl ? 'تعذر استيراد الملف' : 'Import failed'), { id: loadingToast });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ direction: isRtl ? 'rtl' : 'ltr' }}>
      <Paper sx={{ p: 3, mb: 3, borderRadius: 4, background: 'linear-gradient(135deg, #f8fbff 0%, #eef4ff 55%, #fff 100%)', border: '1px solid rgba(102,126,234,.18)' }}>
        <Stack direction={{ xs: 'column', md: isRtl ? 'row-reverse' : 'row' }} justifyContent="space-between" spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
          <Box sx={{ textAlign: isRtl ? 'right' : 'left' }}>
            <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <SecurityIcon color="primary" />
              <Typography variant="overline" color="primary" fontWeight={900}>{isRtl ? 'استيراد آمن للبيانات الصحية' : 'Secure Health Data Import'}</Typography>
            </Stack>
            <Typography variant="h4" fontWeight={950}>{isRtl ? 'استيراد Excel إلى قاعدة البيانات' : 'Excel Import to Database'}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, maxWidth: 950, lineHeight: 1.9 }}>
              {isRtl ? 'ارفع ملف Excel داخل المنصة فقط. يتم فحص الأعمدة، إخفاء أرقام الهوية في المعاينة، التحقق من التكرار، ثم الحفظ في PostgreSQL عند التفعيل.' : 'Upload Excel inside the platform only. Columns are validated, IDs are masked in preview, duplicates are checked, and records are committed to PostgreSQL only when enabled.'}
            </Typography>
          </Box>
          <Chip color="warning" icon={<WarningIcon />} label={isRtl ? 'لا ترفع ملفات البيانات إلى GitHub' : 'Do not upload data files to GitHub'} sx={{ fontWeight: 800 }} />
        </Stack>
      </Paper>

      <Alert severity="warning" sx={{ mb: 3 }}>
        {isRtl ? 'هذه الشاشة مخصصة للملفات التي تحتوي على بيانات حساسة مثل الهوية والجوال والتشخيصات. الملف الخام لا يُحفظ في GitHub، ويُستخدم فقط أثناء عملية الفحص أو الاستيراد.' : 'This page is for sensitive files such as IDs, phone numbers, and diagnoses. Raw files are not stored in GitHub and are used only during validation/import.'}
      </Alert>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 5 }}>
          <Card sx={{ borderRadius: 4 }}>
            <CardContent>
              <Stack spacing={2.5}>
                <Button component="label" variant="contained" size="large" startIcon={<CloudUploadIcon />} sx={{ borderRadius: 3, py: 1.6 }}>
                  {file ? file.name : (isRtl ? 'اختيار ملف Excel' : 'Select Excel File')}
                  <input hidden type="file" accept=".xlsx,.xlsm,.xltx,.xltm" onChange={onFileChange} />
                </Button>

                <TextField
                  label={isRtl ? 'اسم الشيت اختياري' : 'Sheet name optional'}
                  value={sheetName}
                  onChange={(event) => setSheetName(event.target.value)}
                  placeholder="Database"
                  fullWidth
                />

                <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                  <Stack direction={isRtl ? 'row-reverse' : 'row'} alignItems="center" justifyContent="space-between">
                    <Box sx={{ textAlign: isRtl ? 'right' : 'left' }}>
                      <Typography fontWeight={900}>{isRtl ? 'حفظ فعلي في PostgreSQL' : 'Commit to PostgreSQL'}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {isRtl ? 'اتركه مغلقًا للمعاينة فقط، وفعّله بعد مراجعة النتائج.' : 'Keep off for preview. Enable only after reviewing validation results.'}
                      </Typography>
                    </Box>
                    <Switch checked={commitMode} onChange={(event) => setCommitMode(event.target.checked)} color="success" />
                  </Stack>
                </Paper>

                <Button onClick={upload} disabled={loading || !file} variant="contained" color={commitMode ? 'success' : 'primary'} size="large" startIcon={commitMode ? <StorageIcon /> : <PreviewIcon />} sx={{ borderRadius: 3, py: 1.4 }}>
                  {commitMode ? (isRtl ? 'فحص وحفظ في قاعدة البيانات' : 'Validate & Commit') : (isRtl ? 'فحص ومعاينة فقط' : 'Validate Preview Only')}
                </Button>

                {loading && <LinearProgress />}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 7 }}>
          <Card sx={{ borderRadius: 4 }}>
            <CardContent>
              <Typography variant="h6" fontWeight={900} gutterBottom>{isRtl ? 'قواعد الاستيراد' : 'Import Rules'}</Typography>
              <Stack spacing={1.2}>
                <Typography variant="body2">{isRtl ? '1. يجب وجود اسم الموظف ورقم الهوية/السجل.' : '1. Employee name and National/Registry ID are required.'}</Typography>
                <Typography variant="body2">{isRtl ? '2. رقم الهوية يتم التحقق منه لمنع التكرار داخل الملف وقاعدة البيانات.' : '2. National ID is checked for duplicates inside the file and database.'}</Typography>
                <Typography variant="body2">{isRtl ? '3. يتم إخفاء الهوية والجوال في المعاينة.' : '3. IDs and phone numbers are masked in preview.'}</Typography>
                <Typography variant="body2">{isRtl ? '4. إذا وُجد تشخيص يتم إنشاء زيارة عيادة مرتبطة بالموظف عند الحفظ.' : '4. If diagnosis exists, a clinic visit is created on commit.'}</Typography>
                <Typography variant="body2">{isRtl ? '5. لا يتم تخزين ملف Excel الخام داخل المستودع أو قاعدة البيانات.' : '5. Raw Excel files are not stored in the repository or database.'}</Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {result && (
        <Box sx={{ mt: 3 }}>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>{summaryCard(isRtl ? 'إجمالي الصفوف' : 'Total rows', result.summary.total_rows, '#1e40af')}</Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>{summaryCard(isRtl ? 'صفوف صالحة' : 'Valid rows', result.summary.valid_rows, '#16a34a')}</Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>{summaryCard(isRtl ? 'مكررة' : 'Duplicates', result.summary.duplicate_rows, '#f59e0b')}</Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>{summaryCard(isRtl ? 'أخطاء' : 'Errors', result.summary.errors_count, '#dc2626')}</Grid>
          </Grid>

          <Alert icon={<CheckCircleIcon />} severity={result.mode === 'commit' ? 'success' : 'info'} sx={{ mb: 2 }}>
            {result.mode === 'commit'
              ? (isRtl ? `تم الحفظ: ${result.summary.imported_employees} موظف و ${result.summary.imported_clinic_visits} زيارة عيادة.` : `Committed: ${result.summary.imported_employees} employees and ${result.summary.imported_clinic_visits} clinic visits.`)
              : (isRtl ? 'هذه نتيجة معاينة فقط، لم يتم الحفظ في قاعدة البيانات.' : 'Preview only. Nothing was saved to the database.')}
          </Alert>

          <Paper sx={{ p: 2.5, borderRadius: 3, mb: 2 }}>
            <Stack direction={isRtl ? 'row-reverse' : 'row'} spacing={1} flexWrap="wrap">
              <Chip label={`${isRtl ? 'الشيت' : 'Sheet'}: ${result.sheet_name}`} />
              <Chip label={`${isRtl ? 'الدفعة' : 'Batch'}: ${result.batch_id || '-'}`} />
              <Chip label={`${isRtl ? 'الوضع' : 'Mode'}: ${result.mode}`} color={result.mode === 'commit' ? 'success' : 'primary'} />
            </Stack>
          </Paper>

          <TableContainer component={Paper} sx={{ borderRadius: 3, mb: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{isRtl ? 'الصف' : 'Row'}</TableCell>
                  <TableCell>{isRtl ? 'الاسم' : 'Name'}</TableCell>
                  <TableCell>{isRtl ? 'الهوية masked' : 'Masked ID'}</TableCell>
                  <TableCell>{isRtl ? 'المركز' : 'Center'}</TableCell>
                  <TableCell>{isRtl ? 'المسمى' : 'Job Title'}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.preview_rows.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell>{row.row}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.national_id}</TableCell>
                    <TableCell>{row.health_center}</TableCell>
                    <TableCell>{row.job_title}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {(result.duplicates.length > 0 || result.errors.length > 0) && (
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Alert severity="warning" sx={{ mb: 1 }}>{isRtl ? 'التكرارات' : 'Duplicates'}</Alert>
                <Paper sx={{ p: 2, borderRadius: 3, maxHeight: 260, overflow: 'auto' }}>
                  {result.duplicates.length ? result.duplicates.map((item, index) => <Typography key={index} variant="body2">#{item.row} - {item.name} - {item.national_id} - {item.reason}</Typography>) : <Typography variant="body2">-</Typography>}
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Alert severity="error" sx={{ mb: 1 }}>{isRtl ? 'الأخطاء' : 'Errors'}</Alert>
                <Paper sx={{ p: 2, borderRadius: 3, maxHeight: 260, overflow: 'auto' }}>
                  {result.errors.length ? result.errors.map((item, index) => <Typography key={index} variant="body2">#{item.row} - {item.reason}</Typography>) : <Typography variant="body2">-</Typography>}
                </Paper>
              </Grid>
            </Grid>
          )}

          <Divider sx={{ my: 3 }} />
          <Alert severity="info">{result.privacy_note}</Alert>
        </Box>
      )}
    </Box>
  );
}
