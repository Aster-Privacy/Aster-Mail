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
import type { DecryptedThreadMessage } from "@/types/thread";

import { describe, expect, it } from "vitest";

import {
  message_plain_view_state,
  plain_view_html,
  sender_text_alternative,
} from "./plain_view";

const HTML =
  '<html><body><img src="https://cdn.news.example/a.png"><p>Rich</p></body></html>';

function fields(
  extra: Partial<DecryptedThreadMessage> = {},
): Pick<DecryptedThreadMessage, "body" | "html_content" | "text_part"> {
  return { body: HTML, html_content: HTML, ...extra };
}

describe("sender_text_alternative", () => {
  it("returns the text part next to an HTML part", () => {
    expect(sender_text_alternative(HTML, "Plain words")).toBe("Plain words");
  });

  it("ignores text without an HTML part, empty text and the HTML itself", () => {
    expect(sender_text_alternative(undefined, "Plain words")).toBe(undefined);
    expect(sender_text_alternative(HTML, "   \n")).toBe(undefined);
    expect(sender_text_alternative(HTML, HTML)).toBe(undefined);
  });

  it("ignores text parts that are markup, MIME or still encrypted", () => {
    expect(sender_text_alternative(HTML, "<div>Hi</div>")).toBe(undefined);
    expect(
      sender_text_alternative(HTML, "Content-Type: text/plain\n\nHi"),
    ).toBe(undefined);
    expect(
      sender_text_alternative(
        HTML,
        "-----BEGIN PGP MESSAGE-----\nabc\n-----END PGP MESSAGE-----",
      ),
    ).toBe(undefined);
  });

  it("keeps angle-bracket links and ampersands in plain text", () => {
    const text = "Read <https://news.example/a> & more";

    expect(sender_text_alternative(HTML, text)).toBe(text);
  });
});

describe("plain_view_html", () => {
  it("renders the text part escaped, without remote resources", () => {
    const html = plain_view_html(
      HTML,
      fields({ text_part: "Price < 5 & rising <b>now</b>" }),
    );

    expect(html).toContain("Price &lt; 5 &amp; rising &lt;b&gt;now");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("Rich");
  });

  it("falls back to a readable conversion of the HTML", () => {
    const html = plain_view_html(HTML, fields());

    expect(html).toContain("Rich");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("cdn.news.example");
  });
});

describe("message_plain_view_state", () => {
  it("prefers the text part only when the setting is on and one exists", () => {
    expect(
      message_plain_view_state(fields({ text_part: "Plain" }), true, undefined),
    ).toEqual({ available: true, active: true });
    expect(message_plain_view_state(fields(), true, undefined)).toEqual({
      available: true,
      active: false,
    });
    expect(
      message_plain_view_state(
        fields({ text_part: "Plain" }),
        false,
        undefined,
      ),
    ).toEqual({ available: true, active: false });
  });

  it("lets the per-message choice win over the setting", () => {
    expect(
      message_plain_view_state(fields({ text_part: "Plain" }), true, false),
    ).toEqual({ available: true, active: false });
    expect(message_plain_view_state(fields(), false, true)).toEqual({
      available: true,
      active: true,
    });
  });

  it("is unavailable for plain text messages", () => {
    expect(
      message_plain_view_state(
        { body: "Just text", html_content: undefined },
        true,
        true,
      ),
    ).toEqual({ available: false, active: false });
  });
});
