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
import { neutralize_unterminated_comments } from "./html_sanitizer_utils";

const verify_link =
  '<a href="https://example.com/verify?token=abc">Verify Now</a>';

const options = {
  external_content_mode: "ask" as const,
  sandbox_mode: true,
  content_blocking: {
    block_remote_images: true,
    block_remote_fonts: true,
    block_remote_css: true,
    block_tracking_pixels: true,
  },
};

describe("neutralize_unterminated_comments", () => {
  it("leaves a well formed comment in place", () => {
    const html = `<p>a</p><!-- note --><p>b</p>`;

    expect(neutralize_unterminated_comments(html)).toBe(html);
  });

  it("keeps a comment closed with the bang form intact", () => {
    const html = `<p>a</p><!-- note --!><p>b</p>`;

    expect(neutralize_unterminated_comments(html)).toBe(html);
  });

  it("drops the marker of a comment that is never closed", () => {
    expect(neutralize_unterminated_comments(`<p>a</p><!-- note <p>b</p>`)).toBe(
      `<p>a</p> note <p>b</p>`,
    );
  });

  it("removes an abruptly closed empty comment", () => {
    expect(neutralize_unterminated_comments(`<p>a</p><!--><p>b</p>`)).toBe(
      `<p>a</p><p>b</p>`,
    );
  });

  it("returns input untouched when there is no comment", () => {
    expect(neutralize_unterminated_comments("<p>a</p>")).toBe("<p>a</p>");
  });
});

describe("sanitize_html malformed comment recovery", () => {
  it("keeps content that follows a conditional comment with no endif", () => {
    const result = sanitize_html(
      `<body><!--[if mso]><div>${verify_link}</div><p>MID: 6425522</p></body>`,
      options,
    );

    expect(result.html).toContain("Verify Now");
    expect(result.html).toContain("MID: 6425522");
  });

  it("keeps content that follows an unterminated plain comment", () => {
    const result = sanitize_html(
      `<body><!-- start of content <div>${verify_link}</div></body>`,
      options,
    );

    expect(result.html).toContain("Verify Now");
  });

  it("keeps content that follows an abruptly closed comment", () => {
    const result = sanitize_html(
      `<body><!--><div>${verify_link}</div></body>`,
      options,
    );

    expect(result.html).toContain("Verify Now");
  });

  it("still strips a well formed outlook conditional block", () => {
    const result = sanitize_html(
      `<body><!--[if mso]><p>outlook only</p><![endif]--><div>${verify_link}</div></body>`,
      options,
    );

    expect(result.html).not.toContain("outlook only");
    expect(result.html).toContain("Verify Now");
  });

  it("still reveals a downlevel revealed conditional block", () => {
    const result = sanitize_html(
      `<body><!--[if !mso]><!-- --><div>${verify_link}</div><!--<![endif]--></body>`,
      options,
    );

    expect(result.html).toContain("Verify Now");
    expect(result.html).not.toContain("endif");
  });
});
