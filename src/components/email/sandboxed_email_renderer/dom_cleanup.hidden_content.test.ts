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
import { afterEach, describe, expect, it } from "vitest";

import {
  collapse_forwarded_content,
  collapse_quoted_replies,
  reveal_fully_hidden_content,
  reveal_orphaned_hidden_quotes,
} from "./dom_cleanup";

type translate_fn = Parameters<typeof collapse_forwarded_content>[1];

const t = ((key: string) => key) as unknown as translate_fn;

const QUOTE_CSS =
  ".aster_quote, .gmail_quote, .protonmail_quote, .yahoo_quoted, .moz-cite-prefix { display: none; }" +
  ".aster-quoted-content .gmail_quote { display: block; }";

const frames: HTMLIFrameElement[] = [];

function render(html: string, extra_css = ""): Document {
  const iframe = document.createElement("iframe");

  document.body.appendChild(iframe);
  frames.push(iframe);

  const doc = iframe.contentDocument!;

  doc.head.innerHTML = `<style>${QUOTE_CSS}${extra_css}</style>`;
  doc.body.innerHTML = html;

  collapse_forwarded_content(doc, t);
  collapse_quoted_replies(doc, t);
  reveal_orphaned_hidden_quotes(doc);
  reveal_fully_hidden_content(doc);

  return doc;
}

function is_shown(doc: Document, selector: string): boolean {
  let el = doc.querySelector<HTMLElement>(selector);

  while (el) {
    const style = doc.defaultView!.getComputedStyle(el);

    if (style.display === "none" || style.visibility === "hidden") return false;
    if (el === doc.body) break;
    el = el.parentElement;
  }

  return true;
}

afterEach(() => {
  frames.splice(0).forEach((iframe) => iframe.remove());
});

describe("hidden quote wrappers without a toggle", () => {
  it("shows a message that sits entirely in a quote blockquote", () => {
    const doc = render(
      `<blockquote class="gmail_quote" id="m">Hi there, a clan is a group of players.</blockquote>`,
    );

    expect(doc.querySelector(".aster-quote-toggle")).toBeNull();
    expect(is_shown(doc, "#m")).toBe(true);
  });

  it("shows a second quote block that no toggle controls", () => {
    const doc = render(
      `<p>Reply text</p><div class="gmail_quote" id="a">First</div><p>More</p><div class="gmail_quote" id="b">Second</div>`,
    );

    expect(doc.querySelector(".aster-quote-toggle")).not.toBeNull();
    expect(doc.querySelector("#a")!.closest(".aster-quoted-content")).not.toBe(
      null,
    );
    expect(is_shown(doc, "#b")).toBe(true);
  });

  it("shows a citation prefix when no marker matches", () => {
    const doc = render(
      `<p>Svar</p><div class="moz-cite-prefix" id="p">Den 1. oktober skrev Ada:</div><blockquote type="cite">Hej</blockquote>`,
    );

    expect(is_shown(doc, "#p")).toBe(true);
  });

  it("keeps a collapsed quote collapsed when a toggle exists", () => {
    const doc = render(
      `<p>Reply text</p><div class="gmail_quote" id="q">Quoted</div>`,
    );
    const content = doc.querySelector<HTMLElement>(".aster-quoted-content")!;

    expect(doc.querySelector(".aster-quote-toggle")).not.toBeNull();
    expect(content.style.display).toBe("none");
    expect(content.contains(doc.querySelector("#q"))).toBe(true);
  });
});

describe("messages whose whole content is hidden", () => {
  it("reveals content hidden by an inline style", () => {
    const doc = render(
      `<div id="w" style="display:none"><p>Hi there</p></div>`,
    );

    expect(is_shown(doc, "#w")).toBe(true);
  });

  it("reveals content hidden by a style sheet rule", () => {
    const doc = render(
      `<div class="loading" id="w"><p>Hi there</p></div>`,
      ".loading { visibility: hidden; }",
    );

    expect(is_shown(doc, "#w")).toBe(true);
  });

  it("reveals content with zero opacity", () => {
    const doc = render(`<div id="w" style="opacity:0"><p>Hi there</p></div>`);

    expect(doc.querySelector<HTMLElement>("#w")!.style.opacity).toBe("1");
  });

  it("leaves a hidden preheader alone when other text is visible", () => {
    const doc = render(
      `<div id="pre" style="display:none">Preview text</div><p>Visible body</p>`,
    );

    expect(is_shown(doc, "#pre")).toBe(false);
  });

  it("leaves a hidden preheader alone when an image is visible", () => {
    const doc = render(
      `<div id="pre" style="display:none">Preview text</div><img src="data:," width="600" height="200">`,
    );

    expect(is_shown(doc, "#pre")).toBe(false);
  });

  it("does not count a tracking pixel as visible content", () => {
    const doc = render(
      `<div id="w" style="display:none">Hi there</div><img src="data:," width="1" height="1">`,
    );

    expect(is_shown(doc, "#w")).toBe(true);
  });

  it("reports nothing to reveal for an empty body", () => {
    const iframe = document.createElement("iframe");

    document.body.appendChild(iframe);
    frames.push(iframe);

    expect(reveal_fully_hidden_content(iframe.contentDocument!)).toBe(false);
  });
});
