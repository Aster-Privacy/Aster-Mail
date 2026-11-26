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
  find_close_tag,
  find_close_tag_end,
  find_conditional_open,
  find_tag_open,
  revealed_open_tail_end,
  sanitize_srcset,
  strip_amp_boilerplate_styles,
  strip_leftover_endif,
  strip_mso_conditionals,
} from "@/lib/html_sanitizer_utils";
import { trim_end_while } from "@/lib/linear_trim";

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

const OLD_TRAILING_COMMAS = /,+$/;
const OLD_REVEALED_OPEN_TAIL = /^\s*(?:<!)?--\s*!?\s*>/;
const OLD_LEFTOVER_ENDIF =
  /\s*<!--(?:\s|-)*<!\[endif\](?:\s|-)*>|\s*<!\[endif\]\s*--\s*>/gi;
const OLD_AMP_BOILERPLATE_STYLE =
  /<style\b[^>]*?\samp(?:4email|4ads)?-boilerplate\b[^>]*>[\s\S]*?<\/style\s*>/gi;

function old_conditional_open(html: string, from: number) {
  const pattern = /<!--\s*\[\s*if\b[^\]]*\]\s*>/gi;

  pattern.lastIndex = from;

  const match = pattern.exec(html);

  return match ? { start: match.index, end: match.index + match[0].length } : null;
}

function old_strip_mso_conditionals(html: string): string {
  if (html.indexOf("[if") === -1 && html.indexOf("[endif]") === -1) return html;

  const pattern = /<!--\s*\[\s*if\b[^\]]*\]\s*>/gi;
  let result = "";
  let cursor = 0;

  for (
    let match = pattern.exec(html);
    match !== null;
    match = pattern.exec(html)
  ) {
    const start = match.index;

    if (start < cursor) continue;

    const after_open = start + match[0].length;
    const revealed = OLD_REVEALED_OPEN_TAIL.exec(html.slice(after_open));

    result += html.slice(cursor, start);

    if (revealed) {
      cursor = after_open + revealed[0].length;
    } else {
      const comment_end = html.indexOf("-->", after_open);

      if (comment_end === -1) {
        cursor = after_open;
        pattern.lastIndex = cursor;
        continue;
      }

      cursor = comment_end + 3;
    }

    pattern.lastIndex = cursor;
  }

  result += html.slice(cursor);

  return result.replace(OLD_LEFTOVER_ENDIF, "");
}

function old_tag_open(html: string, name: string, from: number): number {
  const pattern = new RegExp(`<${name}\\b`, "gi");

  pattern.lastIndex = from;

  const match = pattern.exec(html);

  return match ? match.index : -1;
}

function old_close_tag(html: string, name: string, from: number) {
  const pattern = new RegExp(`</${name}\\s*>`, "gi");

  pattern.lastIndex = from;

  const match = pattern.exec(html);

  return match ? { start: match.index, end: match.index + match[0].length } : null;
}

const MARKUP_ALPHABET = [
  "<!--",
  "-->",
  "<!",
  "--",
  "-",
  "!",
  ">",
  "<",
  "[",
  "]",
  "if",
  "IF",
  "ifx",
  " gte mso 9",
  "<![endif]",
  "<![ENDIF]",
  "endif",
  "x",
  ...WHITESPACE,
];

const CONDITIONAL_CASES = [
  "",
  "<!--[if mso]>a<![endif]-->",
  "<!--[if !mso]><!-->a<!--<![endif]-->",
  "<!-- [ if gte mso 9 ] >x<![endif]-->",
  "<!--[ifmso]>",
  "<!--[if_x]>",
  "<!--[if]>",
  "<!--[if mso]",
  "<!--[if mso] x>",
  "<!--[if mso]]>",
  "<!--<!--[if mso]>",
  "<!--[if a]><!--[if b]>c-->",
  "<!--[if mso]> -- ! >tail",
  "<!--[if mso]><! -- >tail",
  "<!--[if mso]>\u2028<!--\ufeff!\u00a0>",
  "a <!-- - <![endif] -->b",
  "a <![endif] -- >b",
  "a <![endif]-->b <!--<![endif]-->",
  "<!--[if mso]>no close",
  "<!--[if mso]>x<!-- [if y]>",
];

