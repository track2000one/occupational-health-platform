import { useEffect, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Checkbox, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, LinearProgress, Paper,
  Stack, TextField, Typography,
} from '@mui/material';
import { toast } from 'sonner';

import { authFetch, getAccessToken } from '../context/AuthContext';

const API_URL = (import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:8000/api' : '')).replace(/\/$/, '');

type SourceGroup = {
  source_name: string;
  count: number;
  with_name_and_identity: number;
};
type Center = {
  id: number;
  name: string;
  name_ar: string;
  code: string;
};
type GroupData = {
  unmatched_count: number;
  missing_source_count: number;
  missing_name_count: number;
  group_count: number;
  truncated: boolean;
  groups: SourceGroup[];
  centers: Center[];
};
type MappingPreview = {
  mode: 'preview';
  source_name: string;
  target_center_id: number;
  target_center_name: string;
  affected_count: number;
  with_name_and_identity: number;
  still_missing_basic_info: number;
  preview_token: string;
};

type Props = {
  open: boolean;
  isRtl: boolean;
  onClose: () => void;
  onMapped: () => void | Promise<void>;
};

export function StagingCenterReconciliationDialog({
  open, isRtl, onClose, onMapped,
}: Props) {
  const [data, setData] = useState<GroupData | null>(null);
  const [source, setSource] = useState<SourceGroup | null>(null);
  const [center, setCenter] = useState<Center | null>(null);
  const [preview, setPreview] = useState<MappingPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const request = async <T,>(method: 'GET' | 'POST', body?: Record<string, unknown>): Promise<T> => {
    const token = getAccessToken();
    if (!token || !API_URL) throw new Error('يجب تسجيل الدخول وضبط اتصال Staging أولًا.');
    const response = await authFetch(`${API_URL}/employee-import-reviews/center-reconciliation/`, {
      method, headers: {
        Authorization: `Bearer ${token}`,
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json.detail || 'تعذر مراجعة مراكز الاستيراد.');
    return json as T;
  };

  const load = async () => {
    setBusy(true);
    try {
      const response = await request<GroupData>('GET');
      setData(response);
      setSource(null);
      setCenter(null);
      setPreview(null);
      setConfirmed(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر جلب المراكز المعلقة');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open]);

  const changeSource = (_: unknown, next: SourceGroup | null) => {
    setSource(next);
    setPreview(null);
    setConfirmed(false);
  };
  const changeCenter = (_: unknown, next: Center | null) => {
    setCenter(next);
    setPreview(null);
    setConfirmed(false);
  };

  const previewMatch = async () => {
    if (!source || !center || busy) return;
    setBusy(true);
    try {
      const response = await request<MappingPreview>('POST', {
        action: 'preview', source_name: source.source_name,
        target_center_id: center.id,
      });
      setPreview(response);
      setConfirmed(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر معاينة المطابقة');
    } finally {
      setBusy(false);
    }
  };

  const commitMatch = async () => {
    if (!preview || !confirmed || busy) return;
    setBusy(true);
    try {
      const result = await request<{ mapped_count: number; remaining_without_name_or_identity: number }>(
        'POST', { action: 'commit', confirmed: true, preview_token: preview.preview_token },
      );
      toast.success(
        isRtl ? `تمت مطابقة ${result.mapped_count} بطاقة بمركز معتمد. لم يُضف أي موظف بعد.`
          : `Matched ${result.mapped_count} reviews. No employees were activated.`,
        { duration: 8500 },
      );
      await load();
      await onMapped();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر حفظ مطابقة المراكز');
      setPreview(null);
      setConfirmed(false);
    } finally {
      setBusy(false);
    }
  };

  return <Dialog open={open} onClose={() => !busy && onClose()}
    fullWidth maxWidth="md" dir={isRtl ? 'rtl' : 'ltr'}
    PaperProps={{ sx: { borderRadius: 3 } }}>
    <DialogTitle fontWeight={900}>
      {isRtl ? 'مطابقة مراكز الموظفين المعلّقة' : 'Match pending employee centers'}
    </DialogTitle>
    <DialogContent dividers>
      {busy && <LinearProgress sx={{ mb: 2 }} />}
      <Stack spacing={2}>
        <Alert severity="info">
          {isRtl
            ? 'هذه خطوة اعتماد ربط المركز فقط؛ لا تُنشئ موظفين. اختر اسم المركز الوارد في Excel ثم طابقه بالمركز الصحيح في سجل المنصة. لا تختر مركزًا لمجرد تشابه الاسم.'
            : 'This step updates the center mapping only. No employees are created. Verify the source label against the master center before confirming.'}
        </Alert>
        {data && <>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>
            {[
              [isRtl ? 'بطاقات بلا مركز مطابق' : 'Unmatched centers', data.unmatched_count],
              [isRtl ? 'مجموعات مسميات المراكز' : 'Center name groups', data.group_count],
              [isRtl ? 'بلا اسم مركز أصلي' : 'Missing source name', data.missing_source_count],
            ].map(([label, value]) => <Paper variant="outlined" key={String(label)}
              sx={{ p: 1.5, textAlign: 'center', borderRadius: 2 }}>
              <Typography fontWeight={900} fontSize={23}>{value}</Typography>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
            </Paper>)}
          </Box>
          {data.truncated && <Alert severity="warning">
            توجد مجموعات أكثر من الحد المعروض. عالج الأسماء الظاهرة أولًا ثم حدّث القائمة.
          </Alert>}
          <Autocomplete
            fullWidth
            options={data.groups}
            value={source}
            onChange={changeSource}
            getOptionLabel={item => `${item.source_name} (${item.count})`}
            isOptionEqualToValue={(a, b) => a.source_name === b.source_name}
            renderInput={params => <TextField {...params} label={
              isRtl ? 'اسم المركز كما ورد في بيانات Excel' : 'Source center label from Excel'
            } helperText={isRtl
              ? 'القائمة مجمعة بالاسم الأصلي، وتعرض عدد البطاقات التي تشترك في الاسم.'
              : 'The original labels are grouped by their exact source value.'} />}
            noOptionsText={isRtl ? 'لا توجد مراكز معلّقة بمسميات مسجلة' : 'No source groups'}
          />
          <Autocomplete
            fullWidth
            options={data.centers}
            value={center}
            onChange={changeCenter}
            getOptionLabel={item => `${item.name_ar || item.name} (${item.code})`}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={params => <TextField {...params} label={
              isRtl ? 'المركز الصحيح في سجل المراكز الصحية' : 'Correct master health center'
            } helperText={isRtl ? 'اختر مركزًا نشطًا بعد مراجعة مسماه.' : 'Choose an active, verified master center.'} />}
            noOptionsText={isRtl ? 'لم يتم العثور على مركز مطابق' : 'No matching center'}
          />
          {source && <Alert severity="warning">
            {isRtl
              ? `سيتأثر بهذا الربط ${source.count} سجلًا. من بينها ${source.with_name_and_identity} سجلًا يحتوي على اسم وهوية مكتملين مبدئيًا.`
              : `This mapping affects ${source.count} reviews, including ${source.with_name_and_identity} with an initial name and ID.`}
          </Alert>}
          <Button variant="outlined" disabled={!source || !center || busy}
            onClick={() => void previewMatch()}>
            {isRtl ? 'معاينة مطابقة هذا الاسم' : 'Preview this center mapping'}
          </Button>
          {preview && <>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography fontWeight={900}>
                {isRtl ? 'مطابقة تحتاج تأكيدك' : 'Confirm center mapping'}
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                {isRtl ? 'الاسم في الملف:' : 'Source:'} {preview.source_name}
              </Typography>
              <Typography variant="body2">
                {isRtl ? 'المركز المختار:' : 'Master center:'} {preview.target_center_name}
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                {isRtl ? 'عدد البطاقات التي سيتم ربطها:' : 'Reviews affected:'}
                {' '}{preview.affected_count}
              </Typography>
              <Typography variant="body2">
                {isRtl ? 'ستظل تحتاج اسمًا أو هوية:' : 'Still missing name or ID:'}
                {' '}{preview.still_missing_basic_info}
              </Typography>
            </Paper>
            <FormControlLabel
              control={<Checkbox checked={confirmed} disabled={busy}
                onChange={(_, checked) => setConfirmed(checked)} />}
              label={<Typography variant="body2" fontWeight={700}>
                {isRtl
                  ? 'راجعت الاسم والمسار التنظيمي وأؤكد أن هذا هو المركز الصحيح لجميع بطاقات هذه المجموعة.'
                  : 'I have verified that all reviews in this source group belong to the selected master center.'}
              </Typography>}
            />
            <Button variant="contained" color="success" disabled={!confirmed || busy}
              onClick={() => void commitMatch()}>
              {isRtl ? `تأكيد ربط ${preview.affected_count} بطاقة`
                : `Confirm mapping for ${preview.affected_count} cards`}
            </Button>
          </>}
          {data.missing_source_count > 0 && <Alert severity="warning">
            {isRtl
              ? `هناك ${data.missing_source_count} بطاقة لم يُحفظ لها اسم مركز أصلي. لا يمكن ربطها جماعيًا دون الرجوع إلى ملف المصدر أو تعديلها يدويًا.`
              : `${data.missing_source_count} reviews have no stored source center name; they require source-file reimport or individual correction.`}
          </Alert>}
          <Alert severity="info">
            {isRtl
              ? 'بعد حفظ المطابقات، افتح «تفعيل جميع البطاقات المؤهلة» مجددًا لمعاينة الأعداد الجديدة. لا تُفعّل البيانات قبل مراجعة النتيجة.'
              : 'After mapping, preview the eligible bulk activation count again. Mapping never activates employees.'}
          </Alert>
        </>}
      </Stack>
    </DialogContent>
    <DialogActions sx={{ p: 2 }}>
      <Button disabled={busy} onClick={onClose}>{isRtl ? 'إغلاق' : 'Close'}</Button>
    </DialogActions>
  </Dialog>;
}
