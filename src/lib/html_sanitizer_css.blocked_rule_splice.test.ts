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

import { sanitize_css_block } from "./html_sanitizer_css";

describe("sanitize_css_block blocked rules cannot be spliced back together", () => {
  it("drops an import assembled around a removed dark media block", () => {
    const out = sanitize_css_block(
      '@imp@media (prefers-color-scheme:dark){}ort "https://collector.example/x.css";p{color:red}',
    );

    expect(out.toLowerCase()).not.toContain("@import");
    expect(out).not.toContain("collector.example");
    expect(out).toContain("p{color:red}");
  });

  it("drops an import assembled around a removed import", () => {
    const out = sanitize_css_block(
      '@imp@import "a.css";ort "https://collector.example/y.css";p{color:red}',
    );

    expect(out.toLowerCase()).not.toContain("@import");
    expect(out).not.toContain("collector.example");
  });

  it("drops an expression assembled around a removed rule", () => {
    const out = sanitize_css_block(
      "p{width:expre@charset x;ssion(alert(1))}",
    );

    expect(out.toLowerCase()).not.toContain("expression");
  });

  it("returns nothing when the splices nest deeper than the pass limit", () => {
    let piece = "@import a;";

    for (let depth = 0; depth < 20; depth++) {
      piece = `@imp${piece}ort a;`;
    }
    const out = sanitize_css_block(
      `@imp${piece}ort "https://collector.example/z.css";p{color:red}`,
    );

    expect(out).toBe("");
  });

  it("leaves ordinary style sheets unchanged", () => {
    const css = "p{color:red}@media (min-width:600px){a{color:blue}}";

    expect(sanitize_css_block(css)).toBe(css);
  });
});
