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

const EMPTY_CAMPAIGNS: Campaign[] = [];

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

  const [campaigns, setCampaigns] = useState<Campaign[]>(EMPTY_CAMPAIGNS);
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
    toast.success(isRtl ? 'تم إنشاء الحملة' : 'Campaign created');
  }

  function openProgress(campaign: Campaign) {
    setEditCampaign(campaign);
    setProgressValue(String(campaign.completedCount));
    setProgressOpen(true);
  }

  function saveProgress() {
    setCampaigns(prev => prev.map(c => c.id === editCampaign?.id
      ? { ...c, completedCount: Number(progressValue), status: Number(progressValue) >= c.targetCount ? 'completed' : c.status }
      : c
    ));
    setProgressOpen(false);
    toast.success(isRtl ? 'تم تحديث التقدم' : 'Progress updated');
  }

  const totalTarget = campaigns.reduce((sum, c) => sum + c.targetCount, 0);
  const activeCount = campaigns.filter(c => c.status === 'active').length;
  const plannedCount = campaigns.filter(c => c.status === 'planned').length;
  const completedCount = campaigns.filter(c => c.status === 'completed').length;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <CampaignIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">
              {isRtl ? 'إدارة الحملات' : 'Health Campaigns'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {isRtl ? 'إدارة ومتابعة حملات الصحة المهنية' : 'Manage and track occupational health campaigns'}
            </Typography>
          </Box>
        </Box>
        {can(PERMISSIONS.MANAGE_CAMPAIGNS) && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}
            sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            {isRtl ? 'حملة جديدة' : 'New Campaign'}
          </Button>
        )}
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: isRtl ? 'حملات نشطة' : 'Active Campaigns', value: activeCount, icon: <CampaignIcon />, color: 'primary.main' },
          { label: isRtl ? 'مخططة' : 'Planned', value: plannedCount, icon: null, color: 'info.main' },
          { label: isRtl ? 'مكتملة' : 'Completed', value: completedCount, icon: null, color: 'success.main' },
          { label: isRtl ? 'المستهدف الإجمالي' : 'Total Target', value: totalTarget, icon: <GroupIcon />, color: 'warning.main' },
        ].map(s => (
          <Grid key={s.label} size={{ xs: 6, sm: 3 }}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              {s.icon && <Box sx={{ color: s.color }}>{s.icon}</Box>}
              <Typography variant="h4" fontWeight="bold" color={s.color}>{s.value}</Typography>
              <Typography variant="body2" color="text.secondary">{s.label}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 8 }}>
            <TextField fullWidth placeholder={(isRtl ? 'بحث باسم الحملة' : 'Search campaigns') + '...'}
              value={search} onChange={e => setSearch(e.target.value)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField fullWidth select label={isRtl ? 'الحالة' : 'Status'} value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}>
              <MenuItem value="all">{isRtl ? 'الكل' : 'All Statuses'}</MenuItem>
              {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                <MenuItem key={key} value={key}>{isRtl ? config.labelAr : config.labelEn}</MenuItem>
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
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'الفترة' : 'Period'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'التقدم' : 'Progress'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{isRtl ? 'الحالة' : 'Status'}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }} align="center">{isRtl ? 'إجراءات' : 'Actions'}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map(campaign => {
              const progress = campaign.targetCount > 0 ? Math.round((campaign.completedCount / campaign.targetCount) * 100) : 0;
              const status = STATUS_CONFIG[campaign.status];
              return (
                <TableRow key={campaign.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">{isRtl ? campaign.nameAr : campaign.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{campaign.id}</Typography>
                  </TableCell>
                  <TableCell><Chip label={campaign.campaignType} size="small" variant="outlined" /></TableCell>
                  <TableCell>
                    <Typography variant="body2">{campaign.startDate}</Typography>
                    <Typography variant="caption" color="text.secondary">→ {campaign.endDate}</Typography>
                  </TableCell>
                  <TableCell sx={{ minWidth: 150 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ flex: 1 }}><LinearProgress variant="determinate" value={Math.min(progress, 100)} /></Box>
                      <Typography variant="caption">{progress}%</Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">{campaign.completedCount} / {campaign.targetCount}</Typography>
                  </TableCell>
                  <TableCell><Chip label={isRtl ? status.labelAr : status.labelEn} size="small" color={status.color} /></TableCell>
                  <TableCell align="center">
                    <Tooltip title={isRtl ? 'تحديث التقدم' : 'Update Progress'}>
                      <IconButton size="small" onClick={() => openProgress(campaign)}><EditIcon fontSize="small" /></IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{isRtl ? 'إنشاء حملة جديدة' : 'Create New Campaign'}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth required label={isRtl ? 'اسم الحملة (إنجليزي)' : 'Campaign Name'} value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth label={isRtl ? 'اسم الحملة (عربي)' : 'Arabic Name'} value={form.nameAr}
                onChange={e => setForm(p => ({ ...p, nameAr: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth select label={isRtl ? 'نوع الحملة' : 'Campaign Type'} value={form.campaignType}
                onChange={e => setForm(p => ({ ...p, campaignType: e.target.value }))}>
                <MenuItem value="Vaccination">{isRtl ? 'تطعيم' : 'Vaccination'}</MenuItem>
                <MenuItem value="Lab Screening">{isRtl ? 'فحص مخبري' : 'Lab Screening'}</MenuItem>
                <MenuItem value="Periodic Exam">{isRtl ? 'فحص دوري' : 'Periodic Exam'}</MenuItem>
                <MenuItem value="Awareness">{isRtl ? 'توعية' : 'Awareness'}</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth required label={isRtl ? 'تاريخ البدء' : 'Start Date'} type="date" value={form.startDate}
                onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} slotProps={{ inputLabel: { shrink: true } }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth required label={isRtl ? 'تاريخ الانتهاء' : 'End Date'} type="date" value={form.endDate}
                onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} slotProps={{ inputLabel: { shrink: true } }} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth required label={isRtl ? 'العدد المستهدف' : 'Target Count'} type="number" value={form.targetCount}
                onChange={e => setForm(p => ({ ...p, targetCount: e.target.value }))} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{isRtl ? 'إلغاء' : 'Cancel'}</Button>
          <Button variant="contained" onClick={handleCreate}>{isRtl ? 'إنشاء' : 'Create'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={progressOpen} onClose={() => setProgressOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{isRtl ? 'تحديث تقدم الحملة' : 'Update Campaign Progress'}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {editCampaign && (isRtl ? editCampaign.nameAr : editCampaign.name)}
          </Typography>
          <TextField fullWidth type="number" label={isRtl ? 'عدد المكتمل' : 'Completed Count'} value={progressValue}
            onChange={e => setProgressValue(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProgressOpen(false)}>{isRtl ? 'إلغاء' : 'Cancel'}</Button>
          <Button variant="contained" onClick={saveProgress}>{isRtl ? 'حفظ' : 'Save'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
