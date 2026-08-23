import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type DateCalendar = 'gregorian' | 'hijri';

type DatePreferenceContextValue = {
  calendar: DateCalendar;
  setCalendar: (calendar: DateCalendar) => void;
  formatDate: (value?: string | Date | null, options?: Intl.DateTimeFormatOptions) => string;
  formatDateTime: (value?: string | Date | null, options?: Intl.DateTimeFormatOptions) => string;
};

const STORAGE_KEY = 'ohp_date_calendar';
const DatePreferenceContext = createContext<DatePreferenceContextValue | undefined>(undefined);

function safeDate(value?: string | Date | null) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const normalized = String(value).trim();
  if (!normalized || normalized === '-' || normalized === '—') return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? new Date(`${normalized}T00:00:00`)
    : new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getStoredCalendar(): DateCalendar {
  if (typeof window === 'undefined') return 'gregorian';
  return window.localStorage.getItem(STORAGE_KEY) === 'hijri' ? 'hijri' : 'gregorian';
}

function getLocale(calendar: DateCalendar) {
  return calendar === 'hijri' ? 'ar-SA-u-ca-islamic-umalqura' : 'en-GB';
}

export function DatePreferenceProvider({ children }: { children: React.ReactNode }) {
  const [calendar, setCalendarState] = useState<DateCalendar>(() => getStoredCalendar());

  const setCalendar = useCallback((nextCalendar: DateCalendar) => {
    setCalendarState(nextCalendar);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, nextCalendar);
    }
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.dateCalendar = calendar;
    }
  }, [calendar]);

  const formatDate = useCallback((value?: string | Date | null, options?: Intl.DateTimeFormatOptions) => {
    const date = safeDate(value);
    if (!date) return '-';
    const fallbackOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...options,
    };
    try {
      return new Intl.DateTimeFormat(getLocale(calendar), fallbackOptions).format(date);
    } catch {
      return new Intl.DateTimeFormat('en-GB', fallbackOptions).format(date);
    }
  }, [calendar]);

  const formatDateTime = useCallback((value?: string | Date | null, options?: Intl.DateTimeFormatOptions) => {
    return formatDate(value, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      ...options,
    });
  }, [formatDate]);

  const value = useMemo(() => ({ calendar, setCalendar, formatDate, formatDateTime }), [calendar, formatDate, formatDateTime, setCalendar]);

  return (
    <DatePreferenceContext.Provider value={value}>
      {children}
    </DatePreferenceContext.Provider>
  );
}

export function useDatePreference() {
  const context = useContext(DatePreferenceContext);
  if (!context) {
    throw new Error('useDatePreference must be used within DatePreferenceProvider');
  }
  return context;
}

export function DateText({ value, withTime = false }: { value?: string | Date | null; withTime?: boolean }) {
  const { formatDate, formatDateTime } = useDatePreference();
  return <>{withTime ? formatDateTime(value) : formatDate(value)}</>;
}
