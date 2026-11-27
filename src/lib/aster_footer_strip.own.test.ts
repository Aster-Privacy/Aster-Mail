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

import { strip_own_aster_footer_html } from "./aster_footer_strip";

const FOOTER =
  '<br><br>Secured by <a href="https://astermail.org" target="_blank" rel="noopener noreferrer">Aster Mail</a>';

describe("strip_own_aster_footer_html", () => {
  it("removes the watermark from the message body", () => {
    const result = strip_own_aster_footer_html(`<div>Hello</div>${FOOTER}`);

    expect(result).toContain("Hello");
    expect(result).not.toContain("astermail.org");
    expect(result).not.toContain("Secured by");
  });

  it("keeps a watermark inside quoted mail", () => {
    const html = `<div>Hi</div><blockquote>Earlier${FOOTER}</blockquote>`;

    expect(strip_own_aster_footer_html(html)).toContain("astermail.org");
  });

  it("removes the plain text watermark at the end", () => {
    const result = strip_own_aster_footer_html(
      "Hello<br><br>Secured by Aster Mail",
      "Secured by Aster Mail",
    );

    expect(result).toBe("Hello");
  });

  it("leaves a body without a watermark unchanged", () => {
    expect(strip_own_aster_footer_html("<div>Hello</div>")).toBe(
      "<div>Hello</div>",
    );
  });
});
