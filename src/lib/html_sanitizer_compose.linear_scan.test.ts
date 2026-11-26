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

import { strip_mso_declarations } from "@/lib/html_sanitizer_compose";
import { trim_edges_while } from "@/lib/linear_trim";

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

const OLD_MSO_DECLARATION = /mso-[^:]+:[^;]+;?/gi;
const OLD_EDGE_SEMICOLONS = /^;+|;+$/g;

const MSO_ALPHABET = [
  "mso-",
  "MSO-",
  "mso",
  "-",
  ":",
  ";",
  "a",
  "color",
  " ",
  "\n",
];

const MSO_CASES = [
  "",
  "mso-line-height-rule: exactly; color: red",
  "MSO-x:1",
  "mso-:1;",
  "mso-a:;",
  "mso-a:",
  "mso-a",
  "mso-mso-a:b;c",
  "mso-a:b:c;d",
  "a;mso-a:b;mso-c:d",
  "mso-a mso-b:c",
  "mso-;mso-a:b",
];

describe("mso declarations", () => {
  it("match the old regex", () => {
    const values = [
      ...MSO_CASES,
      ...random_strings(MSO_ALPHABET, 12000, 12, 346),
    ];

    for (const value of values) {
      expect(strip_mso_declarations(value)).toBe(
        value.replace(OLD_MSO_DECLARATION, ""),
      );
    }
  });

  it("stay linear on attack input", () => {
    const attacks = [
      repeat_to("mso-"),
      repeat_to("mso-a"),
      repeat_to("mso-:"),
      repeat_to("mso-a:;"),
      `mso-a${";".repeat(ATTACK_SIZE)}`,
    ];

    for (const attack of attacks) {
      expect(time_ms(() => strip_mso_declarations(attack))).toBeLessThan(250);
    }
  });
});

describe("edge semicolons", () => {
  it("trim_edges_while matches the old regex", () => {
    const values = random_strings([";", "a", " ", ";;"], 6000, 12, 57);

    for (const value of values) {
      expect(trim_edges_while(value, (code) => code === 0x3b)).toBe(
        value.replace(OLD_EDGE_SEMICOLONS, ""),
      );
    }
  });

  it("stays linear on attack input", () => {
    const attack = `a${";".repeat(ATTACK_SIZE)}b`;

    expect(
      time_ms(() => trim_edges_while(attack, (code) => code === 0x3b)),
    ).toBeLessThan(250);
  });
});
