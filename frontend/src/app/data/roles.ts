// ─── Permission tokens ────────────────────────────────────────────────────────
export const PERMISSIONS = {
  // Dashboard
  VIEW_DASHBOARD: 'view:dashboard',
  VIEW_KPI: 'view:kpi',

  // Employees
  VIEW_EMPLOYEES: 'view:employees',
  VIEW_EMPLOYEES_OWN_CENTER: 'view:employees:ownCenter',
  VIEW_OWN_PROFILE: 'view:ownProfile',
  CREATE_EMPLOYEE: 'create:employee',
  UPDATE_EMPLOYEE: 'update:employee',
  UPDATE_EMPLOYEE_BASIC: 'update:employee:basic',  // name, mobile only
  DELETE_EMPLOYEE: 'delete:employee',
  VIEW_SENSITIVE_DATA: 'view:sensitiveData',        // HIV, HCV, full NID

  // Lab Tests
  VIEW_LAB_TESTS: 'view:labTests',
  CREATE_LAB_REQUEST: 'create:labRequest',
  UPDATE_LAB_RESULT: 'update:labResult',
  APPROVE_LAB_RESULT: 'approve:labResult',
  UPLOAD_LAB_ATTACHMENT: 'upload:labAttachment',

  // Vaccinations
  VIEW_VACCINATIONS: 'view:vaccinations',
  CREATE_VACCINATION: 'create:vaccination',
  UPDATE_VACCINATION: 'update:vaccination',

  // Clinic Visits
  VIEW_CLINIC_VISITS: 'view:clinicVisits',
  CREATE_CLINIC_VISIT: 'create:clinicVisit',
  UPDATE_CLINIC_VISIT: 'update:clinicVisit',

  // Occupational Health Visits
  VIEW_OH_VISITS: 'view:ohVisits',
  CREATE_OH_VISIT: 'create:ohVisit',
  UPDATE_OH_VISIT: 'update:ohVisit',

  // Needle Stick Injuries
  VIEW_NEEDLE_STICK: 'view:needleStick',
  CREATE_NEEDLE_STICK: 'create:needleStick',
  UPDATE_NEEDLE_STICK: 'update:needleStick',
  CLOSE_NEEDLE_STICK: 'close:needleStick',

  // Medical Committee
  VIEW_COMMITTEE: 'view:committee',
  CREATE_REFERRAL: 'create:referral',
  UPDATE_COMMITTEE_DECISION: 'update:committeeDecision',
  APPROVE_COMMITTEE_DECISION: 'approve:committeeDecision',
  UPLOAD_COMMITTEE_ATTACHMENT: 'upload:committeeAttachment',

  // Campaigns
  VIEW_CAMPAIGNS: 'view:campaigns',
  CREATE_CAMPAIGN: 'create:campaign',
  UPDATE_CAMPAIGN: 'update:campaign',

  // Reports
  VIEW_REPORTS: 'view:reports',
  VIEW_REPORTS_OWN_CENTER: 'view:reports:ownCenter',
  CREATE_REPORT: 'create:report',
  EXPORT_REPORTS: 'export:reports',
  EXPORT_REPORTS_OWN_CENTER: 'export:reports:ownCenter',

  // Data Quality
  VIEW_DATA_QUALITY: 'view:dataQuality',
  UPDATE_DATA_QUALITY: 'update:dataQuality',

  // System Administration
  MANAGE_USERS: 'manage:users',
  MANAGE_ROLES: 'manage:roles',
  MANAGE_SETTINGS: 'manage:settings',
  MANAGE_HEALTH_CENTERS: 'manage:healthCenters',
  MANAGE_LOOKUP_TABLES: 'manage:lookupTables',
  VIEW_AUDIT_LOGS: 'view:auditLogs',
  MANAGE_BACKUPS: 'manage:backups',
  RESET_PASSWORDS: 'reset:passwords',

  // Technical Support
  VIEW_USER_TECHNICAL: 'view:userTechnical',
  MANAGE_TECH_TICKETS: 'manage:techTickets',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// ─── All 16 roles ─────────────────────────────────────────────────────────────
export type UserRole =
  | 'systemAdmin'
  | 'ohManager'
  | 'ohDoctor'
  | 'clinicDoctor'
  | 'labOfficer'
  | 'vaccinationOfficer'
  | 'needleStickOfficer'
  | 'medicalCommitteeOfficer'
  | 'campaignOfficer'
  | 'centerManager'
  | 'executive'
  | 'employee'
  | 'dataEntry'
  | 'dataQuality'
  | 'reportsOfficer'
  | 'techSupport';

export interface RoleDefinition {
  id: UserRole;
  nameAr: string;
  nameEn: string;
  color: string;         // MUI color token
  bgColor: string;       // hex background for badge
  permissions: Permission[];
}

const ALL_PERMISSIONS = Object.values(PERMISSIONS) as Permission[];

export const ROLE_DEFINITIONS: Record<UserRole, RoleDefinition> = {
  systemAdmin: {
    id: 'systemAdmin',
    nameAr: 'مدير النظام',
    nameEn: 'System Admin',
    color: '#fff',
    bgColor: '#212121',
    permissions: ALL_PERMISSIONS,
  },
  ohManager: {
    id: 'ohManager',
    nameAr: 'مدير الصحة المهنية',
    nameEn: 'OH Manager',
    color: '#fff',
    bgColor: '#4527A0',
    permissions: [
      PERMISSIONS.VIEW_DASHBOARD, PERMISSIONS.VIEW_KPI,
      PERMISSIONS.VIEW_EMPLOYEES, PERMISSIONS.VIEW_SENSITIVE_DATA,
      PERMISSIONS.VIEW_LAB_TESTS,
      PERMISSIONS.VIEW_VACCINATIONS,
      PERMISSIONS.VIEW_CLINIC_VISITS,
      PERMISSIONS.VIEW_OH_VISITS,
      PERMISSIONS.VIEW_NEEDLE_STICK, PERMISSIONS.CLOSE_NEEDLE_STICK,
      PERMISSIONS.VIEW_COMMITTEE, PERMISSIONS.CREATE_REFERRAL,
      PERMISSIONS.VIEW_CAMPAIGNS,
      PERMISSIONS.VIEW_REPORTS, PERMISSIONS.CREATE_REPORT, PERMISSIONS.EXPORT_REPORTS,
      PERMISSIONS.VIEW_AUDIT_LOGS,
    ],
  },
  ohDoctor: {
    id: 'ohDoctor',
    nameAr: 'طبيب الصحة المهنية',
    nameEn: 'OH Doctor',
    color: '#fff',
    bgColor: '#1565C0',
    permissions: [
      PERMISSIONS.VIEW_DASHBOARD,
      PERMISSIONS.VIEW_EMPLOYEES, PERMISSIONS.VIEW_SENSITIVE_DATA,
      PERMISSIONS.VIEW_LAB_TESTS, PERMISSIONS.CREATE_LAB_REQUEST,
      PERMISSIONS.VIEW_VACCINATIONS, PERMISSIONS.CREATE_VACCINATION,
      PERMISSIONS.VIEW_OH_VISITS, PERMISSIONS.CREATE_OH_VISIT, PERMISSIONS.UPDATE_OH_VISIT,
      PERMISSIONS.VIEW_NEEDLE_STICK, PERMISSIONS.CREATE_NEEDLE_STICK, PERMISSIONS.UPDATE_NEEDLE_STICK,
      PERMISSIONS.VIEW_COMMITTEE, PERMISSIONS.CREATE_REFERRAL,
      PERMISSIONS.VIEW_REPORTS,
    ],
  },
  clinicDoctor: {
    id: 'clinicDoctor',
    nameAr: 'طبيب عيادة الموظفين',
    nameEn: 'Clinic Doctor',
    color: '#fff',
    bgColor: '#0277BD',
    permissions: [
      PERMISSIONS.VIEW_DASHBOARD,
      PERMISSIONS.VIEW_EMPLOYEES,
      PERMISSIONS.VIEW_CLINIC_VISITS, PERMISSIONS.CREATE_CLINIC_VISIT, PERMISSIONS.UPDATE_CLINIC_VISIT,
      PERMISSIONS.CREATE_LAB_REQUEST,
      PERMISSIONS.CREATE_REFERRAL,
    ],
  },
  labOfficer: {
    id: 'labOfficer',
    nameAr: 'مسؤول المختبر',
    nameEn: 'Lab Officer',
    color: '#fff',
    bgColor: '#00695C',
    permissions: [
      PERMISSIONS.VIEW_DASHBOARD,
      PERMISSIONS.VIEW_EMPLOYEES,
      PERMISSIONS.VIEW_LAB_TESTS, PERMISSIONS.UPDATE_LAB_RESULT,
      PERMISSIONS.APPROVE_LAB_RESULT, PERMISSIONS.UPLOAD_LAB_ATTACHMENT,
      PERMISSIONS.EXPORT_REPORTS_OWN_CENTER,
    ],
  },
  vaccinationOfficer: {
    id: 'vaccinationOfficer',
    nameAr: 'مسؤول التطعيمات',
    nameEn: 'Vaccination Officer',
    color: '#fff',
    bgColor: '#2E7D32',
    permissions: [
      PERMISSIONS.VIEW_DASHBOARD,
      PERMISSIONS.VIEW_EMPLOYEES,
      PERMISSIONS.VIEW_VACCINATIONS, PERMISSIONS.CREATE_VACCINATION, PERMISSIONS.UPDATE_VACCINATION,
      PERMISSIONS.VIEW_REPORTS, PERMISSIONS.EXPORT_REPORTS_OWN_CENTER,
    ],
  },
  needleStickOfficer: {
    id: 'needleStickOfficer',
    nameAr: 'مسؤول إصابات الوخز بالإبر',
    nameEn: 'Needle Stick Officer',
    color: '#fff',
    bgColor: '#BF360C',
    permissions: [
      PERMISSIONS.VIEW_DASHBOARD,
      PERMISSIONS.VIEW_EMPLOYEES,
      PERMISSIONS.VIEW_NEEDLE_STICK, PERMISSIONS.CREATE_NEEDLE_STICK,
      PERMISSIONS.UPDATE_NEEDLE_STICK, PERMISSIONS.CLOSE_NEEDLE_STICK,
      PERMISSIONS.EXPORT_REPORTS_OWN_CENTER,
    ],
  },
  medicalCommitteeOfficer: {
    id: 'medicalCommitteeOfficer',
    nameAr: 'مسؤول الهيئة الطبية',
    nameEn: 'Medical Committee Officer',
    color: '#fff',
    bgColor: '#4A148C',
    permissions: [
      PERMISSIONS.VIEW_DASHBOARD,
      PERMISSIONS.VIEW_EMPLOYEES,
      PERMISSIONS.VIEW_COMMITTEE, PERMISSIONS.CREATE_REFERRAL,
      PERMISSIONS.UPDATE_COMMITTEE_DECISION, PERMISSIONS.APPROVE_COMMITTEE_DECISION,
      PERMISSIONS.UPLOAD_COMMITTEE_ATTACHMENT,
      PERMISSIONS.EXPORT_REPORTS_OWN_CENTER,
    ],
  },
  campaignOfficer: {
    id: 'campaignOfficer',
    nameAr: 'مسؤول الحملات الصحية',
    nameEn: 'Campaign Officer',
    color: '#fff',
    bgColor: '#E65100',
    permissions: [
      PERMISSIONS.VIEW_DASHBOARD,
      PERMISSIONS.VIEW_EMPLOYEES,
      PERMISSIONS.VIEW_CAMPAIGNS, PERMISSIONS.CREATE_CAMPAIGN, PERMISSIONS.UPDATE_CAMPAIGN,
      PERMISSIONS.VIEW_VACCINATIONS, PERMISSIONS.CREATE_VACCINATION,
      PERMISSIONS.VIEW_REPORTS, PERMISSIONS.EXPORT_REPORTS_OWN_CENTER,
    ],
  },
  centerManager: {
    id: 'centerManager',
    nameAr: 'مدير المركز الصحي',
    nameEn: 'Center Manager',
    color: '#fff',
    bgColor: '#37474F',
    permissions: [
      PERMISSIONS.VIEW_DASHBOARD, PERMISSIONS.VIEW_KPI,
      PERMISSIONS.VIEW_EMPLOYEES_OWN_CENTER,
      PERMISSIONS.VIEW_LAB_TESTS,
      PERMISSIONS.VIEW_VACCINATIONS,
      PERMISSIONS.VIEW_REPORTS_OWN_CENTER, PERMISSIONS.EXPORT_REPORTS_OWN_CENTER,
    ],
  },
  executive: {
    id: 'executive',
    nameAr: 'الإدارة العليا',
    nameEn: 'Executive',
    color: '#fff',
    bgColor: '#6A1B9A',
    permissions: [
      PERMISSIONS.VIEW_DASHBOARD, PERMISSIONS.VIEW_KPI,
      PERMISSIONS.VIEW_REPORTS, PERMISSIONS.EXPORT_REPORTS,
    ],
  },
  employee: {
    id: 'employee',
    nameAr: 'موظف / مستفيد',
    nameEn: 'Employee',
    color: '#333',
    bgColor: '#ECEFF1',
    permissions: [
      PERMISSIONS.VIEW_OWN_PROFILE,
      PERMISSIONS.UPDATE_EMPLOYEE_BASIC,
    ],
  },
  dataEntry: {
    id: 'dataEntry',
    nameAr: 'مدخل بيانات',
    nameEn: 'Data Entry',
    color: '#fff',
    bgColor: '#558B2F',
    permissions: [
      PERMISSIONS.VIEW_EMPLOYEES,
      PERMISSIONS.CREATE_EMPLOYEE, PERMISSIONS.UPDATE_EMPLOYEE_BASIC,
      PERMISSIONS.UPLOAD_LAB_ATTACHMENT, PERMISSIONS.UPLOAD_COMMITTEE_ATTACHMENT,
    ],
  },
  dataQuality: {
    id: 'dataQuality',
    nameAr: 'مدقق جودة البيانات',
    nameEn: 'Data Quality Officer',
    color: '#fff',
    bgColor: '#00838F',
    permissions: [
      PERMISSIONS.VIEW_EMPLOYEES,
      PERMISSIONS.VIEW_DATA_QUALITY, PERMISSIONS.UPDATE_DATA_QUALITY,
      PERMISSIONS.VIEW_REPORTS,
    ],
  },
  reportsOfficer: {
    id: 'reportsOfficer',
    nameAr: 'مسؤول التقارير',
    nameEn: 'Reports Officer',
    color: '#fff',
    bgColor: '#1565C0',
    permissions: [
      PERMISSIONS.VIEW_DASHBOARD, PERMISSIONS.VIEW_KPI,
      PERMISSIONS.VIEW_EMPLOYEES,
      PERMISSIONS.VIEW_LAB_TESTS,
      PERMISSIONS.VIEW_VACCINATIONS,
      PERMISSIONS.VIEW_REPORTS, PERMISSIONS.CREATE_REPORT, PERMISSIONS.EXPORT_REPORTS,
    ],
  },
  techSupport: {
    id: 'techSupport',
    nameAr: 'مسؤول الدعم الفني',
    nameEn: 'Technical Support',
    color: '#fff',
    bgColor: '#546E7A',
    permissions: [
      PERMISSIONS.VIEW_USER_TECHNICAL,
      PERMISSIONS.RESET_PASSWORDS,
      PERMISSIONS.MANAGE_TECH_TICKETS,
    ],
  },
};

// ─── Helper ───────────────────────────────────────────────────────────────────
export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_DEFINITIONS[role]?.permissions.includes(permission) ?? false;
}

export function getRoleDefinition(role: UserRole): RoleDefinition {
  return ROLE_DEFINITIONS[role];
}

/** Nav visibility guard */
export const NAV_PERMISSIONS: Record<string, Permission> = {
  dashboard:    PERMISSIONS.VIEW_DASHBOARD,
  employees:    PERMISSIONS.VIEW_EMPLOYEES,
  'lab-tests':  PERMISSIONS.VIEW_LAB_TESTS,
  vaccinations: PERMISSIONS.VIEW_VACCINATIONS,
  'clinic-visits': PERMISSIONS.VIEW_CLINIC_VISITS,
  'occupational-health': PERMISSIONS.VIEW_OH_VISITS,
  'needle-stick-injuries': PERMISSIONS.VIEW_NEEDLE_STICK,
  'medical-committee': PERMISSIONS.VIEW_COMMITTEE,
  campaigns:    PERMISSIONS.VIEW_CAMPAIGNS,
  reports:      PERMISSIONS.VIEW_REPORTS,
  settings:     PERMISSIONS.MANAGE_USERS,
  'data-quality': PERMISSIONS.VIEW_DATA_QUALITY,
};
