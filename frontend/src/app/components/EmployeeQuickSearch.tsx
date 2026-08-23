import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Avatar,
  Box,
  CircularProgress,
  List,
  ListItemButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { getAccessToken } from '../context/AuthContext';

const PRODUCTION_API_BASE_URL = 'https://occupational-health-platform-production.up.railway.app/api';
const LOCAL_API_BASE_URL = 'http://localhost:8000/api';
const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? LOCAL_API_BASE_URL
    : PRODUCTION_API_BASE_URL)
).replace(/\/$/, '');

export type EmployeeSearchOption = {
  id: string | number;
  name: string;
  email?: string | null;
  national_id?: string | null;
  nationalId?: string | null;
  employee_number?: string | null;
  employeeNumber?: string | null;
  mobile?: string | null;
  phone?: string | null;
  job_title?: string | null;
  jobTitle?: string | null;
  health_center?: string | number | null;
  healthCenterId?: string | number | null;
  health_center_name?: string | null;
  healthCenterName?: string | null;
};

type EmployeeQuickSearchProps = {
  value: string;
  onChange: (employeeId: string, employee: EmployeeSearchOption | null) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  helperText?: string;
  placeholder?: string;
  minSearchLength?: number;
};

function getList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object' && Array.isArray((payload as { results?: unknown }).results)) {
    return (payload as { results: T[] }).results;
  }
  return [];
}

function getNationalId(employee: EmployeeSearchOption | null | undefined) {
  return employee?.national_id || employee?.nationalId || '';
}

function getEmployeeNumber(employee: EmployeeSearchOption | null | undefined) {
  return employee?.employee_number || employee?.employeeNumber || '';
}

function getMobile(employee: EmployeeSearchOption | null | undefined) {
  return employee?.mobile || employee?.phone || '';
}

function getJobTitle(employee: EmployeeSearchOption | null | undefined) {
  return employee?.job_title || employee?.jobTitle || '';
}

function getHealthCenterName(employee: EmployeeSearchOption | null | undefined) {
  return employee?.health_center_name || employee?.healthCenterName || '';
}

function maskNationalId(value?: string | null) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '-';
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 2)}****${digits.slice(-4)}`;
}

function normalize(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function employeeSearchText(employee: EmployeeSearchOption) {
  return [
    employee.name,
    employee.email,
    getNationalId(employee),
    getEmployeeNumber(employee),
    getMobile(employee),
    getJobTitle(employee),
    getHealthCenterName(employee),
  ].map(normalize).join(' ');
}

function shouldSearch(query: string, minSearchLength: number) {
  const compact = query.replace(/\s/g, '');
  const digits = query.replace(/\D/g, '');
  return compact.length >= minSearchLength || digits.length >= 4;
}

async function fetchEmployees(query: string): Promise<EmployeeSearchOption[]> {
  const token = getAccessToken();
  if (!token) return [];

  const searchParam = query.trim() ? `?search=${encodeURIComponent(query.trim())}` : '';
  const response = await fetch(`${API_BASE_URL}/employees/${searchParam}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) return [];
  const payload = await response.json();
  return getList<EmployeeSearchOption>(payload).slice(0, 25);
}

