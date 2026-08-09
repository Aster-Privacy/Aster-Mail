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

import { html_to_readable_plain_text, plain_text_to_html } from "./html_sanitizer";

const verify_url =
  "https://account.example.com/verify?token=abc123&mid=6425522";
const manage_url = "https://account.example.com/preferences";

const verification_email = `<!DOCTYPE html>
<html><body>
<div style="display:none;max-height:0px;overflow:hidden;">MID: 6425522</div>
<table role="presentation" width="100%">
  <tr><td style="font-size:0.9em;opacity:0.95;">
    <a href="${verify_url}"><img src="https://cdn.example.com/logo.png" width="120" alt="Example"></a>
    <p>Please verify your email address to finish updating your account.</p>
    <p>Your code is 483920.</p>
    <p><a href="${verify_url}">Verify Now</a></p>
    <p><a href="${manage_url}">Manage preferences</a></p>
  </td></tr>
</table>
</body></html>`;

function render_blocked(html: string) {
  return plain_text_to_html(
    html_to_readable_plain_text(html, { keep_link_urls: true }),
  );
}

describe("plain text rendering of blocked html", () => {
  it("keeps verification links reachable", () => {
    const text = html_to_readable_plain_text(verification_email, {
      keep_link_urls: true,
    });

    expect(text).toContain("Please verify your email address");
    expect(text).toContain("483920");
    expect(text).toContain("Verify Now");
    expect(text).toContain(verify_url);
    expect(text).toContain(manage_url);
  });

  it("emits clickable anchors for the recovered urls", () => {
    const html = render_blocked(verification_email);

    expect(html).toContain(
      `href="https://account.example.com/verify?token=abc123&amp;mid=6425522"`,
    );
    expect(html).toContain(`href="${manage_url}"`);
  });

  it("does not drop content wrapped in fractional font-size or opacity", () => {
    const text = html_to_readable_plain_text(
      `<div style="font-size:0.9em"><p style="opacity:0.85">Body copy</p></div>`,
    );

    expect(text).toContain("Body copy");
  });

  it("still drops genuinely hidden preheaders", () => {
    const text = html_to_readable_plain_text(verification_email, {
      keep_link_urls: true,
    });

    expect(text).not.toContain("MID: 6425522");
  });

  it("still drops zeroed and hidden elements", () => {
    const text = html_to_readable_plain_text(
      `<p style="font-size:0px">zero</p><p style="opacity:0">clear</p><p style="max-height:0;overflow:hidden">flat</p><p>kept</p>`,
    );

    expect(text).toBe("kept");
  });

  it("leaves link text alone when it already shows the url", () => {
    const text = html_to_readable_plain_text(
      `<p><a href="${manage_url}">${manage_url}</a></p>`,
      { keep_link_urls: true },
    );

    expect(text).toBe(manage_url);
  });

  it("keeps urls out of the text when the caller does not ask for them", () => {
    const text = html_to_readable_plain_text(
      `<p><a href="${manage_url}">Manage preferences</a></p>`,
    );

    expect(text).toBe("Manage preferences");
  });

  it("does not repeat a url shared by adjacent anchors", () => {
    const text = html_to_readable_plain_text(
      `<p><a href="${verify_url}"><img src="https://cdn.example.com/logo.png"></a><a href="${verify_url}">Verify Now</a></p>`,
      { keep_link_urls: true },
    );

    expect(text.split(verify_url).length - 1).toBe(1);
  });

  it("puts the url next to the labelled link rather than the logo", () => {
    const text = html_to_readable_plain_text(verification_email, {
      keep_link_urls: true,
    });

    expect(text).toContain(`Verify Now ${verify_url}`);
  });

  it("keeps the url for an image only link that has no labelled twin", () => {
    const text = html_to_readable_plain_text(
      `<p><a href="${manage_url}"><img src="https://cdn.example.com/logo.png"></a></p>`,
      { keep_link_urls: true },
    );

    expect(text).toBe(manage_url);
  });

  it("ignores non http schemes", () => {
    const text = html_to_readable_plain_text(
      `<p><a href="mailto:support@example.com">Contact us</a></p>`,
      { keep_link_urls: true },
    );

    expect(text).toBe("Contact us");
  });
});
