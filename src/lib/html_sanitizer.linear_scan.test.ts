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
  append_style_separator,
  degraded_text_html,
  extract_style_blocks,
  match_body_bgcolor_attribute,
  match_body_first_element,
  match_body_style_attribute,
  match_head_block,
  strip_preview_forbidden_tags,
  strip_preview_style_blocks,
  strip_raw_text_blocks,
  strip_raw_text_tail,
} from "@/lib/html_sanitizer";

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

const OLD_STYLE_BLOCK = /<style\b[\s\S]*?<\/style\b[^>]*>/gi;
const OLD_STYLE_TAIL = /<style\b[^>]*>[\s\S]*/gi;
const OLD_SCRIPT_BLOCK = /<script\b[\s\S]*?<\/script\b[^>]*>/gi;
const OLD_SCRIPT_TAIL = /<script\b[^>]*>[\s\S]*/gi;
const OLD_ANY_TAG = /<[^>]*>/g;
const OLD_PREVIEW_FORBIDDEN =
  /<\/?(?:style|script|noscript|template|link|meta|base|iframe|object|embed)\b[^>]*>/gi;
const OLD_PREVIEW_STYLE_BLOCK = /<style[\s\S]*?<\/style\s*>/gi;
const OLD_BODY_STYLE = /<body[^>]*style\s*=\s*["']([^"']*)["']/i;
const OLD_BODY_BGCOLOR = /<body[^>]*bgcolor\s*=\s*["']?([^"'\s>]+)["']?/i;
const OLD_BODY_FIRST_ELEMENT =
  /<body[^>]*>\s*(?:<!--[\s\S]*?-->\s*){0,32}<(table|div|center)\b[^>]*/i;
const OLD_HEAD_BLOCK = /<head[\s>][\s\S]*?<\/head\s*>/i;
const OLD_STYLE_SEPARATOR = /;?\s*$/;

