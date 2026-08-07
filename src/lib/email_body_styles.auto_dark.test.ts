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
  build_auto_dark_mode_css,
  LINK_BUTTON_EXCLUDE,
} from "@/lib/email_body_styles";
import { LINK_VISITED_VAR } from "@/lib/email_contrast_repair";

const TEXT = "#e5e5e5";
const LINK = "#60a5fa";
const VISITED = "#c4b5fd";

describe("build_auto_dark_mode_css", () => {
  const css = build_auto_dark_mode_css(TEXT, LINK, VISITED);

  it("never flattens author text colors", () => {
    expect(css).not.toMatch(
      /body\s*\*[^{]*\{[^}]*color:\s*inherit\s*!important/,
    );
  });

  it("declares the inherited ink without important so author rules win", () => {
    expect(css).toContain(
      `html, body { background-color: transparent !important; color: ${TEXT}; }`,
    );
  });

  it("leaves link color non important so an inline repair can win", () => {
    expect(css).toContain(
      `a${LINK_BUTTON_EXCLUDE}, a${LINK_BUTTON_EXCLUDE} * { color: ${LINK}; }`,
    );
    expect(css).not.toContain(`color: ${LINK} !important`);
  });

  it("routes the visited ink through the repair variable", () => {
    expect(css).toContain(
      `color: var(${LINK_VISITED_VAR}, ${VISITED}) !important;`,
    );
  });

  it("keeps button links inheriting their own painted ink", () => {
    expect(css).toContain(
      'a[style*="background" i] *, [bgcolor] > a * { color: inherit !important; }',
    );
  });

  it("writes no text background beyond the translucent span reset", () => {
    const background_rules = css
      .split("\n")
      .filter((line) => /background(-color|-image)?:/.test(line));

    expect(background_rules).toHaveLength(2);
    expect(background_rules[0]).toContain("html, body");
    expect(background_rules[1]).toContain('span[style*="background"]');
  });
});
