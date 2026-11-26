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
  has_centered_card_layout,
  has_style_block_background,
  has_table_layout_attribute,
} from "./layout_probe";

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

const OLD_STYLE_BACKGROUND = /<style\b[^>]*>(?:(?!<\/style\b)[\s\S])*?background/i;
const OLD_CENTERED_CARD =
  /max-width\s*:\s*[3456789]\d{2}px[^;}"']*;[^"']*margin\s*:[^;}"']*auto/i;
const OLD_TABLE_ATTRIBUTE = /<table[^>]*(?:width|bgcolor|background)\s*=/i;

const STYLE_ALPHABET = [
  "<style",
  "<STYLE",
  "<styles",
  ">",
  "</style",
  "</STYLE>",
  "</styles",
  "background",
  "BACKGROUND",
  "back",
  " ",
  "\n",
  "a",
];

const CARD_ALPHABET = [
  "max-width",
  "MAX-WIDTH",
  ":",
  " ",
  "\n",
  "600",
  "300",
  "200",
  "9",
  "px",
  "PX",
  ";",
  "}",
  '"',
  "'",
  "margin",
  "Margin",
  "auto",
  "0",
  "x",
];

const TABLE_ALPHABET = [
  "<table",
  "<TABLE",
  ">",
  "width",
  "bgcolor",
  "BACKGROUND",
  "=",
  " ",
  "\n",
  "a",
];

const CASES = [
  "",
  "<style>a{background:red}</style>",
  "<style>a</style>background",
  "<style></style><style>background",
  "<styles>background",
  "<style>background",
  "<style",
  "<style></stylex>background",
  "max-width:600px;margin:0 auto",
  "max-width : 600px ; margin: auto",
  "max-width:600px}margin:auto",
  "max-width:600px;\"margin:auto",
  "max-width:600px;margin:0;auto",
  "max-width:200px;margin:auto",
  "max-width:6000px;margin:auto",
  "max-width:600px;x max-width:700px;margin:auto",
  "<table width=1>",
  "<table>width=1",
  "<tablewidth =",
  "<table><table bgcolor=x>",
  "<table background\n=x",
];

describe("layout probes", () => {
  it("match the old patterns on edge cases", () => {
    for (const value of CASES) {
      expect(has_style_block_background(value), value).toBe(
        OLD_STYLE_BACKGROUND.test(value),
      );
      expect(has_centered_card_layout(value), value).toBe(
        OLD_CENTERED_CARD.test(value),
      );
      expect(has_table_layout_attribute(value), value).toBe(
        OLD_TABLE_ATTRIBUTE.test(value),
      );
    }
  });

  it("match the old patterns on random input", () => {
    for (const value of random_strings(STYLE_ALPHABET, 6000, 10, 101)) {
      expect(has_style_block_background(value), JSON.stringify(value)).toBe(
        OLD_STYLE_BACKGROUND.test(value),
      );
    }
    for (const value of random_strings(CARD_ALPHABET, 8000, 12, 102)) {
      expect(has_centered_card_layout(value), JSON.stringify(value)).toBe(
        OLD_CENTERED_CARD.test(value),
      );
    }
    for (const value of random_strings(TABLE_ALPHABET, 6000, 10, 103)) {
      expect(has_table_layout_attribute(value), JSON.stringify(value)).toBe(
        OLD_TABLE_ATTRIBUTE.test(value),
      );
    }
  });

  it("stay linear on adversarial markup", () => {
    const styles = repeat_to("<style>", ATTACK_SIZE);
    const cards = repeat_to("max-width:600px;", ATTACK_SIZE);
    const margins = "max-width:600px;" + repeat_to("margin:", ATTACK_SIZE);
    const tables = repeat_to("<table", ATTACK_SIZE);

    expect(elapsed_ms(() => has_style_block_background(styles))).toBeLessThan(500);
    expect(elapsed_ms(() => has_centered_card_layout(cards))).toBeLessThan(500);
    expect(elapsed_ms(() => has_centered_card_layout(margins))).toBeLessThan(500);
    expect(elapsed_ms(() => has_table_layout_attribute(tables))).toBeLessThan(500);
  });
});
