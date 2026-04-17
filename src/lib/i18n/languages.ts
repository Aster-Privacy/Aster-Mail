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
import type { Language, LanguageCode } from "./types";

const SUPPORTED_LANGUAGES: Language[] = [
  { code: "en", name: "English", native_name: "English", direction: "ltr" },
  { code: "es", name: "Spanish", native_name: "Español", direction: "ltr" },
  { code: "fr", name: "French", native_name: "Français", direction: "ltr" },
  { code: "de", name: "German", native_name: "Deutsch", direction: "ltr" },
  { code: "it", name: "Italian", native_name: "Italiano", direction: "ltr" },
  {
    code: "pt",
    name: "Portuguese",
    native_name: "Português",
    direction: "ltr",
    region: "Portugal",
  },
  {
    code: "pt-BR",
    name: "Portuguese",
    native_name: "Português",
    direction: "ltr",
    region: "Brazil",
  },
  { code: "nl", name: "Dutch", native_name: "Nederlands", direction: "ltr" },
  { code: "pl", name: "Polish", native_name: "Polski", direction: "ltr" },
  { code: "tr", name: "Turkish", native_name: "Türkçe", direction: "ltr" },
  { code: "ru", name: "Russian", native_name: "Русский", direction: "ltr" },
  {
    code: "zh-CN",
    name: "Chinese",
    native_name: "简体中文",
    direction: "ltr",
    region: "Simplified",
  },
  { code: "ja", name: "Japanese", native_name: "日本語", direction: "ltr" },
  { code: "ko", name: "Korean", native_name: "한국어", direction: "ltr" },
  { code: "ar", name: "Arabic", native_name: "العربية", direction: "rtl" },
];

const LANGUAGE_MAP = new Map<LanguageCode, Language>(
  SUPPORTED_LANGUAGES.map((lang) => [lang.code, lang]),
);

export function get_supported_languages(): Language[] {
  return SUPPORTED_LANGUAGES;
}

export function get_language_info(code: LanguageCode): Language | undefined {
  return LANGUAGE_MAP.get(code);
}

export function is_rtl_language(code: LanguageCode): boolean {
  const lang = LANGUAGE_MAP.get(code);

  return lang?.direction === "rtl";
}

export function get_display_name(code: LanguageCode): string {
  const lang = LANGUAGE_MAP.get(code);

  if (!lang) return code;

  return lang.region
    ? `${lang.native_name} (${lang.region})`
    : lang.native_name;
}

export function detect_browser_language(): LanguageCode {
  const browser_lang =
    navigator.language ||
    (navigator as { userLanguage?: string }).userLanguage ||
    "en";
  const primary = browser_lang.split("-")[0].toLowerCase();
  const full = browser_lang.toLowerCase().replace("_", "-");

  if (LANGUAGE_MAP.has(full as LanguageCode)) {
    return full as LanguageCode;
  }

  if (full.startsWith("zh")) {
    return "zh-CN";
  }

  if (full.startsWith("pt")) {
    return full.includes("br") ? "pt-BR" : "pt";
  }

  if (LANGUAGE_MAP.has(primary as LanguageCode)) {
    return primary as LanguageCode;
  }

  return "en";
}

export function is_valid_language_code(code: string): code is LanguageCode {
  return LANGUAGE_MAP.has(code as LanguageCode);
}
