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
  replace_quote_lines,
  replace_urls_and_emails,
  strip_for_detection,
} from "@/services/translation/language_detect";

const OLD_QUOTE_LINE = /^\s*(?:>|\|)+.*$/gm;
const OLD_URL_OR_EMAIL =
  /(?:https?:\/\/|www\.)\S+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const OLD_SIGNATURE_BLOCK = /\n--\s*\n[\s\S]*$/;

function old_strip_for_detection(text: string): string {
  return text
    .replace(OLD_QUOTE_LINE, " ")
    .replace(OLD_SIGNATURE_BLOCK, " ")
    .replace(OLD_URL_OR_EMAIL, " ")
    .replace(/\s+/g, " ")
    .trim();
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

const QUOTE_CASES = [
  "",
  ">",
  "|",
  "> quoted\nplain",
  "plain\n> quoted\nplain",
  "  > indented\n",
  "\n\n> after blanks",
  "\n \n |pipe\nx",
  "a > not quoted",
  ">>> nested\r\n> again\r\nreply",
  "x > after separator",
  "x |y",
  "\r\n>",
  "\n\n",
  "   ",
  " \n x\n>",
  " > nbsp",
  "﻿|bom",
];

const QUOTE_ALPHABET = [">", "|", "a", " ", "\n", "\r", " ", " "];

const URL_CASES = [
  "",
  "see https://example.com/x now",
  "http://",
  "https:// x",
  "https://a",
  "HTTPS://a",
  "www.",
  "www.x",
  "wwww.x",
  "mail a@b.co today",
  "a@b.c",
  "a@b.cd.e",
  "a@b..cd",
  "a@.cd",
  "@b.cd",
  "a.b@c-d.ef.gh1",
  "a@b.cd@e.fg",
  "x+y%z@q.rs",
  "a@b.c1.de",
  "a@www.example.com",
  "http://a@b.cd",
  "a@https://b.cd",
  "é@b.cd",
  "a@b.éé",
];

const URL_ALPHABET = [
  "a",
  "B",
  "1",
  ".",
  "@",
  "-",
  "_",
  "%",
  "+",
  " ",
  "\n",
  " ",
  "http://",
  "https://",
  "www.",
  "/",
];

describe("replace_quote_lines equivalence", () => {
  const inputs = [
    ...QUOTE_CASES,
    ...random_strings(QUOTE_ALPHABET, 30000, 12, 41),
    ...random_strings([">", " ", "\n", "a"], 20000, 10, 42),
  ];

  it("matches the old quote line regex for every input", () => {
    for (const input of inputs) {
      expect([input, replace_quote_lines(input, " ")]).toEqual([
        input,
        input.replace(OLD_QUOTE_LINE, " "),
      ]);
    }
  });
});

describe("replace_urls_and_emails equivalence", () => {
  const inputs = [
    ...URL_CASES,
    ...random_strings(URL_ALPHABET, 30000, 10, 43),
    ...random_strings(["a", ".", "@", "b1", " "], 20000, 10, 44),
  ];

  it("matches the old url and email regex for every input", () => {
    for (const input of inputs) {
      expect([input, replace_urls_and_emails(input, " ")]).toEqual([
        input,
        input.replace(OLD_URL_OR_EMAIL, " "),
      ]);
    }
  });
});

describe("strip_for_detection equivalence", () => {
  const inputs = [
    ...QUOTE_CASES,
    ...URL_CASES,
    "Hello there\n> old reply a@b.cd\n-- \nSignature https://x.y",
    ...random_strings([...QUOTE_ALPHABET, ...URL_ALPHABET, "--"], 20000, 10, 45),
  ];

  it("matches the old pipeline for every input", () => {
    for (const input of inputs) {
      expect([input, strip_for_detection(input)]).toEqual([
        input,
        old_strip_for_detection(input),
      ]);
    }
  });
});

describe("linear scans on attack input", () => {
  const size = 256 * 1024;

  it("strips quote lines on crafted input in linear time", () => {
    const attacks = [
      " ".repeat(size) + "x",
      "\n".repeat(size) + "x",
      " \n".repeat(size / 2) + "x",
      "  ".repeat(size / 2) + "x",
      ">".repeat(size),
    ];
    const started = performance.now();

    for (const attack of attacks) replace_quote_lines(attack, " ");
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("strips urls and emails on crafted input in linear time", () => {
    const attacks = [
      "a".repeat(size) + "@",
      "a".repeat(size) + "@" + "b.".repeat(size / 2),
      "a@" + "b.".repeat(size / 2) + "1",
      "a@b".repeat(size / 3),
      "a@" + ".c1".repeat(size / 3),
      "-".repeat(size) + "@a",
      "https:// ".repeat(size / 9),
    ];
    const started = performance.now();

    for (const attack of attacks) replace_urls_and_emails(attack, " ");
    expect(performance.now() - started).toBeLessThan(500);
  });
});
