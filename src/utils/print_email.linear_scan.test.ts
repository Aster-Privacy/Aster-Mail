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

import { REMOTE_STYLE_URL_PATTERN } from "@/utils/print_email";

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

const OLD_REMOTE_STYLE_URL = /url\(\s*["']?\s*(https?:|\/\/)/i;

const ALPHABET = ["url(", "URL(", " ", "\n", '"', "'", "http:", "HTTPS:", "//", "/", "x", "data:"];

const CASES = [
  "",
  "url(http://a)",
  "url( 'https://a')",
  "url(\" //a\")",
  "url(''http://a)",
  "url(\"\"//a)",
  "url(data:x)",
  "background:URL(  HTTPS://a)",
];

describe("REMOTE_STYLE_URL_PATTERN", () => {
  it("matches like the old pattern", () => {
    for (const value of [...CASES, ...random_strings(ALPHABET, 6000, 8, 121)]) {
      const old_match = OLD_REMOTE_STYLE_URL.exec(value);
      const new_match = REMOTE_STYLE_URL_PATTERN.exec(value);

      expect(new_match?.index, JSON.stringify(value)).toBe(old_match?.index);
      expect(new_match?.[0], JSON.stringify(value)).toBe(old_match?.[0]);
      expect(new_match?.[1], JSON.stringify(value)).toBe(old_match?.[1]);
    }
  });

  it("stays linear on long whitespace runs", () => {
    const spaces = " ".repeat(ATTACK_SIZE);

    for (const value of ["url(" + spaces, "url(" + spaces + '"' + spaces, repeat_to("url( ", ATTACK_SIZE)]) {
      expect(elapsed_ms(() => REMOTE_STYLE_URL_PATTERN.test(value))).toBeLessThan(500);
    }
  });
});
