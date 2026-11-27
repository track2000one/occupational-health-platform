import { useEffect, useState } from 'react';
import { authFetch, useAuth } from '../context/AuthContext';
import { Button, Stack, CircularProgress } from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  Box, Paper, Typography, Chip, TextField, MenuItem, Avatar,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  InputAdornment, Alert, Divider,
} from '@mui/material';
import { Grid } from '@mui/material';
import {
  Security as SecurityIcon, Search as SearchIcon,
  Edit as EditIcon, Add as AddIcon, Delete as DeleteIcon,
  Visibility as ViewIcon, Login as LoginIcon, Logout as LogoutIcon,
  FileDownload as ExportIcon, CheckCircle as ApproveIcon, Cancel as RejectIcon,
} from '@mui/icons-material';
import { mockAuditLogs, type AuditLog } from '../data/mockData';
import { DateText } from '../context/DatePreferenceContext';

const ACTION_CONFIG: Record<AuditLog['action'], { icon: React.ReactNode; color: string; labelAr: string; labelEn: string }> = {
  create: { icon: <AddIcon sx={{ fontSize: 16 }} />, color: '#43e97b', labelAr: 'إنشاء', labelEn: 'Create' },
  update: { icon: <EditIcon sx={{ fontSize: 16 }} />, color: '#667eea', labelAr: 'تعديل', labelEn: 'Update' },
  delete: { icon: <DeleteIcon sx={{ fontSize: 16 }} />, color: '#fa709a', labelAr: 'حذف', labelEn: 'Delete' },
  view: { icon: <ViewIcon sx={{ fontSize: 16 }} />, color: '#4facfe', labelAr: 'عرض', labelEn: 'View' },
  login: { icon: <LoginIcon sx={{ fontSize: 16 }} />, color: '#764ba2', labelAr: 'تسجيل دخول', labelEn: 'Login' },
  logout: { icon: <LogoutIcon sx={{ fontSize: 16 }} />, color: '#f093fb', labelAr: 'تسجيل خروج', labelEn: 'Logout' },
  export: { icon: <ExportIcon sx={{ fontSize: 16 }} />, color: '#f9a825', labelAr: 'تصدير', labelEn: 'Export' },
  approve: { icon: <ApproveIcon sx={{ fontSize: 16 }} />, color: '#00b894', labelAr: 'اعتماد', labelEn: 'Approve' },
  reject: { icon: <RejectIcon sx={{ fontSize: 16 }} />, color: '#ff6b6b', labelAr: 'رفض', labelEn: 'Reject' },
};

