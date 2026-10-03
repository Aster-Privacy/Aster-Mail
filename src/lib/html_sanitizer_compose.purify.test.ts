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
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";

import { purify_outgoing_html } from "./html_sanitizer_compose";

function parse_body(html: string): HTMLElement {
  return new DOMParser().parseFromString(html, "text/html").body;
}

describe("purify_outgoing_html", () => {
  it("returns an empty string for empty input", () => {
    expect(purify_outgoing_html("")).toBe("");
  });

  it("keeps the markup a composed message relies on", () => {
    const html =
      '<div dir="auto" style="font-family: Arial;">Hi <a href="https://example.com/" target="_blank" rel="noopener noreferrer">x</a></div>' +
      '<div data-aster-signature="true" data-aster-signature-id="sig_1"><table><tbody><tr><td>Sig</td></tr></tbody></table></div>' +
      '<img src="cid:logo@example.com" data-filename="logo.png">' +
      '<a href="mailto:a@b.com">m</a><a href="tel:+15550100">t</a>';

    expect(purify_outgoing_html(html)).toBe(parse_body(html).innerHTML);
  });

  it("keeps pasted data images so they can become attachments", () => {
    const src = "data:image/png;base64,iVBORw0KGgo=";
    const body = parse_body(purify_outgoing_html(`<img src="${src}">`));

    expect(body.querySelector("img")?.getAttribute("src")).toBe(src);
  });

  it.each([
    ["script", "<script>alert(1)</script><p>ok</p>"],
    ["event handler", '<img src="x" onerror="alert(1)">'],
    ["script url", '<a href="javascript:alert(1)">x</a>'],
    [
      "html data url",
      '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    ],
    [
      "svg handler",
      '<svg><animate onbegin="alert(1)" attributeName="x"></animate></svg>',
    ],
    ["iframe", '<iframe srcdoc="<b>x</b>"></iframe>'],
    ["object", '<object data="x.swf"></object><embed src="x">'],
    [
      "mxss",
      "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)></style></mglyph></table></mtext></math>",
    ],
    [
      "noscript",
      '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
    ],
  ])("removes %s", (_name, html) => {
    const body = parse_body(purify_outgoing_html(html));

    expect(
      body.querySelector("script, iframe, object, embed, animate"),
    ).toBeNull();
    for (const el of Array.from(body.querySelectorAll("*"))) {
      for (const attr of Array.from(el.attributes)) {
        expect(attr.name).not.toMatch(/^on/i);
        expect(attr.value).not.toMatch(/^\s*(javascript|data:text)/i);
      }
    }
  });
});
