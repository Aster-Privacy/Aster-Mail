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
  has_receipt_reference,
  replace_tag_runs,
} from "@/services/extraction/extractor";
import {
  char_set_predicate,
  is_js_whitespace,
  trim_end_while,
} from "@/lib/linear_trim";

const OLD_TAG_RUN = /<[^>]*>/g;
const OLD_RECEIPT_REFERENCE =
  /\b(?:receipt|transaction|confirmation)\s*(?:#|no\.?|num(?:ber)?|id)(?:\s*[:#])?\s*[A-Za-z0-9.-]*[0-9]/i;
const OLD_IDENTIFIER_TRAILING = /[.,;:]+$/;
const OLD_TEXT_URL_TRAILING = /['">\]]+$/;
const OLD_DOMAIN_TRAILING = /[>\s]+$/;
const OLD_RECEIPT_URL_TRAILING = /[),.;'"\]]+$/;

const IDENTIFIER_TRAILING = char_set_predicate(".,;:");
const TEXT_URL_TRAILING = char_set_predicate("'\">]");
const RECEIPT_URL_TRAILING = char_set_predicate("),.;'\"]");
const DOMAIN_TRAILING = (code: number): boolean =>
  code === 0x3e || is_js_whitespace(code);

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

const TAG_CASES = [
  "",
  "<",
  ">",
  "<>",
  "<<>>",
  "a<b>c",
  "<a><b>",
  "<a",
  "a>",
  "<a<b>c>",
  "x<\n>y",
  "<<<",
  "<><",
  "<p>Hello</p> <br/> world",
];

const RECEIPT_CASES = [
  "receipt #123",
  "Receipt No. 42",
  "receipt no.42",
  "receipt no 42",
  "TRANSACTION ID: AB-12",
  "transaction id # 9",
  "confirmation number: x.y-7",
  "confirmation num 7",
  "confirmation numb 7",
  "receipt # : 1",
  "receipt #:: 1",
  "receipt: #1",
  "myreceipt #1",
  "_receipt #1",
  "-receipt #1",
  "receipt # 1",
  "receipt id abc",
  "receipt id abc.def-",
  "receipt id abc 1",
  "receiptid1",
  "receipt#a_1",
  "receipt#",
  "receipt ID",
  "ſreceipt #1",
  "transaction ıd 1",
  "tranſaction id 1",
  "transaction id ab9",
];

const RECEIPT_ALPHABET = [
  "receipt",
  "transaction",
  "confirmation",
  "RECEIPT",
  "#",
  "no",
  "No.",
  "num",
  "number",
  "id",
  "ID",
  ":",
  " ",
  "\n",
  " ",
  "1",
  "a",
  ".",
  "-",
  "_",
  "x",
];

const TRIM_ALPHABET = [
  "a",
  ".",
  ",",
  ";",
  ":",
  "'",
  '"',
  ">",
  "]",
  ")",
  " ",
  "\n",
  " ",
  " ",
  "﻿",
  "\u0085",
];

describe("replace_tag_runs equivalence", () => {
  const inputs = [
    ...TAG_CASES,
    ...random_strings(["<", ">", "a", "\n", " "], 20000, 12, 11),
    ...random_strings(["<", ">", "a"], 20000, 8, 12),
  ];

  it("matches the old tag regex for every input", () => {
    for (const input of inputs) {
      expect([input, replace_tag_runs(input, "\n")]).toEqual([
        input,
        input.replace(OLD_TAG_RUN, "\n"),
      ]);
    }
  });
});

describe("has_receipt_reference equivalence", () => {
  const inputs = [
    ...RECEIPT_CASES,
    ...random_strings(RECEIPT_ALPHABET, 30000, 8, 13),
    ...random_strings(["receipt", "#", "no.", " ", ":", "1", "a"], 20000, 6, 14),
  ];

  it("matches the old receipt reference regex for every input", () => {
    for (const input of inputs) {
      expect([input, has_receipt_reference(input)]).toEqual([
        input,
        OLD_RECEIPT_REFERENCE.test(input),
      ]);
    }
  });
});

describe("trailing trims equivalence", () => {
  const inputs = random_strings(TRIM_ALPHABET, 20000, 10, 15);

  it("matches each old trailing regex for every input", () => {
    for (const input of inputs) {
      expect([input, trim_end_while(input, IDENTIFIER_TRAILING)]).toEqual([
        input,
        input.replace(OLD_IDENTIFIER_TRAILING, ""),
      ]);
      expect([input, trim_end_while(input, TEXT_URL_TRAILING)]).toEqual([
        input,
        input.replace(OLD_TEXT_URL_TRAILING, ""),
      ]);
      expect([input, trim_end_while(input, DOMAIN_TRAILING)]).toEqual([
        input,
        input.replace(OLD_DOMAIN_TRAILING, ""),
      ]);
      expect([input, trim_end_while(input, RECEIPT_URL_TRAILING)]).toEqual([
        input,
        input.replace(OLD_RECEIPT_URL_TRAILING, ""),
      ]);
    }
  });
});

describe("linear scans on attack input", () => {
  const size = 256 * 1024;

  it("strips tag runs with many open brackets in linear time", () => {
    const attacks = ["<".repeat(size), "<a".repeat(size / 2), "a".repeat(size)];
    const started = performance.now();

    for (const attack of attacks) {
      expect(replace_tag_runs(attack, "\n")).toBe(attack);
    }
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("checks receipt references on crafted input in linear time", () => {
    const attacks = [
      "receipt".repeat(size / 7),
      "receipt #" + "-".repeat(size),
      "receipt no" + " ".repeat(size) + ":",
      "receipt # " + ": ".repeat(size / 2),
      "receipt id ".repeat(size / 11),
      "receipt #a.".repeat(size / 11),
      " ".repeat(size) + "receipt",
    ];
    const started = performance.now();

    for (const attack of attacks) {
      expect(has_receipt_reference(attack)).toBe(false);
    }
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("trims long trailing runs in linear time", () => {
    const attacks = [
      "a" + ".,;:".repeat(size / 4) + "a",
      "a" + "'\">]".repeat(size / 4) + "a",
      "a" + "> ".repeat(size / 2) + "a",
      "a" + "),.;'\"]".repeat(size / 7) + "a",
    ];
    const started = performance.now();

    for (const attack of attacks) {
      expect(trim_end_while(attack, IDENTIFIER_TRAILING)).toBe(attack);
      expect(trim_end_while(attack, TEXT_URL_TRAILING)).toBe(attack);
      expect(trim_end_while(attack, DOMAIN_TRAILING)).toBe(attack);
      expect(trim_end_while(attack, RECEIPT_URL_TRAILING)).toBe(attack);
    }
    expect(performance.now() - started).toBeLessThan(500);
  });
});