function old_degraded_text_html(html: string): string {
  const text = html
    .replace(OLD_STYLE_BLOCK, " ")
    .replace(OLD_STYLE_TAIL, " ")
    .replace(OLD_SCRIPT_BLOCK, " ")
    .replace(OLD_SCRIPT_TAIL, " ")
    .replace(OLD_ANY_TAG, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function old_extract_style_blocks(html: string) {
  const pattern = /<style([^>]*)>([\s\S]*?)<\/style\s*>/gi;
  const blocks: Array<{ attributes: string; css: string }> = [];

  for (
    let match = pattern.exec(html);
    match !== null;
    match = pattern.exec(html)
  ) {
    blocks.push({ attributes: match[1], css: match[2] });
  }

  return blocks;
}

function same_match(
  actual: RegExpExecArray | null,
  expected: RegExpMatchArray | null,
): void {
  if (expected === null) {
    expect(actual).toBeNull();

    return;
  }

  expect(actual).not.toBeNull();
  expect(actual?.index).toBe(expected.index);
  expect(actual?.[0]).toBe(expected[0]);
  expect(actual?.[1]).toBe(expected[1]);
}

const RAW_TEXT_ALPHABET = [
  "<style",
  "<STYLE",
  "<styles",
  "</style",
  "</style>",
  "<script",
  "</script",
  "</SCRIPT >",
  "<scripts",
  "<",
  ">",
  "/",
  "a",
  "&",
  " ",
  "\n",
  "\u00a0",
];

const RAW_TEXT_CASES = [
  "",
  "plain",
  "<style>a{}</style>text",
  "<style>a{}</style x>text<style>b",
  "<style>never closed",
  "<style>a</style",
  "<style>a</stylex>b</style>c",
  "<script>alert(1)</script>ok",
  "<script src=x>",
  "<b>bold</b> & <i>it</i>",
  "<styles>x</styles>",
  "a<style b>c</style>d<style>e</style>f",
];

describe("degraded text html", () => {
  it("raw text helpers match the old regexes", () => {
    const values = [
      ...RAW_TEXT_CASES,
      ...random_strings(RAW_TEXT_ALPHABET, 8000, 10, 224),
    ];

    for (const value of values) {
      expect(strip_raw_text_blocks(value, "style")).toBe(
        value.replace(OLD_STYLE_BLOCK, " "),
      );
      expect(strip_raw_text_tail(value, "style")).toBe(
        value.replace(OLD_STYLE_TAIL, " "),
      );
      expect(strip_raw_text_blocks(value, "script")).toBe(
        value.replace(OLD_SCRIPT_BLOCK, " "),
      );
      expect(strip_raw_text_tail(value, "script")).toBe(
        value.replace(OLD_SCRIPT_TAIL, " "),
      );
      expect(degraded_text_html(value)).toBe(old_degraded_text_html(value));
    }
  });

  it("stays linear on attack input", () => {
    const attacks = [
      repeat_to("<style"),
      repeat_to("<style>"),
      repeat_to("<script </script"),
      repeat_to("<"),
      `${repeat_to("<style ")}>`,
      `${repeat_to("<")}>`,
      repeat_to("<style></style"),
    ];

    for (const attack of attacks) {
      expect(time_ms(() => degraded_text_html(attack))).toBeLessThan(250);
    }
  });
});

const PREVIEW_ALPHABET = [
  "<style",
  "</style",
  "<script",
  "</iframe",
  "<meta",
  "<metas",
  "<link",
  "<",
  ">",
  "/",
  "a",
  " ",
  "\t",
];

describe("preview stripping", () => {
  it("matches the old regexes", () => {
    const values = [
      "",
      "<style>a</style >b",
      "<styles>a</style>b",
      "<style>a</style x>",
      "<meta x><metas><link>",
      ...random_strings(PREVIEW_ALPHABET, 8000, 10, 267),
    ];

    for (const value of values) {
      expect(strip_preview_forbidden_tags(value)).toBe(
        value.replace(OLD_PREVIEW_FORBIDDEN, ""),
      );
      expect(strip_preview_style_blocks(value)).toBe(
        value.replace(OLD_PREVIEW_STYLE_BLOCK, ""),
      );
    }
  });

  it("stays linear on attack input", () => {
    const attacks = [
      repeat_to("<style"),
      repeat_to("<meta "),
      `${repeat_to("<iframe ")}>`,
      repeat_to("<style></style "),
    ];

    for (const attack of attacks) {
      const elapsed = time_ms(() => {
        strip_preview_forbidden_tags(attack);
        strip_preview_style_blocks(attack);
      });

      expect(elapsed).toBeLessThan(250);
    }
  });
});

const BODY_ALPHABET = [
  "<body",
  "<BODY",
  "<body ",
  " style",
  "style",
  " bgcolor",
  "=",
  "\"",
  "'",
  ">",
  "<",
  "#fff",
  "a",
  ";",
  " ",
  "\n",
];

const BODY_CASES = [
  "",
  "<body style=\"color:red\">",
  "<body style = 'a'><body style=\"b\">",
  "<body x>style=\"a\"",
  "<body style=\"a>b\"",
  "<body style=\"unterminated>",
  "<body a style=x style='y'>",
  "<body bgcolor=#fff>",
  "<body bgcolor = \"#000\" >",
  "<body bgcolor=\">",
  "<body bgcolor=><body bgcolor=red>",
  "<body<body style='a'>",
];

describe("body attribute matches", () => {
  it("match the old regexes", () => {
    const values = [
      ...BODY_CASES,
      ...random_strings(BODY_ALPHABET, 10000, 12, 478),
    ];

    for (const value of values) {
      same_match(match_body_style_attribute(value), value.match(OLD_BODY_STYLE));
      same_match(
        match_body_bgcolor_attribute(value),
        value.match(OLD_BODY_BGCOLOR),
      );
    }
  });

  it("stay linear on attack input", () => {
    const attacks = [
      repeat_to("<body"),
      repeat_to("<body style"),
      repeat_to("<body style= "),
      repeat_to("<body bgcolor= "),
      `<body ${repeat_to("style=")}`,
      `<body ${repeat_to("style ")}>`,
      `${repeat_to("<body style=")}"`,
      `<body style="${"a".repeat(ATTACK_SIZE)}`,
      repeat_to("<body style>"),
    ];

    for (const attack of attacks) {
      const elapsed = time_ms(() => {
        match_body_style_attribute(attack);
        match_body_bgcolor_attribute(attack);
      });

      expect(elapsed).toBeLessThan(250);
    }
  });
});

const FIRST_ELEMENT_ALPHABET = [
  "<body>",
  "<body",
  "<!--",
  "-->",
  "<!-- c -->",
  "<table",
  "<div",
  "<divx",
  "<center",
  "<CENTER",
  "<",
  ">",
  "-",
  "x",
  " ",
  "\n",
];

function comment_chain(count: number): string {
  return "<!--c-->".repeat(count);
}

const FIRST_ELEMENT_CASES = [
  "",
  "<body><table>",
  "<body x><div class=a>",
  "<body>  <!-- a --> <center x",
  "<body><divx>",
  "<body><!-- <table> --><div>",
  "<body><!--a--><!--b-->x<table>",
  "<body><!-- unterminated <table>",
  "<body><!--a<body><table>",
  `<body>${comment_chain(32)}<table>`,
  `<body>${comment_chain(33)}<table>`,
  `<body>${comment_chain(14)}<body><table>`,
  `<body>${comment_chain(14)}x<!--a--><div>`,
  `<body>${comment_chain(31)}<!--x<!--y--><div>`,
  `<body>${comment_chain(12)}<!--x--><body>${comment_chain(2)}<div>`,
  `<body><!--${comment_chain(40)}--><table>`,
  `<body><!--a-->${comment_chain(31)}--><div>`,
  `<body>${comment_chain(30)}<!-- ${"-->".repeat(5)}<table>`,
];

describe("body first element match", () => {
  it("matches the old regex", () => {
    const values = [
      ...FIRST_ELEMENT_CASES,
      ...random_strings(FIRST_ELEMENT_ALPHABET, 10000, 12, 511),
    ];

    for (const value of values) {
      const old = value.match(OLD_BODY_FIRST_ELEMENT);

      expect(match_body_first_element(value)).toBe(old ? old[0] : null);
    }
  });

  it("matches the old regex on long comment chains that reach an element", () => {
    const random = seeded_random(512);
    const pieces = ["<!--c-->", "<!--", "-->", " ", "<body>", "<div", "x"];

    for (let n = 0; n < 1500; n += 1) {
      let value = "<body><!--";
      const length = 20 + Math.floor(random() * 30);

      for (let i = 0; i < length; i += 1) {
        value +=
          random() < 0.7
            ? "<!--c-->"
            : pieces[Math.floor(random() * pieces.length)];
      }
      value += random() < 0.5 ? "--><table>" : "--> <center";

      const old = value.match(OLD_BODY_FIRST_ELEMENT);

      expect(match_body_first_element(value)).toBe(old ? old[0] : null);
    }
  });

  it("stays linear on attack input", () => {
    const attacks = [
      repeat_to("<body>"),
      repeat_to("<body><!--"),
      repeat_to("<body><!---->"),
      `<body>${repeat_to("<!---->")}`,
      `${repeat_to("<body>")}${repeat_to("<!--a-->", 1000)}<table>`,
      repeat_to("<body><!-- --> "),
      `<body>${repeat_to("<!--")}`,
    ];

    for (const attack of attacks) {
      expect(time_ms(() => match_body_first_element(attack))).toBeLessThan(
        250,
      );
    }
  });
});

const HEAD_ALPHABET = [
  "<head",
  "<head>",
  "<HEAD ",
  "<header>",
  "</head",
  "</head>",
  "<style",
  "<style>",
  "</style",
  "</style>",
  "</STYLE >",
  ">",
  "<",
  "a",
  " ",
  "\n",
];

describe("head and style block extraction", () => {
  it("match the old regexes", () => {
    const values = [
      "",
      "<head><style>a{}</style></head>",
      "<header><head x><style m>b</style ></head >",
      "<head\n></head",
      "<style>a</style><style b>c</style>",
      "<style>never",
      "<style x>a</stylex></style>",
      ...random_strings(HEAD_ALPHABET, 10000, 10, 550),
    ];

    for (const value of values) {
      const old_head = value.match(OLD_HEAD_BLOCK);

      expect(match_head_block(value)).toBe(old_head ? old_head[0] : null);
      expect(extract_style_blocks(value)).toEqual(
        old_extract_style_blocks(value),
      );
    }
  });

  it("stay linear on attack input", () => {
    const attacks = [
      repeat_to("<head "),
      repeat_to("<head></head "),
      repeat_to("<style>"),
      repeat_to("<style></style "),
      `<style>${repeat_to("</style")}`,
    ];

    for (const attack of attacks) {
      const elapsed = time_ms(() => {
        match_head_block(attack);
        extract_style_blocks(attack);
      });

      expect(elapsed).toBeLessThan(250);
    }
  });
});

describe("style separator", () => {
  it("matches the old regex", () => {
    const values = [
      "",
      ";",
      " ",
      "a",
      "a;",
      "a; ",
      "a ;",
      "a;;",
      "a; ; ",
      "a\u00a0;\u2028",
      ...random_strings([";", " ", "a", "\n", "\ufeff"], 6000, 10, 1098),
    ];

    for (const value of values) {
      expect(append_style_separator(value)).toBe(
        value.replace(OLD_STYLE_SEPARATOR, "; "),
      );
    }
  });

  it("stays linear on attack input", () => {
    const attack = `a${" ".repeat(ATTACK_SIZE)}b`;

    expect(time_ms(() => append_style_separator(attack))).toBeLessThan(250);
  });
});
