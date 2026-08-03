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
import { apply_compose_paste_dom_rules } from "./html_sanitizer_compose";

describe("sanitize_compose_style signature paste fidelity", () => {
  it("keeps border-radius so circular logos stay circular", () => {
    const out = sanitize_compose_style(
      "width: 80px; height: 80px; border-radius: 50%",
    );

    expect(out).toContain("border-radius: 50%");
    expect(out).toContain("width: 80px");
    expect(out).toContain("height: 80px");
  });

  it("keeps corner radius longhands", () => {
    const out = sanitize_compose_style(
      "border-top-left-radius: 8px; border-bottom-right-radius: 8px",
    );

    expect(out).toContain("border-top-left-radius: 8px");
    expect(out).toContain("border-bottom-right-radius: 8px");
  });

  it("keeps padding shorthand and longhands", () => {
    const out = sanitize_compose_style(
      "padding: 10px 16px; padding-top: 4px; padding-right: 8px; padding-bottom: 4px",
    );

    expect(out).toContain("padding: 10px 16px");
    expect(out).toContain("padding-top: 4px");
    expect(out).toContain("padding-right: 8px");
    expect(out).toContain("padding-bottom: 4px");
  });

  it("keeps margin longhands", () => {
    const out = sanitize_compose_style(
      "margin-top: 12px; margin-bottom: 12px; margin-left: 0; margin-right: 0",
    );

    expect(out).toContain("margin-top: 12px");
    expect(out).toContain("margin-bottom: 12px");
    expect(out).toContain("margin-left: 0");
    expect(out).toContain("margin-right: 0");
  });

  it("keeps borders and table border model properties", () => {
    const out = sanitize_compose_style(
      "border: 1px solid #ddd; border-top: 2px solid #333; border-collapse: collapse; border-spacing: 0",
    );

    expect(out).toContain("border: 1px solid #ddd");
    expect(out).toContain("border-top: 2px solid #333");
    expect(out).toContain("border-collapse: collapse");
    expect(out).toContain("border-spacing: 0");
  });

  it("keeps typography properties used by signature generators", () => {
    const out = sanitize_compose_style(
      "font-family: Arial, sans-serif; letter-spacing: 2px; text-transform: uppercase; white-space: nowrap",
    );

    expect(out).toContain("font-family: Arial, sans-serif");
    expect(out).toContain("letter-spacing: 2px");
    expect(out).toContain("text-transform: uppercase");
    expect(out).toContain("white-space: nowrap");
  });

  it("keeps table display values", () => {
    expect(sanitize_compose_style("display: table")).toBe("display: table");
    expect(sanitize_compose_style("display: table-cell")).toBe(
      "display: table-cell",
    );
    expect(sanitize_compose_style("display: table-row")).toBe(
      "display: table-row",
    );
  });

  it("keeps layout helpers", () => {
    const out = sanitize_compose_style(
      "float: left; clear: both; min-width: 40px; max-height: 120px; table-layout: fixed; object-fit: cover; vertical-align: middle",
    );

    expect(out).toContain("float: left");
    expect(out).toContain("clear: both");
    expect(out).toContain("min-width: 40px");
    expect(out).toContain("max-height: 120px");
    expect(out).toContain("table-layout: fixed");
    expect(out).toContain("object-fit: cover");
    expect(out).toContain("vertical-align: middle");
  });

  it("still drops non-allowlisted and dangerous declarations", () => {
    expect(sanitize_compose_style("position: fixed")).toBe("");
    expect(sanitize_compose_style("position: absolute")).toBe("");
    expect(sanitize_compose_style("display: none")).toBe("");
    expect(sanitize_compose_style("display: flex")).toBe("");
    expect(sanitize_compose_style("behavior: url(evil.htc)")).toBe("");
    expect(sanitize_compose_style("background-image: url(https://x/y.png)")).toBe(
      "",
    );
    expect(
      sanitize_compose_style("border-radius: expression(alert(1))"),
    ).toBe("");
    expect(sanitize_compose_style("padding: url(https://x)")).toBe("");
    expect(sanitize_compose_style("content: 'x'")).toBe("");
    expect(sanitize_compose_style("z-index: 9999")).toBe("");
    expect(sanitize_compose_style("opacity: 0")).toBe("");
  });

  it("drops url values inside otherwise allowed properties", () => {
    expect(
      sanitize_compose_style("background-color: url(javascript:alert(1))"),
    ).toBe("");
    expect(sanitize_compose_style("font-family: url(https://x)")).toBe("");
  });
});

describe("compose paste dom rules for legacy font elements", () => {
  it("converts font color, face, and size to a styled span", () => {
    const out = apply_compose_paste_dom_rules(
      '<font color="#336699" face="Georgia" size="4">Jane Doe</font>',
    );

    expect(out).not.toContain("<font");
    expect(out).toContain("<span");
    expect(out).toContain("color: #336699");
    expect(out).toContain("font-family: Georgia");
    expect(out).toContain("font-size: 18px");
    expect(out).toContain("Jane Doe");
  });

  it("keeps font element text when attributes are unsafe", () => {
    const out = apply_compose_paste_dom_rules(
      '<font color="red;position:fixed" face="x{}: bad">Name</font>',
    );

    expect(out).not.toContain("<font");
    expect(out).not.toContain("position");
    expect(out).toContain("Name");
  });

  it("keeps signature markup with inline radius on images", () => {
    const out = apply_compose_paste_dom_rules(
      '<div><img src="https://cdn.example.com/logo.png" width="72" height="72" style="border-radius:50%;width:72px;height:72px" alt="logo"></div>',
    );

    expect(out).toContain("border-radius: 50%");
    expect(out).toContain('alt="logo"');
  });

  it("strips dangerous inline handlers and hrefs in the dom pass", () => {
    const out = apply_compose_paste_dom_rules(
      '<a href="javascript:alert(1)">x</a><img src="data:image/svg+xml;base64,PHN2Zz4=">',
    );

    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("<img");
  });
});
