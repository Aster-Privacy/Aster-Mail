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

import { build_body_preview, build_plain_preview } from "./preview_text";

import {
  has_leading_css_rules,
  html_to_preview_text,
  preview_body_source,
  strip_html_tags,
  strip_leading_css_rules,
} from "@/lib/html_text";
import { searchable_body_source } from "@/hooks/use_search/matching";
import type { DecryptedEnvelope } from "@/types/email";

const OUTSIDE_PROVIDER_CSS =
  "body { background-color: #ffffff; margin: 0; padding: 0; }\n" +
  ".wrapper { width: 100%; max-width: 600px; }\n" +
  "a:hover, a.button { color: #1a73e8 !important; }\n";

const OUTSIDE_PROVIDER_HTML =
  "<!DOCTYPE html><html><head><title>Receipt</title></head><body>" +
  "<style>body { background-color: #ffffff; margin: 0; padding: 0; }" +
  ".wrapper { width: 100%; max-width: 600px; }</style>" +
  '<div class="wrapper"><p>Your order has shipped and arrives Tuesday.</p></div>' +
  "</body></html>";

const OUTSIDE_PROVIDER_TEXT =
  OUTSIDE_PROVIDER_CSS + "Your order has shipped and arrives Tuesday.";

describe("message previews from an outside provider", () => {
  it("shows the words, not the style block", () => {
    const preview = build_body_preview(
      OUTSIDE_PROVIDER_TEXT,
      OUTSIDE_PROVIDER_HTML,
    );

    expect(preview).toBe("Your order has shipped and arrives Tuesday.");
  });

  it("prefers the html part when the text part leads with style rules", () => {
    expect(
      preview_body_source(OUTSIDE_PROVIDER_TEXT, OUTSIDE_PROVIDER_HTML),
    ).toBe(OUTSIDE_PROVIDER_HTML);
    expect(preview_body_source("Hello", OUTSIDE_PROVIDER_HTML)).toBe("Hello");
  });

  it("drops the style rules when only the text part exists", () => {
    expect(build_body_preview(OUTSIDE_PROVIDER_TEXT, "")).toBe(
      "Your order has shipped and arrives Tuesday.",
    );
  });

  it("drops a style block that sits inside the body", () => {
    expect(build_body_preview("", OUTSIDE_PROVIDER_HTML)).toBe(
      "Your order has shipped and arrives Tuesday.",
    );
  });

  it("drops conditional comment blocks", () => {
    const html =
      "<!--[if mso]><style>table { border-collapse: collapse; }</style>" +
      "<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch>" +
      "</o:OfficeDocumentSettings></xml><![endif]-->" +
      "<!--[if !mso]><!--><p>Weekly digest is ready</p><!--<![endif]-->";

    expect(build_body_preview("", html)).toBe("Weekly digest is ready");
  });

  it("drops script, title, noscript, template and cdata", () => {
    const html =
      "<title>Hidden title</title><script>var a = 1;</script>" +
      "<noscript>Enable scripts</noscript><template><p>Unused</p></template>" +
      "<![CDATA[ raw data ]]><p>Visible line</p>";

    expect(strip_html_tags(html)).toBe("Visible line");
  });

  it("decodes entities and collapses whitespace", () => {
    const html =
      "<p>Tom &amp; Jerry&nbsp;&lt;3</p>\n\n   <p>caf&eacute; &#8217;s &#x41;</p>";

    expect(build_body_preview("", html)).toBe("Tom & Jerry <3 café ’s A");
  });

  it("keeps the list snapshot path consistent for plain sources", () => {
    expect(build_plain_preview(OUTSIDE_PROVIDER_TEXT)).toBe(
      "Your order has shipped and arrives Tuesday.",
    );
    expect(html_to_preview_text(OUTSIDE_PROVIDER_HTML, 600)).toBe(
      "Your order has shipped and arrives Tuesday.",
    );
  });

  it("routes search previews through the html part", () => {
    const envelope = {
      body_text: OUTSIDE_PROVIDER_TEXT,
      body_html: OUTSIDE_PROVIDER_HTML,
    } as unknown as DecryptedEnvelope;

    expect(searchable_body_source(envelope)).toBe(OUTSIDE_PROVIDER_HTML);
  });
});

describe("strip_leading_css_rules", () => {
  it("strips at-rules, comments and rules at the start", () => {
    const text =
      "<!-- @charset \"utf-8\"; " +
      "@media only screen and (max-width: 600px) { .col { width: 100% !important; } } " +
      "/* reset */ p { margin: 0 } td {} " +
      "@font-face { font-family: Brand; src: url(brand.woff2); } -->" +
      "Thanks for joining the beta.";

    expect(strip_leading_css_rules(text)).toBe("Thanks for joining the beta.");
  });

  it("strips a leading rule closed with the bang comment end", () => {
    const text = "<!-- p { margin: 0 } --!> Your order has shipped.";

    expect(strip_leading_css_rules(text)).toBe("Your order has shipped.");
  });

  it("keeps normal text that uses braces", () => {
    const samples = [
      "Use the {name} placeholder in your template.",
      "Hi team { note: see the attached plan }",
      "function greet() { return 1; } is the snippet",
      "Set {color: red} on the label, then reload.",
      "@media team, the launch moved to Friday; see you there.",
      "@john thanks for the notes {quick one}",
      "Hello world",
    ];

    for (const sample of samples) {
      expect(strip_leading_css_rules(sample)).toBe(sample);
      expect(has_leading_css_rules(sample)).toBe(false);
    }
  });

  it("only strips rules at the start of the text", () => {
    const text = "Paste this: body { margin: 0; } into the editor.";

    expect(strip_leading_css_rules(text)).toBe(text);
  });

  it("returns an empty string for empty input", () => {
    expect(strip_leading_css_rules("")).toBe("");
  });
});
