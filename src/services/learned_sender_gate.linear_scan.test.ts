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

import { ASTER_DOMAIN_SUFFIXES } from "@/data/category_signals";
import {
  is_aster_domain_sender,
  sender_domain,
} from "@/services/learned_sender_gate";

const OLD_DOMAIN_TRAILING = /[.>]+$/;
const OLD_ASTER_DOMAINS = new Set(ASTER_DOMAIN_SUFFIXES);

function old_sender_domain(email: string): string {
  const at = email.lastIndexOf("@");

  if (at === -1) return "";

  return email
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(OLD_DOMAIN_TRAILING, "");
}

function old_is_aster_domain_sender(email: string): boolean {
  let current = old_sender_domain(email);

  while (current) {
    if (OLD_ASTER_DOMAINS.has(current)) return true;

    const dot = current.indexOf(".");

    if (dot === -1) return false;
    current = current.slice(dot + 1);
  }

  return false;
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
  "a@astermail.org",
  "a@ASTERMAIL.ORG.",
  "a@astermail.org>",
  "a@mail.astermail.org>.",
  "a@astermail.org. ",
  " a@aster.cx>\n",
  "a@aster.cx >",
  "a@notaster.cx",
  "a@x.aster.cx",
  "a@",
  "a",
  "a@b@aster.cx",
  "a@aster.cx ",
  "a@aster.cx .",
  "a@.aster.cx",
];

const ALPHABET = [
  "a",
  "aster",
  "astermail",
  ".cx",
  ".org",
  "@",
  ".",
  ">",
  " ",
  "\n",
  " ",
  "A",
];

describe("sender_domain equivalence", () => {
  const inputs = [...CASES, ...random_strings(ALPHABET, 30000, 8, 31)];

  it("matches the old domain regex for every input", () => {
    for (const input of inputs) {
      expect([input, sender_domain(input)]).toEqual([
        input,
        old_sender_domain(input),
      ]);
      expect([input, is_aster_domain_sender(input)]).toEqual([
        input,
        old_is_aster_domain_sender(input),
      ]);
    }
  });
});

describe("linear scans on attack input", () => {
  const size = 256 * 1024;

  it("trims a long trailing run in linear time", () => {
    const attacks = [
      "a@" + ".>".repeat(size / 2) + "a",
      "a@b" + ">".repeat(size) + "c",
      "a@" + "a.".repeat(size / 2) + "b",
      "a@aster.cx" + ".>".repeat(size / 2),
    ];
    const started = performance.now();
    const results = attacks.map((attack) => is_aster_domain_sender(attack));

    expect(performance.now() - started).toBeLessThan(500);
    expect(results).toEqual([false, false, false, true]);
  });
});
