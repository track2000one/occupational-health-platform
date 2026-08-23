import { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete,
  Avatar,
  Box,
  CircularProgress,
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
  employee_number?: string | null;
  mobile?: string | null;
  job_title?: string | null;
  health_center?: string | number | null;
  health_center_name?: string | null;
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
    employee.national_id,
    employee.employee_number,
    employee.mobile,
    employee.job_title,
    employee.health_center_name,
  ].map(normalize).join(' ');
}

async function fetchEmployees(): Promise<EmployeeSearchOption[]> {
  const token = getAccessToken();
  if (!token) return [];
  const response = await fetch(`${API_BASE_URL}/employees/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return [];
  const payload = await response.json();
  return getList<EmployeeSearchOption>(payload);
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
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchEmployees()
      .then(items => { if (alive) setEmployees(items); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const selected = useMemo(
    () => employees.find(employee => String(employee.id) === String(value)) || null,
    [employees, value]
  );

  const canSearch = inputValue.replace(/\s/g, '').length >= minSearchLength || /\d{4,}/.test(inputValue);

  return (
    <Autocomplete
      fullWidth
      disabled={disabled}
      loading={loading}
      options={employees}
      value={selected}
      inputValue={inputValue}
      onInputChange={(_, nextValue) => setInputValue(nextValue)}
      onChange={(_, employee) => onChange(employee ? String(employee.id) : '', employee)}
      getOptionLabel={option => option.name || String(option.id)}
      isOptionEqualToValue={(option, selectedOption) => String(option.id) === String(selectedOption.id)}
      noOptionsText={canSearch ? 'لا توجد نتائج مطابقة' : 'اكتب الاسم أو الهوية أو الرقم الوظيفي للبحث'}
      filterOptions={(options, state) => {
        const query = state.inputValue.trim().toLowerCase();
        if (!query) return options.slice(0, 10);
        const normalizedDigits = query.replace(/\D/g, '');
        if (query.replace(/\s/g, '').length < minSearchLength && normalizedDigits.length < 4) return [];
        return options
          .filter(employee => {
            const searchText = employeeSearchText(employee);
            return searchText.includes(query) || (
              normalizedDigits.length >= 4 &&
              [employee.national_id, employee.employee_number, employee.mobile]
                .some(value => String(value || '').replace(/\D/g, '').includes(normalizedDigits))
            );
          })
          .slice(0, 25);
      }}
      renderOption={(props, employee) => (
        <Box component="li" {...props} key={employee.id} sx={{ direction: 'rtl', alignItems: 'flex-start !important', gap: 1.25, py: 1 }}>
          <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.main', fontSize: '.85rem' }}>
            {String(employee.name || employee.employee_number || '?').charAt(0)}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" fontWeight={800}>{employee.name}</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 0.25 }}>
              <Typography variant="caption" color="text.secondary">الرقم الوظيفي: {employee.employee_number || '-'}</Typography>
              <Typography variant="caption" color="text.secondary">الهوية: {maskNationalId(employee.national_id)}</Typography>
              <Typography variant="caption" color="text.secondary">الجوال: {employee.mobile || '-'}</Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {employee.health_center_name || '-'}{employee.job_title ? ` — ${employee.job_title}` : ''}
            </Typography>
          </Box>
        </Box>
      )}
      renderInput={params => (
        <TextField
          {...params}
          required={required}
          label={label}
          placeholder={placeholder}
          helperText={helperText}
          InputProps={{
            ...params.InputProps,
            startAdornment: (
              <>
                <SearchIcon fontSize="small" sx={{ mx: 1, color: 'text.secondary' }} />
                {params.InputProps.startAdornment}
              </>
            ),
            endAdornment: (
              <>
                {loading ? <CircularProgress color="inherit" size={18} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
}
