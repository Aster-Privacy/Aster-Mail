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

import { bracketed_http_links } from "@/utils/unsubscribe_detector";

const OLD_BRACKETED_LINK = /<\s*(https?:\/\/[^>\s]+)\s*>/gi;

function old_bracketed_http_links(header: string): string[] {
  return [...header.matchAll(OLD_BRACKETED_LINK)].map((match) => match[1]);
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
  "<https://a.example/u>",
  "<mailto:u@a.example>, <https://a.example/u?x=1>",
  "< https://a.example/u >",
  "<\n\thttp://a.example>",
  "<HTTPS://A.EXAMPLE>",
  "<HtTp://a>",
  "<https://>",
  "<https://a b>",
  "<https://a<https://b>",
  "<<https://a>>",
  "<https://a",
  "<http:/a>",
  "<httpss://a>",
  "< https://a >",
  "<https://a> <http://b>",
  "<ſttps://a>",
];

const ALPHABET = [
  "<",
  ">",
  "http://",
  "https://",
  "HTTP://",
  "a",
  " ",
  "\n",
  " ",
  "/",
  ":",
];

describe("bracketed_http_links equivalence", () => {
  const inputs = [
    ...CASES,
    ...random_strings(ALPHABET, 30000, 8, 61),
    ...random_strings(["<", ">", "http://", "a", " "], 20000, 8, 62),
  ];

  it("matches the old bracketed link regex for every input", () => {
    for (const input of inputs) {
      expect([input, bracketed_http_links(input)]).toEqual([
        input,
        old_bracketed_http_links(input),
      ]);
    }
  });
});

describe("linear scans on attack input", () => {
  const size = 256 * 1024;

  it("scans a crafted header in linear time", () => {
    const attacks = [
      "<".repeat(size),
      "< ".repeat(size / 2),
      "<http://" + "a".repeat(size),
      "<http://a".repeat(size / 9),
      "<http://" + "<http://a".repeat(size / 9),
      "<http://a" + " ".repeat(size) + "x",
      "<" + " ".repeat(size) + "x",
    ];
    const started = performance.now();
    const results = attacks.map((attack) => bracketed_http_links(attack));

    expect(performance.now() - started).toBeLessThan(500);
    for (const result of results) expect(result).toEqual([]);
  });
});
