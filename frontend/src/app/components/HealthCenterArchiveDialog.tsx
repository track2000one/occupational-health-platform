import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { toast } from 'sonner';
import { authFetch, getAccessToken } from '../context/AuthContext';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export type CenterArchiveAction = 'delete' | 'reset' | 'restore' | 'restore_batch';
type Preview = {
  mode: string; count: number; blocked_count: number; eligible_count?: number;
  blocked: Array<{ id: number; name: string; references: Record<string, number> }>;
  confirm_phrase: string; preview_token: string; notice?: string;
};
type ArchiveResult = { status: string; affected: number; batch_id?: string };
const titles: Record<CenterArchiveAction, string> = {
  delete: 'حذف مركز صحي — أرشفة قابلة للاستعادة',
  reset: 'تصفير سجل المراكز الصحية',
  restore: 'استعادة المركز المؤرشف',
  restore_batch: 'استعادة آخر دفعة تصفير',
};
const previewActions: Record<CenterArchiveAction, string> = {
  delete: 'preview_delete', reset: 'preview_reset',
  restore: 'preview_restore', restore_batch: 'preview_restore_batch',
};
const relatedNames: Record<string, string> = {
  'health.Employee': 'سجلات الموظفين',
  'health.UserProfile': 'المستخدمون',
  'health.OrganizationUnit': 'الهيكل التنظيمي',
  'health.WorkforceCenterMapping': 'ربط القوى العاملة',
  'health.WorkforceCenterMappingRevision': 'تاريخ ربط القوى العاملة',
  'health.EmployeeEmploymentChange': 'سجل انتقالات الموظفين',
  'health.CenterReferenceCandidate': 'المراجع الجاري تأسيسها',
};

