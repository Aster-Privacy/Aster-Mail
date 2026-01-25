import type {
  LanguageCode,
  Translations,
  TranslationKey,
  CommonTranslations,
  SettingsTranslations,
  MailTranslations,
  AuthTranslations,
  ErrorTranslations,
} from "./types";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

import { get_translations, has_translations } from "./translations";
import {
  detect_browser_language,
  is_rtl_language,
  is_valid_language_code,
} from "./languages";

const STORAGE_KEY = "astermail_language";

interface I18nContextType {
  language: LanguageCode;
  set_language: (code: LanguageCode) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  translations: Translations;
  is_rtl: boolean;
  is_loading: boolean;
}

const I18nContext = createContext<I18nContextType | null>(null);

interface I18nProviderProps {
  children: ReactNode;
  default_language?: LanguageCode;
  on_language_change?: (code: LanguageCode) => void;
}

function interpolate(
  text: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return text;

  return Object.entries(params).reduce((result, [key, value]) => {
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");

    return result.replace(regex, String(value));
  }, text);
}

function get_initial_language(): LanguageCode {
  if (typeof window === "undefined") return "en";

  const stored = localStorage.getItem(STORAGE_KEY);

  if (stored && is_valid_language_code(stored)) {
    return stored as LanguageCode;
  }

  return detect_browser_language();
}

export function I18nProvider({
  children,
  default_language,
  on_language_change,
}: I18nProviderProps) {
  const [language, set_language_state] = useState<LanguageCode>(
    default_language || get_initial_language(),
  );
  const [is_loading, set_is_loading] = useState(false);

  const translations = useMemo(() => get_translations(language), [language]);

  const is_rtl = useMemo(() => is_rtl_language(language), [language]);

  const set_language = useCallback(
    (code: LanguageCode) => {
      if (!has_translations(code)) {
        code = "en";
      }

      set_is_loading(true);
      set_language_state(code);
      localStorage.setItem(STORAGE_KEY, code);

      document.documentElement.lang = code;
      document.documentElement.dir = is_rtl_language(code) ? "rtl" : "ltr";

      on_language_change?.(code);

      requestAnimationFrame(() => {
        set_is_loading(false);
      });
    },
    [on_language_change],
  );

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>): string => {
      const parts = key.split(".");

      if (parts.length < 2) {
        return key;
      }

      const namespace = parts[0] as keyof Translations;
      const translation_key = parts.slice(1).join(".");

      const namespace_translations = translations[namespace];

      if (!namespace_translations) {
        return key;
      }

      const value = (
        namespace_translations as unknown as Record<string, string>
      )[translation_key];

      if (value === undefined) {
        return key;
      }

      return interpolate(value, params);
    },
    [translations],
  );

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = is_rtl ? "rtl" : "ltr";
  }, [language, is_rtl]);

  const context_value = useMemo(
    () => ({
      language,
      set_language,
      t,
      translations,
      is_rtl,
      is_loading,
    }),
    [language, set_language, t, translations, is_rtl, is_loading],
  );

  return (
    <I18nContext.Provider value={context_value}>
      {children}
    </I18nContext.Provider>
  );
}

export function use_i18n(): I18nContextType {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("use_i18n must be used within an I18nProvider");
  }

  return context;
}

type TranslationHookReturn<T> = {
  t: T;
  language: LanguageCode;
};

export function use_translation(): TranslationHookReturn<
  (key: TranslationKey, params?: Record<string, string | number>) => string
> & {
  common: CommonTranslations;
  settings: SettingsTranslations;
  mail: MailTranslations;
  auth: AuthTranslations;
  errors: ErrorTranslations;
} {
  const { t, language, translations } = use_i18n();

  return {
    t,
    language,
    common: translations.common,
    settings: translations.settings,
    mail: translations.mail,
    auth: translations.auth,
    errors: translations.errors,
  };
}
