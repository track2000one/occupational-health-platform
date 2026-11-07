import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, MenuItem, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TablePagination, TableRow, TextField, Typography,
} from '@mui/material';
import { Search as SearchIcon, Visibility as VisibilityIcon } from '@mui/icons-material';

export type EmployeePreviewRow = {
  row: number;
  status?: 'valid' | 'error' | 'conflict' | 'existing';
  missing_optional_fields?: string[];
  existing_employee?: {
    id: number; name: string; employee_number: string; health_center: string;
  } | null;
  field_differences?: Array<{
    field: string; kind: 'different' | 'incoming_only' | 'existing_only';
    existing: string; incoming: string;
  }>;
  name?: string;
  national_id?: string;
  employee_number?: string;
  health_center?: string;
  health_center_matched?: boolean;
  date_of_birth?: string;
  appointment_date?: string;
  job_title?: string;
  current_job?: string;
  gender?: string;
  marital_status?: string;
  nationality?: string;
  birth_place?: string;
  job_title_en?: string;
  children_count?: string | number;
  organization_unit_code?: string;
  email?: string;
  mobile?: string;
  national_address?: string;
  issues?: string[];
  [key: string]: unknown;
};

type Props = {
  rows: EmployeePreviewRow[];
  totalRows: number;
  truncated?: boolean;
  isRtl: boolean;
  mode: 'preview' | 'commit';
  formatIssue: (issue: string) => string;
};

const FIELDS: Array<[keyof EmployeePreviewRow, string, string]> = [
  ['name', 'اسم الموظف', 'Employee name'],
  ['national_id', 'رقم الهوية / الإقامة (محجوب)', 'National ID (masked)'],
  ['employee_number', 'الرقم الوظيفي', 'Employee number'],
  ['date_of_birth', 'تاريخ الميلاد', 'Date of birth'],
  ['birth_place', 'مكان الميلاد', 'Birth place'],
  ['gender', 'الجنس', 'Gender'],
  ['marital_status', 'الحالة الاجتماعية', 'Marital status'],
  ['children_count', 'عدد الأطفال', 'Children'],
  ['nationality', 'الجنسية', 'Nationality'],
  ['mobile', 'الجوال (محجوب)', 'Mobile (masked)'],
  ['email', 'البريد الإلكتروني (محجوب)', 'Email (masked)'],
  ['national_address', 'العنوان الوطني (محجوب)', 'Address (masked)'],
  ['job_title', 'المسمى الوظيفي', 'Job title'],
  ['job_title_en', 'المسمى الوظيفي بالإنجليزية', 'English job title'],
  ['current_job', 'الوظيفة الحالية', 'Current job'],
  ['appointment_date', 'تاريخ التعيين', 'Appointment date'],
  ['health_center', 'المركز الصحي', 'Health center'],
  ['organization_unit_code', 'رمز الوحدة التنظيمية', 'Organization unit code'],
];

function statusOf(row: EmployeePreviewRow) {
  return row.status === 'valid' || row.status === 'error' ||
    row.status === 'conflict' || row.status === 'existing'
    ? row.status : 'valid';
}

function labelForStatus(status: ReturnType<typeof statusOf>, isRtl: boolean) {
  const translation = {
    valid: isRtl ? 'صالحة' : 'Valid',
    error: isRtl ? 'تحتاج معالجة' : 'Needs correction',
    conflict: isRtl ? 'تعارض فعلي' : 'Real conflict',
    existing: isRtl ? 'موجود مسبقًا' : 'Existing employee',
  };
  return translation[status];
}

const norm = (value: unknown) => String(value ?? '').normalize('NFKC')
  .toLocaleLowerCase().replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').trim();

