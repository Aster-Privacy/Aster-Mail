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
  replace_markup_tags,
  replace_style_blocks,
} from "@/lib/compose_deferred_markup";

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

const OLD_TAG = /<[a-z][^\s/>]*(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const OLD_STYLE_BLOCK =
  /(<style\b(?:[^>"']|"[^"]*"|'[^']*')*>)([\s\S]*?)(<\/style>)/gi;
const OLD_PARKED_STYLE =
  /<style\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/style>/gi;

function tag_marker(tag: string): string {
  return `[${tag}]`;
}

const ALPHABET = [
  "<a",
  "<B",
  "<style",
  "<STYLE",
  "<styles",
  "</style>",
  "</STYLE>",
  ">",
  '"',
  "'",
  " ",
  "/",
  "x",
  "<",
  "=",
  "\n",
  "<1",
];

const CASES = [
  "",
  "<a>",
  "<a href=\"x>y\">",
  "<a href='x>y'>",
  "<a\"b>",
  "<a\"b",
  "<a href=\"x",
  "<a title=\"1\" b='2'>t</a>",
  "<style>a{}</style>",
  "<style media=\"a>b\">x</style>",
  "<style>x",
  "<style'>x</style>",
  "<styles>x</style>",
  "<style>a</style><style>b</style>",
  "<a\"x\">",
  "<a \"x\"y'z'>",
  "<1>",
  "<a/>",
];

describe("replace_markup_tags", () => {
  it("matches the old pattern on edge cases", () => {
    for (const value of CASES) {
      expect(replace_markup_tags(value, tag_marker), value).toBe(
        value.replace(OLD_TAG, tag_marker),
      );
    }
  });

  it("matches the old pattern on random input", () => {
    for (const value of random_strings(ALPHABET, 8000, 12, 81)) {
      expect(replace_markup_tags(value, tag_marker), JSON.stringify(value)).toBe(
        value.replace(OLD_TAG, tag_marker),
      );
    }
  });

  it("stays linear on unclosed tags", () => {
    for (const unit of ["<a", '<a "', "<a '", '<a"x"', "<a b"]) {
      const attack = repeat_to(unit, ATTACK_SIZE);

      expect(
        elapsed_ms(() => replace_markup_tags(attack, tag_marker)),
        unit,
      ).toBeLessThan(500);
    }
  });
});

describe("replace_style_blocks", () => {
  it("matches the old compose pattern", () => {
    for (const value of [...CASES, ...random_strings(ALPHABET, 8000, 12, 82)]) {
      const expected = value.replace(
        OLD_STYLE_BLOCK,
        (_match: string, open: string, css: string, close: string) =>
          `{${open}|${css}|${close}}`,
      );

      expect(
        replace_style_blocks(value, ({ open, css, close }) => `{${open}|${css}|${close}}`),
        JSON.stringify(value),
      ).toBe(expected);
    }
  });

  it("matches the old parked style pattern", () => {
    for (const value of [...CASES, ...random_strings(ALPHABET, 8000, 12, 83)]) {
      const expected = value.replace(
        OLD_PARKED_STYLE,
        (match: string, attributes: string, css: string) =>
          `{${match}|${attributes}|${css}}`,
      );

      expect(
        replace_style_blocks(
          value,
          ({ match, attributes, css }) => `{${match}|${attributes}|${css}}`,
        ),
        JSON.stringify(value),
      ).toBe(expected);
    }
  });

  it("stays linear on unclosed style blocks", () => {
    for (const unit of ["<style>", '<style "', "<style"]) {
      const attack = repeat_to(unit, ATTACK_SIZE);

      expect(
        elapsed_ms(() => replace_style_blocks(attack, ({ match }) => match)),
        unit,
      ).toBeLessThan(500);
    }
  });
});
