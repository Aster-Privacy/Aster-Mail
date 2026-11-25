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

import { strip_trailing_dots } from "@/lib/link_destination";
import { domain_list_entries } from "@/lib/mail_rules/address_match";

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

const SIZE = 256 * 1024;

describe("trailing dot trims", () => {
  const inputs = [
    "",
    ".",
    "..",
    "a.",
    "a..",
    ".a",
    "a.b.",
    "example.com",
    "example.com...",
    ...random_strings([".", "a", "@", "*", " ", ",", ";", "\n"], 30000, 10, 31),
  ];

  it("matches the old trailing dot regex", () => {
    for (const input of inputs) {
      expect([input, strip_trailing_dots(input)]).toEqual([
        input,
        input.replace(/\.+$/, ""),
      ]);
    }
  });

  it("matches the old domain list entry cleanup", () => {
    for (const input of inputs) {
      expect([input, domain_list_entries(input)]).toEqual([
        input,
        input
          .split(/[,;\s]+/)
          .map((entry) =>
            entry
              .trim()
              .replace(/^@+/, "")
              .replace(/^\*\./, "")
              .replace(/\.+$/, ""),
          )
          .filter((entry) => entry.length > 0),
      ]);
    }
  });

  it("runs in linear time on attack input", () => {
    const started = performance.now();
    const dots = "a" + ".".repeat(SIZE) + "b";

    expect(strip_trailing_dots(dots)).toBe(dots);
    expect(domain_list_entries(dots)).toEqual([dots]);
    expect(performance.now() - started).toBeLessThan(500);
  });
});
