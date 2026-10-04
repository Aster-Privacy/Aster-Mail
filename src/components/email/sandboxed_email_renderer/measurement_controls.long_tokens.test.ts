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
import { describe, it, expect, vi } from "vitest";

import { build_measurement_controls } from "./measurement_controls";

import { LONG_TOKEN_MARK } from "@/lib/email_long_tokens";

const FRAME_WIDTH = 1076;
const BODY_PADDING = 16;
const CHAR_WIDTH = 7;
const TABLE_WIDTH = 440;
const TOKEN = `https://privacy.example.org/requests/5f1c2d3e?state=${"eyJhbGciOiJIUzI1NiJ9".repeat(30)}`;

const fit = (html: string, table_width = TABLE_WIDTH) => {
  const doc = document.implementation.createHTMLDocument("");
  const body = doc.body;

  body.setAttribute("style", "padding:8px 16px 8px 16px");
  body.innerHTML = html;
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

  const content_width = () => {
    const unbroken = Array.from(body.querySelectorAll("a, span"))
      .filter((el) => !el.hasAttribute(LONG_TOKEN_MARK))
      .map((el) => (el.textContent || "").length * CHAR_WIDTH);

    return Math.max(table_width, ...unbroken);
  };
  const scroll_width = () =>
    Math.max(FRAME_WIDTH, BODY_PADDING * 2 + content_width());

  Object.defineProperty(body, "scrollWidth", {
    configurable: true,
    get: scroll_width,
  });
  Object.defineProperty(doc.documentElement, "scrollWidth", {
    configurable: true,
    get: scroll_width,
  });
  doc.getSelection = () => null;

  const iframe = {
    clientWidth: FRAME_WIDTH,
    contentDocument: doc,
    contentWindow: {
      getComputedStyle: (el: HTMLElement) => ({
        zoom: el.style.getPropertyValue("zoom") || "1",
        paddingInlineStart: `${BODY_PADDING}px`,
        paddingInlineEnd: `${BODY_PADDING}px`,
      }),
    },
    parentElement: null,
    style: { height: "" },
  } as unknown as HTMLIFrameElement;

  build_measurement_controls({
    iframe,
    email_id: undefined,
    base_zoom_ref: { current: 1 },
    document_ready_cleanup_ref: { current: null },
    has_fired_ready_ref: { current: false },
    mutation_observer_ref: { current: null },
    observer_ref: { current: null },
    raf_ref: { current: 0 },
    remeasure_ref: { current: null },
    on_document_ready_ref: { current: undefined },
    set_height_ready: vi.fn(),
    set_iframe_height: vi.fn(),
  }).measure_and_apply(true);

  return body;
};

describe("fitting an email that holds a long unbroken url", () => {
  it("wraps the url instead of shrinking the whole email", () => {
    const body = fit(
      `<table width="${TABLE_WIDTH}"><tr><td><p>Or copy and paste this link into your web browser:<br><a href="${TOKEN}">${TOKEN}</a></p><p>Plain text copy: <span>${TOKEN}</span></p></td></tr></table>`,
    );

    expect(body.style.getPropertyValue("zoom")).toBe("1");
    expect(body.querySelector("a")?.hasAttribute(LONG_TOKEN_MARK)).toBe(true);
    expect(body.querySelector("span")?.hasAttribute(LONG_TOKEN_MARK)).toBe(
      true,
    );
  });

  it("still shrinks an email whose fixed layout is wider than the pane", () => {
    const body = fit(
      `<table width="1600"><tr><td><a href="https://example.com/a">Read more</a></td></tr></table>`,
      1600,
    );

    expect(body.style.getPropertyValue("zoom")).toBe("0.653");
    expect(body.querySelector(`[${LONG_TOKEN_MARK}]`)).toBeNull();
  });

  it("leaves an email that already fits untouched", () => {
    const body = fit(
      `<table width="${TABLE_WIDTH}"><tr><td><a href="https://example.com/a">https://example.com/a/short</a></td></tr></table>`,
    );

    expect(body.style.getPropertyValue("zoom")).toBe("1");
    expect(body.querySelector(`[${LONG_TOKEN_MARK}]`)).toBeNull();
  });
});
