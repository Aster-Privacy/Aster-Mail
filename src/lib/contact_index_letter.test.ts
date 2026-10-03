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
import { describe, it, expect } from "vitest";

import { contact_index_letter } from "./contact_index_letter";

describe("contact_index_letter", () => {
  it("files accented initials under their base letter in Portuguese", () => {
    expect(contact_index_letter("Álvaro", "pt")).toBe("A");
    expect(contact_index_letter("Ângela", "pt")).toBe("A");
    expect(contact_index_letter("élio", "pt")).toBe("E");
    expect(contact_index_letter("Óscar", "pt")).toBe("O");
    expect(contact_index_letter("Çelik", "pt")).toBe("C");
  });

  it("keeps letters the language sorts separately", () => {
    expect(contact_index_letter("Ñuño", "es")).toBe("Ñ");
    expect(contact_index_letter("Álvaro", "es")).toBe("A");
    expect(contact_index_letter("łukasz", "pl")).toBe("Ł");
    expect(contact_index_letter("Ósemka", "pl")).toBe("Ó");
    expect(contact_index_letter("Şule", "tr")).toBe("Ş");
    expect(contact_index_letter("ilker", "tr")).toBe("İ");
    expect(contact_index_letter("Åsa", "sv")).toBe("Å");
    expect(contact_index_letter("Ödön", "sv")).toBe("Ö");
    expect(contact_index_letter("Øyvind", "da")).toBe("Ø");
    expect(contact_index_letter("Ærin", "da")).toBe("Æ");
  });

  it("folds Latin letters without a canonical decomposition when the language does", () => {
    expect(contact_index_letter("Ærin", "en")).toBe("A");
    expect(contact_index_letter("øyvind", "en")).toBe("O");
    expect(contact_index_letter("Łukasz", "en")).toBe("L");
    expect(contact_index_letter("Đuro", "en")).toBe("D");
    expect(contact_index_letter("Ĳssel", "en")).toBe("I");
    expect(contact_index_letter("ßigrid", "en")).toBe("S");
  });

  it("keeps alphabetic scripts as their own index", () => {
    expect(contact_index_letter("ωmega", "en")).toBe("Ω");
    expect(contact_index_letter("жанна", "en")).toBe("Ж");
  });

  it("files Hangul under its initial consonant", () => {
    expect(contact_index_letter("김민준", "ko")).toBe("ㄱ");
    expect(contact_index_letter("까치", "ko")).toBe("ㄲ");
    expect(contact_index_letter("나무", "ko")).toBe("ㄴ");
    expect(contact_index_letter("힘", "ko")).toBe("ㅎ");
  });

  it("files Han and kana names under #", () => {
    expect(contact_index_letter("山田", "ja")).toBe("#");
    expect(contact_index_letter("さくら", "ja")).toBe("#");
    expect(contact_index_letter("カタカナ", "ja")).toBe("#");
    expect(contact_index_letter("王伟", "zh")).toBe("#");
  });

  it("uses # for names that do not start with a letter", () => {
    expect(contact_index_letter("42 Club")).toBe("#");
    expect(contact_index_letter("😀 Joy")).toBe("#");
    expect(contact_index_letter("@home")).toBe("#");
    expect(contact_index_letter("   ")).toBe("#");
    expect(contact_index_letter("")).toBe("#");
    expect(contact_index_letter(undefined)).toBe("#");
  });

  it("skips invisible leading characters", () => {
    expect(contact_index_letter("  bruno", "en")).toBe("B");
    expect(contact_index_letter("\u200bZoe", "en")).toBe("Z");
    expect(contact_index_letter("\u200fZoe", "en")).toBe("Z");
    expect(contact_index_letter("\u00adZoe", "en")).toBe("Z");
    expect(contact_index_letter("\u0301Zoe", "en")).toBe("Z");
  });

  it("caches per locale", () => {
    expect(contact_index_letter("Ñuño", "es")).toBe("Ñ");
    expect(contact_index_letter("Ñuño", "pt")).toBe("N");
    expect(contact_index_letter("Ñuño", "es")).toBe("Ñ");
  });

  it("groups each letter contiguously in the order the locale sorts names", () => {
    const names = [
      "Adam",
      "Afton",
      "Ærin",
      "Æsa",
      "Álvaro",
      "Åsa",
      "Bo",
      "Çelik",
      "Ilker",
      "İpek",
      "ilker",
      "Łukasz",
      "Lena",
      "Nora",
      "Ñuño",
      "Olga",
      "Øyvind",
      "Ósemka",
      "Ödön",
      "Şule",
      "Sam",
      "ßigrid",
      "Zed",
      "Þora",
      "ωmega",
      "жанна",
      "가나",
      "기린",
      "까치",
      "끝",
      "나무",
      "힘",
    ];

    for (const locale of ["en", "pt", "es", "pl", "tr", "sv", "da", "ko"]) {
      const sorted = [...names].sort((a, b) => a.localeCompare(b, locale));
      const runs: string[] = [];

      for (const name of sorted) {
        const letter = contact_index_letter(name, locale);

        if (runs[runs.length - 1] !== letter) runs.push(letter);
      }

      expect(new Set(runs).size, `${locale}: ${runs.join(" ")}`).toBe(
        runs.length,
      );
    }
  });
});
