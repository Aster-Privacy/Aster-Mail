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
import { app_locale } from "@/utils/date_format";

export const CONTACT_INDEX_FALLBACK = "#";

const LATIN_LETTERS_WITHOUT_DECOMPOSITION: Record<string, string> = {
  Æ: "AE",
  Ð: "D",
  Đ: "D",
  Ħ: "H",
  Ł: "L",
  Ø: "O",
  Œ: "OE",
  Ŧ: "T",
};

const HANGUL_INITIALS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;
const HANGUL_SYLLABLES_PER_INITIAL = 588;

const INVISIBLE_PREFIX = /^[\s\p{Cf}\p{M}]+/u;
const LETTER = /\p{L}/u;
const UNINDEXED_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

interface LocaleIndex {
  collator: Intl.Collator;
  letters: Map<number, string>;
}

const locale_indexes = new Map<string, LocaleIndex>();

function get_locale_index(locale: string | undefined): LocaleIndex {
  const key = locale ?? "";
  let index = locale_indexes.get(key);

  if (!index) {
    index = {
      collator: new Intl.Collator(locale, { sensitivity: "base" }),
      letters: new Map(),
    };
    locale_indexes.set(key, index);
  }

  return index;
}

function first_code_point(value: string): string {
  return String.fromCodePoint(value.codePointAt(0)!);
}

function letter_for(
  code_point: number,
  locale: string | undefined,
  collator: Intl.Collator,
): string {
  if (code_point >= HANGUL_FIRST && code_point <= HANGUL_LAST) {
    return HANGUL_INITIALS[
      Math.floor((code_point - HANGUL_FIRST) / HANGUL_SYLLABLES_PER_INITIAL)
    ];
  }

  const original = String.fromCodePoint(code_point);

  if (!LETTER.test(original) || UNINDEXED_SCRIPT.test(original)) {
    return CONTACT_INDEX_FALLBACK;
  }

  const upper = original.toLocaleUpperCase(locale);
  const stripped = upper
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .normalize("NFC");
  const folded = LATIN_LETTERS_WITHOUT_DECOMPOSITION[stripped] ?? stripped;

  if (folded && folded !== upper && collator.compare(upper, folded) === 0) {
    return first_code_point(folded);
  }

  return first_code_point(upper);
}

export function contact_index_letter(
  name: string | null | undefined,
  locale: string | undefined = app_locale(),
): string {
  const visible = (name ?? "").replace(INVISIBLE_PREFIX, "");
  const code_point = visible.codePointAt(0);

  if (code_point === undefined) return CONTACT_INDEX_FALLBACK;

  const index = get_locale_index(locale);
  let letter = index.letters.get(code_point);

  if (letter === undefined) {
    letter = letter_for(code_point, locale, index.collator);
    index.letters.set(code_point, letter);
  }

  return letter;
}
