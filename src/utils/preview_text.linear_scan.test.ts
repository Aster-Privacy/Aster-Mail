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

import { find_paired_elements } from "@/lib/html_text";
import {
  collect_css_rules,
  strip_hidden_elements,
  strip_html_comments,
} from "@/utils/preview_text";

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

const OLD_CSS_RULE = /([^{}]+)\{([^{}]*)\}/g;
const OLD_STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const OLD_COMMENT = /<!--[\s\S]*?-->/g;
const OLD_HIDDEN_ELEMENT = /<(style|script|head|title)\b[^>]*>[\s\S]*?<\/\1>/gi;

function old_rules(css: string): { selector: string; declarations: string }[] {
  return Array.from(css.matchAll(OLD_CSS_RULE), (rule) => ({
    selector: rule[1] ?? "",
    declarations: rule[2] ?? "",
  }));
}

function old_style_contents(html: string): string[] {
  return Array.from(html.matchAll(OLD_STYLE_BLOCK), (block) => block[1] ?? "");
}

function new_style_contents(html: string): string[] {
  return find_paired_elements(html, ["style"], {
    word_boundary: true,
    open_tag: true,
  }).map((match) => html.slice(match.content_start, match.content_end));
}

const CSS_ALPHABET = ["{", "}", "a", ".x", " ", ";", "color:red", "\n", ","];

const COMMENT_ALPHABET = ["<!--", "-->", "--", "-", ">", "<", "!", "a", "\n"];

const ELEMENT_ALPHABET = [
  "<style",
  "<STYLE",
  "<script",
  "<head",
  "<title",
  "<styles",
  "<style-x",
  ">",
  "</style>",
  "</STYLE>",
  "</script>",
  "</head>",
  "</title>",
  "</styles>",
  "</style >",
  "a",
  " ",
  "\n",
  "<",
  "/",
];

const ELEMENT_CASES = [
  "",
  "<style>a</style>",
  "<STYLE>a</style>",
  "<style>a</STYLE>",
  "<style type=x>a</style>b",
  "<styles>a</styles>",
  "<style>a",
  "<style>a</script>",
  "<script>a</script><style>b</style>c",
  "<head><title>x</title></head>body",
  "<style>a</style></style>",
  "<style<style>x</style>",
  "<title>a</TITLE>",
];

describe("collect_css_rules", () => {
  it("matches the old pattern", () => {
    const cases = ["", "a{b}", "a{b}{c}", "{b}", "a{", "a}b{c}", "a,b{c:d}e{f}"];

    for (const value of cases) {
      expect(collect_css_rules(value), value).toEqual(old_rules(value));
    }
    for (const value of random_strings(CSS_ALPHABET, 4000, 14, 21)) {
      expect(collect_css_rules(value), JSON.stringify(value)).toEqual(
        old_rules(value),
      );
    }
  });

  it("stays linear on css with no braces", () => {
    const attack = "a".repeat(ATTACK_SIZE);

    expect(elapsed_ms(() => collect_css_rules(attack))).toBeLessThan(500);
  });

  it("stays linear on unclosed rules", () => {
    const attack = repeat_to("a{", ATTACK_SIZE);

    expect(elapsed_ms(() => collect_css_rules(attack))).toBeLessThan(500);
  });
});

describe("style block contents", () => {
  it("matches the old pattern", () => {
    for (const value of ELEMENT_CASES) {
      expect(new_style_contents(value), value).toEqual(old_style_contents(value));
    }
    for (const value of random_strings(ELEMENT_ALPHABET, 4000, 12, 22)) {
      expect(new_style_contents(value), JSON.stringify(value)).toEqual(
        old_style_contents(value),
      );
    }
  });

  it("stays linear on unclosed style blocks", () => {
    const attack = repeat_to("<style>", ATTACK_SIZE);

    expect(elapsed_ms(() => new_style_contents(attack))).toBeLessThan(500);
  });
});

describe("strip_html_comments", () => {
  it("matches the old pattern", () => {
    const cases = ["", "<!---->", "a<!--b-->c", "<!--", "<!-- a --> b <!--", "<!--->"];

    for (const value of cases) {
      expect(strip_html_comments(value), value).toBe(value.replace(OLD_COMMENT, ""));
    }
    for (const value of random_strings(COMMENT_ALPHABET, 4000, 14, 23)) {
      expect(strip_html_comments(value), JSON.stringify(value)).toBe(
        value.replace(OLD_COMMENT, ""),
      );
    }
  });

  it("stays linear on unclosed comments", () => {
    const attack = repeat_to("<!--", ATTACK_SIZE);

    expect(elapsed_ms(() => strip_html_comments(attack))).toBeLessThan(500);
  });
});

describe("strip_hidden_elements", () => {
  it("matches the old pattern", () => {
    for (const value of ELEMENT_CASES) {
      expect(strip_hidden_elements(value), value).toBe(
        value.replace(OLD_HIDDEN_ELEMENT, ""),
      );
    }
    for (const value of random_strings(ELEMENT_ALPHABET, 4000, 12, 24)) {
      expect(strip_hidden_elements(value), JSON.stringify(value)).toBe(
        value.replace(OLD_HIDDEN_ELEMENT, ""),
      );
    }
  });

  it("stays linear on unclosed elements", () => {
    const attack = repeat_to("<title>", ATTACK_SIZE);
    const unterminated = repeat_to("<script", ATTACK_SIZE);

    expect(elapsed_ms(() => strip_hidden_elements(attack))).toBeLessThan(500);
    expect(elapsed_ms(() => strip_hidden_elements(unterminated))).toBeLessThan(
      500,
    );
  });
});
