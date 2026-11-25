//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, expect, it } from "vitest";

import { sanitize_html } from "@/lib/html_sanitizer";
import { html_to_preview_text, strip_html_tags } from "@/lib/html_text";
import { build_body_preview } from "@/utils/preview_text";

const SIZE = 200_000;

function elapsed_ms(run: () => void): number {
  const started = performance.now();

  run();

  return performance.now() - started;
}

const unclosed_inputs: Array<[string, string]> = [
  ["bare open brackets", "<".repeat(SIZE)],
  ["open brackets with text", "<a ".repeat(SIZE / 3)],
  ["embed openers", "<embed ".repeat(SIZE / 7)],
  ["base openers", "<base ".repeat(SIZE / 6)],
  ["form openers", "<form ".repeat(SIZE / 6)],
  ["meta refresh openers", '<meta http-equiv="refresh" '.repeat(SIZE / 27)],
  ["link preload openers", '<link rel="preload" '.repeat(SIZE / 20)],
  ["head openers", "<head ".repeat(SIZE / 6)],
  ["style openers", "<style ".repeat(SIZE / 7)],
  ["title openers", "<title ".repeat(SIZE / 7)],
  ["font face blocks", `<style>${"@font-face {".repeat(SIZE / 12)}</style>`],
  ["comment openers", "<!--".repeat(SIZE / 4)],
];

describe("mail text passes on unterminated markup", () => {
  it.each(unclosed_inputs)("previews %s in linear time", (_label, html) => {
    expect(elapsed_ms(() => strip_html_tags(html))).toBeLessThan(1500);
    expect(elapsed_ms(() => html_to_preview_text(html, 200))).toBeLessThan(
      1500,
    );
    expect(elapsed_ms(() => build_body_preview("", html))).toBeLessThan(1500);
  });

  it.each(unclosed_inputs)("sanitizes %s in linear time", (_label, html) => {
    expect(
      elapsed_ms(() =>
        sanitize_html(html, {
          external_content_mode: "never",
          sandbox_mode: true,
        }),
      ),
    ).toBeLessThan(4000);
  });
});
