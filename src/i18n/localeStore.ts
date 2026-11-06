import { useState, useEffect } from 'react';
import {
  AppLocale,
  LOCALE_STORAGE_KEY,
  LOCALE_DICTIONARY,
  LocaleStrings,
  formatLocalizedDate
} from './localeDictionary';

export type { AppLocale, LocaleStrings };
export { LOCALE_DICTIONARY, formatLocalizedDate };

export function getStoredLocale(): AppLocale {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (saved === 'id' || saved === 'en' || saved === 'ja') {
        return saved;
      }
    }
  } catch {
    // Ignore storage read error
  }
  return 'id';
}

let currentLocale: AppLocale = getStoredLocale();
const localeListeners = new Set<(loc: AppLocale) => void>();

export function setAppLocale(next: AppLocale): void {
  currentLocale = next;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = next;
    }
  } catch {
    // Ignore storage write error
  }
  localeListeners.forEach((fn) => fn(next));
}

export function useLocaleStore() {
  const [locale, setLocaleState] = useState<AppLocale>(currentLocale);

  useEffect(() => {
    localeListeners.add(setLocaleState);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = currentLocale;
    }
    return () => {
      localeListeners.delete(setLocaleState);
    };
  }, []);

  return {
    locale,
    t: LOCALE_DICTIONARY[locale],
    setLocale: setAppLocale
  };
}