async function api<T>(payload: Record<string, unknown>): Promise<T> {
  const token = getAccessToken();
  if (!token || !API_BASE) throw new Error('جلسة الدخول أو رابط API غير متاح.');
  const response = await authFetch(API_BASE + '/health-centers/archive/', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(json?.detail || 'تعذّر تنفيذ الإجراء؛ راجع الارتباطات أو أعد المعاينة.');
  return json as T;
}

export function HealthCenterArchiveDialog({
  open, action, center, onClose, onComplete,
}: {
  open: boolean; action: CenterArchiveAction | null;
  center?: { id: number; name: string } | null;
  onClose: () => void; onComplete: () => void | Promise<void>;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [phrase, setPhrase] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !action) return;
    let cancelled = false;
    setPreview(null); setReason(''); setPhrase(''); setConfirmed(false);
    setError(''); setBusy(true);
    void api<Preview>({
      action: previewActions[action],
      ...(center?.id && ['delete', 'restore'].includes(action) ? { center_id: center.id } : {}),
    }).then(result => {
      if (!cancelled) setPreview(result);
    }).catch(err => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'تعذرت معاينة المراكز.');
    }).finally(() => {
      if (!cancelled) setBusy(false);
    });
    return () => { cancelled = true; };
  }, [open, action, center?.id]);

  const blocked = preview?.blocked_count || 0;
  const isDanger = action === 'delete' || action === 'reset';
  const label = action === 'delete' ? 'حذف / أرشفة المركز' :
    action === 'reset' ? 'تصفير المراكز' :
    action === 'restore' ? 'استعادة المركز' : 'استعادة الدفعة';
  const ready = !busy && preview && !blocked &&
    reason.trim().length >= 15 && reason.trim().length <= 500 &&
    phrase === preview.confirm_phrase && confirmed;

  async function commit() {
    if (!action || !preview || !ready) return;
    if (!window.confirm(
      isDanger
        ? `هذا الإجراء سيؤرشف ${preview.count} مركزًا ويخفيها من القائمة النشطة، مع الاحتفاظ بالبيانات في PostgreSQL. هل تؤكد؟`
        : `تأكيد استعادة ${preview.count} مركزًا من الأرشيف؟`,
    )) return;
    setBusy(true); setError('');
    try {
      const result = await api<ArchiveResult>({
        action, preview_token: preview.preview_token,
        ...(center?.id && ['delete', 'restore'].includes(action) ? { center_id: center.id } : {}),
        reason: reason.trim(), confirm_phrase: phrase, confirmed: true,
      });
      toast.success(`اكتمل إجراء «${label}» لعدد ${result.affected} مركزًا دون حذف ملفات الموظفين.`);
      await onComplete();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'تعذّر تنفيذ العملية.';
      setError(message + ' أعد فتح النافذة للحصول على معاينة جديدة.');
      setPreview(null);
    } finally { setBusy(false); }
  }

  return <Dialog open={open} onClose={() => { if (!busy) onClose(); }}
    dir="rtl" fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: 3 } }}>
    <DialogTitle fontWeight={900} color={isDanger ? 'error.main' : 'primary.main'}>
      {action ? titles[action] : 'إدارة المراكز'}
    </DialogTitle>
    <DialogContent dividers><Stack gap={2}>
      <Alert severity={isDanger ? 'warning' : 'info'}>
        {isDanger
          ? 'الحذف والتصفير هنا أرشفة قابلة للاستعادة، وليسا حذفًا نهائيًا. لا يغيّران سجلات الموظفين أو تاريخهم الطبي أو الهيكل التنظيمي. المركز المرتبط بأي سجل يُمنع إزالته.'
          : 'الاستعادة تعيد ظهور المركز في القائمة النشطة دون تغيير الملفات الصحية أو الارتباطات القديمة.'}
      </Alert>
      {center && <Typography fontWeight={800}>{center.name}</Typography>}
      {busy && <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={24}/></Box>}
      {error && <Alert severity="error">{error}</Alert>}
      {preview && <>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
          <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', borderRadius: 2 }}>
            <Typography variant="h5" fontWeight={900}>{preview.count}</Typography>
            <Typography variant="caption">المراكز المشمولة</Typography>
          </Paper>
          <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', borderRadius: 2 }}>
            <Typography variant="h5" fontWeight={900} color={blocked ? 'error.main' : 'success.main'}>
              {blocked}
            </Typography>
            <Typography variant="caption">مراكز تمنع ارتباطاتها الإجراء</Typography>
          </Paper>
        </Box>
        {blocked > 0 ? <Alert severity="error">
          تم منع الإجراء حفاظًا على السجلات المرتبطة. يجب معالجة الارتباطات رسميًا
          قبل إعادة المحاولة، ولا يُنفّذ تصفير جزئي.
        </Alert> : <Alert severity="success">
          لم تظهر ارتباطات تمنع الإجراء في المعاينة. ستُعاد مراجعتها عند التأكيد.
        </Alert>}
        {preview.blocked?.slice(0, 15).map(item => <Paper key={item.id}
          variant="outlined" sx={{ p: 1.4, borderRadius: 2 }}>
          <Typography fontWeight={800}>{item.name}</Typography>
          <Typography variant="caption" color="text.secondary">
            {Object.entries(item.references).map(([model, value]) =>
              (relatedNames[model] || model) + ': ' + value).join(' • ')}
          </Typography>
        </Paper>)}
        {blocked === 0 && <>
          <TextField required multiline minRows={3} fullWidth disabled={busy}
            label="سبب الإجراء (إلزامي)" value={reason}
            onChange={event => setReason(event.target.value)}
            inputProps={{ maxLength: 500 }}
            helperText={`الحد الأدنى 15 حرفًا — ${reason.trim().length}/500`} />
          <TextField required fullWidth disabled={busy}
            label="اكتب عبارة التأكيد تمامًا" value={phrase}
            onChange={event => setPhrase(event.target.value)}
            helperText={preview.confirm_phrase} />
          <FormControlLabel control={<Checkbox checked={confirmed}
            disabled={busy} onChange={(_, checked) => setConfirmed(checked)} />}
            label="أؤكد العدد وسبب الإجراء، وأعلم أن العملية ستُوثق باسم مستخدمي وتاريخ التنفيذ."/>
        </>}
      </>}
    </Stack></DialogContent>
    <DialogActions sx={{ p: 2, gap: 1 }}>
      <Button disabled={busy} onClick={onClose}>إلغاء</Button>
      <Button variant="contained" color={isDanger ? 'error' : 'success'}
        disabled={!ready} onClick={() => void commit()}>
        {label}
      </Button>
    </DialogActions>
  </Dialog>;
}
