// Empty operational datasets for production readiness.
// Do not keep employee names, national IDs, phone numbers, diagnoses, lab results, vaccinations,
// appointments, committee referrals, injuries, or audit examples in the frontend bundle.
// Official records must be entered through the platform and stored in Django/PostgreSQL.

export interface Employee {
  id: string;
  nationalId: string;
  mohId: string;
  name: string;
  dateOfBirth: string;
  mobile: string;
  gender: 'male' | 'female';
  maritalStatus: 'single' | 'married';
  healthCenterId: string;
  jobTitle: string;
  currentJob: string;
  dateOfStart: string;
  yearsOfExperience: number;
}

export interface LabTest {
  id: string;
  employeeId: string;
  employeeName: string;
  testType: string;
  result?: string;
  status: 'pending' | 'completed' | 'missing';
  requestedBy: string;
  requestedDate: string;
  completedDate?: string;
  notes?: string;
}

export interface Vaccination {
  id: string;
  employeeId: string;
  employeeName: string;
  vaccineType: string;
  doseNumber: 1 | 2 | 3;
  doseDate?: string;
  nextDueDate?: string;
  status: 'notGiven' | 'dose1' | 'dose2' | 'dose3' | 'immune' | 'refused' | 'contraindicated';
  notes?: string;
}

export interface ClinicVisit {
  id: string;
  employeeId: string;
  employeeName: string;
  visitDate: string;
  clinicType: string;
  diagnosis: string;
  actionTaken: string;
  sickLeaveDays?: number;
  followUpDate?: string;
  doctorName: string;
  notes?: string;
}

export interface NeedleStickInjury {
  id: string;
  employeeId: string;
  employeeName: string;
  exposureDate: string;
  workplace: string;
  injuryMethod: string;
  sourceKnown: boolean;
  sourceName?: string;
  sourceNationalId?: string;
  employeeLabResult?: string;
  sourceLabResult?: string;
  actionTaken: string;
  followUpRequired: boolean;
  status: 'new' | 'underReview' | 'followUpRequired' | 'closed';
  notes?: string;
}

export interface MedicalCommitteeReferral {
  id: string;
  employeeId: string;
  employeeName: string;
  transactionNumber: string;
  diagnosis: string;
  recommendation?: string;
  decision?: string;
  decisionDate?: string;
  doctorName: string;
  status: 'draft' | 'submitted' | 'underReview' | 'decisionIssued' | 'closed';
  notes?: string;
}

export interface HealthCenter {
  id: string;
  name: string;
  nameAr: string;
  city: string;
  region: string;
  isActive: boolean;
}

export interface Notification {
  id: string;
  userId: string;
  role?: string;
  title: string;
  titleAr: string;
  message: string;
  messageAr: string;
  type: 'info' | 'warning' | 'success' | 'error';
  module: 'lab' | 'vaccination' | 'appointment' | 'needleStick' | 'committee' | 'system' | 'dataQuality' | 'campaign';
  isRead: boolean;
  createdAt: string;
  link?: string;
}

export interface Appointment {
  id: string;
  employeeId: string;
  employeeName: string;
  appointmentType: 'periodicExam' | 'vaccination' | 'clinicVisit' | 'ohVisit' | 'needleStickFollowUp' | 'labTest';
  appointmentDate: string;
  appointmentTime: string;
  healthCenterId: string;
  assignedTo: string;
  status: 'new' | 'confirmed' | 'completed' | 'cancelled' | 'noShow';
  notes?: string;
  createdAt?: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  action: 'create' | 'update' | 'delete' | 'view' | 'login' | 'logout' | 'export' | 'approve' | 'reject';
  module: string;
  recordId?: string;
  oldValue?: string;
  newValue?: string;
  description: string;
  ipAddress: string;
  createdAt: string;
}

export const mockHealthCenters: HealthCenter[] = [];
export const mockEmployees: Employee[] = [];
export const mockLabTests: LabTest[] = [];
export const mockVaccinations: Vaccination[] = [];
export const mockClinicVisits: ClinicVisit[] = [];
export const mockNeedleStickInjuries: NeedleStickInjury[] = [];
export const mockMedicalCommitteeReferrals: MedicalCommitteeReferral[] = [];
export const mockNotifications: Notification[] = [];
export const mockAppointments: Appointment[] = [];
export const mockAuditLogs: AuditLog[] = [];
