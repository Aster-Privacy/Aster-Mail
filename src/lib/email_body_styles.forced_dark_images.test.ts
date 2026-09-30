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

import { build_forced_dark_mode_css } from "@/lib/email_body_styles";

describe("build_forced_dark_mode_css background images", () => {
  const css = build_forced_dark_mode_css();

  it("never blanks a background image the sender declared inline", () => {
    const reset_rule = css
      .split(String.fromCharCode(10))
      .filter((line) => line.includes("background-image: none"));

    expect(reset_rule.length).toBeGreaterThan(0);
  });

  it("excludes every container that paints its own image", () => {
    const block = css.slice(0, css.indexOf("background-image: none"));

    expect(block).toContain(':not([style*="background-image" i])');
    expect(block).toContain(':not([style*="url(" i])');
    expect(block).toContain(":not([background])");
  });

  it("still flattens plain container backgrounds", () => {
    expect(css).toContain("background-color: transparent !important;");
  });
});
