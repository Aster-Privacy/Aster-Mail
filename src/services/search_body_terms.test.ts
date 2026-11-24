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

import {
  build_body_terms,
  build_chunk_postings,
  drop_postings_slots,
  parse_postings,
  postings_prefix_slots,
  sorted_has_prefix,
  split_search_words,
  term_bucket,
  BODY_TERM_BUCKETS,
  MAX_BODY_TERMS_PER_ENTRY,
} from "@/services/search_body_terms";

describe("split_search_words", () => {
  it("folds case and diacritics and drops one-letter words", () => {
    expect(split_search_words("Crème Brûlée à Zürich")).toEqual([
      "creme",
      "brulee",
      "zurich",
    ]);
  });

  it("splits on punctuation and keeps digits", () => {
    expect(split_search_words("invoice#4821, due 2026-11-30")).toEqual([
      "invoice",
      "4821",
      "due",
      "2026",
      "11",
      "30",
    ]);
  });
});

describe("build_body_terms", () => {
  it("returns sorted unique words from the body and file names", () => {
    expect(
      build_body_terms("beta alpha beta", ["Quarterly_Report.pdf"]),
    ).toEqual(["alpha", "beta", "pdf", "quarterly", "report"]);
  });

  it("caps the number of words per message", () => {
    const body = Array.from(
      { length: MAX_BODY_TERMS_PER_ENTRY + 50 },
      (_, i) => `w${i}`,
    ).join(" ");

    expect(build_body_terms(body)).toHaveLength(MAX_BODY_TERMS_PER_ENTRY);
  });
});

describe("sorted_has_prefix", () => {
  it("finds a word that starts with the prefix", () => {
    const sorted = ["apple", "banana", "cherry"];

    expect(sorted_has_prefix(sorted, "ban")).toBe(true);
    expect(sorted_has_prefix(sorted, "cherry")).toBe(true);
    expect(sorted_has_prefix(sorted, "nan")).toBe(false);
    expect(sorted_has_prefix([], "a")).toBe(false);
  });
});

describe("chunk postings", () => {
  const entries = [
    ["alpha", "beta"],
    undefined,
    ["alphabet", "gamma"],
    ["beta"],
  ];

  function slots_for(prefix: string): number[] {
    const stored = build_chunk_postings(entries).get(term_bucket(prefix));

    return [...postings_prefix_slots(parse_postings(stored), prefix)].sort();
  }

  it("keeps every bucket in range", () => {
    for (const word of ["alpha", "zz", "日本", "x"]) {
      const bucket = term_bucket(word);

      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThan(BODY_TERM_BUCKETS);
    }
  });

  it("maps a prefix to the slots of every entry holding a matching word", () => {
    expect(slots_for("alph")).toEqual([0, 2]);
    expect(slots_for("beta")).toEqual([0, 3]);
    expect(slots_for("gam")).toEqual([2]);
    expect(slots_for("delta")).toEqual([]);
  });

  it("drops removed slots and words left with no entries", () => {
    const stored = build_chunk_postings(entries).get(term_bucket("gamma"))!;
    const next = drop_postings_slots(stored, new Set([2]));

    expect(next.t).not.toContain("gamma");
    expect([...postings_prefix_slots(parse_postings(next), "gam")]).toEqual([]);
  });

  it("rejects a malformed record", () => {
    expect(parse_postings(null)).toBeNull();
    expect(parse_postings({ t: ["a"], p: [] })).toBeNull();
  });
});
