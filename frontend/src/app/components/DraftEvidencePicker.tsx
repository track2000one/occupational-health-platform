import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { AttachFile as AttachFileIcon, DeleteOutline as DeleteIcon, Visibility as VisibilityIcon } from '@mui/icons-material';
import { toast } from 'sonner';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_BATCH_SIZE = 50 * 1024 * 1024;
const MAX_FILES = 15;
const ACCEPTED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

export type DraftEvidencePickerProps = {
  files: File[];
  onChange: (files: File[]) => void;
  isRtl: boolean;
  disabled?: boolean;
  compact?: boolean;
};

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 KB';
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKey(file: File) {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

export function DraftEvidencePicker({ files, onChange, isRtl, disabled = false, compact = false }: DraftEvidencePickerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewType, setPreviewType] = useState('');
  const [previewName, setPreviewName] = useState('');

  const totalBytes = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);
  const totalPercent = Math.min(100, Math.round((totalBytes / MAX_BATCH_SIZE) * 100));

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function validateAndAppend(selected: File[]) {
    if (!selected.length || disabled) return;
    const currentKeys = new Set(files.map(fileKey));
    const accepted: File[] = [];
    let nextTotal = totalBytes;

    for (const file of selected) {
      if (!ACCEPTED_TYPES.has(file.type)) {
        toast.error(isRtl ? `نوع الملف غير مدعوم: ${file.name}` : `Unsupported file type: ${file.name}`);
        continue;
      }
      if (file.size <= 0) {
        toast.error(isRtl ? `الملف فارغ: ${file.name}` : `Empty file: ${file.name}`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(isRtl ? `يتجاوز الملف 10 MB: ${file.name}` : `File exceeds 10 MB: ${file.name}`);
        continue;
      }
      const key = fileKey(file);
      if (currentKeys.has(key) || accepted.some(item => fileKey(item) === key)) {
        toast.warning(isRtl ? `الملف مضاف مسبقًا: ${file.name}` : `File already selected: ${file.name}`);
        continue;
      }
      if (files.length + accepted.length + 1 > MAX_FILES) {
        toast.error(isRtl ? `الحد الأقصى ${MAX_FILES} مرفقًا لكل عملية حفظ.` : `Maximum ${MAX_FILES} files per save.`);
        break;
      }
      if (nextTotal + file.size > MAX_BATCH_SIZE) {
        toast.error(isRtl ? 'إجمالي حجم المرفقات لا يمكن أن يتجاوز 50 MB.' : 'Total attachment size cannot exceed 50 MB.');
        break;
      }
      accepted.push(file);
      nextTotal += file.size;
    }

    if (accepted.length) onChange([...files, ...accepted]);
    if (inputRef.current) inputRef.current.value = '';
  }

  function removeFile(index: number) {
    onChange(files.filter((_, itemIndex) => itemIndex !== index));
  }

  function previewFile(file: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setPreviewType(file.type);
    setPreviewName(file.name);
  }

  return <Paper
    variant="outlined"
    onDragEnter={event => { event.preventDefault(); if (!disabled) setDragging(true); }}
    onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }}
    onDragLeave={event => { event.preventDefault(); setDragging(false); }}
    onDrop={event => {
      event.preventDefault();
      setDragging(false);
      if (!disabled) validateAndAppend(Array.from(event.dataTransfer.files || []));
    }}
    sx={{
      p: compact ? 1.4 : 2,
      borderStyle: 'dashed',
      borderWidth: 2,
      borderColor: dragging ? 'primary.main' : 'divider',
      bgcolor: dragging ? 'action.hover' : 'rgba(248,250,252,.7)',
      transition: 'all .18s ease',
    }}
  >
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1.5}>
      <Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant={compact ? 'body2' : 'subtitle1'} fontWeight={950}>{isRtl ? 'المرفقات والإثباتات قبل الحفظ' : 'Attachments before saving'}</Typography>
          <Chip size="small" label={`${files.length}/${MAX_FILES}`} color={files.length ? 'primary' : 'default'} />
          {files.length > 0 && <Chip size="small" variant="outlined" label={formatBytes(totalBytes)} />}
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {isRtl ? 'اسحب الملفات هنا أو اخترها من الجهاز. سيتم حفظ البطاقة والمرفقات معًا كعملية واحدة. يدعم PDF والصور، 10 MB لكل ملف و50 MB إجماليًا.' : 'Drag files here or choose from your device. The record and files will be saved together in one operation. PDF/images, 10 MB each, 50 MB total.'}
        </Typography>
      </Box>
      <Button variant="outlined" startIcon={<AttachFileIcon />} disabled={disabled} onClick={() => inputRef.current?.click()}>
        {isRtl ? 'اختيار المرفقات' : 'Choose files'}
      </Button>
      <input ref={inputRef} hidden type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={event => validateAndAppend(Array.from(event.target.files || []))} />
    </Stack>

    {files.length > 0 && <Box sx={{ mt: 1.5 }}>
      <LinearProgress variant="determinate" value={totalPercent} sx={{ height: 5, borderRadius: 999, mb: 1.2 }} />
      <Stack spacing={.8}>
        {files.map((file, index) => <Box key={fileKey(file)} sx={{ display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'space-between', p: 1, borderRadius: 1.5, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="body2" fontWeight={850} noWrap title={file.name}>{file.name}</Typography>
            <Typography variant="caption" color="text.secondary">{formatBytes(file.size)} · {file.type === 'application/pdf' ? 'PDF' : (isRtl ? 'صورة' : 'Image')}</Typography>
          </Box>
          <Stack direction="row" spacing={.5}>
            <Button size="small" startIcon={<VisibilityIcon />} onClick={() => previewFile(file)}>{isRtl ? 'معاينة' : 'Preview'}</Button>
            <Button size="small" color="error" startIcon={<DeleteIcon />} disabled={disabled} onClick={() => removeFile(index)}>{isRtl ? 'إزالة' : 'Remove'}</Button>
          </Stack>
        </Box>)}
      </Stack>
    </Box>}

    {files.length === 0 && <Alert severity="info" sx={{ mt: 1.4, py: .3 }}>{isRtl ? 'يمكن اختيار المرفقات الآن قبل حفظ البطاقة، ولن يتم رفعها للخادم إلا عند الضغط على زر الحفظ.' : 'Files can be selected now and are uploaded only when you press save.'}</Alert>}

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
