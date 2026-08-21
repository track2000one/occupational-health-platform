import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Paper, Typography, Chip, IconButton, Button, Divider,
  List, ListItem, ListItemText, ListItemIcon, MenuItem, TextField,
  Alert,
} from '@mui/material';
import {
  Notifications as BellIcon, DoneAll as DoneAllIcon,
  Science as ScienceIcon, Vaccines as VaccinesIcon,
  CalendarMonth as CalendarIcon, Warning as WarningIcon,
  LocalHospital as HospitalIcon, Security as SecurityIcon,
  BugReport as BugReportIcon, Campaign as CampaignIcon,
  DataObject as DataIcon, CheckCircle as CheckIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { mockNotifications, type Notification } from '../data/mockData';

function moduleIcon(module: Notification['module']) {
  const icons: Record<Notification['module'], React.ReactNode> = {
    lab: <ScienceIcon fontSize="small" />,
    vaccination: <VaccinesIcon fontSize="small" />,
    appointment: <CalendarIcon fontSize="small" />,
    needleStick: <WarningIcon fontSize="small" />,
    committee: <HospitalIcon fontSize="small" />,
    system: <SecurityIcon fontSize="small" />,
    dataQuality: <DataIcon fontSize="small" />,
    campaign: <CampaignIcon fontSize="small" />,
  };
  return icons[module];
}

const MODULE_COLORS: Record<Notification['module'], string> = {
  lab: '#667eea',
  vaccination: '#43e97b',
  appointment: '#4facfe',
  needleStick: '#fa709a',
  committee: '#f093fb',
  system: '#764ba2',
  dataQuality: '#ff6b6b',
  campaign: '#f9a825',
};

export function NotificationsPage() {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const isRtl = i18n.language === 'ar';

  const relevant = mockNotifications.filter(
    n => n.userId === user?.id || n.role === user?.role || n.userId === 'all'
  );

  const [notifications, setNotifications] = useState<Notification[]>(relevant);
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [moduleFilter, setModuleFilter] = useState<string>('all');

  const filtered = notifications.filter(n => {
    const matchesRead = filter === 'all' || (filter === 'unread' ? !n.isRead : n.isRead);
    const matchesModule = moduleFilter === 'all' || n.module === moduleFilter;
    return matchesRead && matchesModule;
  });

  const unreadCount = notifications.filter(n => !n.isRead).length;

  function markRead(id: string) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  }

  function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  }

  const typeColor = { info: 'info', warning: 'warning', success: 'success', error: 'error' } as const;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <BellIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">
              {isRtl ? 'الإشعارات' : 'Notifications'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {isRtl ? `${unreadCount} إشعار غير مقروء` : `${unreadCount} unread notifications`}
            </Typography>
          </Box>
        </Box>
        {unreadCount > 0 && (
          <Button startIcon={<DoneAllIcon />} variant="outlined" size="small" onClick={markAllRead}>
            {isRtl ? 'تحديد الكل كمقروء' : 'Mark all as read'}
          </Button>
        )}
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField select size="small" label={isRtl ? 'الحالة' : 'Status'} value={filter} onChange={e => setFilter(e.target.value as typeof filter)} sx={{ minWidth: 140 }}>
          <MenuItem value="all">{isRtl ? 'الكل' : 'All'}</MenuItem>
          <MenuItem value="unread">{isRtl ? 'غير مقروء' : 'Unread'}</MenuItem>
          <MenuItem value="read">{isRtl ? 'مقروء' : 'Read'}</MenuItem>
        </TextField>
        <TextField select size="small" label={isRtl ? 'القسم' : 'Module'} value={moduleFilter} onChange={e => setModuleFilter(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="all">{isRtl ? 'جميع الأقسام' : 'All Modules'}</MenuItem>
          <MenuItem value="lab">{isRtl ? 'التحاليل' : 'Lab Tests'}</MenuItem>
          <MenuItem value="vaccination">{isRtl ? 'التطعيمات' : 'Vaccinations'}</MenuItem>
          <MenuItem value="appointment">{isRtl ? 'المواعيد' : 'Appointments'}</MenuItem>
          <MenuItem value="needleStick">{isRtl ? 'إصابات الوخز' : 'Needle Stick'}</MenuItem>
          <MenuItem value="committee">{isRtl ? 'الهيئة الطبية' : 'Medical Committee'}</MenuItem>
          <MenuItem value="system">{isRtl ? 'النظام' : 'System'}</MenuItem>
          <MenuItem value="dataQuality">{isRtl ? 'جودة البيانات' : 'Data Quality'}</MenuItem>
          <MenuItem value="campaign">{isRtl ? 'الحملات' : 'Campaigns'}</MenuItem>
        </TextField>
      </Paper>

      {/* List */}
      <Paper>
        {filtered.length === 0 ? (
          <Box sx={{ p: 6, textAlign: 'center' }}>
            <CheckIcon sx={{ fontSize: 64, color: 'success.light', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              {isRtl ? 'لا توجد إشعارات' : 'No notifications'}
            </Typography>
          </Box>
        ) : (
          <List disablePadding>
            {filtered.map((notif, idx) => (
              <Box key={notif.id}>
                <ListItem
                  alignItems="flex-start"
                  sx={{
                    bgcolor: notif.isRead ? 'transparent' : 'primary.50',
                    transition: 'background 0.2s',
                    '&:hover': { bgcolor: 'grey.50' },
                    cursor: notif.isRead ? 'default' : 'pointer',
                  }}
                  onClick={() => !notif.isRead && markRead(notif.id)}
                >
                  <ListItemIcon sx={{ mt: 1, minWidth: 44 }}>
                    <Box
                      sx={{
                        width: 36, height: 36, borderRadius: '50%',
                        bgcolor: `${MODULE_COLORS[notif.module]}20`,
                        color: MODULE_COLORS[notif.module],
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {moduleIcon(notif.module)}
                    </Box>
                  </ListItemIcon>
                  <ListItemText
                    disableTypography
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="body2" fontWeight={notif.isRead ? 'normal' : 'bold'}>
                          {isRtl ? notif.titleAr : notif.title}
                        </Typography>
                        <Alert severity={typeColor[notif.type]} sx={{ py: 0, px: 1, fontSize: '0.7rem', lineHeight: 1.2 }}>
                          {notif.type}
                        </Alert>
                        {!notif.isRead && (
                          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main', flexShrink: 0 }} />
                        )}
                      </Box>
                    }
                    secondary={
                      <Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {isRtl ? notif.messageAr : notif.message}
                        </Typography>
                        <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
                          {new Date(notif.createdAt).toLocaleString(isRtl ? 'ar-SA' : 'en-US')}
                        </Typography>
                      </Box>
                    }
                  />
                  {!notif.isRead && (
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); markRead(notif.id); }} title={isRtl ? 'تحديد كمقروء' : 'Mark as read'}>
                      <CheckIcon fontSize="small" />
                    </IconButton>
                  )}
                </ListItem>
                {idx < filtered.length - 1 && <Divider />}
              </Box>
            ))}
          </List>
        )}
      </Paper>
    </Box>
  );
}
