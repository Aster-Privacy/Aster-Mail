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

import {
  has_rich_html,
  strip_quoted_sections,
  is_transparent_color_value,
} from "./html_sanitizer";
import { strip_transparent_backgrounds } from "./html_sanitizer_compose";

const transparent_span_reply =
  '<div data-aster-signature="1">Okay, thank you! We\'ll have this fixed today. <br><br>Cheers,<br>The Aster Team</div><br><br><div class="aster_quote"><div class="aster_quote_attr">On Mon, Jul 20, 2026, 12:49 PM, kchaos &lt;kchaos@aster.cx&gt; wrote:</div><blockquote class="aster_quote_body" style="margin:0 0 0 0.8ex;border-left:1px solid #ccc;padding-left:1ex">I am on Android. <br><br><div class="aster_quote"><div class="aster_quote_attr">On Mon, Jul 20, 2026, 12:18 PM, kchaos &lt;kchaos@aster.cx&gt; wrote:</div><blockquote class="aster_quote_body" style="margin:0 0 0 0.8ex;border-left:1px solid #ccc;padding-left:1ex"><div>Thanks.  <span style="background-color: rgba(0, 0, 0, 0);">One more question - how come I can\'t see the body of your message on the phone app.</span></div></blockquote></div></blockquote></div>';

describe("is_transparent_color_value", () => {
  it("treats fully transparent values as transparent", () => {
    expect(is_transparent_color_value("transparent")).toBe(true);
    expect(is_transparent_color_value("rgba(0, 0, 0, 0)")).toBe(true);
    expect(is_transparent_color_value("rgba(0,0,0,0)")).toBe(true);
    expect(is_transparent_color_value("rgba(255, 255, 255, 0)")).toBe(true);
    expect(is_transparent_color_value("hsla(0, 0%, 0%, 0)")).toBe(true);
    expect(is_transparent_color_value("inherit")).toBe(true);
    expect(is_transparent_color_value("none")).toBe(true);
  });

  it("treats visible values as not transparent", () => {
    expect(is_transparent_color_value("#ffffff")).toBe(false);
    expect(is_transparent_color_value("white")).toBe(false);
    expect(is_transparent_color_value("rgba(0, 0, 0, 0.5)")).toBe(false);
    expect(is_transparent_color_value("rgb(255, 255, 255)")).toBe(false);
    expect(is_transparent_color_value("url(https://x.test/a.png)")).toBe(false);
    expect(is_transparent_color_value("linear-gradient(#fff, #000)")).toBe(
      false,
    );
  });
});

describe("strip_quoted_sections", () => {
  it("removes the trailing aster quote chain", () => {
    const stripped = strip_quoted_sections(transparent_span_reply);

    expect(stripped).toContain("fixed today");
    expect(stripped).not.toContain("aster_quote");
    expect(stripped).not.toContain("rgba(0, 0, 0, 0)");
  });

  it("keeps content when the whole message is a quote", () => {
    const only_quote =
      '<div class="gmail_quote">On Mon wrote:<blockquote><table><tr><td>hi</td></tr></table></blockquote></div>';

    expect(strip_quoted_sections(only_quote)).toBe(only_quote);
  });

  it("returns content without quotes unchanged", () => {
    expect(strip_quoted_sections("<p>plain</p>")).toBe("<p>plain</p>");
  });
});

describe("has_rich_html", () => {
  it("does not classify a plain reply with a transparent-background span as rich", () => {
    expect(has_rich_html(transparent_span_reply)).toBe(false);
  });

  it("does not classify a plain reply quoting a rich email as rich", () => {
    const plain_over_newsletter =
      'Thanks!<br><br><div class="aster_quote"><div class="aster_quote_attr">On Mon wrote:</div><blockquote class="aster_quote_body"><table width="600" bgcolor="#ffffff"><tr><td><img src="https://x.test/logo.png"></td></tr></table></blockquote></div>';

    expect(has_rich_html(plain_over_newsletter)).toBe(false);
  });

  it("still classifies genuine rich content as rich", () => {
    expect(has_rich_html("<table><tr><td>x</td></tr></table>")).toBe(true);
    expect(
      has_rich_html('<div style="background-color: #ffffff">x</div>'),
    ).toBe(true);
    expect(has_rich_html('<img src="https://x.test/a.png">')).toBe(true);
    expect(has_rich_html('<div style="width: 600px">x</div>')).toBe(true);
  });

  it("classifies a message that is only a quoted rich email as rich", () => {
    const only_quote =
      '<div class="gmail_quote">On Mon wrote:<blockquote><table><tr><td>hi</td></tr></table></blockquote></div>';

    expect(has_rich_html(only_quote)).toBe(true);
  });

  it("treats a transparent background span alone as plain", () => {
    expect(
      has_rich_html(
        '<div>Thanks. <span style="background-color: rgba(0, 0, 0, 0);">One more question</span></div>',
      ),
    ).toBe(false);
  });
});

describe("strip_transparent_backgrounds", () => {
  const make_el = (style: string): Element => {
    const el = document.createElement("span");

    el.setAttribute("style", style);
    el.textContent = "x";

    return el;
  };

  it("removes no-op transparent background declarations", () => {
    const el = make_el("background-color: rgba(0, 0, 0, 0);");

    strip_transparent_backgrounds(el);
    expect(el.hasAttribute("style")).toBe(false);
  });

  it("keeps other declarations when removing transparent backgrounds", () => {
    const el = make_el("color: red; background-color: rgba(0, 0, 0, 0)");

    strip_transparent_backgrounds(el);
    expect(el.getAttribute("style")).toContain("color: red");
    expect(el.getAttribute("style")).not.toContain("background");
  });

  it("keeps visible background declarations", () => {
    const el = make_el("background-color: #fef08a");

    strip_transparent_backgrounds(el);
    expect(el.getAttribute("style")).toContain("background-color: #fef08a");
  });
});
