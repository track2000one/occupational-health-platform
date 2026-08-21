import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, TextField, InputAdornment,
  MenuItem, Dialog, DialogTitle, DialogContent, DialogActions,
  LinearProgress, IconButton, Tooltip,
} from '@mui/material';
import { Grid } from '@mui/material';
import {
  Campaign as CampaignIcon, Add as AddIcon, Search as SearchIcon,
  Group as GroupIcon, Edit as EditIcon,
} from '@mui/icons-material';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../data/roles';

interface Campaign {
  id: string;
  name: string;
  nameAr: string;
  campaignType: string;
  startDate: string;
  endDate: string;
  targetCount: number;
  completedCount: number;
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  description?: string;
}

const MOCK_CAMPAIGNS: Campaign[] = [
  { id: 'CAM-001', name: 'Influenza Vaccination 2024', nameAr: 'حملة تطعيم الإنفلونزا 2024', campaignType: 'Vaccination', startDate: '2024-01-15', endDate: '2024-02-15', targetCount: 295, completedCount: 210, status: 'active' },
  { id: 'CAM-002', name: 'Annual Periodic Examination', nameAr: 'الفحص الدوري السنوي 2024', campaignType: 'Periodic Exam', startDate: '2024-01-01', endDate: '2024-03-31', targetCount: 295, completedCount: 243, status: 'active' },
  { id: 'CAM-003', name: 'HBV Booster Campaign', nameAr: 'حملة جرعة التعزيز لالتهاب الكبد B', campaignType: 'Vaccination', startDate: '2023-10-01', endDate: '2023-12-31', targetCount: 80, completedCount: 80, status: 'completed' },
  { id: 'CAM-004', name: 'TB Screening Drive', nameAr: 'حملة فحص السل', campaignType: 'Lab Screening', startDate: '2024-03-01', endDate: '2024-04-30', targetCount: 295, completedCount: 0, status: 'planned' },
];

const STATUS_CONFIG = {
  planned: { color: 'info' as const, labelEn: 'Planned', labelAr: 'مخطط' },
  active: { color: 'success' as const, labelEn: 'Active', labelAr: 'نشط' },
  completed: { color: 'default' as const, labelEn: 'Completed', labelAr: 'مكتمل' },
  cancelled: { color: 'error' as const, labelEn: 'Cancelled', labelAr: 'ملغي' },
};

