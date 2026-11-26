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
  has_important_suffix,
  important_suffix_start,
  is_empty_content_value,
  strip_css_expressions,
  strip_important_suffix,
  strip_moz_document_rules,
  strip_remote_css_fetches,
  strip_remote_url_calls,
} from "@/lib/html_sanitizer_css";

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

function time_ms(run: () => void): number {
  const started = performance.now();

  run();

  return performance.now() - started;
}

const ATTACK_SIZE = 200_000;

function repeat_to(unit: string, size: number = ATTACK_SIZE): string {
  return unit.repeat(Math.ceil(size / unit.length));
}

const WHITESPACE = [" ", "\t", "\n", "\r", "\u00a0", "\u2028", "\ufeff"];

const OLD_IMPORTANT_SUFFIX = /\s*!\s*important\s*$/i;
const OLD_EMPTY_CONTENT_VALUE =
  /^\s*(?:none|""|''|"\s*"|'\s*')?\s*(?:!\s*important\s*)?$/i;
const OLD_EXPRESSION = /expression\s*\([^)]*\)/gi;
const OLD_MOZ_DOCUMENT = /-moz-document[^;{]*\{[^}]*\}/gi;
const OLD_REMOTE_URL = /url\(\s*(['"]?)(?:https?:)?\/\/[^)]*\1\s*\)/gi;

function old_strip_remote_css_fetches(html: string): string {
  return html
    .replace(OLD_REMOTE_URL, "url()")
    .replace(/(?:-webkit-)?image-set\s*\([^)]*\)/gi, "none")
    .replace(/cross-fade\s*\([^)]*\)/gi, "none")
    .replace(/@import[^;]*;/gi, "");
}

const IMPORTANT_ALPHABET = [
  "!",
  "important",
  "IMPORTANT",
  "importan",
  "none",
  "\"",
  "'",
  "red",
  ";",
  ...WHITESPACE,
];

const IMPORTANT_CASES = [
  "",
  "!important",
  "red !important",
  "red!important ",
  "red ! important\n",
  "red !IMPORTANT",
  "red important",
  "red !importantx",
  "red !! important",
  "\u00a0!\u2028important\ufeff",
  "none",
  "\"\"",
  "' '",
  "\" \" !important",
  "'\"",
  "none none",
  "nonex",
];

describe("important suffix and empty content", () => {
  it("match the old regexes", () => {
    const values = [
      ...IMPORTANT_CASES,
      ...random_strings(IMPORTANT_ALPHABET, 10000, 8, 787),
    ];

    for (const value of values) {
      const old = OLD_IMPORTANT_SUFFIX.exec(value);

      expect(important_suffix_start(value)).toBe(old ? old.index : -1);
      expect(has_important_suffix(value)).toBe(OLD_IMPORTANT_SUFFIX.test(value));
      expect(strip_important_suffix(value)).toBe(
        value.replace(OLD_IMPORTANT_SUFFIX, ""),
      );
      expect(is_empty_content_value(value)).toBe(
        OLD_EMPTY_CONTENT_VALUE.test(value),
      );
    }
  });

  it("stay linear on attack input", () => {
    const attacks = [
      `a${" ".repeat(ATTACK_SIZE)}b`,
      `!${" ".repeat(ATTACK_SIZE)}x`,
      repeat_to(" !"),
      repeat_to("! important "),
      `${" ".repeat(ATTACK_SIZE)}!`,
      `"${" ".repeat(ATTACK_SIZE)}`,
    ];

    for (const attack of attacks) {
      const elapsed = time_ms(() => {
        strip_important_suffix(attack);
        is_empty_content_value(attack);
      });

      expect(elapsed).toBeLessThan(250);
    }
  });
});

const CSS_ALPHABET = [
  "expression",
  "EXPRESSION",
  "-moz-document",
  "-MOZ-DOCUMENT",
  "url(",
  "URL(",
  "http:",
  "https:",
  "//",
  "/",
  "image-set",
  "-webkit-image-set",
  "cross-fade",
  "@import",
  "(",
  ")",
  "{",
  "}",
  ";",
  "'",
  "\"",
  "a",
  " ",
  "\n",
];

const CSS_CASES = [
  "",
  "width: expression(alert(1))",
  "a: expression (1) expression(2)",
  "expression(",
  "-moz-document url-prefix() { a { b } } c",
  "-moz-document x; y { z }",
  "-moz-document x {",
  "-moz-document a -moz-document b { c }",
  "background: url(https://x/y.png)",
  "background: url( 'https://x/y.png' )",
  "background: url(\"//x/y.png\" )",
  "background: url('//x/y.png\" )",
  "background: url('//x/y.png ')",
  "background: url(\"//x\"y\")",
  "background: url(data:x)",
  "url(http://a) url(  //b)",
  "url('https:/x')",
  "url('//')",
  "url(\"//)",
  "url(//a url(//b)",
  "image-set(url(//a) 1x)",
  "-webkit-image-set( a )",
  "cross-fade(a, b)",
  "@import url(//x); a{}",
  "@import 'x'",
];

describe("css call stripping", () => {
  it("matches the old regexes", () => {
    const values = [...CSS_CASES, ...random_strings(CSS_ALPHABET, 12000, 10, 933)];

    for (const value of values) {
      expect(strip_css_expressions(value)).toBe(
        value.replace(OLD_EXPRESSION, ""),
      );
      expect(strip_moz_document_rules(value)).toBe(
        value.replace(OLD_MOZ_DOCUMENT, ""),
      );
      expect(strip_remote_url_calls(value)).toBe(
        value.replace(OLD_REMOTE_URL, "url()"),
      );
      expect(strip_remote_css_fetches(value)).toBe(
        old_strip_remote_css_fetches(value),
      );
    }
  });

  it("stays linear on attack input", () => {
    const attacks = [
      repeat_to("expression("),
      repeat_to("expression "),
      repeat_to("-moz-document "),
      repeat_to("-moz-document{"),
      repeat_to("url(//"),
      repeat_to("url('//"),
      repeat_to("url('//a)"),
      `url("//${" ".repeat(ATTACK_SIZE)})`,
      repeat_to("image-set("),
      repeat_to("cross-fade("),
      repeat_to("@import"),
    ];

    for (const attack of attacks) {
      const elapsed = time_ms(() => {
        strip_css_expressions(attack);
        strip_moz_document_rules(attack);
        strip_remote_css_fetches(attack);
      });

      expect(elapsed).toBeLessThan(250);
    }
  });
});
