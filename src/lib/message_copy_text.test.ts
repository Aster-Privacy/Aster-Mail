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

import { afterEach, describe, expect, it } from "vitest";

import {
  clean_range_for_copy,
  handle_message_copy,
  strip_zero_width,
} from "./message_copy_text";

function body_range(html: string): Range {
  document.body.innerHTML = html;
  const range = document.createRange();

  range.selectNodeContents(document.body);

  return range;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("clean message copy", () => {
  it("drops hidden preheader text and its filler", () => {
    const { text } = clean_range_for_copy(
      body_range(`
        <div style="display:none;font-size:0">Preview text &#847;&zwnj;&#847;&zwnj;</div>
        <span style="font-size:0px">&#847; &#847; &#847;</span>
        <p>Hello Ada</p>
      `),
    );

    expect(text).toBe("Hello Ada");
  });

  it("drops blocked images and tracking pixels", () => {
    const { text, html } = clean_range_for_copy(
      body_range(`
        <p>Before<img class="blocked-remote-image" alt="Image blocked" data-tracking-pixel="false" /></p>
        <img data-tracking-pixel="true" alt="pixel" />
        <p>After</p>
      `),
    );

    expect(text).toBe("Before\nAfter");
    expect(html).not.toContain("blocked-remote-image");
    expect(html).not.toContain("data-tracking-pixel");
  });

  it("drops collapsed quoted history and its toggle", () => {
    const { text } = clean_range_for_copy(
      body_range(`
        <p>Thanks for the update.</p>
        <details class="aster-quoted-wrapper">
          <summary class="aster-quote-toggle"><span class="aster-quote-toggle-dots"></span></summary>
          <div class="aster-quoted-content">On Monday Grace wrote: old text</div>
        </details>
      `),
    );

    expect(text).toBe("Thanks for the update.");
  });

  it("keeps expanded quoted history without the toggle", () => {
    const { text } = clean_range_for_copy(
      body_range(`
        <p>Reply</p>
        <details class="aster-quoted-wrapper" open>
          <summary class="aster-quote-toggle">Hide</summary>
          <div class="aster-quoted-content">Earlier message</div>
        </details>
      `),
    );

    expect(text).toBe("Reply\nEarlier message");
  });

  it("strips zero width characters", () => {
    expect(strip_zero_width("A​B‌‍C﻿D͏")).toBe("ABCD");

    const { text } = clean_range_for_copy(
      body_range(`<p>Order​ number⁠ 42</p>`),
    );

    expect(text).toBe("Order number 42");
  });

  it("leaves the source document unchanged", () => {
    const range = body_range(
      `<p>Visible</p><div style="display:none" id="hidden">Hidden</div>`,
    );

    clean_range_for_copy(range);

    expect(document.querySelector("[data-aster-copy-skip]")).toBeNull();
    expect(document.getElementById("hidden")).not.toBeNull();
  });

  it("writes clean text to the clipboard on copy", () => {
    const range = body_range(
      `<div style="display:none">Preheader</div><p>Body text</p>`,
    );
    const selection = document.getSelection()!;

    selection.removeAllRanges();
    selection.addRange(range);

    const store = new Map<string, string>();
    const event = new Event("copy", { cancelable: true }) as ClipboardEvent;

    Object.defineProperty(event, "clipboardData", {
      value: {
        setData: (type: string, value: string) => store.set(type, value),
      },
    });

    handle_message_copy(event, document);

    expect(event.defaultPrevented).toBe(true);
    expect(store.get("text/plain")).toBe("Body text");
    expect(store.get("text/html")).not.toContain("Preheader");
  });
});
