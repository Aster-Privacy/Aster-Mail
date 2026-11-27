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

import { plain_text_to_html } from "@/lib/html_text";
import {
  convert_plain_quote_html,
  segment_plain_quote_text,
  strip_plain_quote_markers,
} from "@/lib/quoted_history_clean";

function elapsed_ms(run: () => void): number {
  const started = performance.now();

  run();

  return performance.now() - started;
}

function repeat_to(unit: string, size: number): string {
  return unit.repeat(Math.ceil(size / unit.length));
}

const ATTACK_SIZE = 256 * 1024;

const ATTACKS = [
  repeat_to(">", ATTACK_SIZE),
  repeat_to("> ", ATTACK_SIZE),
  repeat_to(">\n", ATTACK_SIZE),
  repeat_to("> >", ATTACK_SIZE),
  repeat_to(">>>>>>>>>>>>>\n", ATTACK_SIZE),
  repeat_to(">\t​", ATTACK_SIZE),
  repeat_to("> a\n>> b\n>>> c\n", ATTACK_SIZE),
  repeat_to(">_<\n", ATTACK_SIZE),
  repeat_to("text\n> q\n\n", ATTACK_SIZE),
];

describe("plain quote parsing stays linear", () => {
  it("segments large hostile input quickly", () => {
    for (const attack of ATTACKS) {
      const ms = elapsed_ms(() => {
        segment_plain_quote_text(attack);
        strip_plain_quote_markers(attack);
      });

      expect(ms, JSON.stringify(attack.slice(0, 12))).toBeLessThan(1500);
    }
  });

  it("renders large quoted text quickly", () => {
    for (const attack of ATTACKS) {
      const sample = attack.slice(0, 64 * 1024);
      const ms = elapsed_ms(() => {
        convert_plain_quote_html(plain_text_to_html(sample));
      });

      expect(ms, JSON.stringify(attack.slice(0, 12))).toBeLessThan(4000);
    }
  });

  it("grows close to linearly with input size", () => {
    const unit = "> a\n>> b\n>\n";
    const small = repeat_to(unit, 32 * 1024);
    const large = repeat_to(unit, 256 * 1024);

    segment_plain_quote_text(small);
    const small_ms = Math.max(
      elapsed_ms(() => segment_plain_quote_text(small)),
      1,
    );
    const large_ms = elapsed_ms(() => segment_plain_quote_text(large));

    expect(large_ms).toBeLessThan(small_ms * 40 + 200);
  });

  it("converts large escaped html quickly", () => {
    const html = `<p>${repeat_to("&gt; line<br>&gt;&gt; deeper<br>", 64 * 1024)}</p>`;
    const ms = elapsed_ms(() => {
      convert_plain_quote_html(html);
    });

    expect(ms).toBeLessThan(6000);
  });

  it("caps nesting depth on long marker runs", () => {
    const html = convert_plain_quote_html(
      plain_text_to_html(`${">".repeat(5000)} deep\n> next`),
    );
    const root = document.createElement("div");

    root.innerHTML = html;
    let depth = 0;
    let node: Element | null = root.querySelector("blockquote");

    while (node) {
      depth += 1;
      node = node.querySelector(":scope > blockquote");
    }

    expect(depth).toBe(8);
  });
});
