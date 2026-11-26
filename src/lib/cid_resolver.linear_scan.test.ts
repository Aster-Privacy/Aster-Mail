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

import {
  extract_cid_inline_filenames,
  extract_cid_references,
  strip_cid_brackets,
} from "@/lib/cid_resolver";

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

const OLD_INLINE_NAME =
  /src=["']cid:[^"']+["'][^>]*alt=["']([^"']+)["']|alt=["']([^"']+)["'][^>]*src=["']cid:[^"']+["']/gi;
const OLD_BRACKETS = /^<+|>+$/g;

function old_inline_names(html: string): string[] {
  const filenames = new Set<string>();
  const regex = new RegExp(OLD_INLINE_NAME.source, OLD_INLINE_NAME.flags);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    const name = (match[1] || match[2] || "").toLowerCase().trim();

    if (name) filenames.add(name);
  }

  return Array.from(filenames).sort();
}

function new_inline_names(html: string): string[] {
  return Array.from(extract_cid_inline_filenames(html)).sort();
}

const NAME_ALPHABET = [
  'src="cid:',
  "src='cid:",
  'SRC="CID:',
  'alt="',
  "alt='",
  'ALT="',
  '"',
  "'",
  ">",
  "<img ",
  "a.png",
  "B",
  " ",
  "=",
  "cid:",
];

const NAME_CASES = [
  "",
  '<img src="cid:x" alt="a.png">',
  '<img alt="a.png" src="cid:x">',
  '<img src="cid:x"> alt="a.png"',
  '<img alt="a.png"> src="cid:x"',
  '<img src="cid:x" alt=" ">',
  '<img src="cid:x" alt="A.PNG" src="cid:y" alt="b.png">',
  '<img alt="a" alt="b" src="cid:x">',
  "<img src='cid:x\" alt='a'>",
  '<img src="cid:" alt="a">',
  '<img src="cid:x" alt="a" alt="b">',
];

const BRACKET_CASES = ["", "<", ">", "<>", "<<a>>", "a>b", "<a<b>", ">a<", "<<<", ">>>", " <a> "];

describe("extract_cid_inline_filenames", () => {
  it("matches the old pattern on edge cases", () => {
    for (const value of NAME_CASES) {
      expect(new_inline_names(value), value).toEqual(old_inline_names(value));
    }
  });

  it("matches the old pattern on random input", () => {
    for (const value of random_strings(NAME_ALPHABET, 6000, 10, 41)) {
      expect(new_inline_names(value), JSON.stringify(value)).toEqual(
        old_inline_names(value),
      );
    }
  });

  it("stays linear on unmatched attributes", () => {
    const alts = repeat_to('alt="a" ', ATTACK_SIZE);
    const sources = repeat_to('src="cid:a" ', ATTACK_SIZE);

    expect(elapsed_ms(() => extract_cid_inline_filenames(alts))).toBeLessThan(500);
    expect(elapsed_ms(() => extract_cid_inline_filenames(sources))).toBeLessThan(
      500,
    );
  });
});

describe("strip_cid_brackets", () => {
  it("matches the old pattern", () => {
    const alphabet = ["<", ">", "a", " "];

    for (const value of [...BRACKET_CASES, ...random_strings(alphabet, 4000, 10, 42)]) {
      expect(strip_cid_brackets(value), JSON.stringify(value)).toBe(
        value.replace(OLD_BRACKETS, ""),
      );
    }
  });

  it("stays linear on a long inner run", () => {
    const attack = "a" + ">".repeat(ATTACK_SIZE) + "a";

    expect(elapsed_ms(() => strip_cid_brackets(attack))).toBeLessThan(500);
  });
});

describe("srcset trailing commas", () => {
  it("stays linear on a long comma run inside a candidate", () => {
    const attack = `<img srcset="cid:a${",".repeat(ATTACK_SIZE)}x 1x">`;

    expect(elapsed_ms(() => extract_cid_references(attack))).toBeLessThan(500);
  });
});
