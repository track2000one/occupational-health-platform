import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, LinearProgress, Paper,
  Stack, Tab, Tabs, Table, TableBody, TableCell, TableContainer,
  TableHead, TablePagination, TableRow, TextField, Typography,
} from '@mui/material';
import type { EmployeePreviewRow } from './EmployeeImportPreviewTable';

type Center = {
  id: number | string;
  name: string;
  name_ar?: string;
  name_en?: string;
  code?: string;
  is_active?: boolean;
};

type Props = {
  open: boolean;
  isRtl: boolean;
  loading: boolean;
  previewComplete: boolean;
  rows: EmployeePreviewRow[];
  centers: Center[];
  corrections: Record<string, string>;
  onClose: () => void;
  onRevalidate: (corrections: Record<string, string>) => void | Promise<void>;
};

const needsCenter = (row: EmployeePreviewRow): boolean =>
  row.health_center_matched === false &&
  Boolean(row.issues?.some(issue => /health center|health_center|active center/i.test(issue)));

function sourceName(row: EmployeePreviewRow): string {
  return String(row.health_center || '').trim();
}

export function EmployeeCenterQuickFixDialog({
  open, isRtl, loading, previewComplete, rows, centers, corrections,
  onClose, onRevalidate,
}: Props) {
  const [tab, setTab] = useState<'named' | 'missing'>('named');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [selectedCenter, setSelectedCenter] = useState<Center | null>(null);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [page, setPage] = useState(0);
  const [feedback, setFeedback] = useState('');

  const pending = useMemo(() => rows.filter(needsCenter), [rows]);
  const missing = useMemo(() => pending.filter(row => !sourceName(row)), [pending]);
  const namedGroups = useMemo(() => {
    const bySource = new Map<string, number[]>();
    for (const row of pending) {
      const name = sourceName(row);
      if (!name) continue;
      const group = bySource.get(name) || [];
      group.push(row.row);
      bySource.set(name, group);
    }
    return Array.from(bySource, ([name, rowNumbers]) => ({ name, rowNumbers }))
      .sort((a, b) => b.rowNumbers.length - a.rowNumbers.length);
  }, [pending]);
  const activeCenters = useMemo(() =>
    centers.filter(center => center.is_active !== false), [centers]);
  const blankMatches = useMemo(() => {
    const query = search.normalize('NFKC').trim().toLocaleLowerCase();
    if (!query) return missing;
    return missing.filter(row => [
      row.name, row.employee_number, row.job_title, row.current_job, row.row,
    ].some(value => String(value || '').normalize('NFKC').toLocaleLowerCase().includes(query)));
  }, [missing, search]);
  const shownMissing = blankMatches.slice(page * 25, (page + 1) * 25);
  const group = namedGroups.find(item => item.name === selectedSource);
  const readyCorrections = pending.filter(row => Boolean(draft[String(row.row)])).length;
  const readyMissing = missing.filter(row => Boolean(draft[String(row.row)])).length;
  const readyNamed = pending.filter(row => sourceName(row) && Boolean(draft[String(row.row)])).length;
  const selected = new Set(selectedRows);
  const allFilteredSelected = blankMatches.length > 0 &&
    blankMatches.every(row => selected.has(row.row));

  useEffect(() => {
    if (!open) return;
    setDraft({ ...corrections });
    setTab(namedGroups.length ? 'named' : 'missing');
    setSelectedCenter(null);
    setSelectedSource(null);
    setSearch('');
    setSelectedRows([]);
    setPage(0);
    setFeedback('');
  }, [open]);

  const assign = () => {
    if (loading || !selectedCenter || !previewComplete || !activeCenters.length) return;
    const affected = tab === 'named'
      ? (group?.rowNumbers || [])
      : selectedRows;
    if (!affected.length) return;
    const next = { ...draft };
    for (const row of affected) next[String(row)] = String(selectedCenter.id);
    setDraft(next);
    setFeedback(isRtl
      ? `تم اختيار المركز لـ${affected.length} صف. لن تُحفظ أي بيانات قبل إعادة الفحص والاعتماد.`
      : `Assigned a center to ${affected.length} rows. No employee data has been committed.`);
    if (tab === 'missing') setSelectedRows([]);
    else setSelectedSource(null);
  };

  const applyAndRevalidate = () => {
    if (!readyCorrections || loading || !previewComplete) return;
    onRevalidate(draft);
  };

  return (
    <Dialog open={open} onClose={() => !loading && onClose()}
      maxWidth="lg" fullWidth dir={isRtl ? 'rtl' : 'ltr'}
      PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle fontWeight={900}>
        {isRtl ? 'تصحيح مراكز الموظفين مباشرة' : 'Correct employee centers in place'}
      </DialogTitle>
      <DialogContent dividers>
        {loading && <LinearProgress sx={{ mb: 1 }} />}
        <Stack spacing={2}>
          <Alert severity="info">
            {isRtl
              ? 'بدون تنزيل ملفات أو إدخال أرقام مراكز. اختر المركز الصحيح من القائمة؛ سيُعاد فحص الموظفين قبل أي إضافة. لا تستخدم التخمين للصفوف التي لا يتوفر لها مركز.'
              : 'No correction files or center IDs. Choose an approved center and revalidate before adding anyone. Never guess a missing center.'}
          </Alert>
          {!previewComplete && <Alert severity="warning">
            {isRtl ? 'المعاينة غير مكتملة؛ لا يمكن تطبيق تصحيحات جماعية على بيانات ناقصة.'
              : 'The preview is truncated; bulk center corrections are disabled.'}
          </Alert>}
          {!activeCenters.length && <Alert severity="error">
            {isRtl ? 'تعذر تحميل دليل المراكز الصحية المعتمدة. أغلق النافذة وأعد تحميل الصفحة.'
              : 'Approved health centers have not loaded. Reload the page.'}
          </Alert>}
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Chip color="warning" label={isRtl
              ? `بلا اسم مركز: ${missing.length}` : `Missing center: ${missing.length}`} />
            <Chip color="warning" variant="outlined" label={isRtl
              ? `مسميات غير مطابقة: ${namedGroups.reduce((n, g) => n + g.rowNumbers.length, 0)}`
              : `Unmatched names: ${namedGroups.reduce((n, g) => n + g.rowNumbers.length, 0)}`} />
            <Chip color="success" variant="outlined" label={isRtl
              ? `تم اختيار مركز لها: ${readyCorrections} / ${pending.length}`
              : `Centers selected: ${readyCorrections} / ${pending.length}`} />
          </Stack>
          <Tabs value={tab} onChange={(_, value: 'named' | 'missing') => {
            setTab(value);
            setFeedback('');
            setSelectedCenter(null);
          }}>
            <Tab value="named" label={isRtl ? `مركز غير مطابق (${readyNamed} مُعالج)`
              : `Unmatched names (${readyNamed} assigned)`} />
            <Tab value="missing" label={isRtl ? `مركز غير مدخل (${readyMissing} مُعالج)`
              : `Missing centers (${readyMissing} assigned)`} />
          </Tabs>

          {tab === 'named' ? (
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Stack spacing={1.5}>
                <Typography fontWeight={800}>
                  {isRtl ? 'اختر المسمى الموجود في Excel، ثم المركز الصحيح' :
                    'Select the source center label and its approved center'}
                </Typography>
                <Autocomplete
                  options={namedGroups}
                  value={group || null}
                  onChange={(_, value) => setSelectedSource(value?.name || null)}
                  getOptionLabel={item => `${item.name} — ${item.rowNumbers.length} ${isRtl ? 'موظف' : 'rows'}`}
                  isOptionEqualToValue={(a, b) => a.name === b.name}
                  renderInput={params => <TextField {...params}
                    label={isRtl ? 'اسم المركز الوارد في الملف' : 'Source center name'} />}
                  noOptionsText={isRtl ? 'لا توجد مسميات غير مطابقة' : 'No unmatched names'}
                />
                {group && /^[0-9٠-٩\s-]+$/.test(group.name) && <Alert severity="warning">
                  {isRtl
                    ? 'القيمة الواردة في خانة المركز أرقام فقط؛ راجع مطابقة عمود «المركز الصحي» مع Excel أولًا، فقد تكون البيانات مأخوذة من عمود مختلف.'
                    : 'The source center is numeric. Verify the Excel center-column mapping before assigning staff; it may be a different field.'}
                </Alert>}
                {group && <Typography variant="body2" color="text.secondary">
                  {isRtl ? `التعيين سيشمل ${group.rowNumbers.length} صفًا بهذا المسمى فقط.`
                    : `This assignment covers ${group.rowNumbers.length} rows with exactly this source name.`}
                </Typography>}
              </Stack>
            </Paper>
          ) : (
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Stack spacing={1.5}>
                <Alert severity="warning">
                  {isRtl
                    ? 'حدد فقط الموظفين الذين تأكدت من تبعيتهم للمركز نفسه؛ لا يُنسخ المركز من الصف السابق تلقائيًا.'
                    : 'Select only employees verified to belong to the same center. Neighboring rows are never used to infer assignments.'}
                </Alert>
                <TextField size="small" fullWidth value={search}
                  onChange={event => { setSearch(event.target.value); setPage(0); }}
                  label={isRtl ? 'بحث باسم الموظف أو الرقم الوظيفي أو المسمى' : 'Search employee, job number or role'}
                  placeholder={isRtl ? 'اكتب اسمًا أو رقمًا لتحديد مجموعة' : 'Filter employees'} />
                <FormControlLabel
                  control={<Checkbox size="small" checked={allFilteredSelected}
                    disabled={!blankMatches.length || loading}
                    onChange={(_, checked) => setSelectedRows(previous => {
                      const next = new Set(previous);
                      for (const row of blankMatches) {
                        if (checked) next.add(row.row);
                        else next.delete(row.row);
                      }
                      return [...next];
                    })} />}
                  label={<Typography variant="body2">
                    {isRtl
                      ? `تحديد جميع نتائج البحث (${blankMatches.length} صف) — المحدد: ${selectedRows.length}`
                      : `Select all filtered (${blankMatches.length}) — selected: ${selectedRows.length}`}
                  </Typography>}
                />
                <TableContainer sx={{ maxHeight: 320 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox" />
                        <TableCell>{isRtl ? 'صف Excel' : 'Excel row'}</TableCell>
                        <TableCell>{isRtl ? 'الموظف' : 'Employee'}</TableCell>
                        <TableCell>{isRtl ? 'الرقم الوظيفي' : 'Job number'}</TableCell>
                        <TableCell>{isRtl ? 'المسمى' : 'Role'}</TableCell>
                        <TableCell>{isRtl ? 'مركز مختار' : 'Assigned center'}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {shownMissing.map(row => {
                        const center = activeCenters.find(item => String(item.id) === draft[String(row.row)]);
                        return <TableRow key={row.row} hover onClick={() =>
                          setSelectedRows(previous => previous.includes(row.row)
                            ? previous.filter(n => n !== row.row) : [...previous, row.row])}
                          sx={{ cursor: 'pointer' }}>
                          <TableCell padding="checkbox">
                            <Checkbox size="small" checked={selected.has(row.row)} />
                          </TableCell>
                          <TableCell>{row.row}</TableCell>
                          <TableCell>{row.name || '—'}</TableCell>
                          <TableCell>{row.employee_number || '—'}</TableCell>
                          <TableCell>{row.job_title || '—'}</TableCell>
                          <TableCell>{center ? (center.name_ar || center.name) : '—'}</TableCell>
                        </TableRow>;
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
                <TablePagination component="div" count={blankMatches.length}
                  page={Math.min(page, Math.max(0, Math.ceil(blankMatches.length / 25) - 1))}
                  rowsPerPage={25} rowsPerPageOptions={[25]}
                  onPageChange={(_, next) => setPage(next)}
                  labelRowsPerPage={isRtl ? 'الصفوف:' : 'Rows:'} />
              </Stack>
            </Paper>
          )}

          <Autocomplete
            options={activeCenters}
            value={selectedCenter}
            onChange={(_, value) => setSelectedCenter(value)}
            getOptionLabel={center => `${center.name_ar || center.name} ${center.code ? `(${center.code})` : ''}`}
            isOptionEqualToValue={(a, b) => String(a.id) === String(b.id)}
            renderInput={params => <TextField {...params}
              label={isRtl ? 'المركز الصحيح المعتمد' : 'Approved health center'} />}
            noOptionsText={isRtl ? 'المركز غير موجود في السجل' : 'No center found'}
          />
          <Button variant="contained" disabled={loading || !previewComplete ||
            !selectedCenter || !activeCenters.length ||
            (tab === 'named' ? !group : selectedRows.length === 0)}
            onClick={assign}>
            {isRtl
              ? `تطبيق المركز على ${tab === 'named' ? (group?.rowNumbers.length || 0) : selectedRows.length} صف`
              : `Assign center to ${tab === 'named' ? (group?.rowNumbers.length || 0) : selectedRows.length} rows`}
          </Button>
          {feedback && <Alert severity="success">{feedback}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onClose} disabled={loading}>
          {isRtl ? 'إغلاق' : 'Close'}
        </Button>
        <Button variant="contained" color="success" disabled={loading || !previewComplete ||
          readyCorrections === 0 || !activeCenters.length}
          onClick={applyAndRevalidate}>
          {isRtl ? `إعادة فحص الملف بعد تصحيح ${readyCorrections} صف`
            : `Revalidate ${readyCorrections} selected rows`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
