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
  extract_preview_html,
  move_leading_footer_to_end,
} from "@/components/email/message_body_parts";

const FOOTER = 'Secured by <a href="https://astermail.org">Aster Mail</a>';

describe("move_leading_footer_to_end", () => {
  it("moves a leading footer after the body", () => {
    const result = move_leading_footer_to_end(
      `<br><br>${FOOTER}Are we still on?`,
    );

    expect(result.indexOf("Are we still on?")).toBeLessThan(
      result.indexOf("Secured by"),
    );
  });

  it("keeps the quoted section after the moved footer", () => {
    const result = move_leading_footer_to_end(
      `${FOOTER}Sounds good<blockquote>old text</blockquote>`,
    );

    expect(result.indexOf("Sounds good")).toBeLessThan(
      result.indexOf("Secured by"),
    );
    expect(result.indexOf("Secured by")).toBeLessThan(
      result.indexOf("<blockquote>"),
    );
  });

  it("leaves a body that already ends with the footer untouched", () => {
    const html = `<div>Hello</div><br><br>${FOOTER}`;

    expect(move_leading_footer_to_end(html)).toBe(html);
  });
});

describe("extract_preview_html", () => {
  it("drops the footer and the quoted reply", () => {
    const result = extract_preview_html(
      `<div>8 is perfect.</div><br><br>${FOOTER}<blockquote>On Fri someone wrote</blockquote>`,
    );

    expect(result).toContain("8 is perfect.");
    expect(result).not.toContain("Secured by");
    expect(result).not.toContain("On Fri");
  });

  it("strips a trailing footer from plain text", () => {
    expect(extract_preview_html("See you there\n\nSecured by Aster Mail")).toBe(
      "See you there",
    );
  });
});
