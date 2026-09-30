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

import { fold_search_text, includes_folded } from "@/utils/search_fold";

describe("fold_search_text", () => {
  it("lower-cases and removes Latin accents", () => {
    expect(fold_search_text("Mudança")).toBe("mudanca");
    expect(fold_search_text("TRANSFERÊNCIA")).toBe("transferencia");
    expect(fold_search_text("Ação São João")).toBe("acao sao joao");
    expect(fold_search_text("Crème Brûlée Ñandú")).toBe("creme brulee nandu");
  });

  it("folds decomposed text the same as precomposed text", () => {
    expect(fold_search_text("mudanc\u0327a")).toBe("mudanca");
    expect(fold_search_text("transfere\u0302ncia")).toBe(
      fold_search_text("transferência"),
    );
  });

  it("folds the dotted capital I to a plain i", () => {
    expect(fold_search_text("İstanbul")).toBe("istanbul");
  });

  it("removes Greek and Cyrillic accents too", () => {
    expect(fold_search_text("Αθήνα")).toBe("αθηνα");
    expect(fold_search_text("Ёлка")).toBe("елка");
  });

  it("only lower-cases plain ASCII", () => {
    expect(fold_search_text("Hello World 42")).toBe("hello world 42");
    expect(fold_search_text("")).toBe("");
  });

  it("leaves scripts whose marks change the letter alone", () => {
    expect(fold_search_text("한국어")).toBe("한국어");
    expect(fold_search_text("किताब")).toBe("किताब");
    expect(fold_search_text("ภาษาไทย")).toBe("ภาษาไทย");
  });

  it("keeps Hangul syllables whole, so a syllable does not match inside another", () => {
    expect(fold_search_text("한").includes(fold_search_text("하"))).toBe(false);
  });
});

describe("includes_folded", () => {
  it("matches like folding the text first, without folding it", () => {
    const alphabet = [
      ..."aeiouçãáâàéêíóôõúc n.*(",
      "\u0301",
      "\u0327",
      "\u0303",
      "ё",
      "е",
      "й",
      "и",
      "ά",
      "α",
    ];
    let state = 20260930;
    const next = () => {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0;

      return state;
    };
    let checked = 0;

    for (let n = 0; n < 5000; n++) {
      let text = "";
      let term = "";

      for (let i = 0, l = 1 + (next() % 30); i < l; i++) {
        text += alphabet[next() % alphabet.length];
      }
      for (let i = 0, l = 1 + (next() % 5); i < l; i++) {
        term += alphabet[next() % alphabet.length];
      }

      const folded_term = fold_search_text(term);

      if (!folded_term) continue;
      checked++;
      expect(
        includes_folded(text.toLowerCase(), folded_term),
        `${text} / ${term}`,
      ).toBe(fold_search_text(text).includes(folded_term));
    }

    expect(checked).toBeGreaterThan(4000);
  });

  it("treats pattern characters in the query as plain text", () => {
    const term = fold_search_text("a.*b(c)]\\e$^|+?{2}");

    expect(includes_folded("xa.*b(c)]\\e$^|+?{2}y", term)).toBe(true);
    expect(includes_folded("axxb(c)", fold_search_text("a.*b"))).toBe(false);
    expect(includes_folded("abc", fold_search_text("[a-z]"))).toBe(false);
  });

  it("stays fast on long runs of combining marks", () => {
    const hostile = "a" + "\u0301\u0316".repeat(50_000);
    const started = performance.now();

    expect(fold_search_text(hostile)).toBe("a");
    expect(includes_folded(hostile, "ab")).toBe(false);
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it("still ignores accents in very long text and very long terms", () => {
    const long_text = "x".repeat(20_000) + "mudança";
    const long_term = fold_search_text("mudança ".repeat(40));

    expect(includes_folded(long_text, "mudanca")).toBe(true);
    expect(includes_folded(long_text, "transferencia")).toBe(false);
    expect(includes_folded("mudança ".repeat(40), long_term)).toBe(true);
    expect(includes_folded("mudar ".repeat(80), long_term)).toBe(false);
  });

  it("matches a term of bare marks as typed, without a pattern", () => {
    const marks = "\u0301".repeat(40);
    const hostile = "olá " + "\u0301".repeat(24) + "\u0300".repeat(60);
    const started = performance.now();

    expect(fold_search_text(marks)).toBe("");
    expect(includes_folded(hostile, marks)).toBe(false);
    expect(includes_folded("a" + marks + "b", marks)).toBe(true);
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});
