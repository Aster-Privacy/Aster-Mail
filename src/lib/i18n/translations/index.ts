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

import { en } from "./en";

type PartialTranslations = {
  [K in keyof Translations]?: Partial<Translations[K]>;
};

const SUPPORTED_LOCALE_CODES = new Set<LanguageCode>([
  "es", "fr", "de", "it", "pt", "pt-BR", "zh-CN", "ja", "ko", "ar", "ru", "nl", "pl", "tr",
]);

function deep_merge(
  base: Translations,
  override: PartialTranslations,
): Translations {
  const result = {} as Record<string, Record<string, string>>;

  for (const ns of Object.keys(base) as (keyof Translations)[]) {
    result[ns] = {
      ...(base[ns] as unknown as Record<string, string>),
      ...(override[ns] as unknown as Record<string, string> | undefined),
    };
  }

  return result as unknown as Translations;
}

async function load_partial(code: LanguageCode): Promise<PartialTranslations | null> {
  switch (code) {
    case "es": return (await import("./es")).es;
    case "fr": return (await import("./fr")).fr;
    case "de": return (await import("./de")).de;
    case "it": return (await import("./it")).it;
    case "pt":
    case "pt-BR": return (await import("./pt")).pt;
    case "zh-CN": return (await import("./zh-CN")).zh_CN;
    case "ja": return (await import("./ja")).ja;
    case "ko": return (await import("./ko")).ko;
    case "ar": return (await import("./ar")).ar;
    case "ru": return (await import("./ru")).ru;
    case "nl": return (await import("./nl")).nl;
    case "pl": return (await import("./pl")).pl;
    case "tr": return (await import("./tr")).tr;
    default: return null;
  }
}

const translations_cache: Partial<Record<LanguageCode, Translations>> = { en };

export async function get_translations_async(code: LanguageCode): Promise<Translations> {
  if (translations_cache[code]) return translations_cache[code]!;
  if (code === "en") return en;

  const partial = await load_partial(code);

  if (!partial) return en;

  const merged = deep_merge(en, partial);

  translations_cache[code] = merged;

  return merged;
}

export function get_translations(code: LanguageCode): Translations {
  return translations_cache[code] ?? en;
}

export function has_translations(code: LanguageCode): boolean {
  return SUPPORTED_LOCALE_CODES.has(code) || code === "en";
}

const LANGUAGE_STORAGE_KEY = "astermail_language";

export function get_active_translations(): Translations {
  if (typeof window === "undefined") return en;

  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);

  if (stored && has_translations(stored as LanguageCode)) {
    return get_translations(stored as LanguageCode);
  }

  return en;
}

export { en };
