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

import { replace_image_sources } from "@/lib/compose_image_sources";

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

const OLD_IMG_SRC = /(<img\b[^>]*?\ssrc=")([^"]*)(")/gi;

function marker(_match: string, prefix: string, src: string, suffix: string): string {
  return `${prefix}[${src}]${suffix}`;
}

const ALPHABET = [
  "<img",
  "<IMG",
  "<imgx",
  "<img-",
  " ",
  "\n",
  "\t",
  "src=",
  'src="',
  'SRC="',
  '"',
  ">",
  "a",
  "x=",
];

const CASES = [
  "",
  '<img src="a">',
  '<IMG SRC="a">',
  '<img alt="x" src="a">',
  '<img src="a" src="b">',
  '<imgx src="a">',
  '<img-x src="a">',
  '<img\nsrc="a">',
  '<img> src="a"',
  '<img src="a',
  '<img src="">',
  '<img  src="a"><img src="b">',
  '<img src="a" <img src="b">',
];

describe("replace_image_sources", () => {
  it("matches the old pattern on edge cases", () => {
    for (const value of CASES) {
      expect(replace_image_sources(value, marker), value).toBe(
        value.replace(OLD_IMG_SRC, marker),
      );
    }
  });

  it("matches the old pattern on random input", () => {
    for (const value of random_strings(ALPHABET, 6000, 12, 61)) {
      expect(replace_image_sources(value, marker), JSON.stringify(value)).toBe(
        value.replace(OLD_IMG_SRC, marker),
      );
    }
  });

  it("stays linear on image tags without a source", () => {
    const tags = repeat_to("<img ", ATTACK_SIZE);
    const sources = repeat_to('<img src="', ATTACK_SIZE);

    expect(elapsed_ms(() => replace_image_sources(tags, marker))).toBeLessThan(500);
    expect(elapsed_ms(() => replace_image_sources(sources, marker))).toBeLessThan(
      500,
    );
  });
});
