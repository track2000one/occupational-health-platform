import { useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, Stack, Typography,
} from '@mui/material';
import { toast } from 'sonner';
import { authFetch, getAccessToken } from '../context/AuthContext';

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const PHRASE = 'تفعيل تشغيلي';

type Center = { id: number; name: string; name_ar?: string; approval_status?: string; is_active: boolean; is_archived?: boolean };
type Preview = {
  selected_count: number; eligible_count: number; blocked_count: number;
  already_active_count: number; blocked: Array<{id: number; name: string; reason: string}>;
  preview_token: string; commit_enabled: boolean;
};
const REASONS: Record<string,string> = {
  inactive: 'المركز غير نشط', archived: 'المركز مؤرشف',
  missing_name: 'اسم المركز غير موجود',
  duplicate_display_name: 'اسم المركز مكرر ويحتاج تصحيحًا',
};
async function post(payload: Record<string, unknown>) {
  if (!API) throw new Error('لا يوجد اتصال API محدد لنسخة V4.');
  const token = getAccessToken();
  if (!token) throw new Error('انتهت صلاحية جلسة المسؤول.');
  const response = await authFetch(API + '/health-centers/operational-activation/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(data.detail || 'تعذر فحص المراكز.'));
  return data;
}

export function V4CenterOperationalActivation({
  centers, onActivated,
}: {
  centers: Center[]; onActivated: () => Promise<void> | void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const eligibleCenters = centers.filter(center =>
    !center.is_archived && center.is_active && center.approval_status !== 'approved');

  async function openPreview(ids: number[]) {
    setBusy(true); setSelected(ids); setConfirmed(false);
    try {
      const data = await post({ action: 'preview', center_ids: ids });
      setPreview(data as Preview);
    } catch (error) {
      setPreview(null);
      toast.error(error instanceof Error ? error.message : 'تعذرت معاينة المراكز.');
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    if (!preview || !confirmed || busy || !preview.eligible_count) return;
    setBusy(true);
    try {
      const result = await post({
        action: 'activate', center_ids: selected,
        preview_token: preview.preview_token,
        confirmed: true, confirm_text: PHRASE,
      });
      setPreview(null); setConfirmed(false);
      toast.success('تم التفعيل التشغيلي لعدد ' + result.activated_count + ' مركزًا دون تغيير الموظفين.');
      await onActivated();
    } catch (error) {
      setPreview(null); setConfirmed(false);
      toast.error((error instanceof Error ? error.message : 'فشل التفعيل.') + ' أعد المعاينة.');
    } finally { setBusy(false); }
  }

  return <>
    <Button variant="contained" color="success"
      disabled={busy || eligibleCenters.length === 0}
      onClick={() => void openPreview(eligibleCenters.map(center => center.id))}>
      {busy ? 'جارٍ فحص المراكز…' : 'معاينة وتفعيل المراكز (' + eligibleCenters.length + ')'}
    </Button>
    <Dialog open={!!preview} onClose={() => !busy && setPreview(null)} fullWidth maxWidth="sm" dir="rtl">
      <DialogTitle fontWeight={900}>تفعيل المراكز للتشغيل الداخلي</DialogTitle>
      <DialogContent dividers>
        {preview && <Stack gap={2}>
          <Alert severity="info">
            هذا تفعيل لبيانات المنصة فقط، وليس اعتماد هيكلة بقرار رسمي.
            لا يلزم رقم قرار، ولن تُعدّل بطاقات الموظفين أو ملفاتهم الصحية.
          </Alert>
          <Box display="flex" gap={2} flexWrap="wrap">
            <Typography>المحددة: <strong>{preview.selected_count}</strong></Typography>
            <Typography>المؤهلة: <strong>{preview.eligible_count}</strong></Typography>
            <Typography>المفعّلة مسبقًا: <strong>{preview.already_active_count}</strong></Typography>
            <Typography>تحتاج تصحيحًا: <strong>{preview.blocked_count}</strong></Typography>
          </Box>
          {preview.blocked_count > 0 && <Box sx={{ maxHeight: 180, overflowY: 'auto' }}>
            {preview.blocked.map(row =>
              <Typography variant="body2" key={row.id}>
                {row.name} — {REASONS[row.reason] || row.reason}
              </Typography>)}
          </Box>}
          {preview.eligible_count > 0 &&
            <FormControlLabel
              control={<Checkbox checked={confirmed} onChange={(_, checked) => setConfirmed(checked)}/>}
              label="راجعت الأسماء المؤهلة وأوافق على تفعيلها للتشغيل الداخلي فقط." />}
        </Stack>}
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={() => setPreview(null)}>إلغاء</Button>
        <Button color="success" variant="contained"
          disabled={busy || !confirmed || !preview?.eligible_count}
          onClick={() => void activate()}>تأكيد التفعيل التشغيلي</Button>
      </DialogActions>
    </Dialog>
  </>;
}