export function CampaignsPage() {
  const { i18n } = useTranslation();
  const { can } = useAuth();
  const isRtl = i18n.language === 'ar';

  const [campaigns, setCampaigns] = useState<Campaign[]>(MOCK_CAMPAIGNS);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [editCampaign, setEditCampaign] = useState<Campaign | null>(null);
  const [progressValue, setProgressValue] = useState('');
  const [form, setForm] = useState({
    name: '', nameAr: '', campaignType: '', startDate: '', endDate: '',
    targetCount: '', description: '',
  });

  const filtered = campaigns.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.nameAr.includes(search);
    const matchStatus = filterStatus === 'all' || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  function handleCreate() {
    if (!form.name || !form.startDate || !form.endDate || !form.targetCount) {
      toast.error(isRtl ? 'يرجى تعبئة الحقول المطلوبة' : 'Please fill required fields');
      return;
    }
    const newCampaign: Campaign = {
      id: `CAM-${Date.now()}`,
      name: form.name,
      nameAr: form.nameAr || form.name,
      campaignType: form.campaignType || 'General',
      startDate: form.startDate,
      endDate: form.endDate,
      targetCount: Number(form.targetCount),
      completedCount: 0,
      status: 'planned',
      description: form.description,
    };
    setCampaigns(prev => [newCampaign, ...prev]);
    setDialogOpen(false);
    setForm({ name: '', nameAr: '', campaignType: '', startDate: '', endDate: '', targetCount: '', description: '' });
    toast.success(isRtl ? 'تم إنشاء الحملة بنجاح' : 'Campaign created successfully');
  }

  function updateProgress() {
    const val = Number(progressValue);
    if (isNaN(val) || val < 0) return;
    setCampaigns(prev => prev.map(c => c.id === editCampaign?.id
      ? { ...c, completedCount: Math.min(val, c.targetCount), status: val >= c.targetCount ? 'completed' : 'active' }
      : c
    ));
    setProgressOpen(false);
    toast.success(isRtl ? 'تم تحديث تقدم الحملة' : 'Campaign progress updated');
  }

  const stats = {
    active: campaigns.filter(c => c.status === 'active').length,
    planned: campaigns.filter(c => c.status === 'planned').length,
    completed: campaigns.filter(c => c.status === 'completed').length,
    totalTarget: campaigns.filter(c => c.status === 'active').reduce((sum, c) => sum + c.targetCount, 0),
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <CampaignIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">
              {isRtl ? 'إدارة الحملات' : 'Campaigns'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {isRtl ? 'إدارة ومتابعة حملات الصحة المهنية' : 'Manage and track occupational health campaigns'}
            </Typography>
          </Box>
        </Box>
        {can(PERMISSIONS.CREATE_CAMPAIGN) && (
          <Button variant="contained" startIcon={<AddIcon />}
            onClick={() => setDialogOpen(true)}
            sx={{ background: 'linear-gradient(135deg, #f9a825 0%, #f57f17 100%)' }}>
            {isRtl ? 'حملة جديدة' : 'New Campaign'}
          </Button>
        )}
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: isRtl ? 'حملات نشطة' : 'Active Campaigns', value: stats.active, color: 'success.main' },
          { label: isRtl ? 'مخططة' : 'Planned', value: stats.planned, color: 'info.main' },
          { label: isRtl ? 'مكتملة' : 'Completed', value: stats.completed, color: 'text.secondary' },
          { label: isRtl ? 'المستهدف الإجمالي' : 'Total Target', value: stats.totalTarget, color: 'primary.main' },
        ].map(s => (
          <Grid key={s.label} size={{ xs: 6, sm: 3 }}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="h4" fontWeight="bold" color={s.color}>{s.value}</Typography>
              <Typography variant="body2" color="text.secondary">{s.label}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 7 }}>
            <TextField fullWidth placeholder={(isRtl ? 'بحث باسم الحملة' : 'Search campaigns') + '...'}
              value={search} onChange={e => setSearch(e.target.value)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }} />
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <TextField fullWidth select label={isRtl ? 'الحالة' : 'Status'} value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}>
              <MenuItem value="all">{isRtl ? 'الكل' : 'All'}</MenuItem>
              {Object.entries(STATUS_CONFIG).map(([key, val]) => (
                <MenuItem key={key} value={key}>{isRtl ? val.labelAr : val.labelEn}</MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'اسم الحملة' : 'Campaign Name'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'النوع' : 'Type'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'التاريخ' : 'Period'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'الهدف' : 'Target'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'التقدم' : 'Progress'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'الحالة' : 'Status'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }} align="center">{isRtl ? 'إجراءات' : 'Actions'}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map(campaign => {
              const pct = campaign.targetCount > 0 ? Math.round((campaign.completedCount / campaign.targetCount) * 100) : 0;
              return (
                <TableRow key={campaign.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">{isRtl ? campaign.nameAr : campaign.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{campaign.id}</Typography>
                  </TableCell>
                  <TableCell><Chip label={campaign.campaignType} size="small" variant="outlined" /></TableCell>
                  <TableCell>
                    <Typography variant="caption">{campaign.startDate}</Typography>
                    <Typography variant="caption" color="text.secondary"> → {campaign.endDate}</Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <GroupIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                      <Typography variant="body2">{campaign.completedCount} / {campaign.targetCount}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ minWidth: 140 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ flex: 1 }}>
                        <LinearProgress variant="determinate" value={pct} sx={{ height: 8, borderRadius: 4 }} />
                      </Box>
                      <Typography variant="caption">{pct}%</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip label={isRtl ? STATUS_CONFIG[campaign.status].labelAr : STATUS_CONFIG[campaign.status].labelEn}
                      size="small" color={STATUS_CONFIG[campaign.status].color} />
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title={isRtl ? 'تحديث التقدم' : 'Update Progress'}>
                      <IconButton size="small" color="primary" onClick={() => { setEditCampaign(campaign); setProgressValue(String(campaign.completedCount)); setProgressOpen(true); }}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create Campaign Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle component="div">
          <Typography variant="h6" component="span" fontWeight="bold">
            {isRtl ? 'إنشاء حملة جديدة' : 'Create New Campaign'}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth required label={isRtl ? 'اسم الحملة (إنجليزي)' : 'Campaign Name (English)'}
                value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth label={isRtl ? 'اسم الحملة (عربي)' : 'Campaign Name (Arabic)'}
                value={form.nameAr} onChange={e => setForm(p => ({ ...p, nameAr: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth select label={isRtl ? 'نوع الحملة' : 'Campaign Type'}
                value={form.campaignType} onChange={e => setForm(p => ({ ...p, campaignType: e.target.value }))}>
                {['Vaccination', 'Periodic Exam', 'Lab Screening', 'Health Awareness', 'Blood Drive'].map(t => (
                  <MenuItem key={t} value={t}>{t}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth required label={isRtl ? 'تاريخ البدء' : 'Start Date'} type="date"
                value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))}
                slotProps={{ inputLabel: { shrink: true } }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth required label={isRtl ? 'تاريخ الانتهاء' : 'End Date'} type="date"
                value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                slotProps={{ inputLabel: { shrink: true } }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth required label={isRtl ? 'العدد المستهدف' : 'Target Count'} type="number"
                value={form.targetCount} onChange={e => setForm(p => ({ ...p, targetCount: e.target.value }))} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{isRtl ? 'إلغاء' : 'Cancel'}</Button>
          <Button variant="contained" onClick={handleCreate}>{isRtl ? 'إنشاء' : 'Create'}</Button>
        </DialogActions>
      </Dialog>

      {/* Update Progress Dialog */}
      <Dialog open={progressOpen} onClose={() => setProgressOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle component="div">
          <Typography variant="h6" component="span" fontWeight="bold">
            {isRtl ? 'تحديث التقدم' : 'Update Progress'}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {isRtl ? editCampaign?.nameAr : editCampaign?.name}
          </Typography>
          <TextField fullWidth label={isRtl ? 'عدد المكتملين' : 'Completed Count'} type="number"
            value={progressValue} onChange={e => setProgressValue(e.target.value)}
            helperText={`${isRtl ? 'الهدف' : 'Target'}: ${editCampaign?.targetCount}`} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProgressOpen(false)}>{isRtl ? 'إلغاء' : 'Cancel'}</Button>
          <Button variant="contained" onClick={updateProgress}>{isRtl ? 'تحديث' : 'Update'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
