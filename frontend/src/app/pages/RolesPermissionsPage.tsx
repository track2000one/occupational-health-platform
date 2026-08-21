import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Paper, Typography, Chip, Tooltip, Grid, Tabs, Tab,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Alert, Divider,
} from '@mui/material';
import {
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  RemoveCircle as PartialIcon,
  Security as SecurityIcon,
} from '@mui/icons-material';
import { ROLE_DEFINITIONS, PERMISSIONS, hasPermission, type UserRole } from '../data/roles';

// ─── Cell Component ────────────────────────────────────────────────────────────
function AccessCell({ value }: { value: boolean | 'partial' }) {
  if (value === true)
    return <CheckIcon sx={{ color: 'success.main', fontSize: 18 }} />;
  if (value === 'partial')
    return <PartialIcon sx={{ color: 'warning.main', fontSize: 18 }} />;
  return <CancelIcon sx={{ color: 'grey.300', fontSize: 18 }} />;
}

// ─── Matrix rows definition ────────────────────────────────────────────────────
const MATRIX_ROWS: { labelAr: string; labelEn: string; permission: string }[] = [
  { labelAr: 'لوحة المؤشرات', labelEn: 'Dashboard', permission: PERMISSIONS.VIEW_DASHBOARD },
  { labelAr: 'عرض الموظفين', labelEn: 'View Employees', permission: PERMISSIONS.VIEW_EMPLOYEES },
  { labelAr: 'إنشاء موظف', labelEn: 'Create Employee', permission: PERMISSIONS.CREATE_EMPLOYEE },
  { labelAr: 'تعديل بيانات الموظف', labelEn: 'Update Employee', permission: PERMISSIONS.UPDATE_EMPLOYEE },
  { labelAr: 'البيانات الحساسة (HIV/HCV)', labelEn: 'Sensitive Data', permission: PERMISSIONS.VIEW_SENSITIVE_DATA },
  { labelAr: 'عرض التحاليل', labelEn: 'View Lab Tests', permission: PERMISSIONS.VIEW_LAB_TESTS },
  { labelAr: 'طلب تحليل مختبري', labelEn: 'Request Lab Test', permission: PERMISSIONS.CREATE_LAB_REQUEST },
  { labelAr: 'إدخال نتيجة مختبر', labelEn: 'Enter Lab Result', permission: PERMISSIONS.UPDATE_LAB_RESULT },
  { labelAr: 'اعتماد نتيجة مختبر', labelEn: 'Approve Lab Result', permission: PERMISSIONS.APPROVE_LAB_RESULT },
  { labelAr: 'عرض التطعيمات', labelEn: 'View Vaccinations', permission: PERMISSIONS.VIEW_VACCINATIONS },
  { labelAr: 'تسجيل جرعة لقاح', labelEn: 'Record Vaccination', permission: PERMISSIONS.CREATE_VACCINATION },
  { labelAr: 'عرض زيارات العيادة', labelEn: 'View Clinic Visits', permission: PERMISSIONS.VIEW_CLINIC_VISITS },
  { labelAr: 'إضافة زيارة عيادة', labelEn: 'Add Clinic Visit', permission: PERMISSIONS.CREATE_CLINIC_VISIT },
  { labelAr: 'زيارة الصحة المهنية', labelEn: 'OH Visit', permission: PERMISSIONS.VIEW_OH_VISITS },
  { labelAr: 'عرض إصابات الوخز', labelEn: 'View Needle Stick', permission: PERMISSIONS.VIEW_NEEDLE_STICK },
  { labelAr: 'تسجيل إصابة وخز', labelEn: 'Record Needle Stick', permission: PERMISSIONS.CREATE_NEEDLE_STICK },
  { labelAr: 'إغلاق بلاغ الوخز', labelEn: 'Close Needle Stick', permission: PERMISSIONS.CLOSE_NEEDLE_STICK },
  { labelAr: 'عرض الهيئة الطبية', labelEn: 'View Committee', permission: PERMISSIONS.VIEW_COMMITTEE },
  { labelAr: 'إحالة للهيئة الطبية', labelEn: 'Create Referral', permission: PERMISSIONS.CREATE_REFERRAL },
  { labelAr: 'اعتماد قرار الهيئة', labelEn: 'Approve Committee', permission: PERMISSIONS.APPROVE_COMMITTEE_DECISION },
  { labelAr: 'عرض الحملات', labelEn: 'View Campaigns', permission: PERMISSIONS.VIEW_CAMPAIGNS },
  { labelAr: 'إنشاء حملة صحية', labelEn: 'Create Campaign', permission: PERMISSIONS.CREATE_CAMPAIGN },
  { labelAr: 'عرض التقارير', labelEn: 'View Reports', permission: PERMISSIONS.VIEW_REPORTS },
  { labelAr: 'تصدير التقارير', labelEn: 'Export Reports', permission: PERMISSIONS.EXPORT_REPORTS },
  { labelAr: 'إدارة المستخدمين', labelEn: 'Manage Users', permission: PERMISSIONS.MANAGE_USERS },
  { labelAr: 'إدارة الإعدادات', labelEn: 'Manage Settings', permission: PERMISSIONS.MANAGE_SETTINGS },
  { labelAr: 'سجل العمليات', labelEn: 'Audit Logs', permission: PERMISSIONS.VIEW_AUDIT_LOGS },
  { labelAr: 'جودة البيانات', labelEn: 'Data Quality', permission: PERMISSIONS.VIEW_DATA_QUALITY },
  { labelAr: 'الدعم الفني', labelEn: 'Tech Support', permission: PERMISSIONS.MANAGE_TECH_TICKETS },
];

