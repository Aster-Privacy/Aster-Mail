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

import { sanitize_html } from "./html_sanitizer";
import { neutralize_amp_markup } from "./html_sanitizer_utils";
import { html_to_readable_plain_text } from "./html_text";

const amp_email = `<!doctype html><html ⚡4email data-css-strict><head><meta charset="utf-8"><style amp4email-boilerplate>body{visibility:hidden}</style><script async src="https://cdn.ampproject.org/v0.js"></script><style amp-custom>.es-wrapper { width:100%; } h1 { font-size:30px; color:#023047; }</style></head>
<body><div class="es-wrapper-color"><table class="es-wrapper" width="100%"><tr><td><h1>Verify your email</h1><p style="font-size: 20px;color: #666666"><strong>482915</strong><br></p><amp-img src="cid:pic1" alt="Banner" width="370" height="255" layout="responsive"></amp-img></td></tr></table></div></body></html>`;

describe("neutralize_amp_markup", () => {
  it("removes every AMP boilerplate style variant", () => {
    const out = neutralize_amp_markup(
      `<style amp4email-boilerplate>body{visibility:hidden}</style>` +
        `<style amp-boilerplate>body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both}</style>` +
        `<noscript><style amp-boilerplate>body{-webkit-animation:none}</style></noscript>` +
        `<style amp4ads-boilerplate>body{visibility:hidden}</style>` +
        `<STYLE AMP4EMAIL-BOILERPLATE="">body{visibility:hidden}</STYLE>`,
    );

    expect(out).not.toContain("visibility");
    expect(out).not.toContain("-amp-start");
    expect(out).not.toMatch(/<style/i);
  });

  it("keeps the amp-custom stylesheet", () => {
    const out = neutralize_amp_markup(amp_email);

    expect(out).toContain("<style amp-custom>");
    expect(out).toContain(".es-wrapper");
  });

  it("turns amp-img into a plain image", () => {
    const out = neutralize_amp_markup(
      `<amp-img src="cid:pic1" alt="Banner" width="370" height="255"></amp-img>`,
    );

    expect(out).toBe(`<img src="cid:pic1" alt="Banner" width="370" height="255">`);
  });

  it("leaves ordinary markup and text untouched", () => {
    const plain = `<style>body{color:red}</style><p>amp4email-boilerplate is a style name</p>`;

    expect(neutralize_amp_markup(plain)).toBe(plain);
  });
});

describe("sanitize_html with an AMP email", () => {
  it("does not hide the body in the sandboxed renderer", () => {
    const { html } = sanitize_html(amp_email, { sandbox_mode: true });

    expect(html).not.toContain("visibility:hidden");
    expect(html).not.toContain("visibility: hidden");
    expect(html).toContain("482915");
    expect(html).toContain(".es-wrapper");
    expect(html).not.toContain("cdn.ampproject.org");
  });

  it("keeps the AMP image once it is a plain image", () => {
    const { html } = sanitize_html(amp_email, { sandbox_mode: true });

    expect(html).toMatch(/<img[^>]*alt="Banner"/);
  });

  it("keeps the code in plain text extraction", () => {
    expect(html_to_readable_plain_text(amp_email)).toContain("482915");
  });
});
