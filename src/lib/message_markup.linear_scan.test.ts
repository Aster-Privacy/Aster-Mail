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

import { collect_image_tags } from "@/lib/message_markup";

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

const OLD_IMAGE_TAG = /<img\b[^>]*>/gi;

const ALPHABET = ["<img", "<IMG", "<imgx", "<img-", ">", " ", "a", "<", "\n"];

const CASES = ["", "<img>", "<IMG src=a>", "<imgx>", "<img-a>", "<img", "<img<img>", "a<img>b<img c>"];

describe("collect_image_tags", () => {
  it("matches the old pattern", () => {
    for (const value of [...CASES, ...random_strings(ALPHABET, 4000, 12, 71)]) {
      expect(collect_image_tags(value), JSON.stringify(value)).toEqual(
        value.match(OLD_IMAGE_TAG) ?? [],
      );
    }
  });

  it("stays linear on unclosed image tags", () => {
    const attack = repeat_to("<img", ATTACK_SIZE);

    expect(elapsed_ms(() => collect_image_tags(attack))).toBeLessThan(500);
  });
});
