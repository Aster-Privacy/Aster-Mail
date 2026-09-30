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

import { sanitize_outgoing_html } from "./html_sanitizer_compose";

describe("sanitize_outgoing_html dangerous href handling", () => {
  it("strips a dangerous href from an anchor", () => {
    const out = sanitize_outgoing_html(
      '<p><a href="javascript:alert(1)">x</a></p>',
    );

    expect(out).not.toContain("javascript:");
    expect(out).toContain("x");
  });

  it("strips a dangerous href from a non-anchor element", () => {
    const out = sanitize_outgoing_html(
      '<p><map name="m"><area shape="rect" coords="0,0,9,9" href="data:text/html,x"></map>y</p>',
    );

    expect(out).not.toContain("data:text/html");
  });

  it("strips a dangerous xlink href", () => {
    const out = sanitize_outgoing_html(
      '<p><svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg></p>',
    );

    expect(out).not.toContain("javascript:");
  });

  it("keeps ordinary links intact", () => {
    const out = sanitize_outgoing_html(
      '<p><a href="https://example.com/a?b=1">x</a></p>',
    );

    expect(out).toContain("https://example.com/a?b=1");
  });

  it("keeps mailto links intact", () => {
    const out = sanitize_outgoing_html('<p><a href="mailto:a@b.com">x</a></p>');

    expect(out).toContain("mailto:a@b.com");
  });

  it("keeps inline image sources intact", () => {
    const out = sanitize_outgoing_html(
      '<div><img src="cid:abc123" alt="x"></div>',
    );

    expect(out).toContain("cid:abc123");
  });

  it("keeps data uri image sources intact", () => {
    const out = sanitize_outgoing_html(
      '<p><img src="data:image/png;base64,iVBORw0KGgo=" alt="x"></p>',
    );

    expect(out).toContain("data:image/png;base64,iVBORw0KGgo=");
  });
});
