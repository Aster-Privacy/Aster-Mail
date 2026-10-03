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

import { build_email_body_css } from "./email_body_styles";
import { LONG_TOKEN_MARK, mark_long_tokens } from "./email_long_tokens";

const CHAR_WIDTH = 7;
const LONG_URL = `https://privacy.example.org/requests/5f1c2d3e?state=${"eyJhbGciOiJIUzI1NiJ9".repeat(30)}`;

function mount(html: string): HTMLElement {
  const doc = document.implementation.createHTMLDocument("");

  doc.body.innerHTML = html;
  doc.createRange = () => {
    let start = 0;
    let end = 0;

    return {
      setStart: (_node: Node, offset: number) => {
        start = offset;
      },
      setEnd: (_node: Node, offset: number) => {
        end = offset;
      },
      getBoundingClientRect: () => ({ width: (end - start) * CHAR_WIDTH }),
    } as unknown as Range;
  };

  return doc.body;
}

function marked_tags(body: HTMLElement): string[] {
  return Array.from(body.querySelectorAll(`[${LONG_TOKEN_MARK}]`)).map(
    (el) => el.tagName,
  );
}

describe("wrapping unbroken tokens wider than the reading pane", () => {
  it("marks a link whose text is a long unbroken url", () => {
    const body = mount(
      `<table width="440"><tr><td><p>Or copy and paste this link into your web browser:<br><a href="${LONG_URL}">${LONG_URL}</a></p></td></tr></table>`,
    );

    expect(mark_long_tokens(body, 400)).toBe(true);
    expect(marked_tags(body)).toEqual(["A"]);
  });

  it("marks plain text that holds a long unbroken token", () => {
    const body = mount(`<p>Your code: <span>${LONG_URL}</span></p>`);

    mark_long_tokens(body, 400);

    expect(marked_tags(body)).toEqual(["SPAN"]);
  });

  it("leaves a long word that fits the pane alone", () => {
    const body = mount(
      '<table><tr><td width="40">Price</td><td>Rechtsschutzversicherungsgesellschaften</td></tr></table>',
    );

    expect(mark_long_tokens(body, 400)).toBe(false);
    expect(marked_tags(body)).toEqual([]);
  });

  it("leaves preformatted blocks and style sheets alone", () => {
    const body = mount(
      `<style>.hero{background:url(data:image/png;base64,${"A".repeat(400)})}</style><pre><code>${LONG_URL}</code></pre>`,
    );

    expect(mark_long_tokens(body, 400)).toBe(false);
  });

  it("does nothing without a usable width", () => {
    const body = mount(`<p>${LONG_URL}</p>`);

    expect(mark_long_tokens(body, 0)).toBe(false);
  });

  it("lets marked text wrap anywhere in the email styles", () => {
    expect(build_email_body_css()).toMatch(
      new RegExp(`\\[${LONG_TOKEN_MARK}\\] \\{\\s*overflow-wrap: anywhere`),
    );
  });
});
