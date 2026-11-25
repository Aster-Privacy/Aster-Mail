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
  find_angle_content,
  has_angle_content,
  is_email_shape,
} from "@/lib/email_shape";

const OLD_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OLD_SHAPE_VARIANT = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const OLD_ANGLE_CAPTURE = /<([^>]+)>/;
const OLD_ANGLE_TEST = /<[^>]+>/;

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

const SHAPE_CASES = [
  "",
  "@",
  "a@b.c",
  "a@b.",
  "a@.c",
  "a@.b.c",
  "a@b..",
  "a@..",
  "a@b.c.",
  "@b.c",
  "a@@b.c",
  "a@b@c.d",
  "a b@c.d",
  "a@b.c ",
  " a@b.c",
  "a@b.c\n",
  "a@b .c",
  "a@b.c ",
  "a@b.c﻿",
  "a@b　c.d",
  "user.name+tag@example.co.uk",
  "a@b",
  "a@bc",
  "a@b.cd",
  "ab@.",
  "x@y.z.w",
  "\u{1f600}@\u{1f600}.\u{1f600}",
  "a@b.c\u0085",
  "a@b.c᠎",
];

const SHAPE_ALPHABET = [
  "a",
  "b",
  "@",
  ".",
  " ",
  "\n",
  "\t",
  " ",
  " ",
  "﻿",
  "\u0085",
  "\u{1f600}",
];

const ANGLE_CASES = [
  "",
  "<",
  ">",
  "<>",
  "<<>>",
  "<a>",
  "Name <a@b.c>",
  "Name <> <a@b.c>",
  "<<a>",
  "<a<b>",
  "a>b<c>",
  "<a",
  "a>",
  "<><>",
  "<> <",
  "<\n>",
  "x <a@b.c> <d@e.f>",
  "<>>",
  "<<>",
];

const ANGLE_ALPHABET = ["<", ">", "a", " ", "\n", "@", "."];

describe("is_email_shape equivalence", () => {
  const inputs = [
    ...SHAPE_CASES,
    ...random_strings(SHAPE_ALPHABET, 20000, 10, 1),
    ...random_strings(["a", "@", "."], 20000, 8, 2),
  ];

  it("matches the old address regexes for every input", () => {
    for (const input of inputs) {
      const actual = is_email_shape(input);

      expect([input, actual]).toEqual([input, OLD_SHAPE.test(input)]);
      expect([input, actual]).toEqual([input, OLD_SHAPE_VARIANT.test(input)]);
    }
  });
});

describe("find_angle_content equivalence", () => {
  const inputs = [
    ...ANGLE_CASES,
    ...random_strings(ANGLE_ALPHABET, 20000, 10, 3),
    ...random_strings(["<", ">", "a"], 20000, 8, 4),
  ];

  it("matches the old capture and test regexes for every input", () => {
    for (const input of inputs) {
      const old_match = input.match(OLD_ANGLE_CAPTURE);

      expect([input, find_angle_content(input)]).toEqual([
        input,
        old_match ? old_match[1] : null,
      ]);
      expect([input, has_angle_content(input)]).toEqual([
        input,
        OLD_ANGLE_TEST.test(input),
      ]);
    }
  });
});

describe("linear scans on attack input", () => {
  const size = 256 * 1024;

  it("checks an address shape with many dots in linear time", () => {
    const attacks = [
      "a@" + ".".repeat(size) + " ",
      "a@" + "a.".repeat(size / 2) + "@",
      "a".repeat(size) + "@" + "b".repeat(size) + "\n",
    ];
    const started = performance.now();

    for (const attack of attacks) expect(is_email_shape(attack)).toBe(false);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("finds angle content with many open brackets in linear time", () => {
    const attacks = [
      "<".repeat(size),
      "<a".repeat(size / 2),
      "<>".repeat(size / 2),
    ];
    const started = performance.now();

    for (const attack of attacks) {
      expect(find_angle_content(attack)).toBeNull();
      expect(has_angle_content(attack)).toBe(false);
    }
    expect(find_angle_content("<".repeat(size) + ">")).toBe(
      "<".repeat(size - 1),
    );
    expect(performance.now() - started).toBeLessThan(500);
  });
});
