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
import { describe, it, expect } from "vitest";

import { sanitize_compose_style } from "./html_sanitizer_css";

describe("sanitize_compose_style display handling", () => {
  it("keeps display block on pasted images", () => {
    const out = sanitize_compose_style(
      "max-width: 100%; height: auto; display: block; margin: 8px 0",
    );

    expect(out).toContain("display: block");
    expect(out).toContain("max-width: 100%");
  });

  it("keeps inline-block and safe vertical-align", () => {
    const out = sanitize_compose_style(
      "display: inline-block; vertical-align: middle",
    );

    expect(out).toContain("display: inline-block");
    expect(out).toContain("vertical-align: middle");
  });

  it("drops display values outside the allowlist", () => {
    expect(sanitize_compose_style("display: none")).toBe("");
    expect(sanitize_compose_style("display: fixed")).toBe("");
    expect(sanitize_compose_style("display: grid")).toBe("");
  });

  it("drops unsafe vertical-align values", () => {
    expect(sanitize_compose_style("vertical-align: -9999px")).toBe("");
  });

  it("still strips dangerous declarations", () => {
    expect(sanitize_compose_style("display: block; position: fixed")).toBe(
      "display: block",
    );
    expect(
      sanitize_compose_style("display: block; background-color: url(x)"),
    ).toBe("display: block");
  });
});
