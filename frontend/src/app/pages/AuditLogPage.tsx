import { useState } from 'react';
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

export function AuditLogPage() {
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
                    <Typography variant="caption">
                      {new Date(log.createdAt).toLocaleDateString(isRtl ? 'ar-SA' : 'en-US')}
                    </Typography>
                    <br />
                    <Typography variant="caption" color="text.secondary">
                      {new Date(log.createdAt).toLocaleTimeString(isRtl ? 'ar-SA' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                    </Typography>
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
