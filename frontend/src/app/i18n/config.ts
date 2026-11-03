import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './locales/en';
import { ar } from './locales/ar';
import { applyDocumentLanguage, getInitialAppLanguage, resolveAppLanguage } from './languagePreference';

const initialLanguage = getInitialAppLanguage();
applyDocumentLanguage(initialLanguage);

i18n.on('languageChanged', language => {
  applyDocumentLanguage(resolveAppLanguage(language));
});

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar }
    },
    lng: initialLanguage,
    fallbackLng: 'ar',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
