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

import { normalize_url_value, parse_srcset_candidates } from "@/lib/url_value";

const OLD_EDGE = /^[\u0000- ]+|[\u0000- ]+$/g;
const OLD_TAB_OR_NEWLINE = /[\t\n\r]/g;

function old_normalize(value: string): string {
  return value.replace(OLD_EDGE, "").replace(OLD_TAB_OR_NEWLINE, "");
}

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

describe("url_value linear scans", () => {
  it("normalizes exactly like the previous pattern", () => {
    const alphabet = ["\u0000", "\u0001", "\t", "\n", "\r", " ", "!", "a", ":", "/", " ", "　", ","];
    const random = seeded_random(7);

    for (let n = 0; n < 5000; n += 1) {
      const length = Math.floor(random() * 12);
      let value = "";

      for (let i = 0; i < length; i += 1) {
        value += alphabet[Math.floor(random() * alphabet.length)];
      }
      expect(normalize_url_value(value)).toBe(old_normalize(value));
    }
  });

  it("keeps trailing comma handling in srcset", () => {
    expect(parse_srcset_candidates("a.png,,, b.png 2x")).toEqual([
      { url: "a.png", descriptor: "" },
      { url: "b.png", descriptor: "2x" },
    ]);
  });

  it("stays linear on long control runs", () => {
    const run = "\u0001".repeat(200_000);
    const started = performance.now();

    normalize_url_value(`${run}a${run}a${run}`);
    parse_srcset_candidates(`a${",".repeat(200_000)}b,`);

    expect(performance.now() - started).toBeLessThan(500);
  });
});
