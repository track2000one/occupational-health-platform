import { useEffect, useState } from 'react';
import {
  Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Stack, TextField, Typography,
} from '@mui/material';
import { toast } from 'sonner';
import { authFetch, getAccessToken } from '../context/AuthContext';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
type Center = { id: number; name: string; approval_status?: string };

export function HealthCenterVerificationDialog({
  center, onClose, onVerified,
}: {
  center: Center | null;
  onClose: () => void;
  onVerified: () => void | Promise<void>;
}) {
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isRevoke = center?.approval_status === 'approved';

  useEffect(() => {
    setReference(''); setReason(''); setConfirmed(false); setError('');
  }, [center?.id, center?.approval_status]);

  async function submit() {
    if (!center || busy || !confirmed || reference.trim().length < 4 ||
        reason.trim().length < 15 || !API_BASE) return;
    if (!window.confirm(
      isRevoke ? 'تأكيد إلغاء اعتماد مرجع المركز دون تعديل أي قطاع أو موظف؟'
        : 'تأكيد توثيق مرجع المركز بناءً على القرار الرسمي المذكور؟',
    )) return;
    setBusy(true); setError('');
    try {
      const token = getAccessToken();
      if (!token) throw new Error('انتهت جلسة الدخول.');
      const response = await authFetch(
        `${API_BASE}/health-centers/${center.id}/verify-reference/`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            decision: isRevoke ? 'revoke' : 'approve',
            approval_reference: reference.trim(),
            reason: reason.trim(), confirmed: true,
          }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.detail || 'تعذر حفظ القرار.');
      await onVerified();
      toast.success('تم توثيق القرار واسم المستخدم والتوقيت دون تعديل بيانات الموظفين أو القطاعات.');
      onClose();
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : 'فشل حفظ القرار.');
    } finally {
      setBusy(false);
    }
  }

  return <Dialog open={!!center} onClose={() => !busy && onClose()}
    maxWidth="sm" fullWidth dir="rtl">
    <DialogTitle fontWeight={900}>
      {isRevoke ? 'إلغاء توثيق المركز' : 'اعتماد مرجع المركز رسميًا'}
    </DialogTitle>
    <DialogContent dividers><Stack gap={2}>
      <Typography fontWeight={800}>{center?.name}</Typography>
      <Alert severity="warning">
        هذا القرار يخص <b>اعتماد مرجع المركز فقط</b> ولا يعتمد تبعيته للقطاع
        ولا ينقل الموظفين. يلزم وجود قرار رسمي موثق، وتُسجّل العملية في سجل التدقيق.
      </Alert>
      <TextField required label="رقم أو مرجع المستند الرسمي" value={reference}
        onChange={e => setReference(e.target.value)} inputProps={{ maxLength: 250 }}
        helperText="مثال: رقم القرار وتاريخه؛ لا تستخدم رمز TMP كاعتماد رسمي."/>
      <TextField required multiline minRows={3} label="مبرر القرار" value={reason}
        onChange={e => setReason(e.target.value)} inputProps={{ maxLength: 500 }}
        helperText="لا يقل عن 15 حرفًا، دون إدخال بيانات طبية أو معلومات شخصية."/>
      <FormControlLabel control={<Checkbox checked={confirmed}
        onChange={(_, v) => setConfirmed(v)} disabled={busy} />}
        label="أؤكد الاطلاع على المستند وصحة البيانات ومسؤوليتي عن قرار التوثيق."/>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack></DialogContent>
    <DialogActions sx={{ p: 2 }}>
      <Button disabled={busy} onClick={onClose}>إلغاء</Button>
      <Button variant="contained" color={isRevoke ? 'warning' : 'success'}
        disabled={busy || !confirmed || reference.trim().length < 4 ||
          reason.trim().length < 15}
        onClick={() => void submit()}>
        {busy ? 'جارٍ الحفظ...' : isRevoke ? 'تأكيد إلغاء الاعتماد' : 'اعتماد المرجع'}
      </Button>
    </DialogActions>
  </Dialog>;
}
