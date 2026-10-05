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
import type { LanguageCode, Translations } from "../types";

import { safe_local_get } from "@/lib/safe_storage";

const SUPPORTED_LOCALE_CODES = new Set<LanguageCode>([
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "pt-BR",
  "zh-CN",
  "ja",
  "ko",
  "ar",
  "ru",
  "nl",
  "pl",
  "tr",
  "hi",
]);

const EMPTY_NAMESPACE = new Proxy(
  {},
  { get: (_target, key) => (typeof key === "string" ? "" : undefined) },
);
const EMPTY_TRANSLATIONS = new Proxy(
  {},
  {
    get: (_target, key) =>
      typeof key === "string" ? EMPTY_NAMESPACE : undefined,
  },
) as Translations;

async function load_table(code: LanguageCode): Promise<unknown> {
  switch (code) {
    case "en":
      return (await import("./en")).en;
    case "es":
      return (await import("./es")).es;
    case "fr":
      return (await import("./fr")).fr;
    case "de":
      return (await import("./de")).de;
    case "it":
      return (await import("./it")).it;
    case "pt":
      return (await import("./pt")).pt;
    case "pt-BR":
      return (await import("./pt-BR")).pt_br;
    case "zh-CN":
      return (await import("./zh-CN")).zh_CN;
    case "ja":
      return (await import("./ja")).ja;
    case "ko":
      return (await import("./ko")).ko;
    case "ar":
      return (await import("./ar")).ar;
    case "ru":
      return (await import("./ru")).ru;
    case "nl":
      return (await import("./nl")).nl;
    case "pl":
      return (await import("./pl")).pl;
    case "tr":
      return (await import("./tr")).tr;
    case "hi":
      return (await import("./hi")).hi;
    default:
      return null;
  }
}

const translations_cache: Partial<Record<LanguageCode, Translations>> = {};
const pending_loads = new Map<LanguageCode, Promise<Translations>>();
let latest_loaded: Translations | null = null;

async function load_and_cache(code: LanguageCode): Promise<Translations> {
  const table = (await load_table(code)) as Translations | null;

  if (!table) return get_translations_async("en");

  translations_cache[code] = table;
  latest_loaded = table;

  return table;
}

export function get_translations_async(
  code: LanguageCode,
): Promise<Translations> {
  const cached = translations_cache[code];

  if (cached) return Promise.resolve(cached);

  const pending = pending_loads.get(code);

  if (pending) return pending;

  const load = load_and_cache(code).finally(() => {
    pending_loads.delete(code);
  });

  pending_loads.set(code, load);

  return load;
}

export function get_translations(code: LanguageCode): Translations {
  return (
    translations_cache[code] ??
    translations_cache.en ??
    latest_loaded ??
    EMPTY_TRANSLATIONS
  );
}

export function get_cached_translations(
  code: LanguageCode,
): Translations | undefined {
  return translations_cache[code];
}

export function has_translations(code: LanguageCode): boolean {
  return SUPPORTED_LOCALE_CODES.has(code) || code === "en";
}

const LANGUAGE_STORAGE_KEY = "astermail_language";

export function get_active_language(): LanguageCode {
  if (typeof window === "undefined") return "en";

  const stored = safe_local_get(LANGUAGE_STORAGE_KEY);

  if (stored && has_translations(stored as LanguageCode)) {
    return stored as LanguageCode;
  }

  return "en";
}

export function get_active_translations(): Translations {
  return get_translations(get_active_language());
}
