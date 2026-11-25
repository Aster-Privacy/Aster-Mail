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

import { sender_region_currency } from "@/services/extraction/money";

const OLD_HOST_TRAILING = /[>.]+$/;

function old_tld(from_email: string): string | null {
  const at = from_email.lastIndexOf("@");

  if (at < 0) return null;

  const host = from_email
    .slice(at + 1)
    .trim()
    .replace(OLD_HOST_TRAILING, "")
    .toLowerCase();

  return host.slice(host.lastIndexOf(".") + 1);
}

function old_sender_region_currency(from_email: string): string | null {
  const tld = old_tld(from_email);

  if (tld === null || tld === "" || /[\s>.]/.test(tld)) return null;

  return sender_region_currency(`a@b.${tld}`);
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

const CASES = [
  "a@b.se",
  "a@b.SE",
  "a@b.se>",
  "a@b.se.",
  "a@b.se>.>.",
  "a@b.se. ",
  " a@b.se>\n",
  "a@b.se >",
  "a@b.no",
  "a@b",
  "a@",
  "ab.se",
  "a@b.se@c.dk",
  "a@b.dk ",
  "a@b.dk .",
];

const ALPHABET = [
  "a",
  "se",
  "dk",
  "no",
  "@",
  ".",
  ">",
  " ",
  "\n",
  " ",
  "S",
];

describe("sender_region_currency equivalence", () => {
  const inputs = [...CASES, ...random_strings(ALPHABET, 30000, 8, 21)];

  it("matches the old host regex for every input", () => {
    for (const input of inputs) {
      expect([input, sender_region_currency(input)]).toEqual([
        input,
        old_sender_region_currency(input),
      ]);
    }
  });

  it("keeps known regional hosts", () => {
    expect(sender_region_currency("shop@store.se>.")).toBe("SEK");
    expect(sender_region_currency("shop@store.no")).toBe("NOK");
    expect(sender_region_currency("shop@store.dk. ")).toBe("DKK");
  });
});

describe("linear scans on attack input", () => {
  const size = 256 * 1024;

  it("trims a long trailing run in linear time", () => {
    const attacks = [
      "a@" + ">.".repeat(size / 2) + "a",
      "a@" + ".".repeat(size) + " x",
      "a@b" + ">".repeat(size) + "c",
      "a@b.se" + ">.".repeat(size / 2),
    ];
    const started = performance.now();
    const results = attacks.map((attack) => sender_region_currency(attack));

    expect(performance.now() - started).toBeLessThan(500);
    expect(results).toEqual([null, null, null, "SEK"]);
  });
});
