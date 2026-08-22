import { createContext, useContext, useState, ReactNode } from 'react';
import { type UserRole, type Permission, hasPermission } from '../data/roles';

export type { UserRole };

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  personType?: 'admin' | 'healthStaff' | 'employee' | 'patient' | 'external';
  healthCenterId?: string;
  healthCenterName?: string;
  nationalId?: string;
  employeeNumber?: string;
  medicalRecordNumber?: string;
  phone?: string;
  department?: string;
  jobTitle?: string;
  specialty?: string;
  licenseNumber?: string;
  avatar?: string;
  isActive: boolean;
  isStaff?: boolean;
  isSuperuser?: boolean;
  lastLogin?: string | null;
  permissions?: string[];
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/$/, '');
const ACCESS_TOKEN_KEY = 'ohp_access_token';
const REFRESH_TOKEN_KEY = 'ohp_refresh_token';
const USER_KEY = 'ohp_current_user';

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function persistSession(user: User, access: string, refresh: string) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(ACCESS_TOKEN_KEY, access);
  localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
}

function clearSession() {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) as User : null;
  } catch {
    return null;
  }
}

async function fetchJson(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || body.email || body.password || 'Request failed');
  }
  return response.json();
}

function normalizeUser(payload: any): User {
  return {
    id: String(payload.id),
    name: payload.name || payload.username || payload.email,
    email: payload.email,
    role: payload.role || 'employee',
    personType: payload.personType || 'employee',
    healthCenterId: payload.healthCenterId || undefined,
    healthCenterName: payload.healthCenterName || undefined,
    nationalId: payload.nationalId || undefined,
    employeeNumber: payload.employeeNumber || undefined,
    medicalRecordNumber: payload.medicalRecordNumber || undefined,
    phone: payload.phone || undefined,
    department: payload.department || undefined,
    jobTitle: payload.jobTitle || undefined,
    specialty: payload.specialty || undefined,
    licenseNumber: payload.licenseNumber || undefined,
    isActive: payload.isActive ?? true,
    isStaff: payload.isStaff,
    isSuperuser: payload.isSuperuser,
    lastLogin: payload.lastLogin,
    permissions: payload.permissions || [],
  };
}

// Mock users remain as an emergency local fallback only. Production user management is now Django/PostgreSQL based.
const MOCK_USERS: Record<string, { password: string; user: User }> = {
  'admin@health.gov':       { password: 'admin123',     user: { id: '1',  name: 'أحمد المنصور',      email: 'admin@health.gov',       role: 'systemAdmin', personType: 'admin', isActive: true, isStaff: true, isSuperuser: true } },
  'manager@health.gov':     { password: 'manager123',   user: { id: '2',  name: 'خالد إبراهيم',       email: 'manager@health.gov',     role: 'ohManager', personType: 'healthStaff', isActive: true, isStaff: true } },
  'ohdoctor@health.gov':    { password: 'doctor123',    user: { id: '3',  name: 'د. سارة محمد',       email: 'ohdoctor@health.gov',    role: 'ohDoctor', personType: 'healthStaff', isActive: true } },
  'clinicdoc@health.gov':   { password: 'clinic123',    user: { id: '4',  name: 'د. عمر الزهراني',    email: 'clinicdoc@health.gov',   role: 'clinicDoctor', personType: 'healthStaff', isActive: true } },
  'lab@health.gov':         { password: 'lab123',       user: { id: '5',  name: 'فاطمة علي',          email: 'lab@health.gov',         role: 'labOfficer', personType: 'healthStaff', isActive: true } },
  'vaccine@health.gov':     { password: 'vaccine123',   user: { id: '6',  name: 'عمر حسن',            email: 'vaccine@health.gov',     role: 'vaccinationOfficer', personType: 'healthStaff', isActive: true } },
  'needle@health.gov':      { password: 'needle123',    user: { id: '7',  name: 'نورة العتيبي',       email: 'needle@health.gov',      role: 'needleStickOfficer', personType: 'healthStaff', isActive: true } },
  'committee@health.gov':   { password: 'comm123',      user: { id: '8',  name: 'عبدالله القحطاني',   email: 'committee@health.gov',   role: 'medicalCommitteeOfficer', personType: 'healthStaff', isActive: true } },
  'campaign@health.gov':    { password: 'camp123',      user: { id: '9',  name: 'ريم الشمري',         email: 'campaign@health.gov',    role: 'campaignOfficer', personType: 'healthStaff', isActive: true } },
  'center@health.gov':      { password: 'center123',    user: { id: '10', name: 'سلطان المطيري',      email: 'center@health.gov',      role: 'centerManager', personType: 'healthStaff', healthCenterId: '1', isActive: true } },
  'executive@health.gov':   { password: 'exec123',      user: { id: '11', name: 'الأمير فيصل',        email: 'executive@health.gov',   role: 'executive', personType: 'admin', isActive: true } },
  'employee@health.gov':    { password: 'emp123',       user: { id: '12', name: 'ليلى أحمد',          email: 'employee@health.gov',    role: 'employee', personType: 'employee', isActive: true } },
  'dataentry@health.gov':   { password: 'entry123',     user: { id: '13', name: 'هند السيف',          email: 'dataentry@health.gov',   role: 'dataEntry', personType: 'employee', isActive: true } },
  'quality@health.gov':     { password: 'quality123',   user: { id: '14', name: 'بدر الرشيدي',        email: 'quality@health.gov',     role: 'dataQuality', personType: 'employee', isActive: true } },
  'reports@health.gov':     { password: 'reports123',   user: { id: '15', name: 'مريم البلوي',        email: 'reports@health.gov',     role: 'reportsOfficer', personType: 'employee', isActive: true } },
  'support@health.gov':     { password: 'support123',   user: { id: '16', name: 'وليد الحربي',        email: 'support@health.gov',     role: 'techSupport', personType: 'admin', isActive: true, isStaff: true } },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => readStoredUser());

  const login = async (email: string, password: string) => {
    const identifier = email.trim().toLowerCase();
    try {
      const tokenData = await fetchJson('/auth/token/', {
        method: 'POST',
        body: JSON.stringify({ username: identifier, password }),
      });
      const me = await fetchJson('/users/me/', {
        headers: { Authorization: `Bearer ${tokenData.access}` },
      });
      const normalized = normalizeUser(me);
      if (!normalized.isActive) throw new Error('Account is disabled');
      persistSession(normalized, tokenData.access, tokenData.refresh);
      setUser(normalized);
      return;
    } catch (backendError) {
      const record = MOCK_USERS[identifier];
      if (record && record.password === password) {
        if (!record.user.isActive) throw new Error('Account is disabled');
        clearSession();
        setUser(record.user);
        return;
      }
      throw backendError instanceof Error ? backendError : new Error('Invalid credentials');
    }
  };

  const logout = () => {
    clearSession();
    setUser(null);
  };

  const can = (permission: Permission): boolean => {
    if (!user) return false;
    return hasPermission(user.role, permission);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}

export const MOCK_USERS_LIST: User[] = Object.values(MOCK_USERS).map(r => r.user);
