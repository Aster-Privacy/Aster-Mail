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

import { find_organizer_property } from "@/services/calendar/itip";

const OLD_ORGANIZER = /^ORGANIZER((?:;[^:\r\n]*)?):([^\r\n]*)/im;

function old_find_organizer(
  block: string,
): { params: string; value: string } | null {
  const match = block.match(OLD_ORGANIZER);

  if (!match) return null;

  return { params: match[1] ?? "", value: match[2] };
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
  "",
  "ORGANIZER:mailto:a@b.c",
  "organizer;CN=Ann:mailto:a@b.c",
  "ORGANIZER;CN=Ann",
  "ORGANIZER;CN=Ann\n:mailto:a@b.c",
  "ORGANIZER;CN= Ann:mailto:a@b.c",
  "ORGANIZER;CN=Ann\r\nORGANIZER:mailto:x@y.z",
  "X-ORGANIZER:mailto:a@b.c",
  "BEGIN:VEVENT\r\nORGANIZER:mailto:a@b.c\r\nEND:VEVENT",
  "x ORGANIZER:v",
  "x ORGANIZER:v w\rz",
  "ORGANIZERX:v",
  "ORGANIZER",
  "ORGANIZER:",
  "ORGANIZER;:",
  "ORGANIZER;a;b;c:d:e",
  "ıORGANIZER:v",
  "ORGANıZER:v",
  "OrGaNiZeR;x=1:v\n",
];

const ALPHABET = [
  "ORGANIZER",
  "organizer",
  ";",
  ":",
  "\n",
  "\r",
  " ",
  " ",
  "a",
  "=",
  " ",
];

describe("find_organizer_property equivalence", () => {
  const inputs = [
    ...CASES,
    ...random_strings(ALPHABET, 30000, 8, 51),
    ...random_strings(["ORGANIZER", ";", ":", "\n", " "], 20000, 8, 52),
  ];

  it("matches the old organizer regex for every input", () => {
    for (const input of inputs) {
      expect([input, find_organizer_property(input)]).toEqual([
        input,
        old_find_organizer(input),
      ]);
    }
  });
});

describe("linear scans on attack input", () => {
  const size = 256 * 1024;

  it("finds the organizer on crafted input in linear time", () => {
    const attacks = [
      "ORGANIZER; ".repeat(size / 11),
      "ORGANIZER;" + " ORGANIZER;".repeat(size / 11) + "\n",
      "\n".repeat(size),
      "ORGANIZE\n".repeat(size / 9),
      " ".repeat(size),
    ];
    const started = performance.now();
    const results = attacks.map((attack) => find_organizer_property(attack));

    expect(performance.now() - started).toBeLessThan(500);
    expect(results).toEqual([null, null, null, null, null]);
  });
});
