import { createContext, useContext, useState, ReactNode } from 'react';
import { type UserRole, type Permission, hasPermission } from '../data/roles';

export type { UserRole };

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  healthCenterId?: string;
  avatar?: string;
  isActive: boolean;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Mock users covering all 16 roles
const MOCK_USERS: Record<string, { password: string; user: User }> = {
  'admin@health.gov':       { password: 'admin123',     user: { id: '1',  name: 'أحمد المنصور',      email: 'admin@health.gov',       role: 'systemAdmin',              isActive: true } },
  'manager@health.gov':     { password: 'manager123',   user: { id: '2',  name: 'خالد إبراهيم',       email: 'manager@health.gov',     role: 'ohManager',                isActive: true } },
  'ohdoctor@health.gov':    { password: 'doctor123',    user: { id: '3',  name: 'د. سارة محمد',       email: 'ohdoctor@health.gov',    role: 'ohDoctor',                 isActive: true } },
  'clinicdoc@health.gov':   { password: 'clinic123',    user: { id: '4',  name: 'د. عمر الزهراني',    email: 'clinicdoc@health.gov',   role: 'clinicDoctor',             isActive: true } },
  'lab@health.gov':         { password: 'lab123',       user: { id: '5',  name: 'فاطمة علي',          email: 'lab@health.gov',         role: 'labOfficer',               isActive: true } },
  'vaccine@health.gov':     { password: 'vaccine123',   user: { id: '6',  name: 'عمر حسن',            email: 'vaccine@health.gov',     role: 'vaccinationOfficer',       isActive: true } },
  'needle@health.gov':      { password: 'needle123',    user: { id: '7',  name: 'نورة العتيبي',       email: 'needle@health.gov',      role: 'needleStickOfficer',       isActive: true } },
  'committee@health.gov':   { password: 'comm123',      user: { id: '8',  name: 'عبدالله القحطاني',   email: 'committee@health.gov',   role: 'medicalCommitteeOfficer',  isActive: true } },
  'campaign@health.gov':    { password: 'camp123',      user: { id: '9',  name: 'ريم الشمري',         email: 'campaign@health.gov',    role: 'campaignOfficer',          isActive: true } },
  'center@health.gov':      { password: 'center123',    user: { id: '10', name: 'سلطان المطيري',      email: 'center@health.gov',      role: 'centerManager',            healthCenterId: 'center-1', isActive: true } },
  'executive@health.gov':   { password: 'exec123',      user: { id: '11', name: 'الأمير فيصل',        email: 'executive@health.gov',   role: 'executive',                isActive: true } },
  'employee@health.gov':    { password: 'emp123',       user: { id: '12', name: 'ليلى أحمد',          email: 'employee@health.gov',    role: 'employee',                 isActive: true } },
  'dataentry@health.gov':   { password: 'entry123',     user: { id: '13', name: 'هند السيف',          email: 'dataentry@health.gov',   role: 'dataEntry',                isActive: true } },
  'quality@health.gov':     { password: 'quality123',   user: { id: '14', name: 'بدر الرشيدي',        email: 'quality@health.gov',     role: 'dataQuality',              isActive: true } },
  'reports@health.gov':     { password: 'reports123',   user: { id: '15', name: 'مريم البلوي',        email: 'reports@health.gov',     role: 'reportsOfficer',           isActive: true } },
  'support@health.gov':     { password: 'support123',   user: { id: '16', name: 'وليد الحربي',        email: 'support@health.gov',     role: 'techSupport',              isActive: true } },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const login = async (email: string, password: string) => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const record = MOCK_USERS[email.toLowerCase()];
    if (record && record.password === password) {
      if (!record.user.isActive) throw new Error('Account is disabled');
      setUser(record.user);
    } else {
      throw new Error('Invalid credentials');
    }
  };

  const logout = () => setUser(null);

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

// Export mock users list for the Users Management page (admin view)
export const MOCK_USERS_LIST: User[] = Object.values(MOCK_USERS).map(r => r.user);
