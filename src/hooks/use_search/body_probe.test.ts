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
import type { DecryptedIndexEntry } from "./types";
import type { ParsedOperator } from "@/utils/search_operators";

import { describe, it, expect } from "vitest";

import { create_body_probe } from "./body_probe";

import { type GramFilter } from "@/services/search_chunk_filter";

function reader_with(chunks: Map<number, Record<string, string[]>>) {
  return {
    read_body_hits: async (chunk_id: number, words: readonly string[]) => {
      const chunk = chunks.get(chunk_id);

      if (!chunk) return null;

      const hits = new Map<string, Set<string>>();

      for (const word of words) {
        const ids = new Set<string>();

        for (const [term, term_ids] of Object.entries(chunk)) {
          if (term.startsWith(word)) for (const id of term_ids) ids.add(id);
        }

        hits.set(word, ids);
      }

      return hits;
    },
  };
}

const blank_entry = {} as DecryptedIndexEntry;
const empty_header: GramFilter = { bytes: new Uint8Array(64), mask: 511 };

function text_op(value: string, negated: boolean): ParsedOperator {
  return { type: "text", value, raw: value, negated } as ParsedOperator;
}

describe("create_body_probe", () => {
  it("returns no probe for a query without words", () => {
    expect(create_body_probe([], [])).toBeNull();
    expect(create_body_probe(["a"], [])).toBeNull();
  });

  it("matches an entry found in a loaded chunk by word prefix", async () => {
    const probe = create_body_probe(["Quetz"], [])!;
    const reader = reader_with(new Map([[0, { quetzalcoatl: ["m1"] }]]));

    expect(await probe.load_chunk(reader, 0, null)).toBe("scan");
    expect(probe.matches("Quetz", "m1", blank_entry)).toBe(true);
    expect(probe.matches("Quetz", "m2", blank_entry)).toBe(false);
  });

  it("needs every word of a multi-word term in the same message", async () => {
    const probe = create_body_probe(["blue whale"], [])!;
    const reader = reader_with(
      new Map([[0, { blue: ["m1", "m2"], whale: ["m2"] }]]),
    );

    await probe.load_chunk(reader, 0, null);

    expect(probe.matches("blue whale", "m2", blank_entry)).toBe(true);
    expect(probe.matches("blue whale", "m1", blank_entry)).toBe(false);
  });

  it("skips a chunk when neither the body nor the headers hold a term", async () => {
    const probe = create_body_probe(["zebra"], [])!;
    const reader = reader_with(new Map([[0, { apple: ["m1"] }]]));

    expect(await probe.load_chunk(reader, 0, empty_header)).toBe("skip");
  });

  it("scans a chunk when its header digest is unknown", async () => {
    const probe = create_body_probe(["zebra"], [])!;
    const reader = reader_with(new Map([[0, { apple: ["m1"] }]]));

    expect(await probe.load_chunk(reader, 0, null)).toBe("scan");
  });

  it("scans a chunk that has no postings record", async () => {
    const probe = create_body_probe(["zebra"], [])!;

    expect(
      await probe.load_chunk(reader_with(new Map()), 7, empty_header),
    ).toBe("scan");
  });

  it("falls back to the unsaved words kept on the entry", () => {
    const probe = create_body_probe(["kiwi"], [])!;
    const entry = {
      index_terms: ["kiwifruit", "mango"],
    } as DecryptedIndexEntry;

    expect(probe.matches("kiwi", "m9", entry)).toBe(true);
    expect(probe.matches("kiwi", "m9", blank_entry)).toBe(false);
  });

  it("loads negated words without letting them skip a chunk", async () => {
    const probe = create_body_probe(
      [],
      [text_op("orchid", false), text_op("tulip", true)],
    )!;
    const reader = reader_with(
      new Map([[0, { orchid: ["m1"], tulip: ["m1"] }]]),
    );

    expect(probe.words).toEqual(["orchid", "tulip"]);
    expect(await probe.load_chunk(reader, 0, empty_header)).toBe("scan");
    expect(probe.matches("tulip", "m1", blank_entry)).toBe(true);
  });

  it("never skips a chunk for a query made only of negated words", async () => {
    const probe = create_body_probe([], [text_op("tulip", true)])!;
    const reader = reader_with(new Map([[0, { apple: ["m1"] }]]));

    expect(await probe.load_chunk(reader, 0, empty_header)).toBe("scan");
  });
});