describe("mso conditional scans", () => {
  it("find_conditional_open matches the old regex from every offset", () => {
    const values = [
      ...CONDITIONAL_CASES,
      ...random_strings(MARKUP_ALPHABET, 2500, 12, 246),
    ];

    for (const value of values) {
      for (let from = 0; from <= value.length; from += 1) {
        expect(find_conditional_open(value, from)).toEqual(
          old_conditional_open(value, from),
        );
      }
    }
  });

  it("revealed_open_tail_end matches the old anchored regex", () => {
    const values = [
      ...CONDITIONAL_CASES,
      ...random_strings(MARKUP_ALPHABET, 4000, 8, 247),
    ];

    for (const value of values) {
      for (let from = 0; from <= value.length; from += 1) {
        const old = OLD_REVEALED_OPEN_TAIL.exec(value.slice(from));

        expect(revealed_open_tail_end(value, from)).toBe(
          old ? from + old[0].length : -1,
        );
      }
    }
  });

  it("strip_leftover_endif matches the old replace", () => {
    const values = [
      ...CONDITIONAL_CASES,
      ...random_strings(MARKUP_ALPHABET, 6000, 14, 249),
    ];

    for (const value of values) {
      expect(strip_leftover_endif(value)).toBe(
        value.replace(OLD_LEFTOVER_ENDIF, ""),
      );
    }
  });

  it("strip_mso_conditionals matches the old implementation", () => {
    const values = [
      ...CONDITIONAL_CASES,
      ...random_strings(MARKUP_ALPHABET, 6000, 16, 383),
    ];

    for (const value of values) {
      expect(strip_mso_conditionals(value)).toBe(
        old_strip_mso_conditionals(value),
      );
    }
  });

  it("stays linear on attack input", () => {
    const attacks = [
      repeat_to("<!--[if "),
      repeat_to("<!-- [ if x"),
      repeat_to("<!--[if mso]>"),
      `${repeat_to("<!--[if mso]>")}-->`,
      repeat_to("<!--[if mso]>x-->"),
      `<!--[if mso]>${" ".repeat(ATTACK_SIZE)}x`,
      `<!--[if mso]>--${" ".repeat(ATTACK_SIZE)}!`,
      repeat_to(" <!--"),
      repeat_to(" <!-- -"),
      `${" ".repeat(ATTACK_SIZE)}<![endif]x`,
      repeat_to("<![endif] "),
      repeat_to("<!--<![endif]-"),
    ];

    for (const attack of attacks) {
      const elapsed = time_ms(() => {
        strip_mso_conditionals(attack);
        strip_leftover_endif(attack);
        revealed_open_tail_end(attack, 0);
      });

      expect(elapsed).toBeLessThan(250);
    }
  });
});

const AMP_ALPHABET = [
  "<style",
  "<STYLE",
  "</style",
  "</style>",
  "<styles",
  " amp4email-boilerplate",
  " amp-boilerplate",
  " amp4ads-boilerplate",
  "amp-boilerplate",
  "-boilerplatex",
  "amp",
  "4email",
  ">",
  "<",
  "/",
  "x",
  " ",
  "\n",
];

const AMP_CASES = [
  "",
  "<style amp4email-boilerplate>body{visibility:hidden}</style>",
  "<style amp-boilerplate>a</style >b",
  "<style amp4ads-boilerplate >a</STYLE\n>b",
  "<style amp4email-boilerplatex>a</style>",
  "<styleamp-boilerplate>a</style>",
  "<style\tamp-boilerplate>a",
  "<style amp-boilerplate>a</style",
  "<style x><style amp-boilerplate>a</style>",
  "<style a=b amp-boilerplate=\"\">a</style>b</style>",
  "<style amp-boilerplate>a</style><style amp-boilerplate>b</style>",
];

describe("amp boilerplate styles", () => {
  it("matches the old regex", () => {
    const values = [
      ...AMP_CASES,
      ...random_strings(AMP_ALPHABET, 8000, 10, 335),
    ];

    for (const value of values) {
      expect(strip_amp_boilerplate_styles(value)).toBe(
        value.replace(OLD_AMP_BOILERPLATE_STYLE, ""),
      );
    }
  });

  it("tag scanners match the old regexes", () => {
    const values = random_strings(AMP_ALPHABET, 1500, 8, 336);

    for (const value of values) {
      for (let from = 0; from <= value.length; from += 1) {
        expect(find_tag_open(value, "style", from)).toBe(
          old_tag_open(value, "style", from),
        );
        expect(find_tag_open(value, "/style", from)).toBe(
          old_tag_open(value, "/style", from),
        );
        expect(find_close_tag(value, "style", from)).toEqual(
          old_close_tag(value, "style", from),
        );
        expect(find_close_tag_end(value, "style", from)).toBe(
          old_close_tag(value, "style", from)?.end ?? -1,
        );
      }
    }
  });

  it("stays linear on attack input", () => {
    const attacks = [
      repeat_to("<style "),
      repeat_to("<style amp-boilerplate>"),
      `<style amp-boilerplate>${repeat_to("</style ")}`,
      repeat_to("<style amp4email "),
      `<style${" ".repeat(ATTACK_SIZE)}>`,
      repeat_to("</style   "),
    ];

    for (const attack of attacks) {
      const elapsed = time_ms(() => {
        strip_amp_boilerplate_styles(attack);
        find_close_tag(attack, "style", 0);
      });

      expect(elapsed).toBeLessThan(250);
    }
  });
});

describe("srcset trailing commas", () => {
  it("trim_end_while matches the old regex", () => {
    const values = random_strings([",", "a", " ", ",,"], 4000, 12, 224);

    for (const value of values) {
      expect(trim_end_while(value, (code) => code === 0x2c)).toBe(
        value.replace(OLD_TRAILING_COMMAS, ""),
      );
    }
  });

  it("sanitize_srcset stays linear on a long comma run", () => {
    const attack = `https://example.com/a.png${",".repeat(ATTACK_SIZE)}x 1x`;

    expect(time_ms(() => sanitize_srcset(attack))).toBeLessThan(250);
  });
});
