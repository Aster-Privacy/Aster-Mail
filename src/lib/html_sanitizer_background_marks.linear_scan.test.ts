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

import { has_background_image_declaration } from "@/lib/html_sanitizer_background_marks";

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

function time_ms(run: () => void): number {
  const started = performance.now();

  run();

  return performance.now() - started;
}

const ATTACK_SIZE = 200_000;

function repeat_to(unit: string, size: number = ATTACK_SIZE): string {
  return unit.repeat(Math.ceil(size / unit.length));
}

const WHITESPACE = [" ", "\t", "\n", "\r", "\u00a0", "\u2028", "\ufeff"];

const OLD_BACKGROUND_IMAGE_DECLARATION =
  /background(?:-image)?\s*:[^;]*url\s*\(/i;

const BACKGROUND_ALPHABET = [
  "background",
  "BACKGROUND",
  "background-image",
  "-image",
  "-color",
  ":",
  ";",
  "url",
  "URL",
  "(",
  "a",
  ...WHITESPACE,
];

const BACKGROUND_CASES = [
  "",
  "background: url(a)",
  "background-image:url (a)",
  "BACKGROUND-IMAGE : URL\n(a)",
  "background-color: red; x: url(a)",
  "background: red; background: url(a)",
  "background:;url(a)",
  "background -image: url(a)",
  "background-imagex: url(a)",
  "backgroundbackground: url(a)",
  "background: urlurl(",
  "background: url",
  "background: url x (",
  "xbackground:url(",
];

describe("background image declaration", () => {
  it("matches the old regex", () => {
    const values = [
      ...BACKGROUND_CASES,
      ...random_strings(BACKGROUND_ALPHABET, 12000, 10, 23),
    ];

    for (const value of values) {
      expect(has_background_image_declaration(value)).toBe(
        OLD_BACKGROUND_IMAGE_DECLARATION.test(value),
      );
    }
  });

  it("stays linear on attack input", () => {
    const attacks = [
      repeat_to("background:"),
      repeat_to("background "),
      repeat_to("background:url "),
      `background:${repeat_to("url ")}`,
      `background${" ".repeat(ATTACK_SIZE)}`,
      repeat_to("background-image:url"),
    ];

    for (const attack of attacks) {
      expect(
        time_ms(() => has_background_image_declaration(attack)),
      ).toBeLessThan(250);
    }
  });
});
