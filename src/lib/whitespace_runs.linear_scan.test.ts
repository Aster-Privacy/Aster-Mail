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
  drop_blanks_before_newlines,
  join_newline_runs,
} from "@/lib/whitespace_runs";
import { char_set_predicate, trim_end_while } from "@/lib/linear_trim";

const OLD_NEWLINE_RUN = /\s*\n\s*/g;
const OLD_BLANKS_BEFORE_NEWLINE = /[ \t]+\n/g;
const OLD_TRAILING_SLASHES = /\/+$/;

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

const WHITESPACE_CASES = [
  "",
  "\n",
  " ",
  "\t\n",
  " \n ",
  "a\nb",
  "a \n b",
  "a  b",
  "a \r\n b",
  "a\r\nb\r\n",
  "\n\n\n",
  "a \t \n\t c \n",
  "a \n b",
  "a b",
  "a　\n﻿b",
  " \t ",
  "a\t",
  "a \nb \t\nc\t \t",
  "line one\nline two\n\n",
  "\u0085\n᠎",
];

const WHITESPACE_ALPHABET = [
  "a",
  " ",
  "\t",
  "\n",
  "\r",
  " ",
  " ",
  "﻿",
  "\u0085",
  "$",
];

describe("join_newline_runs equivalence", () => {
  const inputs = [
    ...WHITESPACE_CASES,
    ...random_strings(WHITESPACE_ALPHABET, 20000, 12, 11),
    ...random_strings(["a", " ", "\n"], 20000, 10, 12),
  ];

  it("matches the old newline run replacement for every input", () => {
    for (const input of inputs) {
      expect([input, join_newline_runs(input, ", ")]).toEqual([
        input,
        input.replace(OLD_NEWLINE_RUN, ", "),
      ]);
    }
  });
});

describe("drop_blanks_before_newlines equivalence", () => {
  const inputs = [
    ...WHITESPACE_CASES,
    ...random_strings(WHITESPACE_ALPHABET, 20000, 12, 13),
    ...random_strings(["a", " ", "\t", "\n"], 20000, 10, 14),
  ];

  it("matches the old blank stripping replacement for every input", () => {
    for (const input of inputs) {
      expect([input, drop_blanks_before_newlines(input)]).toEqual([
        input,
        input.replace(OLD_BLANKS_BEFORE_NEWLINE, "\n"),
      ]);
    }
  });
});

describe("trailing slash trim equivalence", () => {
  const is_slash = char_set_predicate("/");
  const inputs = [
    "",
    "/",
    "//",
    "/a/",
    "/a//b//",
    "a",
    ...random_strings(["/", "a", "?"], 20000, 10, 15),
  ];

  it("matches the old trailing slash regex for every input", () => {
    for (const input of inputs) {
      expect([input, trim_end_while(input, is_slash)]).toEqual([
        input,
        input.replace(OLD_TRAILING_SLASHES, ""),
      ]);
    }
  });
});

describe("linear scans on attack input", () => {
  const size = 256 * 1024;

  it("joins newline runs in linear time", () => {
    const attack = "a" + " ".repeat(size) + "b";
    const started = performance.now();

    expect(join_newline_runs(attack, ", ")).toBe(attack);
    expect(join_newline_runs(attack + "\n", ", ")).toBe(
      "a" + " ".repeat(size) + "b, ",
    );
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("drops blanks before newlines in linear time", () => {
    const attack = "a" + " \t".repeat(size / 2) + "b";
    const started = performance.now();

    expect(drop_blanks_before_newlines(attack)).toBe(attack);
    expect(drop_blanks_before_newlines(attack + " \n")).toBe(attack + "\n");
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("trims trailing slashes in linear time", () => {
    const attack = "/".repeat(size) + "x";
    const started = performance.now();

    expect(trim_end_while(attack, char_set_predicate("/"))).toBe(attack);
    expect(performance.now() - started).toBeLessThan(500);
  });
});