export function EmployeeQuickSearch({
  value,
  onChange,
  label = 'بحث الموظف',
  required = false,
  disabled = false,
  helperText = 'ابحث بالاسم، الهوية الوطنية، الرقم الوظيفي، الجوال أو البريد الإلكتروني. يتم حفظ رقم الموظف الداخلي في السجل.',
  placeholder = 'اكتب 3 أحرف أو 4 أرقام على الأقل...',
  minSearchLength = 3,
}: EmployeeQuickSearchProps) {
  const [employees, setEmployees] = useState<EmployeeSearchOption[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeSearchOption | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [errorText, setErrorText] = useState('');
  const latestQueryRef = useRef('');

  useEffect(() => {
    if (!value) {
      setSelectedEmployee(null);
      return;
    }
    const existing = employees.find(employee => String(employee.id) === String(value));
    if (existing) {
      setSelectedEmployee(existing);
      setInputValue(existing.name || '');
    }
  }, [employees, value]);

  useEffect(() => {
    const query = inputValue.trim();

    if (!query || selectedEmployee?.name === query) {
      setOpen(false);
      setErrorText('');
      return;
    }

    if (!shouldSearch(query, minSearchLength)) {
      setEmployees([]);
      setOpen(false);
      setErrorText('');
      return;
    }

    latestQueryRef.current = query;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setErrorText('');
      try {
        const items = await fetchEmployees(query);
        if (latestQueryRef.current !== query) return;
        setEmployees(items);
        setOpen(true);
      } catch {
        if (latestQueryRef.current !== query) return;
        setEmployees([]);
        setOpen(false);
        setErrorText('تعذر البحث عن الموظفين. تحقق من تسجيل الدخول أو اتصال الـ Backend.');
      } finally {
        if (latestQueryRef.current === query) setLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [inputValue, minSearchLength, selectedEmployee?.name]);

  const visibleEmployees = useMemo(() => {
    const query = inputValue.trim().toLowerCase();
    if (!query) return employees;
    const digits = query.replace(/\D/g, '');
    return employees.filter(employee => {
      const text = employeeSearchText(employee);
      return text.includes(query) || (
        digits.length >= 4 &&
        [getNationalId(employee), getEmployeeNumber(employee), getMobile(employee)]
          .some(item => String(item || '').replace(/\D/g, '').includes(digits))
      );
    });
  }, [employees, inputValue]);

  function selectEmployee(employee: EmployeeSearchOption) {
    setSelectedEmployee(employee);
    setInputValue(employee.name || '');
    setOpen(false);
    onChange(String(employee.id), employee);
  }

  function clearSelectedIfTyping(nextValue: string) {
    setInputValue(nextValue);
    if (selectedEmployee && nextValue !== selectedEmployee.name) {
      setSelectedEmployee(null);
      onChange('', null);
    }
  }

  const minHint = shouldSearch(inputValue.trim(), minSearchLength)
    ? 'لا توجد نتائج مطابقة أو لم يتم إدخال موظفين بعد.'
    : 'اكتب 3 أحرف للاسم أو 4 أرقام للهوية/الرقم الوظيفي.';

  return (
    <Box sx={{ position: 'relative', width: '100%' }}>
      <TextField
        fullWidth
        required={required}
        disabled={disabled}
        label={label}
        placeholder={placeholder}
        value={inputValue}
        onChange={event => clearSelectedIfTyping(event.target.value)}
        onFocus={() => {
          if (visibleEmployees.length > 0 && !selectedEmployee) setOpen(true);
        }}
        helperText={errorText || helperText}
        error={Boolean(errorText)}
        InputProps={{
          startAdornment: <SearchIcon fontSize="small" sx={{ mx: 1, color: 'text.secondary' }} />,
          endAdornment: loading ? <CircularProgress color="inherit" size={18} /> : undefined,
        }}
      />

      {open && !disabled && (
        <Paper
          elevation={8}
          sx={{
            position: 'absolute',
            zIndex: 2000,
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            maxHeight: 310,
            overflow: 'auto',
            borderRadius: 2.5,
            border: '1px solid rgba(15, 23, 42, 0.12)',
          }}
        >
          {visibleEmployees.length === 0 ? (
            <Box sx={{ p: 1.5 }}>
              <Typography variant="body2" color="text.secondary">{minHint}</Typography>
            </Box>
          ) : (
            <List dense disablePadding>
              {visibleEmployees.map(employee => (
                <ListItemButton
                  key={employee.id}
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => selectEmployee(employee)}
                  sx={{ direction: 'rtl', alignItems: 'flex-start', gap: 1.25, py: 1 }}
                >
                  <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.main', fontSize: '.85rem' }}>
                    {String(employee.name || getEmployeeNumber(employee) || '?').charAt(0)}
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={800}>{employee.name || '-'}</Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 0.25 }}>
                      <Typography variant="caption" color="text.secondary">الرقم الوظيفي: {getEmployeeNumber(employee) || '-'}</Typography>
                      <Typography variant="caption" color="text.secondary">الهوية: {maskNationalId(getNationalId(employee))}</Typography>
                      <Typography variant="caption" color="text.secondary">الجوال: {getMobile(employee) || '-'}</Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {getHealthCenterName(employee) || '-'}{getJobTitle(employee) ? ` — ${getJobTitle(employee)}` : ''}
                    </Typography>
                  </Box>
                </ListItemButton>
              ))}
            </List>
          )}
        </Paper>
      )}
    </Box>
  );
}
