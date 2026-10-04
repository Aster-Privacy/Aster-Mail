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
import { describe, it, expect } from "vitest";

import {
  sanitize_css_block,
  strip_dark_mode_media,
} from "./html_sanitizer_css";

const BASE = ".text{color:#222222}";

function squash(css: string): string {
  return css.replace(/\s+/g, " ").trim();
}

describe("strip_dark_mode_media", () => {
  it.each([
    "@media (prefers-color-scheme: dark)",
    "@media screen and (prefers-color-scheme: dark)",
    "@media only screen and (prefers-color-scheme: dark)",
    "@MEDIA SCREEN AND (PREFERS-COLOR-SCHEME: DARK)",
    "@media   screen\n  and\t( prefers-color-scheme :  dark )",
    "@media all and (prefers-color-scheme:dark) and (max-width: 600px)",
    "@media (prefers-color-scheme: dark), screen and (prefers-color-scheme: dark)",
    "@media only all and (prefers-color-scheme: dark)",
    "@media ((prefers-color-scheme: dark))",
  ])("drops the dark block for %s", (prelude) => {
    const out = strip_dark_mode_media(
      `${BASE}${prelude}{.text{color:#f5f5f5 !important}}`,
    );

    expect(out).not.toContain("#f5f5f5");
    expect(out).not.toMatch(/prefers-color-scheme/i);
    expect(out).toContain(BASE);
  });

  it("drops only the dark query from a list that also targets other conditions", () => {
    const out = strip_dark_mode_media(
      "@media screen and (max-width: 600px), screen and (prefers-color-scheme: dark){.text{font-size:18px}}",
    );

    expect(squash(out)).toBe(
      "@media screen and (max-width: 600px) {.text{font-size:18px}}",
    );
  });

  it("keeps the remaining queries in order when the dark query comes first", () => {
    const out = strip_dark_mode_media(
      "@media (prefers-color-scheme: dark), print, (max-width: 480px){.text{color:#000}}",
    );

    expect(squash(out)).toBe(
      "@media print, (max-width: 480px) {.text{color:#000}}",
    );
  });

  it("keeps negated dark queries, which only apply outside dark mode", () => {
    const negated = [
      "@media not all and (prefers-color-scheme: dark){.text{color:#111}}",
      "@media (not (prefers-color-scheme: dark)){.text{color:#111}}",
    ];

    for (const css of negated) {
      expect(strip_dark_mode_media(css)).toBe(css);
    }
  });

  it("keeps light scheme blocks and unrelated media queries", () => {
    const css = [
      "@media (prefers-color-scheme: light){.text{color:#111}}",
      "@media screen and (prefers-color-scheme: light){.text{color:#121212}}",
      "@media only screen and (max-width: 600px){.text{font-size:16px}}",
      "@media print{.text{color:#000}}",
    ].join("");

    expect(strip_dark_mode_media(css)).toBe(css);
  });

  it("removes the whole dark block when its rules contain nested braces", () => {
    const css = `${BASE}@media screen and (prefers-color-scheme: dark){@supports (display:grid){.grid{color:#eeeeee}}.text{color:#f5f5f5}}.after{color:#333333}`;
    const out = strip_dark_mode_media(css);

    expect(out).toBe(`${BASE}.after{color:#333333}`);
  });

  it("removes a dark block nested inside an unrelated media query", () => {
    const css =
      "@media screen and (max-width: 600px){.text{font-size:16px}@media screen and (prefers-color-scheme: dark){.text{color:#f5f5f5}}.after{color:#333333}}";
    const out = strip_dark_mode_media(css);

    expect(out).toBe(
      "@media screen and (max-width: 600px){.text{font-size:16px}.after{color:#333333}}",
    );
  });

  it("strips several dark blocks in one stylesheet", () => {
    const css =
      "@media screen and (prefers-color-scheme: dark){.a{color:#f1f1f1}}.keep{color:#333333}@media only screen and (prefers-color-scheme: dark){.b{color:#f2f2f2}}";

    expect(strip_dark_mode_media(css)).toBe(".keep{color:#333333}");
  });

  it("leaves a stylesheet without media queries untouched", () => {
    expect(strip_dark_mode_media(BASE)).toBe(BASE);
  });
});

describe("dark media queries in sanitized email styles", () => {
  it("drops an email's screen-qualified dark text rule", () => {
    const out = sanitize_css_block(
      "body{background:#ffffff;color:#222222}@media screen and (prefers-color-scheme: dark){body,p{color:#f5f5f5 !important}}",
      true,
    );

    expect(out).toContain("color:#222222");
    expect(out).not.toContain("#f5f5f5");
  });

  it("drops a dark block hidden behind a comment in the prelude", () => {
    const out = sanitize_css_block(
      "@media only screen /* x */ and (prefers-color-scheme: dark){p{color:#f5f5f5}}",
      true,
    );

    expect(out).not.toContain("#f5f5f5");
  });
});
