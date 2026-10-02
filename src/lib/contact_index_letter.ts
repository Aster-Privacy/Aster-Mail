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
const LATIN_LETTERS_WITHOUT_DECOMPOSITION: Record<string, string> = {
  Æ: "A",
  Ð: "D",
  Đ: "D",
  Ħ: "H",
  Ł: "L",
  Ø: "O",
  Œ: "O",
  Ŧ: "T",
};

export const CONTACT_INDEX_FALLBACK = "#";

export function contact_index_letter(name: string | null | undefined): string {
  const first = Array.from((name ?? "").trim())[0];

  if (!first || !/\p{L}/u.test(first)) return CONTACT_INDEX_FALLBACK;

  const base = first
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .normalize("NFC");
  const letter = Array.from(base.toUpperCase())[0] ?? first;

  return LATIN_LETTERS_WITHOUT_DECOMPOSITION[letter] ?? letter;
}
