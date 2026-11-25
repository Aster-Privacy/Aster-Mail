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
import { describe, expect, it } from "vitest";

import { find_mbox_separator } from "@/services/import/mbox_parser";

function seeded_random(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function random_strings(
  alphabet: string[],
  count: number,
  max_length: number,
  seed: number,
): string[] {
  const random = seeded_random(seed);
  const out: string[] = [];

  for (let n = 0; n < count; n += 1) {
    const length = Math.floor(random() * (max_length + 1));
    let value = "";

    for (let i = 0; i < length; i += 1) {
      value += alphabet[Math.floor(random() * alphabet.length)];
    }
    out.push(value);
  }

  return out;
}

interface Separator {
  index: number;
  end: number;
}

function old_separators(text: string, from: number): Separator[] {
  const pattern = /^From [^\r\n]+\r?\n(?=[\x21-\x39\x3b-\x7e]+:)/gm;
  const found: Separator[] = [];

  pattern.lastIndex = from;

  let match;

  while ((match = pattern.exec(text)) !== null) {
    found.push({ index: match.index, end: match.index + match[0].length });
    pattern.lastIndex = match.index + match[0].length;
  }

  return found;
}

function new_separators(text: string, from: number): Separator[] {
  const found: Separator[] = [];
  let position = from;
  let match;

  while ((match = find_mbox_separator(text, position)) !== null) {
    found.push(match);
    position = match.end;
  }

  return found;
}

const CASES = [
  "",
  "From ",
  "From a\n",
  "From a\nX:",
  "From \nX:",
  "From a\r\nX:",
  "From a\rX:",
  "From a\r\rX:",
  "From a\nX",
  "From a\n:X",
  "From a\nX y:",
  "From a\nFrom: b\n",
  "x From a\nX:",
  "x\nFrom a\nX:",
  "x\rFrom a\nX:",
  "x From a\nX:",
  "x From a\nX:",
  "From a From b\nX:",
  "From From a\nX:",
  "From sender Mon Jan 1\nSubject: one\n\nbody\nFrom sender Tue\nSubject: two\n",
  "From a\nX:\nFrom b\nY:\n>From c\nZ:",
];

const ALPHABET = [
  "From ",
  "From ",
  "a",
  " ",
  "\n",
  "\r",
  "\r\n",
  " ",
  ":",
  "X",
  "é",
  "\t",
];

describe("find_mbox_separator equivalence", () => {
  const inputs = [
    ...CASES,
    ...random_strings(ALPHABET, 40000, 10, 21),
    ...random_strings(["From ", "\n", "a", ":"], 20000, 8, 22),
  ];

  it("matches the old separator pattern from the start", () => {
    for (const input of inputs) {
      expect([input, new_separators(input, 0)]).toEqual([
        input,
        old_separators(input, 0),
      ]);
    }
  });

  it("matches the old separator pattern from an offset", () => {
    const random = seeded_random(23);

    for (const input of inputs) {
      const from = Math.floor(random() * (input.length + 1));

      expect([input, from, new_separators(input, from)]).toEqual([
        input,
        from,
        old_separators(input, from),
      ]);
    }
  });
});

describe("find_mbox_separator on attack input", () => {
  const size = 256 * 1024;

  function expect_fast(run: () => void): void {
    const started = performance.now();

    run();
    expect(performance.now() - started).toBeLessThan(500);
  }

  it("scans line separator floods in linear time", () => {
    expect_fast(() => {
      expect(find_mbox_separator("From  ".repeat(size / 6), 0)).toBeNull();
      expect(
        find_mbox_separator("From  ".repeat(size / 6) + "\n" + "a".repeat(size), 0),
      ).toBeNull();
    });
  });

  it("scans long header names in linear time", () => {
    expect_fast(() => {
      expect(
        find_mbox_separator("From a\n" + "X".repeat(size), 0),
      ).toBeNull();
      expect(
        find_mbox_separator("From a\n" + "From b\n".repeat(size / 7), 0),
      ).toBeNull();
    });
  });

  it("still finds a separator after a long line", () => {
    expect_fast(() => {
      const text = "From " + "a".repeat(size) + "\nSubject: x";

      expect(find_mbox_separator(text, 0)).toEqual({
        index: 0,
        end: size + 6,
      });
    });
  });
});
