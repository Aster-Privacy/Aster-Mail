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

import { replace_markup_tags } from "@/components/layout/desktop_calendar_days";

const OLD_MARKUP_TAG = /<[^>]*>/g;

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

const CASES = [
  "",
  "<",
  ">",
  "<>",
  "<<>>",
  "a<b>c",
  "<a><b>",
  "<a",
  "a>",
  "<a<b>c>",
  "x<\n>y",
  "<<<",
  "<><",
  "<p>Team sync</p><br>Room 4",
];

describe("replace_markup_tags equivalence", () => {
  const inputs = [
    ...CASES,
    ...random_strings(["<", ">", "a", "\n", " "], 20000, 12, 71),
    ...random_strings(["<", ">", "a"], 20000, 8, 72),
  ];

  it("matches the old markup regex for every input", () => {
    for (const input of inputs) {
      expect([input, replace_markup_tags(input, " ")]).toEqual([
        input,
        input.replace(OLD_MARKUP_TAG, " "),
      ]);
    }
  });
});

describe("linear scans on attack input", () => {
  const size = 256 * 1024;

  it("strips markup with many open brackets in linear time", () => {
    const attacks = ["<".repeat(size), "<a".repeat(size / 2), "a".repeat(size)];
    const started = performance.now();

    for (const attack of attacks) {
      expect(replace_markup_tags(attack, " ")).toBe(attack);
    }
    expect(performance.now() - started).toBeLessThan(500);
  });
});
