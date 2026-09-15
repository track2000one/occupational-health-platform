import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { toast } from 'sonner';
import { authFetch, getAccessToken } from '../context/AuthContext';

const PRODUCTION_API_BASE_URL = 'https://occupational-health-platform-production.up.railway.app/api';
const LOCAL_API_BASE_URL = 'http://localhost:8000/api';
const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? LOCAL_API_BASE_URL : PRODUCTION_API_BASE_URL)
).replace(/\/$/, '');

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

export type EvidenceAttachment = {
  id: number;
  owner_type: 'initiative' | 'reference_document';
  initiative: number | null;
  reference_document: number | null;
  file_name: string;
  content_type: string;
  byte_size: number;
  checksum_sha256: string;
  description: string;
  uploaded_by_name?: string;
  created_at: string;
  is_image: boolean;
};

type Paginated<T> = { results?: T[]; next?: string | null };

type Props = {
  ownerType: 'initiative' | 'reference_document';
  ownerId: number;
  canEdit: boolean;
  isRtl: boolean;
  initialAttachments?: EvidenceAttachment[];
  compact?: boolean;
};

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 KB';
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

async function responseError(response: Response) {
  try {
    const body = await response.json() as Record<string, unknown>;
    if (typeof body.detail === 'string') return body.detail;
    const first = Object.values(body)[0];
    if (Array.isArray(first) && first.length) return String(first[0]);
    if (typeof first === 'string') return first;
  } catch {
    // Fallback to status code below.
  }
  return `Request failed (${response.status})`;
}

function authHeaders() {
  const token = getAccessToken();
  if (!token) throw new Error('Authentication required');
  return { Authorization: `Bearer ${token}` };
}