export function EmployeeImportPreviewTable({
  rows, totalRows, truncated = false, isRtl, mode, formatIssue,
}: Props) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const [details, setDetails] = useState<EmployeePreviewRow | null>(null);

  useEffect(() => {
    setPage(0);
    setDetails(null);
  }, [rows]);

  const counts = useMemo(() => ({
    valid: rows.filter(row => statusOf(row) === 'valid').length,
    error: rows.filter(row => statusOf(row) === 'error').length,
    conflict: rows.filter(row => statusOf(row) === 'conflict').length,
    existing: rows.filter(row => statusOf(row) === 'existing').length,
    incomplete: rows.filter(row => Boolean(row.missing_optional_fields?.length)).length,
  }), [rows]);

  const filtered = useMemo(() => {
    const q = norm(search);
    return rows.filter(row => {
      if (filter === 'incomplete') {
        if (!row.missing_optional_fields?.length) return false;
      } else if (filter !== 'all' && statusOf(row) !== filter) return false;
      if (!q) return true;
      return [
        row.row, row.name, row.employee_number, row.health_center,
        row.job_title, row.current_job, row.date_of_birth, row.appointment_date,
      ].some(value => norm(value).includes(q));
    });
  }, [rows, filter, search]);

  const visible = filtered.slice(page * perPage, (page + 1) * perPage);
  const cellText = (value: unknown) => String(value ?? '').trim() || '—';

  return <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden', mb: 3, borderColor: '#b2d0e1' }}>
    <Box sx={{ p: { xs: 1.5, md: 2.5 }, bgcolor: '#eef6fb' }}>
      <Stack direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between" gap={1.5} alignItems={{ md: 'center' }}>
        <Box>
          <Typography variant="h6" fontWeight={900} color="#153f64">
            {isRtl ? 'معاينة جميع بيانات الموظفين من Excel' : 'Employee Excel rows — detailed preview'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {isRtl
              ? `يمكنك مراجعة الأسماء وبيانات كل صف وحالته قبل الاعتماد. ${rows.length} صف ظاهر من أصل ${totalRows}.`
              : `Review staff and row-level validation before importing. ${rows.length} of ${totalRows} rows available.`}
          </Typography>
        </Box>
        <Stack direction="row" gap={0.7} flexWrap="wrap">
          <Chip size="small" label={isRtl ? `الجميع: ${rows.length}` : `All: ${rows.length}`} />
          <Chip size="small" color="success" label={isRtl ? `جديد صالح: ${counts.valid}` : `New valid: ${counts.valid}`} />
          <Chip size="small" color="info" label={isRtl ? `موجود مسبقًا: ${counts.existing}` : `Existing: ${counts.existing}`} />
          <Chip size="small" color="warning" label={isRtl ? `تحتاج معالجة: ${counts.error}` : `Needs correction: ${counts.error}`} />
          <Chip size="small" color="error" label={isRtl ? `تعارض فعلي: ${counts.conflict}` : `True conflicts: ${counts.conflict}`} />
          <Chip size="small" color="warning" variant="outlined"
            label={isRtl ? `نواقص اختيارية: ${counts.incomplete}` : `Optional gaps: ${counts.incomplete}`} />
        </Stack>
      </Stack>
      {truncated && <Alert severity="warning" sx={{ mt: 1.5 }}>
        {isRtl
          ? 'الملف يتجاوز حد المعاينة البالغ 5,000 صف. تعرض هذه الصفحة الصفوف الأولى فقط؛ قسّم الملف للمراجعة الكاملة.'
          : 'This workbook exceeds the 5,000-row preview limit. Split it to review the remaining rows.'}
      </Alert>}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2} sx={{ mt: 2 }}>
        <TextField size="small" fullWidth value={search}
          onChange={event => { setSearch(event.target.value); setPage(0); }}
          label={isRtl ? 'بحث بالاسم أو الرقم الوظيفي أو المركز أو التاريخ' : 'Search name, employee number, center, or date'}
          InputProps={{ startAdornment: <SearchIcon fontSize="small" color="action" sx={{ mr: 0.7 }} /> }} />
        <TextField select size="small" label={isRtl ? 'حالة الصف' : 'Row status'}
          value={filter} onChange={event => { setFilter(event.target.value); setPage(0); }}
          sx={{ minWidth: { sm: 210 } }}>
          <MenuItem value="all">{isRtl ? 'جميع الصفوف' : 'All rows'}</MenuItem>
          <MenuItem value="valid">{isRtl ? 'الموظفون الجدد الصالحون' : 'New valid employees'}</MenuItem>
          <MenuItem value="existing">{isRtl ? 'الموظفون الموجودون مسبقًا' : 'Existing employees'}</MenuItem>
          <MenuItem value="error">{isRtl ? 'تحتاج معالجة' : 'Needs correction'}</MenuItem>
          <MenuItem value="conflict">{isRtl ? 'التعارضات الفعلية' : 'True conflicts'}</MenuItem>
          <MenuItem value="incomplete">{isRtl ? 'بيانات اختيارية ناقصة' : 'Optional data missing'}</MenuItem>
        </TextField>
      </Stack>
    </Box>
    <Alert severity={mode === 'preview' ? 'info' : 'warning'} sx={{ borderRadius: 0 }}>
      {mode === 'preview'
        ? (isRtl
          ? 'هذه معاينة فقط؛ لم تتم إضافة أي موظف. أرقام الهوية والجوال والبريد والعنوان محجوبة لحماية الخصوصية.'
          : 'Preview only: no employees created. Sensitive identifiers and contact details are masked.')
        : (isRtl ? 'هذه نتيجة عملية اعتماد سابقة؛ راجع حالة السجل الفعلية في صفحة الموظفين.'
          : 'This response follows a commit; verify saved records on the employees page.')}
    </Alert>
    <TableContainer sx={{ maxHeight: 545 }}>
      <Table stickyHeader size="small" sx={{ minWidth: 1180 }}>
        <TableHead>
          <TableRow>
            {[
              isRtl ? 'صف Excel' : 'Excel row',
              isRtl ? 'حالة الفحص' : 'Status',
              isRtl ? 'اسم الموظف' : 'Name',
              isRtl ? 'الهوية (محجوبة)' : 'ID (masked)',
              isRtl ? 'الرقم الوظيفي' : 'Employee no.',
              isRtl ? 'المركز الصحي' : 'Center',
              isRtl ? 'تاريخ الميلاد' : 'DOB',
              isRtl ? 'المسمى الوظيفي' : 'Job title',
              isRtl ? 'الوظيفة الحالية' : 'Current job',
              isRtl ? 'التفاصيل' : 'Details',
            ].map(label => <TableCell key={label} sx={{
              bgcolor: '#153f64', color: 'white', fontWeight: 800,
              whiteSpace: 'nowrap', py: 1.5,
            }}>{label}</TableCell>)}
          </TableRow>
        </TableHead>
        <TableBody>
          {visible.map(row => {
            const status = statusOf(row);
            return <TableRow key={row.row} hover sx={{
              bgcolor: status === 'conflict' ? '#fff1f1'
                : status === 'existing' ? '#f1f7ff'
                : row.missing_optional_fields?.length || status === 'error' ? '#fff9f0' : 'inherit',
            }}>
              <TableCell>{row.row}</TableCell>
              <TableCell>
                <Stack direction="row" alignItems="center" flexWrap="wrap" gap={0.5}>
                  <Chip size="small" color={status === 'valid' ? 'success'
                    : status === 'existing' ? 'info' : status === 'conflict' ? 'error' : 'warning'}
                    label={labelForStatus(status, isRtl)} />
                  {Boolean(row.missing_optional_fields?.length) &&
                    <Chip size="small" color="warning" variant="outlined"
                      label={isRtl ? `نواقص: ${row.missing_optional_fields?.length}`
                        : `Missing: ${row.missing_optional_fields?.length}`} />}
                </Stack>
              </TableCell>
              <TableCell sx={{ fontWeight: 750, minWidth: 180 }}>{cellText(row.name)}</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{cellText(row.national_id)}</TableCell>
              <TableCell>{cellText(row.employee_number)}</TableCell>
              <TableCell sx={{ minWidth: 160 }}>
                {cellText(row.health_center)}
                {row.health_center_matched === false && Boolean(row.health_center) &&
                  <Typography color="error" fontSize={11}>
                    {isRtl ? 'لم يُطابق مركزًا نشطًا' : 'Unmatched center'}
                  </Typography>}
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{cellText(row.date_of_birth)}</TableCell>
              <TableCell>{cellText(row.job_title)}</TableCell>
              <TableCell>{cellText(row.current_job)}</TableCell>
              <TableCell>
                <Button size="small" startIcon={<VisibilityIcon />}
                  onClick={() => setDetails(row)}>
                  {isRtl ? 'عرض' : 'View'}
                </Button>
              </TableCell>
            </TableRow>;
          })}
          {!visible.length && <TableRow>
            <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
              {isRtl ? 'لا توجد صفوف مطابقة للبحث والتصفية.' : 'No rows match your search.'}
            </TableCell>
          </TableRow>}
        </TableBody>
      </Table>
    </TableContainer>
    <TablePagination
      component="div"
      count={filtered.length}
      page={Math.min(page, Math.max(0, Math.ceil(filtered.length / perPage) - 1))}
      onPageChange={(_, next) => setPage(next)}
      rowsPerPage={perPage}
      onRowsPerPageChange={event => { setPerPage(Number(event.target.value)); setPage(0); }}
      rowsPerPageOptions={[10, 25, 50, 100]}
      labelRowsPerPage={isRtl ? 'صف في الصفحة:' : 'Rows per page:'}
      labelDisplayedRows={({ from, to, count }) => isRtl
        ? `${from}–${to} من ${count}` : `${from}–${to} of ${count}`}
    />
    <Dialog open={Boolean(details)} onClose={() => setDetails(null)} fullWidth maxWidth="md"
      dir={isRtl ? 'rtl' : 'ltr'} PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle fontWeight={900}>
        {isRtl ? `تفاصيل موظف Excel — الصف ${details?.row || ''}` : `Employee Excel details — row ${details?.row || ''}`}
      </DialogTitle>
      <DialogContent dividers>
        {details && <Stack gap={1.5}>
          <Chip sx={{ alignSelf: 'flex-start' }}
            color={statusOf(details) === 'valid' ? 'success'
              : statusOf(details) === 'existing' ? 'info'
              : statusOf(details) === 'conflict' ? 'error' : 'warning'}
            label={labelForStatus(statusOf(details), isRtl)} />
          {details.existing_employee && <Alert severity={
            statusOf(details) === 'conflict' ? 'error' : 'info'
          }>
            <Typography fontWeight={900}>
              {isRtl ? 'هذا الموظف موجود مسبقًا في قاعدة البيانات' : 'Employee already exists'}
            </Typography>
            <Typography variant="body2">
              {details.existing_employee.name} — {details.existing_employee.employee_number ||
                (isRtl ? 'لا يوجد رقم وظيفي' : 'No employee number')} —
              {' '}{details.existing_employee.health_center}
            </Typography>
            <Typography fontSize={12} sx={{ mt: 0.6 }}>
              {isRtl
                ? 'لن يُنشأ موظف مكرر، ولن تُحدّث أي بيانات قائمة تلقائيًا. الفروقات تحتاج إلى اعتماد مستقل.'
                : 'No duplicate or automatic overwrite will occur. Differences require separate approval.'}
            </Typography>
          </Alert>}
          {Boolean(details.missing_optional_fields?.length) && <Alert severity="warning">
            <Typography fontWeight={850}>
              {isRtl
                ? `يوجد ${details.missing_optional_fields?.length} حقلًا اختياريًا غير مكتمل`
                : `${details.missing_optional_fields?.length} optional fields are missing`}
            </Typography>
            <Stack direction="row" gap={0.7} flexWrap="wrap" sx={{ mt: 1 }}>
              {details.missing_optional_fields?.map(field => {
                const defined = FIELDS.find(([key]) => key === field);
                return <Chip size="small" key={field}
                  label={defined ? defined[isRtl ? 1 : 2] : field} color="warning"
                  variant="outlined" />;
              })}
            </Stack>
            <Typography fontSize={12} sx={{ mt: 1 }}>
              {isRtl ? 'هذه حقول اختيارية ولا تمنع إضافة موظف جديد مستوفٍ للاسم والهوية والمركز.'
                : 'Missing optional information does not block a new employee with valid required fields.'}
            </Typography>
          </Alert>}
          {Boolean(details.field_differences?.length) && <Box>
            <Typography fontWeight={850} sx={{ mb: 1 }}>
              {isRtl ? 'مقارنة بيانات Excel مع بيانات الموظف المسجلة' : 'Compare Excel and stored employee fields'}
            </Typography>
            <Alert severity="info" sx={{ mb: 1 }}>
              {isRtl ? 'هذه مقارنة للقراءة فقط، ولا تحفظ أي تعديلات. تغيّر المركز يستلزم إجراءات نقل معتمدة.'
                : 'Read-only comparison. Center transfers need approved transfer workflow.'}
            </Alert>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead><TableRow>
                  <TableCell>{isRtl ? 'الحقل' : 'Field'}</TableCell>
                  <TableCell>{isRtl ? 'المسجل حاليًا' : 'Saved value'}</TableCell>
                  <TableCell>{isRtl ? 'في ملف Excel' : 'Excel value'}</TableCell>
                  <TableCell>{isRtl ? 'التغيير' : 'Difference'}</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {details.field_differences?.map((diff, i) => {
                    const known = FIELDS.find(([key]) => key === diff.field);
                    return <TableRow key={`${diff.field}-${i}`}>
                      <TableCell>{known ? known[isRtl ? 1 : 2] : diff.field}</TableCell>
                      <TableCell>{diff.existing || '—'}</TableCell>
                      <TableCell>{diff.incoming || '—'}</TableCell>
                      <TableCell>{diff.kind === 'different'
                        ? (isRtl ? 'مختلف' : 'Different')
                        : diff.kind === 'incoming_only'
                          ? (isRtl ? 'جديد في Excel' : 'In Excel only')
                          : (isRtl ? 'مسجل فقط' : 'Stored only')}</TableCell>
                    </TableRow>;
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
            {FIELDS.map(([field, ar, en]) => <Paper key={String(field)} variant="outlined"
              sx={{ p: 1.4, borderRadius: 2 }}>
              <Typography color="text.secondary" fontSize={12}>{isRtl ? ar : en}</Typography>
              <Typography fontWeight={750} sx={{ overflowWrap: 'anywhere' }}>
                {cellText(details[field])}
              </Typography>
            </Paper>)}
          </Box>
          {Boolean(details.issues?.length) && <Alert severity="warning">
            <Typography fontWeight={850} sx={{ mb: 0.5 }}>
              {isRtl ? 'ملاحظات هذا الصف' : 'Row validation issues'}
            </Typography>
            <Box component="ul" sx={{ m: 0, ps: 3 }}>
              {details.issues?.map((issue, index) =>
                <Typography key={index} component="li" variant="body2">
                  {formatIssue(issue)}
                </Typography>)}
            </Box>
          </Alert>}
        </Stack>}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={() => setDetails(null)}>{isRtl ? 'إغلاق' : 'Close'}</Button>
      </DialogActions>
    </Dialog>
  </Paper>;
}
