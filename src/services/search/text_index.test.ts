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

import { TextIndex } from "./text_index";

interface Doc {
  header: string;
  body: string;
}

function brute_force(
  docs: Doc[],
  terms: string[],
  include_body: boolean,
): Set<number> {
  const out = new Set<number>();

  for (let i = 0; i < docs.length; i++) {
    const haystack =
      docs[i].header.toLowerCase() +
      (include_body ? "\n" + docs[i].body.toLowerCase() : "");
    const all_match = terms.every((t) => haystack.includes(t.toLowerCase()));

    if (all_match) out.add(i);
  }

  return out;
}

function build(docs: Doc[], budget?: number): TextIndex {
  const idx = new TextIndex(budget);

  for (let i = 0; i < docs.length; i++) {
    idx.add_document(i, {
      header_text: docs[i].header.toLowerCase(),
      body_text: docs[i].body.toLowerCase(),
    });
  }

  return idx;
}

function assert_superset(
  candidates: Set<number> | null,
  truth: Set<number>,
  doc_count: number,
): void {
  const effective =
    candidates ?? new Set(Array.from({ length: doc_count }, (_, i) => i));

  for (const id of truth) {
    expect(effective.has(id)).toBe(true);
  }
}

describe("TextIndex candidate generation", () => {
  const docs: Doc[] = [
    { header: "Invoice from Acme Corp", body: "Your payment of 200 is due" },
    { header: "Weekly newsletter", body: "Read about voice recognition tech" },
    { header: "Meeting notes", body: "We discussed the invoice and budget" },
    { header: "Alice Johnson <alice@example.com>", body: "quarterly report" },
    { header: "noreply@service.io", body: "" },
  ];

  it("returns a superset of true matches for header terms", () => {
    const idx = build(docs);

    for (const term of ["invoice", "acme", "meeting", "alice", "example"]) {
      const truth = brute_force(docs, [term], false);
      const cand = idx.candidates([term], false);

      assert_superset(cand, truth, docs.length);
    }
  });

  it("finds mid-word substring matches (voice inside invoice)", () => {
    const idx = build(docs);
    const truth = brute_force(docs, ["voice"], true);
    const cand = idx.candidates(["voice"], true);

    assert_superset(cand, truth, docs.length);
    expect(truth.has(0)).toBe(true);
    expect(truth.has(1)).toBe(true);
  });

  it("intersects multi-term AND queries as a superset", () => {
    const idx = build(docs);
    const truth = brute_force(docs, ["invoice", "budget"], true);
    const cand = idx.candidates(["invoice", "budget"], true);

    assert_superset(cand, truth, docs.length);
    expect(truth.has(2)).toBe(true);
  });

  it("prunes: a header-only term does not pull unrelated docs", () => {
    const idx = build(docs);
    const cand = idx.candidates(["acme"], false);

    expect(cand).not.toBeNull();
    expect(cand!.size).toBeLessThan(docs.length);
  });

  it("falls back to full scan (null) when body budget is exceeded", () => {
    const big: Doc[] = Array.from({ length: 50 }, (_, i) => ({
      header: `subject ${i}`,
      body: "lorem ipsum dolor sit amet ".repeat(200),
    }));
    const idx = build(big, 100);

    expect(idx.body_indexed).toBe(false);
    expect(idx.candidates(["lorem"], true)).toBeNull();
    expect(idx.candidates(["subject"], false)).not.toBeNull();
  });

  it("treats short (<3 char) terms as unconstrained but still correct", () => {
    const idx = build(docs);
    const truth = brute_force(docs, ["of"], false);
    const cand = idx.candidates(["of"], false);

    assert_superset(cand, truth, docs.length);
  });

  it("randomized fuzz: never drops a real match", () => {
    const alphabet = "abcde ";
    const rand_docs: Doc[] = [];
    let seed = 12345;
    const next = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;

      return seed / 0x7fffffff;
    };
    const rand_str = (n: number) => {
      let s = "";

      for (let i = 0; i < n; i++) {
        s += alphabet[Math.floor(next() * alphabet.length)];
      }

      return s;
    };

    for (let i = 0; i < 200; i++) {
      rand_docs.push({ header: rand_str(20), body: rand_str(40) });
    }
    const idx = build(rand_docs);

    for (let q = 0; q < 300; q++) {
      const term = rand_str(3 + Math.floor(next() * 3)).trim();

      if (term.length < 2) continue;
      const include_body = next() > 0.5;
      const truth = brute_force(rand_docs, [term], include_body);
      const cand = idx.candidates([term], include_body);

      assert_superset(cand, truth, rand_docs.length);
    }
  });
});
