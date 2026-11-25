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

import { strip_secure_footer } from "./send_queue_execute";

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

const OLD_SECURE_FOOTER =
  /<br\s*\/?>\s*<br\s*\/?>\s*.*?<a\s[^>]*href="https:\/\/astermail\.org"[^>]*>.*?<\/a>/gi;

const LINK = '<a href="https://astermail.org">Aster</a>';

const ALPHABET = [
  "<br>",
  "<BR/>",
  "<br />",
  "<br",
  "/",
  "\n",
  "\r",
  "\u2028",
  " ",
  "<a ",
  "<A\t",
  "<a",
  'href="https://astermail.org"',
  'HREF="HTTPS://ASTERMAIL.ORG"',
  'href="https://astermail.org/x"',
  ">",
  "</a>",
  "</A>",
  "x",
  "<",
];

const CASES = [
  "",
  `text<br><br>${LINK}`,
  `text<br><br>Secured by ${LINK} more`,
  `text<br>\n<br/>\n Secured ${LINK}`,
  `text<br><br>Sec\nured ${LINK}`,
  `text<br><br>${LINK.replace("Aster", "As\nter")}`,
  `text<br><br><a\nclass="x"\nhref="https://astermail.org"\n>Aster</a>`,
  `<br><br><br>${LINK}`,
  `<br><br>${LINK}<br><br>${LINK}`,
  `<br><br><a href="https://astermail.org/x">a</a>`,
  `<br><br><a title=">" href="https://astermail.org">a</a>`,
  `<br><br><a href="https://astermail.org">a`,
  `<br><br><a x>${LINK}`,
  `<BR /><Br>${LINK.toUpperCase()}`,
];

describe("strip_secure_footer", () => {
  it("matches the old pattern on edge cases", () => {
    for (const value of CASES) {
      expect(strip_secure_footer(value), value).toBe(
        value.replace(OLD_SECURE_FOOTER, ""),
      );
    }
  });

  it("matches the old pattern on random input", () => {
    for (const value of random_strings(ALPHABET, 10000, 10, 141)) {
      expect(strip_secure_footer(value), JSON.stringify(value)).toBe(
        value.replace(OLD_SECURE_FOOTER, ""),
      );
    }
  });

  it("stays linear on adversarial bodies", () => {
    const inputs = [
      repeat_to("<br><br>", ATTACK_SIZE),
      repeat_to("<br><br><a ", ATTACK_SIZE),
      "<br><br>" + repeat_to('<a href="https://astermail.org">', ATTACK_SIZE),
      repeat_to("<br><br>" + LINK.slice(0, -4), ATTACK_SIZE),
      "<br>" + " ".repeat(ATTACK_SIZE),
    ];

    for (const value of inputs) {
      expect(elapsed_ms(() => strip_secure_footer(value))).toBeLessThan(500);
    }
  });
});
