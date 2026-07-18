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

import { inline_email_css } from "./forward_css_inliner";
import { sanitize_outgoing_html } from "./html_sanitizer_compose";

const parse = (html: string): Document =>
  new DOMParser().parseFromString(html, "text/html");

describe("inline_email_css", () => {
  it("inlines class rules from head styles onto matching elements", () => {
    const html =
      "<html><head><style>.title { color: red; font-size: 24px; }</style></head>" +
      '<body><p class="title">Receipt</p></body></html>';
    const result = inline_email_css(html);
    const doc = parse(result);
    const p = doc.querySelector("p");

    expect(p).not.toBeNull();
    expect(p!.style.color).toBe("red");
    expect(p!.style.fontSize).toBe("24px");
    expect(result).not.toContain("<style");
  });

  it("inlines styles from style blocks inside the body", () => {
    const html =
      '<div><style>.x { font-weight: bold; }</style><span class="x">hi</span></div>';
    const doc = parse(inline_email_css(html));
    const span = doc.querySelector("span");

    expect(span!.style.fontWeight).toBe("bold");
  });

  it("keeps existing inline styles over sheet rules", () => {
    const html =
      "<style>p { color: blue; }</style>" +
      '<p style="color: green">text</p>';
    const doc = parse(inline_email_css(html));

    expect(doc.querySelector("p")!.style.color).toBe("green");
  });

  it("lets important sheet rules override inline styles", () => {
    const html =
      "<style>p { color: blue !important; }</style>" +
      '<p style="color: green">text</p>';
    const doc = parse(inline_email_css(html));

    expect(doc.querySelector("p")!.style.color).toBe("blue");
  });

  it("respects selector specificity over rule order", () => {
    const html =
      "<style>#main { color: purple; } .box { color: orange; }</style>" +
      '<div id="main" class="box">text</div>';
    const doc = parse(inline_email_css(html));

    expect(doc.querySelector("div")!.style.color).toBe("purple");
  });

  it("applies the later rule when specificity ties", () => {
    const html =
      "<style>.a { color: red; } .b { color: teal; }</style>" +
      '<div class="a b">text</div>';
    const doc = parse(inline_email_css(html));

    expect(doc.querySelector("div")!.style.color).toBe("teal");
  });

  it("moves body styling onto a wrapper div", () => {
    const html =
      '<html><body bgcolor="#f4f4f4" style="margin:0"><p>hi</p></body></html>';
    const result = inline_email_css(html);
    const doc = parse(result);
    const wrapper = doc.body.firstElementChild as HTMLElement;

    expect(wrapper.tagName).toBe("DIV");
    expect(wrapper.style.backgroundColor).toBeTruthy();
    expect(wrapper.style.margin).toBe("0px");
    expect(wrapper.querySelector("p")).not.toBeNull();
  });

  it("applies body selector rules through the wrapper", () => {
    const html =
      "<html><head><style>body { background: #eeeeee; font-family: Arial; }</style></head>" +
      "<body><p>hi</p></body></html>";
    const result = inline_email_css(html);
    const doc = parse(result);
    const wrapper = doc.body.firstElementChild as HTMLElement;

    expect(wrapper.tagName).toBe("DIV");
    expect(wrapper.style.fontFamily).toContain("Arial");
  });

  it("skips media query rules", () => {
    const html =
      "<style>@media (max-width: 600px) { p { color: red; } } p { color: navy; }</style>" +
      "<p>hi</p>";
    const doc = parse(inline_email_css(html));

    expect(doc.querySelector("p")!.style.color).toBe("navy");
  });

  it("removes script, link, and meta elements", () => {
    const html =
      '<html><head><link rel="stylesheet" href="https://x.test/a.css"><meta charset="utf-8"></head>' +
      "<body><script>alert(1)</script><p>hi</p></body></html>";
    const result = inline_email_css(html);

    expect(result).not.toContain("<script");
    expect(result).not.toContain("<link");
    expect(result).not.toContain("<meta");
    expect(result).toContain("<p>hi</p>");
  });

  it("passes through content without styles unchanged in structure", () => {
    const html = "<p>plain <b>content</b></p>";
    const doc = parse(inline_email_css(html));

    expect(doc.querySelector("b")!.textContent).toBe("content");
  });

  it("preserves table attributes and inline styles of typical receipts", () => {
    const html =
      "<style>td { padding: 8px; }</style>" +
      '<table width="600" cellpadding="0"><tr><td>Total: $9.99</td></tr></table>';
    const doc = parse(inline_email_css(html));
    const td = doc.querySelector("td")!;

    expect(td.style.padding).toBe("8px");
    expect(doc.querySelector("table")!.getAttribute("width")).toBe("600");
  });

  it("keeps cid image references intact", () => {
    const html =
      "<style>img { border: 0; }</style>" +
      '<img src="cid:logo123@astermail.org" alt="logo">';
    const result = inline_email_css(html);

    expect(result).toContain('src="cid:logo123@astermail.org"');
  });

  it("returns empty string for empty input", () => {
    expect(inline_email_css("")).toBe("");
  });

  it("does not throw on malformed html", () => {
    expect(() =>
      inline_email_css("<style>.a{color:</style><div class='a'><p>x"),
    ).not.toThrow();
  });

  it("ignores selectors that fail to parse", () => {
    const html =
      "<style>p:hover { color: red; } p { color: black; } weird|selector { color: lime; }</style>" +
      "<p>hi</p>";
    const doc = parse(inline_email_css(html));

    expect(doc.querySelector("p")!.style.color).toBe("black");
  });
});

describe("sanitize_outgoing_html style preservation", () => {
  it("keeps leading style blocks instead of dropping them into head", () => {
    const result = sanitize_outgoing_html(
      "<style>.q { color: red; }</style><p class=\"q\">hi</p>",
    );

    expect(result).toContain(".q { color: red; }");
    expect(result).toContain('<p class="q">hi</p>');
  });

  it("keeps data url image sources", () => {
    const result = sanitize_outgoing_html(
      '<div class="wrap"><img src="data:image/png;base64,iVBORw0KGgo="></div>',
    );

    expect(result).toContain("data:image/png;base64");
  });

  it("still strips event handlers and dangerous hrefs", () => {
    const result = sanitize_outgoing_html(
      '<a href="javascript:alert(1)" onclick="x()">link</a>',
    );

    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("onclick");
  });
});
