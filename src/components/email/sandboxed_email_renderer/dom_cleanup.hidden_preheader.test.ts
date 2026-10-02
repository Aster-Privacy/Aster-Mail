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

import { reveal_fully_hidden_content } from "./dom_cleanup";

import { sanitize_html } from "@/lib/html_sanitizer";

const HIDE =
  "display:none !important;visibility:hidden;mso-hide:all;font-size:0;color:#ffffff;" +
  "line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;" +
  "position:fixed;height:0;font-size:0";

const PREVIEW = `<div id="preview" style="${HIDE}">Your weekly digest is here.</div>`;

const FILLER = `<div id="filler" style="${HIDE}">${Array(200).fill("&#847;").join(" ")}</div>`;

const MIXED_FILLER = `<div id="filler" style="${HIDE}">${Array(50).fill("&#847;&zwnj;&nbsp;&#8204; ").join("")}</div>`;

const MJML_BODY =
  `<table><tr><td style="font-size:0px;padding:10px 25px;word-break:break-word">` +
  `<div style="font-size:0px;display:inline-block;width:100%">` +
  `<div id="headline" style="font-family:Arial;font-size:16px;line-height:24px">Most read this week</div>` +
  `</div></td></tr><tr><td id="image_cell" style="font-size:0px">` +
  `<img src="cid:hero" width="600" height="200" alt="Hero">` +
  `</td></tr></table>`;

const frames: HTMLIFrameElement[] = [];

function render(raw: string): { doc: Document; revealed: boolean } {
  const { html } = sanitize_html(raw, {
    external_content_mode: "never",
    sandbox_mode: true,
    lockdown_mode: false,
  });
  const iframe = document.createElement("iframe");

  document.body.appendChild(iframe);
  frames.push(iframe);

  const doc = iframe.contentDocument!;

  doc.body.innerHTML = html;

  return { doc, revealed: reveal_fully_hidden_content(doc) };
}

function style_of(doc: Document, selector: string): CSSStyleDeclaration {
  return doc.defaultView!.getComputedStyle(doc.querySelector(selector)!);
}

afterEach(() => {
  frames.splice(0).forEach((iframe) => iframe.remove());
});

describe("hidden preheader in a newsletter with zero font-size wrappers", () => {
  it("does not treat font-size:0 layout wrappers as hidden content", () => {
    const { doc, revealed } = render(
      `<html><body>${PREVIEW}${FILLER}${MJML_BODY}</body></html>`,
    );

    expect(revealed).toBe(false);
    expect(style_of(doc, "#preview").display).toBe("none");
    expect(style_of(doc, "#filler").display).toBe("none");
  });

  it("keeps the sender's zero font-size on layout wrappers", () => {
    const { doc } = render(
      `<html><body>${PREVIEW}${FILLER}${MJML_BODY}</body></html>`,
    );

    expect(style_of(doc, "#image_cell").fontSize).toBe("0px");
    expect(style_of(doc, "#headline").fontSize).toBe("16px");
  });

  it("keeps mixed zero-width filler hidden", () => {
    const { doc, revealed } = render(
      `<html><body>${PREVIEW}${MIXED_FILLER}${MJML_BODY}</body></html>`,
    );

    expect(revealed).toBe(false);
    expect(style_of(doc, "#filler").display).toBe("none");
  });

  it("still neutralises position:fixed on the preheader", () => {
    const { doc } = render(`<html><body>${PREVIEW}${MJML_BODY}</body></html>`);
    const inline = doc.querySelector("#preview")!.getAttribute("style") ?? "";

    expect(inline).not.toMatch(/position\s*:\s*fixed/i);
  });
});

describe("text that sits directly in a zero font-size element", () => {
  it("is still revealed when it is the only text", () => {
    const { doc, revealed } = render(
      `<html><body><div id="w" style="font-size:0">Only line of the message</div></body></html>`,
    );

    expect(revealed).toBe(true);
    expect(style_of(doc, "#w").fontSize).toBe("14px");
  });
});

describe("a message whose whole body is hidden", () => {
  it("reveals the body but leaves zero-width filler collapsed", () => {
    const { doc, revealed } = render(
      `<html><body>${PREVIEW}${FILLER}<div id="message" style="display:none"><p>Real message text</p></div></body></html>`,
    );

    expect(revealed).toBe(true);
    expect(style_of(doc, "#message").display).not.toBe("none");
    expect(style_of(doc, "#filler").display).toBe("none");
  });

  it("lays revealed preheader text out at a readable width and line height", () => {
    const { doc, revealed } = render(
      `<html><body>${PREVIEW}<div style="display:none"><p>Real message text</p></div></body></html>`,
    );
    const preview = doc.querySelector<HTMLElement>("#preview")!;

    expect(revealed).toBe(true);
    expect(preview.style.getPropertyValue("max-width")).toBe("none");
    expect(preview.style.getPropertyValue("line-height")).toBe("normal");
  });
});
