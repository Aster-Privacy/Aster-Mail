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
import { describe, expect, it } from "vitest";

import {
  collapse_forwarded_content,
  collapse_quoted_replies,
  create_quote_wrapper,
} from "./dom_cleanup";

type translate_fn = Parameters<typeof collapse_quoted_replies>[1];

const t = ((key: string) => key) as unknown as translate_fn;

function render(html: string): Document {
  const doc = document.implementation.createHTMLDocument("");

  doc.body.innerHTML = html;
  collapse_forwarded_content(doc, t);
  collapse_quoted_replies(doc, t);

  return doc;
}

function flush_observers(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function quote_wrapper(doc: Document): HTMLDetailsElement {
  const wrapper = doc.body.querySelector(".aster-quoted-wrapper");

  expect(wrapper).not.toBeNull();

  return wrapper as HTMLDetailsElement;
}

const FORWARDED_HTML = [
  "<div>See below.</div>",
  '<div class="gmail_quote">',
  "<div>---------- Forwarded message ---------</div>",
  "<div>From: Ada &lt;ada@example.com&gt;</div>",
  "<div>Date: Mon, Nov 2, 2026 at 9:00 AM</div>",
  "<div>Subject: Plans</div>",
  '<div id="fwd_body">The forwarded body</div>',
  "</div>",
].join("");

const REPLY_HTML = [
  "<p>Sounds good.</p>",
  '<div class="gmail_quote">',
  '<div class="gmail_attr">On Mon, Nov 2, 2026 at 9:00 AM Ada &lt;ada@example.com&gt; wrote:</div>',
  '<blockquote id="quoted">Can we meet?</blockquote>',
  "</div>",
].join("");

describe("quote toggle", () => {
  it("folds a forwarded html message behind a native disclosure", () => {
    const doc = render(FORWARDED_HTML);
    const wrapper = quote_wrapper(doc);
    const toggle = wrapper.firstElementChild as HTMLElement;

    expect(wrapper.tagName).toBe("DETAILS");
    expect(wrapper.open).toBe(false);
    expect(toggle.tagName).toBe("SUMMARY");
    expect(toggle.classList.contains("aster-quote-toggle")).toBe(true);
    expect(
      wrapper
        .querySelector(".aster-quoted-content")
        ?.contains(doc.getElementById("fwd_body")),
    ).toBe(true);
    expect(doc.body.textContent).toContain("See below.");
  });

  it("folds a reply quote behind a native disclosure", () => {
    const doc = render(REPLY_HTML);
    const wrapper = quote_wrapper(doc);

    expect(wrapper.tagName).toBe("DETAILS");
    expect(wrapper.open).toBe(false);
    expect(wrapper.firstElementChild?.tagName).toBe("SUMMARY");
    expect(
      wrapper
        .querySelector(".aster-quoted-content")
        ?.contains(doc.getElementById("quoted")),
    ).toBe(true);
  });

  it("folds a plain-text reply quote behind a native disclosure", () => {
    const doc = render(
      [
        "<div>Thanks.</div>",
        "<div>On Mon, Nov 2, 2026 at 9:00 AM Ada wrote:</div>",
        "<div>&gt; Can we meet?</div>",
      ].join(""),
    );
    const wrapper = quote_wrapper(doc);

    expect(wrapper.tagName).toBe("DETAILS");
    expect(wrapper.open).toBe(false);
    expect(wrapper.firstElementChild?.tagName).toBe("SUMMARY");
  });

  it("labels the toggle for showing the quote while it is closed", () => {
    const { wrapper } = create_quote_wrapper(document, t);
    const toggle = wrapper.querySelector(".aster-quote-toggle")!;

    expect(toggle.getAttribute("aria-label")).toBe("mail.show_quoted_text");
    expect(toggle.getAttribute("data-aster-tip")).toBe(
      "mail.show_quoted_text",
    );
    expect(toggle.classList.contains("aster-quote-expanded")).toBe(false);
    expect(toggle.hasAttribute("title")).toBe(false);
  });

  it("relabels the toggle when the quote opens and closes", async () => {
    const { wrapper } = create_quote_wrapper(document, t);
    const toggle = wrapper.querySelector(".aster-quote-toggle")!;

    document.body.appendChild(wrapper);
    wrapper.open = true;
    await flush_observers();

    expect(toggle.getAttribute("aria-label")).toBe("mail.hide_quoted_text");
    expect(toggle.getAttribute("data-aster-tip")).toBe(
      "mail.hide_quoted_text",
    );
    expect(toggle.classList.contains("aster-quote-expanded")).toBe(true);

    wrapper.open = false;
    await flush_observers();

    expect(toggle.getAttribute("aria-label")).toBe("mail.show_quoted_text");
    expect(toggle.classList.contains("aster-quote-expanded")).toBe(false);
    wrapper.remove();
  });

  it("keeps the toggle working without any script in the email document", () => {
    const doc = render(REPLY_HTML);
    const serialized = new DOMParser().parseFromString(
      doc.body.innerHTML,
      "text/html",
    );
    const wrapper = quote_wrapper(serialized);

    expect(wrapper.firstElementChild?.tagName).toBe("SUMMARY");
    expect(wrapper.querySelector(".aster-quoted-content")).not.toBeNull();
    expect(serialized.querySelector("button")).toBeNull();
  });
});