// Role groups for tab navigation
const ROLE_GROUPS: { labelAr: string; labelEn: string; roles: UserRole[] }[] = [
  {
    labelAr: 'الطبي والسريري',
    labelEn: 'Medical & Clinical',
    roles: ['ohManager', 'ohDoctor', 'clinicDoctor', 'labOfficer', 'vaccinationOfficer'],
  },
  {
    labelAr: 'الإداري والتشغيلي',
    labelEn: 'Admin & Operational',
    roles: ['needleStickOfficer', 'medicalCommitteeOfficer', 'campaignOfficer', 'centerManager'],
  },
  {
    labelAr: 'القيادي والتقارير',
    labelEn: 'Leadership & Reports',
    roles: ['executive', 'reportsOfficer', 'dataQuality', 'dataEntry'],
  },
  {
    labelAr: 'النظام والدعم',
    labelEn: 'System & Support',
    roles: ['systemAdmin', 'techSupport', 'employee'],
  },
];

export function RolesPermissionsPage() {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';
  const [tab, setTab] = useState(0);

  const currentGroup = ROLE_GROUPS[tab];

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
          <SecurityIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Typography variant="h4" fontWeight="bold">
            {isRtl ? 'مصفوفة الأدوار والصلاحيات' : 'Roles & Permissions Matrix'}
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          {isRtl
            ? 'نظام صلاحيات مبني على الأدوار (RBAC) — كل مستخدم يصل فقط للبيانات المسموح له بها'
            : 'Role-Based Access Control (RBAC) — each user accesses only permitted data'}
        </Typography>
      </Box>

      {/* Role cards overview */}
      <Grid container spacing={1.5} sx={{ mb: 3 }}>
        {Object.values(ROLE_DEFINITIONS).map(def => (
          <Grid key={def.id} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
            <Tooltip
              title={`${def.permissions.length} ${isRtl ? 'صلاحية' : 'permissions'}`}
              placement="top"
            >
              <Paper
                sx={{
                  p: 1.5,
                  borderTop: `4px solid ${def.bgColor}`,
                  cursor: 'default',
                  transition: 'transform 0.15s',
                  '&:hover': { transform: 'translateY(-2px)', boxShadow: 4 },
                }}
              >
                <Typography variant="caption" fontWeight="bold" display="block" noWrap>
                  {def.nameAr}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                  {def.nameEn}
                </Typography>
                <Chip
                  label={`${def.permissions.length} ${isRtl ? 'صلاحية' : 'perms'}`}
                  size="small"
                  sx={{ bgcolor: def.bgColor, color: def.color, fontSize: '0.65rem', height: 20 }}
                />
              </Paper>
            </Tooltip>
          </Grid>
        ))}
      </Grid>

      <Alert severity="warning" sx={{ mb: 2 }}>
        <Typography variant="body2">
          {isRtl
            ? '⚠️ في بيئة الإنتاج، يجب تطبيق صلاحيات RBAC على مستوى الخادم (Backend) أيضاً. الواجهة الأمامية تعرض القيود فقط، لكن التحقق الحقيقي يكون في API.'
            : '⚠️ In production, RBAC must be enforced on the server side (Backend) as well. The frontend only displays restrictions; real authorization happens in the API.'}
        </Typography>
      </Alert>

      {/* Permissions Matrix by group */}
      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ borderBottom: 1, borderColor: 'divider', px: 2, pt: 1 }}
        >
          {ROLE_GROUPS.map(group => (
            <Tab key={group.labelAr} label={isRtl ? group.labelAr : group.labelEn} />
          ))}
        </Tabs>

        <TableContainer sx={{ maxHeight: 560, overflow: 'auto' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell
                  sx={{ fontWeight: 'bold', minWidth: 200, bgcolor: 'grey.50', position: 'sticky', left: 0, zIndex: 3 }}
                >
                  {isRtl ? 'الصلاحية' : 'Permission'}
                </TableCell>
                {currentGroup.roles.map(roleId => {
                  const def = ROLE_DEFINITIONS[roleId];
                  return (
                    <TableCell
                      key={roleId}
                      align="center"
                      sx={{ fontWeight: 'bold', bgcolor: 'grey.50', minWidth: 120 }}
                    >
                      <Box
                        sx={{
                          display: 'inline-block',
                          px: 1, py: 0.25,
                          borderRadius: 1,
                          bgcolor: def.bgColor,
                          color: def.color,
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {def.nameAr}
                      </Box>
                    </TableCell>
                  );
                })}
              </TableRow>
            </TableHead>
            <TableBody>
              {MATRIX_ROWS.map((row, idx) => (
                <TableRow
                  key={row.permission}
                  sx={{ bgcolor: idx % 2 === 0 ? 'transparent' : 'grey.50' }}
                >
                  <TableCell
                    sx={{ position: 'sticky', left: 0, bgcolor: 'inherit', zIndex: 1, borderRight: '1px solid', borderColor: 'divider' }}
                  >
                    <Box>
                      <Typography variant="body2" fontWeight="medium">
                        {isRtl ? row.labelAr : row.labelEn}
                      </Typography>
                      <Typography variant="caption" color="text.disabled" sx={{ fontFamily: 'monospace' }}>
                        {row.permission}
                      </Typography>
                    </Box>
                  </TableCell>
                  {currentGroup.roles.map(roleId => (
                    <TableCell key={roleId} align="center">
                      <AccessCell value={hasPermission(roleId, row.permission as any)} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Legend */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
          {isRtl ? 'دليل الرموز' : 'Legend'}
        </Typography>
        <Divider sx={{ mb: 1.5 }} />
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CheckIcon sx={{ color: 'success.main', fontSize: 20 }} />
            <Typography variant="body2">{isRtl ? 'صلاحية ممنوحة' : 'Permission granted'}</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PartialIcon sx={{ color: 'warning.main', fontSize: 20 }} />
            <Typography variant="body2">{isRtl ? 'صلاحية جزئية' : 'Partial access'}</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CancelIcon sx={{ color: 'grey.300', fontSize: 20 }} />
            <Typography variant="body2">{isRtl ? 'غير مسموح' : 'No access'}</Typography>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
