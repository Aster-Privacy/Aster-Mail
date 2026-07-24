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
import {
  type LanguageCode,
  normalize_language,
  PIVOT_LANGUAGE,
} from "./engine_types";

export function derive_accepted_languages(
  configured: readonly string[],
  ui_locale: string,
  navigator_languages: readonly string[],
): LanguageCode[] {
  const result: LanguageCode[] = [];
  const seen = new Set<LanguageCode>();

  const add = (value: string | null | undefined): void => {
    const code = normalize_language(value);

    if (code && !seen.has(code)) {
      seen.add(code);
      result.push(code);
    }
  };

  for (const value of configured) add(value);

  if (result.length === 0) {
    add(ui_locale);

    for (const value of navigator_languages) add(value);
  }

  if (result.length === 0) add(PIVOT_LANGUAGE);

  return result;
}

export function primary_target(
  accepted: readonly LanguageCode[],
  preferred?: string,
): LanguageCode {
  const preferred_code = normalize_language(preferred);

  if (preferred_code) return preferred_code;

  return accepted[0] ?? PIVOT_LANGUAGE;
}

export function language_display_name(
  language: LanguageCode,
  ui_locale: string,
): string {
  try {
    const names = new Intl.DisplayNames([ui_locale], { type: "language" });

    return names.of(language) ?? language.toUpperCase();
  } catch {
    return language.toUpperCase();
  }
}
