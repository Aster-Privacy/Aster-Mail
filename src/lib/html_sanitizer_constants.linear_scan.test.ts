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
  TRACKING_PIXEL_PATTERNS,
  TRACKING_PIXEL_URL_PATTERNS,
  replace_up_to_last,
} from "@/lib/html_sanitizer_constants";

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

const OLD_WIDTH =
  /(?:^|[;{\s])width\s*[:=]\s*["']?[01](?!\d)\s*(?:px)?\s*(?:;|$|["'])/i;
const OLD_HEIGHT =
  /(?:^|[;{\s])height\s*[:=]\s*["']?[01](?!\d)\s*(?:px)?\s*(?:;|$|["'])/i;

const OLD_URL_PATTERNS: Array<[number, RegExp]> = [
  [8, /(?:^|[./])mailchimp\.com.*\/track/i],
  [9, /(?:^|[./])list-manage\.com.*\/track/i],
  [10, /(?:^|[./])sendgrid\.net.*\/wf\//i],
  [11, /(?:^|[./])amazonses\.com\/(?:[^?#]*\/)?(?:open|track)(?:[/?.]|$)/i],
  [13, /(?:^|[./])mailgun\.org.*\/o\//i],
];

const DIMENSION_CASES = [
  "",
  "width:1",
  "width:0",
  "width:10",
  "width: 1px",
  "WIDTH = '1'",
  'width="0"',
  "width:1 px;",
  "width:1px ;",
  "width:1pxx",
  "width:1 x",
  "x width:1",
  "xwidth:1",
  ";width:1",
  "{width:1}",
  "\u00a0width\u2028:\ufeff1",
  "max-width:1",
  "width::1",
  "width:'1",
  "width:''1",
  "height:1;",
  "height:01",
  "style=\"width:0;height:0\"",
  "width:1\n",
  "width:1 px x",
];

const URL_CASES = [
  "",
  "https://mailchimp.com/track",
  "https://us1.mailchimp.com/x/track",
  "https://notmailchimp.com/track",
  "mailchimp.com\n/track",
  "mailchimp.com\u2028/track",
  "mailchimp.com/x\r\nmailchimp.com/track",
  "mailchimp.commailchimp.com/track",
  "/mailchimp.com/TRACK",
  "https://x.list-manage.com/track/open",
  "sendgrid.net/wf/open",
  "sendgrid.net/w/f/",
  "mailgun.org/o/",
  "mailgun.org/x/o/x",
  "amazonses.com/open",
  "amazonses.com/track",
  "amazonses.com/opener",
  "amazonses.com/open.gif",
  "amazonses.com/a/b/open?x",
  "amazonses.com/a/b?/open",
  "amazonses.com/a#/open",
  "amazonses.com/a/b/track/",
  "x.amazonses.com/a/opentrack",
  "amazonses.com/amazonses.com/open",
  "amazonses.com/x?amazonses.com/open",
  "amazonses.com//open",
  "AMAZONSES.COM/OPEN",
  "xamazonses.com/open",
];

describe("tracking pixel dimension patterns", () => {
  const check = (value: string) => {
    expect(TRACKING_PIXEL_PATTERNS[0].test(value)).toBe(OLD_WIDTH.test(value));
    expect(TRACKING_PIXEL_PATTERNS[1].test(value)).toBe(
      OLD_HEIGHT.test(value),
    );
  };

  it("matches the old regexes on edge cases", () => {
    for (const value of DIMENSION_CASES) check(value);
  });

  it("matches the old regexes on seeded random input", () => {
    const alphabet = [
      "width",
      "height",
      "WIDTH",
      ":",
      "=",
      "0",
      "1",
      "2",
      "px",
      "p",
      ";",
      "{",
      "'",
      '"',
      "x",
      "-",
      ...WHITESPACE,
    ];

    for (const value of random_strings(alphabet, 6000, 14, 263)) {
      check(value);
    }
  });

  it("stays linear on attack input", () => {
    const attacks = [
      repeat_to(" width:"),
      repeat_to("width:1 "),
      `width:${" ".repeat(ATTACK_SIZE)}`,
      `;width:1${" ".repeat(ATTACK_SIZE)}x`,
      repeat_to("height = 1 px "),
    ];

    for (const attack of attacks) {
      const elapsed = time_ms(() => {
        TRACKING_PIXEL_PATTERNS[0].test(attack);
        TRACKING_PIXEL_PATTERNS[1].test(attack);
      });

      expect(elapsed).toBeLessThan(250);
    }
  });
});

describe("tracking pixel url patterns", () => {
  const check = (value: string) => {
    for (const [index, old] of OLD_URL_PATTERNS) {
      expect(TRACKING_PIXEL_URL_PATTERNS[index].test(value)).toBe(
        old.test(value),
      );
    }
  };

  it("matches the old regexes on edge cases", () => {
    for (const value of URL_CASES) check(value);
  });

  it("matches the old regexes on seeded random input", () => {
    const alphabet = [
      "mailchimp.com",
      "list-manage.com",
      "sendgrid.net",
      "mailgun.org",
      "amazonses.com/",
      "AmazonSES.com",
      "/track",
      "/wf/",
      "/o/",
      "open",
      "track",
      "/",
      ".",
      "?",
      "#",
      "x",
      "\n",
      "\u2029",
      " ",
    ];

    for (const value of random_strings(alphabet, 8000, 10, 276)) {
      check(value);
    }
  });

  it("stays linear on attack input", () => {
    const attacks = [
      repeat_to("mailchimp.com"),
      repeat_to("/list-manage.com/"),
      repeat_to(".sendgrid.net/w"),
      repeat_to("/mailgun.org/o"),
      repeat_to(".amazonses.com/a/"),
      `amazonses.com/${"/".repeat(ATTACK_SIZE)}x`,
      repeat_to("amazonses.com/amazonses.com/"),
    ];

    for (const attack of attacks) {
      const elapsed = time_ms(() => {
        for (const [index] of OLD_URL_PATTERNS) {
          TRACKING_PIXEL_URL_PATTERNS[index].test(attack);
        }
      });

      expect(elapsed).toBeLessThan(250);
    }
  });
});

describe("replace_up_to_last", () => {
  it("matches a plain replace for patterns that end in the terminator", () => {
    const alphabet = ["<", ">", "a", " ", "/"];

    for (const value of random_strings(alphabet, 4000, 16, 93)) {
      expect(replace_up_to_last(value, ">", /<[^>]*>/g, " ")).toBe(
        value.replace(/<[^>]*>/g, " "),
      );
    }
  });
});
