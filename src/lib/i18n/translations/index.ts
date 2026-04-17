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
import { es } from "./es";
import { fr } from "./fr";
import { de } from "./de";
import { it } from "./it";
import { pt } from "./pt";
import { zh_CN } from "./zh-CN";
import { ja } from "./ja";
import { ko } from "./ko";
import { ar } from "./ar";
import { ru } from "./ru";
import { nl } from "./nl";
import { pl } from "./pl";
import { tr } from "./tr";

type PartialTranslations = {
  [K in keyof Translations]?: Partial<Translations[K]>;
};

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

const partial_map: Partial<Record<LanguageCode, PartialTranslations>> = {
  es,
  fr,
  de,
  it,
  pt,
  "pt-BR": pt,
  "zh-CN": zh_CN,
  ja,
  ko,
  ar,
  ru,
  nl,
  pl,
  tr,
};

const translations_cache: Partial<Record<LanguageCode, Translations>> = { en };

export function get_translations(code: LanguageCode): Translations {
  if (translations_cache[code]) return translations_cache[code];
  const partial = partial_map[code];

  if (!partial) return en;
  const merged = deep_merge(en, partial);

  translations_cache[code] = merged;

  return merged;
}

export function has_translations(code: LanguageCode): boolean {
  return code in partial_map || code === "en";
}

export { en, es, fr, de, it, pt, zh_CN, ja, ko, ar, ru, nl, pl, tr };