export function EvidenceAttachmentManager({ ownerType, ownerId, canEdit, isRtl, initialAttachments, compact = false }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [attachments, setAttachments] = useState<EvidenceAttachment[]>(initialAttachments || []);
  const [loading, setLoading] = useState(initialAttachments == null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewType, setPreviewType] = useState('');
  const [previewName, setPreviewName] = useState('');

  useEffect(() => {
    setAttachments(initialAttachments || []);
  }, [initialAttachments, ownerId]);

  useEffect(() => {
    if (initialAttachments != null) return;
    let active = true;
    void loadAttachments().finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerType, ownerId]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function loadAttachments() {
    try {
      const tokenHeaders = authHeaders();
      let next: string | null = `${API_BASE_URL}/periodic-statistics/evidence-attachments/?owner_type=${ownerType}&owner_id=${ownerId}`;
      const rows: EvidenceAttachment[] = [];
      const visited = new Set<string>();
      while (next && !visited.has(next) && visited.size < 20) {
        visited.add(next);
        const response = await authFetch(next, { headers: tokenHeaders });
        if (!response.ok) throw new Error(await responseError(response));
        const payload = await response.json() as EvidenceAttachment[] | Paginated<EvidenceAttachment>;
        if (Array.isArray(payload)) {
          rows.push(...payload);
          next = null;
        } else {
          rows.push(...(payload.results || []));
          next = payload.next || null;
        }
      }
      setAttachments(rows);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (isRtl ? 'تعذر تحميل المرفقات' : 'Could not load attachments'));
    }
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length || uploading) return;
    const selected = Array.from(files);
    for (const file of selected) {
      if (!ACCEPTED_TYPES.has(file.type)) {
        toast.error(isRtl ? `نوع الملف غير مدعوم: ${file.name}` : `Unsupported file type: ${file.name}`);
        if (inputRef.current) inputRef.current.value = '';
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(isRtl ? `حجم الملف يتجاوز 10 MB: ${file.name}` : `File exceeds 10 MB: ${file.name}`);
        if (inputRef.current) inputRef.current.value = '';
        return;
      }
    }

    setUploading(true);
    try {
      const tokenHeaders = authHeaders();
      const uploadedRows: EvidenceAttachment[] = [];
      for (const file of selected) {
        const form = new FormData();
        form.append('owner_type', ownerType);
        form.append('owner_id', String(ownerId));
        form.append('file', file);
        const response = await authFetch(`${API_BASE_URL}/periodic-statistics/evidence-attachments/`, {
          method: 'POST',
          headers: tokenHeaders,
          body: form,
        });
        if (!response.ok) throw new Error(await responseError(response));
        uploadedRows.push(await response.json() as EvidenceAttachment);
      }
      setAttachments(current => [...uploadedRows, ...current]);
      toast.success(isRtl ? `تم رفع ${uploadedRows.length} مرفق بنجاح` : `${uploadedRows.length} attachment(s) uploaded`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (isRtl ? 'تعذر رفع المرفقات' : 'Could not upload attachments'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function fetchContent(attachment: EvidenceAttachment) {
    const response = await authFetch(`${API_BASE_URL}/periodic-statistics/evidence-attachments/${attachment.id}/content/`, {
      headers: authHeaders(),
    });
    if (!response.ok) throw new Error(await responseError(response));
    return await response.blob();
  }

  async function previewAttachment(attachment: EvidenceAttachment) {
    try {
      const blob = await fetchContent(attachment);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
      setPreviewType(attachment.content_type);
      setPreviewName(attachment.file_name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (isRtl ? 'تعذرت معاينة الملف' : 'Could not preview file'));
    }
  }

  async function downloadAttachment(attachment: EvidenceAttachment) {
    try {
      const blob = await fetchContent(attachment);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = attachment.file_name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (isRtl ? 'تعذر تنزيل الملف' : 'Could not download file'));
    }
  }

  async function deleteAttachment(attachment: EvidenceAttachment) {
    const confirmed = window.confirm(isRtl ? `حذف المرفق «${attachment.file_name}»؟` : `Delete “${attachment.file_name}”?`);
    if (!confirmed) return;
    try {
      const response = await authFetch(`${API_BASE_URL}/periodic-statistics/evidence-attachments/${attachment.id}/`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error(await responseError(response));
      setAttachments(current => current.filter(item => item.id !== attachment.id));
      toast.success(isRtl ? 'تم حذف المرفق' : 'Attachment deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (isRtl ? 'تعذر حذف المرفق' : 'Could not delete attachment'));
    }
  }

  return <Paper variant="outlined" sx={{ p: compact ? 1.2 : 1.7, mt: compact ? 0 : 1.5, boxShadow: 'none', bgcolor: 'rgba(248,250,252,.65)' }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1}>
      <Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant={compact ? 'body2' : 'subtitle1'} fontWeight={900}>{isRtl ? 'المرفقات والإثباتات' : 'Attachments & Evidence'}</Typography>
          <Chip size="small" label={attachments.length} />
        </Stack>
        {!compact && <Typography variant="caption" color="text.secondary">{isRtl ? 'PDF أو صور JPEG / PNG / WebP — بحد أقصى 10 MB لكل ملف' : 'PDF, JPEG, PNG or WebP — max 10 MB per file'}</Typography>}
      </Box>
      {canEdit && <Button size="small" variant="outlined" disabled={uploading} onClick={() => inputRef.current?.click()}>
        {uploading ? (isRtl ? 'جاري الرفع...' : 'Uploading...') : (isRtl ? 'رفع ملفات' : 'Upload files')}
      </Button>}
      <input ref={inputRef} hidden type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={event => void uploadFiles(event.target.files)} />
    </Stack>

    {loading && <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5 }}><CircularProgress size={18} /><Typography variant="caption">{isRtl ? 'تحميل المرفقات...' : 'Loading attachments...'}</Typography></Stack>}
    {!loading && attachments.length === 0 && <Alert severity="info" sx={{ mt: 1.3, py: .2 }}>{isRtl ? 'لا توجد مرفقات محفوظة لهذا السجل.' : 'No attachments saved for this record.'}</Alert>}

    {attachments.length > 0 && <Stack spacing={.8} sx={{ mt: 1.3 }}>
      {attachments.map(attachment => <Box key={attachment.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper' }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" fontWeight={850} noWrap title={attachment.file_name}>{attachment.file_name}</Typography>
          <Typography variant="caption" color="text.secondary">{formatBytes(attachment.byte_size)} · {attachment.content_type === 'application/pdf' ? 'PDF' : (isRtl ? 'صورة' : 'Image')}{attachment.uploaded_by_name ? ` · ${attachment.uploaded_by_name}` : ''}</Typography>
        </Box>
        <Stack direction="row" spacing={.5} flexShrink={0}>
          <Button size="small" onClick={() => void previewAttachment(attachment)}>{isRtl ? 'معاينة' : 'Preview'}</Button>
          <Button size="small" onClick={() => void downloadAttachment(attachment)}>{isRtl ? 'تنزيل' : 'Download'}</Button>
          {canEdit && <Button size="small" color="error" onClick={() => void deleteAttachment(attachment)}>{isRtl ? 'حذف' : 'Delete'}</Button>}
        </Stack>
      </Box>)}
    </Stack>}

    <Dialog open={Boolean(previewUrl)} onClose={() => setPreviewUrl('')} maxWidth="lg" fullWidth>
      <DialogTitle>{previewName}</DialogTitle>
      <DialogContent dividers sx={{ minHeight: 520, display: 'grid', placeItems: 'center', p: 1.5 }}>
        {previewType.startsWith('image/') && previewUrl && <Box component="img" src={previewUrl} alt={previewName} sx={{ maxWidth: '100%', maxHeight: '72vh', objectFit: 'contain' }} />}
        {previewType === 'application/pdf' && previewUrl && <Box component="iframe" src={previewUrl} title={previewName} sx={{ width: '100%', height: '72vh', border: 0 }} />}
      </DialogContent>
      <DialogActions><Button onClick={() => setPreviewUrl('')}>{isRtl ? 'إغلاق' : 'Close'}</Button></DialogActions>
    </Dialog>
  </Paper>;
}
