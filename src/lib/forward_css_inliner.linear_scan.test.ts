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

import { compute_specificity } from "@/lib/forward_css_inliner";

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

function elapsed_ms(run: () => void): number {
  const started = performance.now();

  run();

  return performance.now() - started;
}

function repeat_to(unit: string, size: number): string {
  return unit.repeat(Math.ceil(size / unit.length));
}

const ATTACK_SIZE = 256 * 1024;

function old_compute_specificity(selector: string): number {
  const cleaned = selector
    .replace(/::[a-zA-Z-]+(\([^)]*\))?/g, " ")
    .replace(/:not\(/gi, "(");
  const ids = (cleaned.match(/#[a-zA-Z0-9_-]+/g) || []).length;
  const classes = (
    cleaned.match(/\.[a-zA-Z0-9_-]+|\[[^\]]*\]|:[a-zA-Z-]+(\([^)]*\))?/g) || []
  ).length;
  const stripped = cleaned
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/:[a-zA-Z-]+(\([^)]*\))?/g, " ")
    .replace(/[#.][a-zA-Z0-9_-]+/g, " ");
  const types = (stripped.match(/[a-zA-Z][a-zA-Z0-9_-]*/g) || []).length;

  return ids * 1_000_000 + classes * 1_000 + types;
}

const ALPHABET = [
  "::",
  "::before",
  ":",
  ":hover",
  ":not(",
  ":NOT(",
  "(",
  ")",
  "[",
  "]",
  "[a=b]",
  ".",
  ".x",
  "#",
  "#y",
  "div",
  "a",
  " ",
  ">",
  "-",
  "_",
  "1",
  "*",
];

const CASES = [
  "",
  "div",
  "div.a#b",
  "a:hover",
  "a::before",
  "a::before(x)",
  "p:not(.x)",
  "p:nth-child(2n+1)",
  "[data-x='1']",
  "[a",
  "a]",
  ":not(",
  "::a(b",
  ":a(b",
  "a:b(c)d",
  "a::-webkit-x",
  "-a",
  "a[b]c[d",
];

describe("compute_specificity", () => {
  it("matches the old patterns on edge cases", () => {
    for (const value of CASES) {
      expect(compute_specificity(value), value).toBe(old_compute_specificity(value));
    }
  });

  it("matches the old patterns on random input", () => {
    for (const value of random_strings(ALPHABET, 8000, 10, 51)) {
      expect(compute_specificity(value), JSON.stringify(value)).toBe(
        old_compute_specificity(value),
      );
    }
  });

  it("stays linear on unclosed brackets and calls", () => {
    for (const unit of ["[", ":a(", "::a(", ".a[", ":"]) {
      const attack = repeat_to(unit, ATTACK_SIZE);

      expect(elapsed_ms(() => compute_specificity(attack)), unit).toBeLessThan(500);
    }
  });
});
