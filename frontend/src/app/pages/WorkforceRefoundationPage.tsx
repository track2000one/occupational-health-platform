import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert, Box, Button, CircularProgress, Grid, Paper, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Typography,
} from '@mui/material';
import { ArrowBack, Refresh, ShieldOutlined, WarningAmber } from '@mui/icons-material';
import { authFetch, getAccessToken, useAuth } from '../context/AuthContext';

const API = (import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:8000/api' : '')).replace(/\/$/, '');

type ModelCounts = { model: string; count: number };
type SectionCounts = {
  key: string; title: string; total: number; items: ModelCounts[];
};
type RefoundationPreview = {
  mode: 'read_only_full_refoundation_impact_preview';
  employees: { total: number; active: number; archived: number };
  health_centers: { total: number; active: number; archived: number };
  organization_units: { total: number; active: number; inactive: number; approved: number };
  sections: SectionCounts[];
  protected_relations: Array<{
    target: string; dependent_model: string; linked_count: number;
  }>;
  archive_frees_unique_employee_identity: false;
  production_backup_restored_and_verified: false;
  execution_available: false;
  recommended_sequence: string[];
  notice: string;
};

export function WorkforceRefoundationPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [report, setReport] = useState<RefoundationPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!user?.isSuperuser) return;
    setBusy(true);
    setError('');
    try {
      const token = getAccessToken();
      if (!token) throw new Error('يلزم تسجيل الدخول مجددًا.');
      const response = await authFetch(API + '/workforce-refoundation/preview/', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!response.ok) {
        throw new Error(response.status === 403
          ? 'معاينة التصفير متاحة للمسؤول الأعلى فقط.'
          : 'تعذّر حصر البيانات. لم يتم إجراء أي تعديل.');
      }
      setReport(await response.json() as RefoundationPreview);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'فشلت المعاينة.');
      setReport(null);
    } finally {
      setBusy(false);
    }
  }, [user?.isSuperuser]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (!user?.isSuperuser) {
    return <Alert severity="error">هذه الصفحة خاصة بالمسؤول الأعلى فقط.</Alert>;
  }

  return <Box sx={{ maxWidth: 1250, mx: 'auto', pb: 4 }}>
    <Paper sx={{ p: { xs: 2.5, md: 3.5 }, mb: 2, borderRadius: 3 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={2} alignItems={{ md: 'center' }}
        justifyContent="space-between">
        <Box>
          <Typography variant="h5" fontWeight={900} gutterBottom>
            معاينة إعادة تأسيس بيانات الموظفين والهيكلة التنظيمية
          </Typography>
          <Typography color="text.secondary">
            حصر شامل للبيانات القديمة قبل اعتماد قالب V4، دون حذف أو إخفاء أي سجل.
          </Typography>
        </Box>
        <Stack direction="row" gap={1}>
          <Button variant="outlined" startIcon={<ArrowBack />} onClick={() => navigate('/admin')}>
            لوحة المسؤول
          </Button>
          <Button variant="contained" disabled={busy} startIcon={<Refresh />} onClick={() => void refresh()}>
            تحديث الحصر
          </Button>
        </Stack>
      </Stack>
    </Paper>

    <Alert severity="warning" icon={<WarningAmber />} sx={{ mb: 2 }}>
      <strong>التصفير النهائي غير مفعّل.</strong> إخفاء بطاقات الموظفين بالأرشفة
      لا يحرر أرقام الهوية الفريدة ولا يسمح تلقائيًا بإعادة استيراد الموظفين أنفسهم.
      يجب حفظ قاعدة الإنتاج القديمة بشكل مستقل والتحقق من إمكانية استعادتها قبل البدء بقاعدة جديدة.
    </Alert>

    <Alert severity="info" icon={<ShieldOutlined />} sx={{ mb: 2 }}>
      هذه الصفحة للمعاينة فقط، ولا تعرض أسماء أو أرقام هويات أو سجلات طبية فردية.
      حسابات المستخدمين وصلاحيات النظام وسجل التدقيق خارج نطاق التصفير المقترح.
    </Alert>

    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {busy && <Stack alignItems="center" sx={{ py: 3 }}><CircularProgress /></Stack>}
    {report && <>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {[
          { title: 'إجمالي الموظفين', value: report.employees.total,
            note: 'نشط: ' + report.employees.active + ' | مؤرشف: ' + report.employees.archived },
          { title: 'المراكز الصحية', value: report.health_centers.total,
            note: 'نشط: ' + report.health_centers.active + ' | مؤرشف: ' + report.health_centers.archived },
          { title: 'الوحدات والأقسام', value: report.organization_units.total,
            note: 'معتمد: ' + report.organization_units.approved +
              ' | غير نشط: ' + report.organization_units.inactive },
          { title: 'ارتباطات تمنع الحذف المباشر', value: report.protected_relations.length,
            note: 'أنواع ارتباطات محمية؛ ليست عدد الموظفين' },
        ].map(item => <Grid key={item.title} size={{ xs: 12, sm: 6, md: 3 }}>
          <Paper variant="outlined" sx={{ p: 2.2, borderRadius: 2, height: '100%' }}>
            <Typography variant="body2" color="text.secondary">{item.title}</Typography>
            <Typography variant="h4" fontWeight={900} sx={{ my: 1 }}>
              {item.value.toLocaleString('ar-SA')}
            </Typography>
            <Typography variant="caption" color="text.secondary">{item.note}</Typography>
          </Paper>
        </Grid>)}
      </Grid>

      <Paper sx={{ p: 2, mb: 2, borderRadius: 3 }}>
        <Typography variant="h6" fontWeight={800} gutterBottom>بيان السجلات حسب المجال</Typography>
        <TableContainer>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>المجال</TableCell><TableCell align="center">إجمالي سجلات المجال</TableCell>
              <TableCell>تفاصيل الأنواع</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {report.sections.map(section => <TableRow key={section.key}>
                <TableCell sx={{ fontWeight: 700 }}>{section.title}</TableCell>
                <TableCell align="center">{section.total.toLocaleString('ar-SA')}</TableCell>
                <TableCell>
                  {section.items.filter(item => item.count > 0)
                    .map(item => item.model + ': ' + item.count.toLocaleString('ar-SA'))
                    .join('، ') || 'لا توجد سجلات'}
                </TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </TableContainer>
        <Typography variant="caption" color="text.secondary">
          إجمالي سجلات المجال يجمع عدة جداول مرتبطة، ولا يمثل عدد الأشخاص الفريدين.
        </Typography>
      </Paper>

      {report.protected_relations.length > 0 && <Paper sx={{ p: 2, mb: 2, borderRadius: 3 }}>
        <Typography variant="h6" fontWeight={800} gutterBottom>
          الارتباطات المحمية التي تتطلب معالجة مسبقة
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>الجدول الرئيسي</TableCell><TableCell>جدول مرتبط</TableCell>
              <TableCell align="center">عدد الروابط</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {report.protected_relations.map((item, i) => <TableRow key={i}>
                <TableCell>{item.target}</TableCell><TableCell>{item.dependent_model}</TableCell>
                <TableCell align="center">{item.linked_count.toLocaleString('ar-SA')}</TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>}

      <Paper sx={{ p: 2.5, borderRadius: 3 }}>
        <Typography variant="h6" fontWeight={800} gutterBottom>التسلسل الآمن للتنفيذ</Typography>
        <Box component="ol" sx={{ pl: 3, '& li': { my: 1 } }}>
          {report.recommended_sequence.map((step, index) => <li key={index}>{step}</li>)}
        </Box>
        <Alert severity="warning" sx={{ mt: 2 }}>
          لا يتوفر زر حذف في هذه المرحلة. التقرير لا يُثبت وجود نسخة احتياطية فعلية،
          ولا يجيز إتلاف السجلات الطبية أو التاريخية.
        </Alert>
      </Paper>
    </>}
  </Box>;
}
