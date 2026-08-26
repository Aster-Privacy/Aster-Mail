//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//

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
import { safe_local_set } from "@/lib/safe_storage";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

import {
  get_translations,
  get_translations_async,
  has_translations,
} from "./translations";
import {
  detect_browser_language,
  is_rtl_language,
  is_valid_language_code,
} from "./languages";

import { app_locale } from "@/utils/date_format";
import { publish_push_strings } from "@/lib/push_strings";
import { sync_tray_labels } from "@/native/tauri_tray";
import { set_display_locale } from "@/utils/date_format";

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

function format_param(value: string | number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return String(value);
  }

  try {
    return new Intl.NumberFormat(app_locale(), {
      maximumFractionDigits: 20,
    }).format(value);
  } catch {
    return String(value);
  }
}

function interpolate(
  text: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return text;

  return Object.entries(params).reduce((result, [key, value]) => {
    const escaped_key = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(
      `\\{\\{\\s*${escaped_key}\\s*\\}\\}|\\{\\s*${escaped_key}\\s*\\}`,
      "g",
    );
    const replacement = format_param(value);

    return result.replace(regex, () => replacement);
  }, text);
}

const plural_rules_cache = new Map<string, Intl.PluralRules>();

function get_plural_rules(language: LanguageCode): Intl.PluralRules | null {
  const cached = plural_rules_cache.get(language);

  if (cached) return cached;

  try {
    const rules = new Intl.PluralRules(language);

    plural_rules_cache.set(language, rules);

    return rules;
  } catch {
    return null;
  }
}

function resolve_plural_key(
  namespace_translations: Record<string, string>,
  translation_key: string,
  language: LanguageCode,
  params?: Record<string, string | number>,
): string {
  const count = params?.count;

  if (typeof count !== "number" || !Number.isFinite(count)) {
    return translation_key;
  }

  const rules = get_plural_rules(language);
  const category = rules ? rules.select(count) : count === 1 ? "one" : "other";
  const candidates = [`${translation_key}_${category}`];

  if (category !== "other") {
    candidates.push(`${translation_key}_other`);
  }

  for (const candidate of candidates) {
    if (namespace_translations[candidate] !== undefined) {
      return candidate;
    }
  }

  return translation_key;
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
  const initial_language = default_language || get_initial_language();
  const [language, set_language_state] =
    useState<LanguageCode>(initial_language);
  const [is_loading, set_is_loading] = useState(initial_language !== "en");
  const [initial_language_pending, set_initial_language_pending] = useState(
    initial_language !== "en",
  );
  const [translations, set_translations] = useState<Translations>(
    get_translations(initial_language),
  );

  useEffect(() => {
    if (language === "en") {
      set_translations(get_translations("en"));
      set_is_loading(false);
      set_initial_language_pending(false);

      return;
    }
    let cancelled = false;

    set_is_loading(true);
    get_translations_async(language)
      .catch(() => get_translations("en"))
      .then((loaded) => {
        if (!cancelled) {
          set_translations(loaded);
          set_is_loading(false);
          set_initial_language_pending(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [language]);

  const is_rtl = useMemo(() => is_rtl_language(language), [language]);

  const set_language = useCallback(
    (code: LanguageCode) => {
      if (!has_translations(code)) {
        code = "en";
      }

      set_language_state(code);
      safe_local_set(STORAGE_KEY, code);

      document.documentElement.lang = code;
      document.documentElement.dir = is_rtl_language(code) ? "rtl" : "ltr";

      on_language_change?.(code);
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

      const entries = namespace_translations as unknown as Record<
        string,
        string
      >;
      const resolved_key = resolve_plural_key(
        entries,
        translation_key,
        language,
        params,
      );
      const value = entries[resolved_key];

      if (value === undefined) {
        return key;
      }

      return interpolate(value, params);
    },
    [language, translations],
  );

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = is_rtl ? "rtl" : "ltr";
    set_display_locale(language);
    void sync_tray_labels();
    void publish_push_strings(translations.common.push_new_message);
  }, [language, is_rtl, translations]);

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
      {initial_language_pending ? null : children}
    </I18nContext.Provider>
  );
}

const FALLBACK_I18N: I18nContextType = {
  language: "en",
  set_language: () => {},
  t: (key: TranslationKey) => key,
  translations: get_translations("en"),
  is_rtl: false,
  is_loading: false,
};

export function use_i18n(): I18nContextType {
  const context = useContext(I18nContext);

  if (!context) {
    if (import.meta.env.DEV) {
      return FALLBACK_I18N;
    }
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
