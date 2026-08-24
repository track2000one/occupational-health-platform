import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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

const PRODUCTION_API_BASE_URL = 'https://occupational-health-platform-production.up.railway.app/api';
const LOCAL_API_BASE_URL = 'http://localhost:8000/api';
const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? LOCAL_API_BASE_URL
    : PRODUCTION_API_BASE_URL)
).replace(/\/$/, '');

const ACCESS_TOKEN_KEY = 'ohp_access_token';
const REFRESH_TOKEN_KEY = 'ohp_refresh_token';
const USER_KEY = 'ohp_current_user';
const SESSION_EXPIRED_EVENT = 'ohp:session-expired';

let refreshInFlight: Promise<string> | null = null;

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
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

function expireSession() {
  clearSession();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

async function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refresh = getRefreshToken();
    if (!refresh) {
      expireSession();
      throw new Error('انتهت جلسة الدخول. سجّل الدخول مرة أخرى.');
    }
    const response = await fetch(`${API_BASE_URL}/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.access) {
      expireSession();
      throw new Error('انتهت جلسة الدخول. سجّل الدخول مرة أخرى.');
    }
    localStorage.setItem(ACCESS_TOKEN_KEY, body.access);
    if (body.refresh) localStorage.setItem(REFRESH_TOKEN_KEY, body.refresh);
    return String(body.access);
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

function withBearerToken(options: RequestInit, accessToken: string) {
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${accessToken}`);
  return { ...options, headers };
}

export async function authFetch(input: RequestInfo | URL, options: RequestInit = {}) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    expireSession();
    throw new Error('انتهت جلسة الدخول. سجّل الدخول مرة أخرى.');
  }

  let response = await fetch(input, withBearerToken(options, accessToken));
  if (response.status !== 401) return response;

  const renewedAccessToken = await refreshAccessToken();
  response = await fetch(input, withBearerToken(options, renewedAccessToken));
  if (response.status === 401) {
    expireSession();
    throw new Error('تعذر تجديد جلسة الدخول. سجّل الدخول مرة أخرى.');
  }
  return response;
}

function readStoredUser(): User | null {
  try {
    if (!getAccessToken() || !getRefreshToken()) {
      clearSession();
      return null;
    }
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => readStoredUser());

  useEffect(() => {
    const handleSessionExpired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);

  const login = async (email: string, password: string) => {
    const identifier = email.trim().toLowerCase();
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

export const MOCK_USERS_LIST: User[] = [];
