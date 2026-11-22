import { useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, Paper, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import { authFetch } from '../context/AuthContext';
import { V4_PRIVATE_UI } from '../data/v4AffiliationHierarchy';
import {
  type AffiliationPreview, mergeAffiliationPreview,
} from '../utils/affiliationBulkPreview';

const API = 'http://127.0.0.1:18081/api';
const labels = {
  center: 'مركز صحي', department: 'إدارة / قسم', unknown: 'تبعية غير محددة',
  matched_approved: 'مطابق لجهة معتمدة',
  matched_pending_reference: 'مطابق لمسودة — المرجع غير مكتمل',
  missing_in_directory: 'المسار غير موجود في الدليل',
  ambiguous_directory: 'تعارض في مسميات الدليل',
  missing_source: 'المسار ناقص في Excel',
  invalid_hierarchy: 'تسلسل تنظيمي غير صالح',
};
type SmallBatch = { batch_id: number; total: number };

export function V4AffiliationBulkPreview({ batch }: { batch: SmallBatch | null }) {
  const [preview, setPreview] = useState<AffiliationPreview | null>(null);
  const [progress, setProgress] = useState<{done:number;total:number} | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  if (!V4_PRIVATE_UI || !batch) return null;

  async function run() {
    if (!batch || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setPreview(null);
    setError('');
    setProgress({done:0,total:batch.total});
    try {
      let combined: AffiliationPreview | null = null;
      for (let offset = 0; offset < batch.total;) {
        const response = await authFetch(
          API + '/provisional-employees/affiliation-preview/?offset=' + offset + '&limit=100',
        );
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(String(payload.detail || 'تعذر استلام معاينة الربط.'));
        }
        const chunk = await response.json() as AffiliationPreview;
        if (chunk.batch_id !== batch.batch_id || chunk.rows_total !== batch.total) {
          throw new Error('تغيرت الدفعة الحالية أثناء الفحص؛ لا توجد أي عملية ربط.');
        }
        combined = mergeAffiliationPreview(combined, chunk);
        offset = chunk.segment.next_offset;
        setProgress({done:offset,total:batch.total});
        if (!chunk.segment.has_more) break;
      }
      if (!combined || combined.rows_scanned !== batch.total ||
          combined.segment.has_more) {
        throw new Error('معاينة الربط لم تشمل جميع السجلات؛ لا يوجد حفظ.');
      }
      setPreview(combined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر فحص الربط التنظيمي.');
    } finally {
      setBusy(false);
      setProgress(null);
      inFlight.current = false;
    }
  }

  const issuePaths = preview?.paths.filter(
    path => path.state !== 'matched_approved',
  ).sort((a,b) => (a.state === 'matched_pending_reference' ? 1 : 0) -
                   (b.state === 'matched_pending_reference' ? 1 : 0) ||
                   b.count - a.count).slice(0,30) || [];

  return <Paper sx={{ p:2, mb:2, borderRadius:3 }} dir="rtl">
    <Stack gap={1.5}>
      <Stack direction={{ xs:'column',sm:'row' }} alignItems={{sm:'center'}}
        justifyContent="space-between" gap={1}>
        <Box>
          <Typography variant="h6" fontWeight={800}>معاينة الربط التنظيمي الجماعي — V4</Typography>
          <Typography variant="body2" color="text.secondary">
            مطابقة جميع بطاقات الموظفين مع القطاعات والمراكز والإدارات والأقسام الواردة في دليل V4،
            باستخدام التبعية المحفوظة من Excel. دون اعتماد أو تعديل أي سجل.
          </Typography>
        </Box>
        <Button variant="contained" disabled={busy} onClick={() => void run()}>
          {busy ? 'جارٍ تحليل التبعية...' : 'فحص الربط الجماعي الآن'}
        </Button>
      </Stack>
      {progress && <Alert severity="info">
        جارٍ فحص {progress.done} من {progress.total} بطاقة، على دفعات صغيرة. لا تنفذ الاستيراد مرة أخرى.
      </Alert>}
      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      {preview && <>
        <Alert severity="success">
          اكتملت معاينة {preview.rows_scanned} بطاقة. لم تُنشأ أي علاقة تبعية أو جهة تنظيمية
          أو سجل موظف، ولم تحدث أي عملية اعتماد.
        </Alert>
        <Stack direction="row" gap={1} flexWrap="wrap">
          <Chip color="info" label={'موظفو المراكز: ' + preview.source_kinds.center}/>
          <Chip label={'موظفو الإدارات والأقسام: ' + preview.source_kinds.department}/>
          <Chip color="warning" label={'تبعية غير مكتملة: ' + preview.source_kinds.unknown}/>
          <Chip color="success" variant="outlined"
            label={'مطابق لجهة معتمدة: ' + preview.statuses.matched_approved}/>
          <Chip color="warning" label={'مطابق لمسودات: ' + preview.statuses.matched_pending_reference}/>
          <Chip color="error"
            label={'غير مطابق / يحتاج تصحيحًا: ' + (
              preview.statuses.missing_in_directory +
              preview.statuses.ambiguous_directory +
              preview.statuses.missing_source +
              preview.statuses.invalid_hierarchy
            )}/>
          <Chip variant="outlined"
            label={'ملاحظات تصنيفية من Excel: ' + preview.source_review_flags}/>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          تطابق المسودة لا يعني اعتمادها؛ يتطلب الربط التشغيلي اعتماد الجهة والمركز
          والتحقق من صحة البيانات الوظيفية. لا تُستخدم هذه المعاينة لفتح ملفات طبية.
        </Typography>
        {issuePaths.length > 0 && <>
          <Typography fontWeight={800}>المسارات التي تتطلب استكمالًا أو مراجعة (أول 30)</Typography>
          <TableContainer sx={{maxHeight:370}}>
            <Table size="small" stickyHeader>
              <TableHead><TableRow>
                <TableCell>المسار التنظيمي</TableCell>
                <TableCell>نوع التبعية</TableCell>
                <TableCell>الملاحظة</TableCell>
                <TableCell align="center">البطاقات</TableCell>
              </TableRow></TableHead>
              <TableBody>{issuePaths.map((item,i) => <TableRow key={i}>
                <TableCell>{item.path || 'غير محدد في المصدر'}</TableCell>
                <TableCell>{labels[item.kind]}</TableCell>
                <TableCell>{labels[item.state]}</TableCell>
                <TableCell align="center">{item.count}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </TableContainer>
        </>}
      </>}
    </Stack>
  </Paper>;
}
