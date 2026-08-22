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
import { strip_html_tags, html_to_readable_plain_text } from "./html_text";
import { extract_preheader_text } from "@/utils/preview_text";
import {
  sanitize_outgoing_html,
  repair_comment_markup,
} from "./html_sanitizer";

const unterminated_conditional = [
  "<div>MID: 6425522</div>",
  "<!--[if mso]>",
  '<div><a href="https://my.account.sony.com/central/verification/?ticket_uuid=fafa4aed">Verify Now</a></div>',
  "<div>You can review or update your registration details.</div>",
].join("");

const unterminated_plain_comment = "<p>before</p><!-- never closed<p>after</p>";

const abrupt_comment = "<p>before</p><!--><p>after</p>";

describe("quoting an original whose comment markup is malformed", () => {
  it("keeps the quoted body past an unterminated outlook conditional", () => {
    const quoted = sanitize_outgoing_html(
      inline_email_css(unterminated_conditional),
    );

    expect(quoted).toContain("Verify Now");
    expect(quoted).toContain("my.account.sony.com");
    expect(quoted).toContain("registration details");
    expect(quoted).not.toContain("[if mso]");
  });

  it("keeps the quoted body past an unterminated plain comment", () => {
    const quoted = sanitize_outgoing_html(
      inline_email_css(unterminated_plain_comment),
    );

    expect(quoted).toContain("after");
  });

  it("keeps the quoted body past an abruptly closed comment", () => {
    const quoted = sanitize_outgoing_html(inline_email_css(abrupt_comment));

    expect(quoted).toContain("after");
  });

  it("keeps the plain text quote past an unterminated conditional", () => {
    const doc = new DOMParser().parseFromString(
      repair_comment_markup(unterminated_conditional),
      "text/html",
    );

    expect(doc.body.textContent ?? "").toContain("Verify Now");
  });

  it("leaves a well formed conditional block stripped", () => {
    const quoted = sanitize_outgoing_html(
      inline_email_css("<p>keep</p><!--[if mso]><p>drop</p><![endif]-->"),
    );

    expect(quoted).toContain("keep");
    expect(quoted).not.toContain("drop");
  });
});

describe("reading text out of a body whose comment markup is malformed", () => {
  it("keeps searchable and preview text past an unterminated conditional", () => {
    const plain = strip_html_tags(unterminated_conditional);

    expect(plain).toContain("Verify Now");
    expect(plain).toContain("registration details");
  });

  it("keeps readable plain text past an unterminated conditional", () => {
    const readable = html_to_readable_plain_text(unterminated_conditional, {
      keep_link_urls: true,
    });

    expect(readable).toContain("Verify Now");
    expect(readable).toContain("my.account.sony.com");
  });

  it("keeps preheader text past an unterminated conditional", () => {
    const preheader = extract_preheader_text(
      `<div style="display:none">${unterminated_conditional}</div>`,
    );

    expect(preheader).toContain("MID: 6425522");
  });

  it("keeps text past an unterminated plain comment", () => {
    expect(strip_html_tags(unterminated_plain_comment)).toContain("after");
  });
});
