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

import { strip_mso_conditionals } from "./html_sanitizer_utils";

const ghost_open = `<!--[if mso | IE]>
<table align="center" border="0" cellpadding="0" cellspacing="0" style="width:600px;" width="600"><tr><td>
<![endif]-->`;

const ghost_close = `<!--[if mso | IE]>
</td></tr></table>
<![endif]-->`;

describe("strip_mso_conditionals", () => {
  it("removes downlevel hidden blocks", () => {
    const out = strip_mso_conditionals(
      `<p>before</p>${ghost_open}<div>body</div>${ghost_close}<p>after</p>`,
    );

    expect(out).toContain("<p>before</p>");
    expect(out).toContain("<div>body</div>");
    expect(out).toContain("<p>after</p>");
    expect(out).not.toContain("[if");
    expect(out).not.toContain("[endif]");
  });

  it("keeps content revealed by a well formed downlevel opener", () => {
    const out = strip_mso_conditionals(
      `<!--[if !mso]><!--><div>revealed</div><!--<![endif]-->`,
    );

    expect(out).toContain("<div>revealed</div>");
    expect(out).not.toContain("[if");
    expect(out).not.toContain("[endif]");
  });

  it("keeps content revealed by a malformed downlevel opener", () => {
    const out = strip_mso_conditionals(
      `<!--[if !mso]>--><div>revealed</div><!--<![endif]-->`,
    );

    expect(out).toContain("<div>revealed</div>");
    expect(out).not.toContain("[if");
    expect(out).not.toContain("[endif]");
  });

  it("does not swallow the document when a malformed opener has no matching closer", () => {
    const html = `<head>
<!--[if !mso]>-->
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<!--<![endif]-->
<style>.card{color:red}</style>
</head>
<body><div class="card">payment receipt</div>${ghost_close}</body>`;

    const out = strip_mso_conditionals(html);

    expect(out).toContain("<style>.card{color:red}</style>");
    expect(out).toContain('<div class="card">payment receipt</div>');
    expect(out).toContain("</head>");
    expect(out).not.toContain("[if");
    expect(out).not.toContain("[endif]");
  });

  it("stops a hidden block at the first comment terminator", () => {
    const out = strip_mso_conditionals(
      `<!--[if mso]><v:rect></v:rect>--><div>kept</div><![endif]-->`,
    );

    expect(out).toContain("<div>kept</div>");
    expect(out).not.toContain("v:rect");
    expect(out).not.toContain("[endif]");
  });

  it("leaves an unterminated opener without discarding the rest of the document", () => {
    const out = strip_mso_conditionals(`<!--[if mso]><div>kept</div>`);

    expect(out).toContain("<div>kept</div>");
  });

  it("handles many nested ghost tables without losing sections", () => {
    const sections = [1, 2, 3, 4]
      .map((n) => `${ghost_open}<div>section ${n}</div>${ghost_close}`)
      .join("");
    const out = strip_mso_conditionals(`<!--[if !mso]>-->${sections}`);

    for (const n of [1, 2, 3, 4]) {
      expect(out).toContain(`<div>section ${n}</div>`);
    }
    expect(out).not.toContain("[if");
    expect(out).not.toContain("[endif]");
  });

  it("returns the input untouched when there are no conditionals", () => {
    const html = `<div>plain <b>content</b></div>`;

    expect(strip_mso_conditionals(html)).toBe(html);
  });
});
