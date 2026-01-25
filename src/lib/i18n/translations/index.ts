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

const translations_map: Partial<Record<LanguageCode, Translations>> = {
  en,
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

export function get_translations(code: LanguageCode): Translations {
  return translations_map[code] || en;
}

export function has_translations(code: LanguageCode): boolean {
  return code in translations_map;
}

export { en, es, fr, de, it, pt, zh_CN, ja, ko, ar, ru, nl, pl, tr };
