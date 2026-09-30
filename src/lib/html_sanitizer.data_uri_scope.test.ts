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

import { sanitize_html } from "./html_sanitizer";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const SVG = "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=";

describe("data urls stay scoped to safe image types", () => {
  it("keeps an inline png source", () => {
    const result = sanitize_html(`<p>lead</p><img src="${PNG}" alt="a">`);

    expect(result.html).toContain("data:image/png;base64,");
  });

  it("drops an svg data url from a srcset", () => {
    const result = sanitize_html(
      `<p>lead</p><img src="cid:a" srcset="${SVG} 2x">`,
    );

    expect(result.html).not.toContain("svg+xml");
  });

  it("drops an svg data url from a background attribute", () => {
    const result = sanitize_html(
      `<p>lead</p><table><tr><td background="${SVG}">cell</td></tr></table>`,
    );

    expect(result.html).not.toContain("svg+xml");
  });

  it("drops an html data url from a link", () => {
    const result = sanitize_html(
      '<p>lead</p><a href="data:text/html,<b>x</b>">link</a>',
    );

    expect(result.html).not.toContain("data:text/html");
  });

  it("drops an svg data url from an image source", () => {
    const result = sanitize_html(`<p>lead</p><img src="${SVG}" alt="a">`);

    expect(result.html).not.toContain("svg+xml");
  });
});
