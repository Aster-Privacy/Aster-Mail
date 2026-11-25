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

import { replace_bracketed_tags } from "@/components/email/pgp_password_prompt";
import { find_paired_elements, replace_matched_ranges } from "@/lib/html_text";

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

const OLD_CODE_BLOCK = /<(script|style)[\s\S]*?<\/\1>/gi;
const OLD_TAG = /<[^>]*>/g;

function new_code_blocks(html: string): string {
  return replace_matched_ranges(
    html,
    find_paired_elements(html, ["script", "style"], {
      word_boundary: false,
      open_tag: false,
    }),
    () => " ",
  );
}

const ALPHABET = [
  "<script",
  "<SCRIPT",
  "<style",
  "<scripts",
  "</script>",
  "</SCRIPT>",
  "</style>",
  "</scripts>",
  "<",
  ">",
  "/",
  "a",
  " ",
  "\n",
];

const CASES = [
  "",
  "<",
  ">",
  "<>",
  "a<b>c",
  "<a<b>",
  "<script>x</script>y",
  "<scriptx</script>",
  "<script>x</style>",
  "<style>a</style><script>b</SCRIPT>",
  "<script>a",
];

describe("pgp prompt visible text", () => {
  it("replaces tags like the old pattern", () => {
    for (const value of [...CASES, ...random_strings(ALPHABET, 4000, 14, 31)]) {
      expect(replace_bracketed_tags(value, " "), JSON.stringify(value)).toBe(
        value.replace(OLD_TAG, " "),
      );
    }
  });

  it("removes code blocks like the old pattern", () => {
    for (const value of [...CASES, ...random_strings(ALPHABET, 4000, 14, 32)]) {
      expect(new_code_blocks(value), JSON.stringify(value)).toBe(
        value.replace(OLD_CODE_BLOCK, " "),
      );
    }
  });

  it("stays linear on unclosed tags and blocks", () => {
    const tags = "<".repeat(ATTACK_SIZE);
    const blocks = repeat_to("<script", ATTACK_SIZE);

    expect(elapsed_ms(() => replace_bracketed_tags(tags, " "))).toBeLessThan(500);
    expect(elapsed_ms(() => new_code_blocks(blocks))).toBeLessThan(500);
  });
});