function LegacyAuditLogPage() {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';

  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [moduleFilter, setModuleFilter] = useState<string>('all');

  const modules = Array.from(new Set(mockAuditLogs.map(l => l.module)));

  const filtered = mockAuditLogs.filter(log => {
    const matchSearch = log.userName.toLowerCase().includes(search.toLowerCase()) ||
      log.description.toLowerCase().includes(search.toLowerCase()) ||
      (log.recordId ?? '').toLowerCase().includes(search.toLowerCase());
    const matchAction = actionFilter === 'all' || log.action === actionFilter;
    const matchModule = moduleFilter === 'all' || log.module === moduleFilter;
    return matchSearch && matchAction && matchModule;
  });

  const stats = {
    total: mockAuditLogs.length,
    creates: mockAuditLogs.filter(l => l.action === 'create').length,
    updates: mockAuditLogs.filter(l => l.action === 'update').length,
    logins: mockAuditLogs.filter(l => l.action === 'login').length,
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <SecurityIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold">
            {isRtl ? 'سجل العمليات' : 'Audit Log'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {isRtl ? 'تتبع جميع العمليات المُنفَّذة في النظام' : 'Track all system actions and data changes'}
          </Typography>
        </Box>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        {isRtl
          ? 'سجل العمليات للقراءة فقط — يتم تسجيل كل إجراء تلقائياً ولا يمكن تعديله أو حذفه.'
          : 'Audit log is read-only — every action is automatically recorded and cannot be modified or deleted.'}
      </Alert>

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: isRtl ? 'إجمالي العمليات' : 'Total Actions', value: stats.total, color: '#667eea' },
          { label: isRtl ? 'إنشاء سجلات' : 'Creates', value: stats.creates, color: '#43e97b' },
          { label: isRtl ? 'تعديلات' : 'Updates', value: stats.updates, color: '#f093fb' },
          { label: isRtl ? 'تسجيلات دخول' : 'Logins', value: stats.logins, color: '#4facfe' },
        ].map(s => (
          <Grid key={s.label} size={{ xs: 6, sm: 3 }}>
            <Paper sx={{ p: 2, textAlign: 'center', borderTop: `4px solid ${s.color}` }}>
              <Typography variant="h4" fontWeight="bold" color={s.color}>{s.value}</Typography>
              <Typography variant="caption" color="text.secondary">{s.label}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 5 }}>
            <TextField fullWidth size="small" placeholder={isRtl ? 'بحث بالاسم أو الوصف...' : 'Search by name or description...'}
              value={search} onChange={e => setSearch(e.target.value)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }} />
          </Grid>
          <Grid size={{ xs: 6, md: 3.5 }}>
            <TextField fullWidth select size="small" label={isRtl ? 'الإجراء' : 'Action'} value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
              <MenuItem value="all">{isRtl ? 'الكل' : 'All'}</MenuItem>
              {Object.entries(ACTION_CONFIG).map(([key, val]) => (
                <MenuItem key={key} value={key}>{isRtl ? val.labelAr : val.labelEn}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 6, md: 3.5 }}>
            <TextField fullWidth select size="small" label={isRtl ? 'القسم' : 'Module'} value={moduleFilter} onChange={e => setModuleFilter(e.target.value)}>
              <MenuItem value="all">{isRtl ? 'الكل' : 'All'}</MenuItem>
              {modules.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      {/* Table */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'الوقت' : 'Time'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'المستخدم' : 'User'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'الإجراء' : 'Action'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'القسم' : 'Module'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'الوصف' : 'Description'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'القبل / البعد' : 'Before / After'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'عنوان IP' : 'IP Address'}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((log) => {
              const actionConf = ACTION_CONFIG[log.action];
              return (
                <TableRow key={log.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Typography variant="caption"><DateText value={log.createdAt} withTime /></Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar sx={{ width: 28, height: 28, fontSize: '0.7rem', bgcolor: 'primary.light' }}>
                        {log.userName.charAt(0)}
                      </Avatar>
                      <Box>
                        <Typography variant="caption" fontWeight="medium" display="block">{log.userName}</Typography>
                        <Typography variant="caption" color="text.secondary">{log.userRole}</Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      icon={<Box sx={{ color: actionConf.color, display: 'flex' }}>{actionConf.icon}</Box>}
                      label={isRtl ? actionConf.labelAr : actionConf.labelEn}
                      size="small"
                      sx={{ bgcolor: `${actionConf.color}15`, color: actionConf.color, fontWeight: 600, fontSize: '0.7rem' }}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip label={log.module} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell sx={{ maxWidth: 260 }}>
                    <Typography variant="caption">{log.description}</Typography>
                    {log.recordId && (
                      <Typography variant="caption" color="primary.main" display="block" fontFamily="monospace">
                        #{log.recordId}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 180 }}>
                    {log.oldValue && (
                      <Box>
                        <Typography variant="caption" color="error.main" display="block">
                          ← {log.oldValue}
                        </Typography>
                        <Divider sx={{ my: 0.25 }} />
                        <Typography variant="caption" color="success.main" display="block">
                          → {log.newValue}
                        </Typography>
                      </Box>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" fontFamily="monospace" color="text.secondary">
                      {log.ipAddress}
                    </Typography>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

type ActualAuditRow={id:number;user:string;action:string;model_name:string;record_id:string;created_at:string};
type AuditResponse={count:number;next:string|null;previous:string|null;results:ActualAuditRow[]};
const AUDIT_API='https://occupational-staging-backend-staging.up.railway.app/api';
function StagingAuditLogPage(){
  const {user}=useAuth();
  const [data,setData]=useState<AuditResponse|null>(null);
  const [page,setPage]=useState(1),[revision,setRevision]=useState(0);
  const [action,setAction]=useState(''),[model,setModel]=useState('');
  const [filters,setFilters]=useState({action:'',model:''});
  const [loading,setLoading]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    let active=true;setData(null);setError('');
    if(!user?.isSuperuser){setLoading(false);return;}
    if((import.meta.env.VITE_API_URL||'').replace(/\/$/,'')!==AUDIT_API){setError('اتصال Staging غير مطابق.');return;}
    setLoading(true);
    const q=new URLSearchParams({page:String(page)});
    if(filters.action)q.set('action',filters.action);
    if(filters.model)q.set('model_name',filters.model);
    void authFetch(AUDIT_API+'/audit-logs/?'+q.toString()).then(async r=>{
      if(!r.ok)throw Error('تعذر قراءة سجل التدقيق أو لا توجد صلاحية.');
      const body=await r.json();
      if(!Array.isArray(body.results)||typeof body.count!=='number')throw Error('صيغة سجل التدقيق غير صالحة.');
      if(active)setData(body);
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:'تعذر قراءة السجل.');})
    .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[user?.isSuperuser,page,revision,filters]);
  const labels:Record<string,string>={qa_login_success:'تسجيل دخول ناجح',qa_login_failed:'محاولة دخول مرفوضة',qa_logout:'إنهاء جلسة',qa_refresh_replay_denied:'رفض رمز تجديد مستخدم سابقًا',qa_view_health_card:'عرض بطاقة اختبار',qa_export_health_metrics:'تصدير مؤشرات الاختبار',
    create_employee_health_card:'إنشاء بطاقة',update_employee_health_card:'تعديل بطاقة',
    qa_delete_card_correction:'حذف مسودة — تصحيح',qa_delete_card_retest:'حذف مسودة — إعادة اختبار',
    qa_delete_card_wrong_entry:'حذف مسودة — إدخال خاطئ',health_data_draft_fill:'استكمال مسودة من Excel',
    create_user:'إنشاء حساب',update_user:'تعديل حساب',reset_password:'إعادة تعيين كلمة المرور'};
  return <Box dir="rtl"><Stack gap={2}>
    <Typography variant="h4" fontWeight={900}>سجل التدقيق الفعلي — Staging</Typography>
    <Alert severity="info">سجل PostgreSQL للقراءة فقط من التطبيق. يعرض العمليات التي يسجلها النظام فعليًا، وليس كل طلب أو حدث. لا يعرض القيم الصحية السابقة أو اللاحقة أو كلمات المرور أو عناوين IP.</Alert>
    {!user?.isSuperuser?<Alert severity="warning">متاح للمسؤول الأعلى فقط.</Alert>:<>
      <Paper sx={{p:2}}><Stack gap={2}>
        <Grid container spacing={2}>
          <Grid size={{xs:12,md:6}}><TextField fullWidth label="رمز العملية (مطابقة تامة)" value={action} onChange={e=>setAction(e.target.value)}/></Grid>
          <Grid size={{xs:12,md:6}}><TextField fullWidth label="نوع السجل (مطابقة تامة)" value={model} onChange={e=>setModel(e.target.value)}/></Grid>
        </Grid>
        <Stack direction="row" gap={1} flexWrap="wrap">
          <Button variant="contained" disabled={loading} onClick={()=>{setPage(1);setFilters({action:action.trim(),model:model.trim()});}}>تطبيق المرشحات</Button>
          <Button variant="outlined" disabled={loading} onClick={()=>{setPage(1);setAction('');setModel('');setFilters({action:'',model:''});}}>إعادة ضبط</Button>
          <Button variant="outlined" disabled={loading} onClick={()=>setRevision(n=>n+1)}>تحديث السجل</Button>
        </Stack>
      </Stack></Paper>
      {error&&<Alert severity="error">{error}</Alert>}
      {loading&&<CircularProgress/>}
      {data&&!loading&&<><Typography fontWeight={800}>العمليات المطابقة: {data.count.toLocaleString('ar-SA')}</Typography>
        <TableContainer component={Paper}><Table size="small"><TableHead><TableRow>{['الوقت','المستخدم','العملية','نوع السجل','معرف السجل'].map(h=><TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead>
          <TableBody>{data.results.map(r=><TableRow key={r.id}><TableCell><DateText value={r.created_at} withTime/></TableCell><TableCell>{r.user||'—'}</TableCell>
            <TableCell>{labels[r.action]||r.action}<Typography variant="caption" display="block" color="text.secondary">{r.action}</Typography></TableCell><TableCell>{r.model_name}</TableCell><TableCell>{r.record_id||'—'}</TableCell></TableRow>)}</TableBody>
        </Table></TableContainer>
        {data.results.length===0&&<Alert severity="info">لا توجد عمليات مطابقة.</Alert>}
        <Stack direction="row" gap={2} alignItems="center"><Button disabled={!data.previous} onClick={()=>setPage(p=>p-1)}>السابق</Button><Typography>صفحة {page}</Typography><Button disabled={!data.next} onClick={()=>setPage(p=>p+1)}>التالي</Button></Stack>
      </>}
    </>}
  </Stack></Box>;
}
export function AuditLogPage(){return /staging/i.test(window.location.hostname)?<StagingAuditLogPage/>:<LegacyAuditLogPage/>;}
