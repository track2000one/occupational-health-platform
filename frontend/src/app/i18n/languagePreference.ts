/**
 * Arabic is the default on the first visit.
 * A user can explicitly select English, and that preference survives reloads.
 * This helper is intentionally independent of React/i18next for unit testing.
 */
export type AppLanguage = 'ar' | 'en';
export const LANGUAGE_STORAGE_KEY = 'ohp_preferred_language';

export function resolveAppLanguage(value: unknown): AppLanguage {
  return value === 'en' ? 'en' : 'ar';
}

export function getInitialAppLanguage(): AppLanguage {
  try {
    return resolveAppLanguage(
      typeof window === 'undefined' ? null : window.localStorage.getItem(LANGUAGE_STORAGE_KEY),
    );
  } catch {
    // Private browsing or a blocked storage API must not prevent startup.
    return 'ar';
  }
}

export function applyDocumentLanguage(language: AppLanguage): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
}

export function rememberAppLanguage(language: AppLanguage): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    }
  } catch {
    // Language switching remains functional even without storage permission.
  }
  applyDocumentLanguage(language);
}
