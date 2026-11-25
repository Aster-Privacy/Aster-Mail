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
  strip_cdata_sections,
  trailing_background_value,
} from "@/lib/html_text";

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

const OLD_BACKGROUND = /background(?:-color)?\s*:\s*([^;"']+)$/i;
const OLD_CDATA = /<!\[CDATA\[[\s\S]*?\]\]>/g;

function old_background(declaration: string): string {
  const match = declaration.match(OLD_BACKGROUND);

  return match ? match[1].trim() : "";
}

function new_background(declaration: string): string {
  return (trailing_background_value(declaration) ?? "").trim();
}

const BACKGROUND_CASES = [
  "",
  "background",
  "background:",
  "background: ",
  "background:red",
  "background : red ",
  "BACKGROUND-COLOR:#fff",
  "background-color :  blue",
  "background-color",
  "background-color:",
  "background-colorx:red",
  "background-color background:red",
  "background:red;",
  "background:red;background:blue",
  "background:'red'",
  "background:\"x\" y",
  "color:red; background:\u00a0green",
  "background:\n\tred",
  "backgroundbackground:red",
  "xbackground:red",
  "background:background:red",
];

const BACKGROUND_ALPHABET = [
  "background",
  "Background",
  "-color",
  "-COLOR",
  ":",
  " ",
  "\t",
  "\n",
  "\u00a0",
  ";",
  '"',
  "'",
  "red",
  "#",
  "b",
];

const CDATA_CASES = [
  "",
  "<![CDATA[",
  "<![CDATA[]]>",
  "a<![CDATA[x]]>b",
  "a<![CDATA[x]]>b<![CDATA[y]]>c",
  "<![CDATA[<![CDATA[x]]>]]>",
  "<![CDATA[x]]",
  "]]><![CDATA[",
  "<![cdata[x]]>",
];

const CDATA_ALPHABET = ["<![CDATA[", "]]>", "]]", "]", "<", "!", "[", "a", "\n"];

describe("trailing_background_value", () => {
  it("matches the old pattern on edge cases", () => {
    for (const value of BACKGROUND_CASES) {
      expect(new_background(value), value).toBe(old_background(value));
    }
  });

  it("matches the old pattern on random input", () => {
    for (const value of random_strings(BACKGROUND_ALPHABET, 4000, 12, 11)) {
      expect(new_background(value), JSON.stringify(value)).toBe(
        old_background(value),
      );
    }
  });

  it("stays linear on repeated declarations", () => {
    const attack = repeat_to("background:x", ATTACK_SIZE) + ";";

    expect(elapsed_ms(() => trailing_background_value(attack))).toBeLessThan(
      500,
    );
  });

  it("stays linear on a long whitespace run", () => {
    const attack = "background" + " ".repeat(ATTACK_SIZE) + "x";

    expect(elapsed_ms(() => trailing_background_value(attack))).toBeLessThan(
      500,
    );
  });
});

describe("strip_cdata_sections", () => {
  it("matches the old pattern on edge cases", () => {
    for (const value of CDATA_CASES) {
      expect(strip_cdata_sections(value), value).toBe(
        value.replace(OLD_CDATA, ""),
      );
    }
  });

  it("matches the old pattern on random input", () => {
    for (const value of random_strings(CDATA_ALPHABET, 4000, 14, 12)) {
      expect(strip_cdata_sections(value), JSON.stringify(value)).toBe(
        value.replace(OLD_CDATA, ""),
      );
    }
  });

  it("stays linear on unclosed sections", () => {
    const attack = repeat_to("<![CDATA[", ATTACK_SIZE);

    expect(elapsed_ms(() => strip_cdata_sections(attack))).toBeLessThan(500);
  });
});
